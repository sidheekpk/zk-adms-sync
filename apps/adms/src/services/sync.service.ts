import { randomUUID } from 'node:crypto';
import { getTenantSql, getPlatformSql } from '@zkc/db/client';
import { decrypt } from '@zkc/shared';
import { logger } from '../utils/logger';
import { postSyncBatch, type SyncTarget } from './sync-dispatcher';
import { transformToRadix, type InternalPunchRow } from './sync-transformer';

const BATCH_SIZE = 50;
const MAX_FAILED_ATTEMPTS = 5;

interface ActiveTenant {
  id: string;
  slug: string;
  schemaName: string;
}

interface TargetRow {
  id: string;
  name: string;
  kind: string;
  endpoint: string;
  workspaceId: string | null;
  apiTokenEncrypted: string;
  retryPolicy: { maxAttempts?: number; baseDelayMs?: number } | null;
  isActive: boolean;
}

export async function listActiveTenants(): Promise<ActiveTenant[]> {
  const sql = getPlatformSql();
  const rows = await sql<ActiveTenant[]>`
    SELECT id, slug, schema_name AS "schemaName"
    FROM platform.tenants
    WHERE status = 'active'
  `;
  return rows;
}

export async function listActiveTargets(schemaName: string): Promise<SyncTarget[]> {
  const sql = getTenantSql(schemaName);
  const rows = await sql<TargetRow[]>`
    SELECT id, name, kind, endpoint, workspace_id AS "workspaceId",
           api_token_encrypted AS "apiTokenEncrypted",
           retry_policy AS "retryPolicy", is_active AS "isActive"
    FROM sync_targets
    WHERE is_active = true
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    endpoint: r.endpoint,
    workspaceId: r.workspaceId,
    apiToken: decrypt(r.apiTokenEncrypted),
    retryPolicy: r.retryPolicy ?? {},
  }));
}

export async function fetchPendingPunches(
  schemaName: string,
  limit = BATCH_SIZE,
): Promise<InternalPunchRow[]> {
  const sql = getTenantSql(schemaName);
  return sql<InternalPunchRow[]>`
    SELECT
      a.id, a.pin,
      a.punch_time AS "punchTime",
      a.status_code AS "statusCode",
      a.punch_type::text AS "punchType",
      a.verify_mode_code AS "verifyModeCode",
      a.verify_mode::text AS "verifyMode",
      a.work_code AS "workCode",
      a.temperature,
      a.device_sn AS "deviceSn",
      COALESCE(d.name, a.device_sn) AS "deviceName"
    FROM attendance_logs a
    LEFT JOIN devices d ON d.id = a.device_id
    WHERE a.sync_status = 'pending'
      AND a.sync_attempts < ${MAX_FAILED_ATTEMPTS}
    ORDER BY a.punch_time ASC
    LIMIT ${limit}
  `;
}

export async function markPunchesSynced(
  schemaName: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const sql = getTenantSql(schemaName);
  await sql`
    UPDATE attendance_logs
    SET sync_status = 'synced',
        synced_at = NOW(),
        last_sync_error = NULL
    WHERE id = ANY(${ids}::uuid[])
  `;
}

export async function markPunchesFailed(
  schemaName: string,
  ids: string[],
  errorMsg: string,
): Promise<void> {
  if (ids.length === 0) return;
  const sql = getTenantSql(schemaName);
  await sql`
    UPDATE attendance_logs
    SET sync_attempts = sync_attempts + 1,
        last_sync_error = ${errorMsg.slice(0, 500)},
        sync_status = CASE
          WHEN sync_attempts + 1 >= ${MAX_FAILED_ATTEMPTS} THEN 'failed'::sync_status
          ELSE sync_status
        END
    WHERE id = ANY(${ids}::uuid[])
  `;
}

export async function recordSyncAttempt(
  schemaName: string,
  args: {
    syncTargetId: string;
    batchId: string;
    recordCount: number;
    status: 'success' | 'failed';
    httpStatus?: number;
    requestPayload?: unknown;
    responseBody?: string;
    errorMessage?: string;
    attempts: number;
  },
): Promise<void> {
  const sql = getTenantSql(schemaName);
  try {
    await sql`
      INSERT INTO sync_log (
        sync_target_id, batch_id, record_count, status, attempts,
        http_status, request_payload, response_body, error_message
      ) VALUES (
        ${args.syncTargetId}::uuid, ${args.batchId}, ${args.recordCount},
        ${args.status}, ${args.attempts},
        ${args.httpStatus ?? null},
        ${args.requestPayload ? JSON.stringify(args.requestPayload) : null}::jsonb,
        ${args.responseBody?.slice(0, 4000) ?? null},
        ${args.errorMessage?.slice(0, 1000) ?? null}
      )
    `;
  } catch (err) {
    logger.error({ err }, 'recordSyncAttempt failed');
  }
}

/**
 * Sync one batch from one tenant to one target. Returns the number of
 * records successfully synced (0 if no pending punches or fully failed).
 */
export async function runOneBatch(
  tenant: ActiveTenant,
  target: SyncTarget,
): Promise<number> {
  const pending = await fetchPendingPunches(tenant.schemaName);
  if (pending.length === 0) return 0;

  const batchId = randomUUID();
  const payload = transformToRadix(pending, {
    workspaceId: target.workspaceId ?? tenant.slug,
    batchId,
  });

  const result = await postSyncBatch(target, payload);
  const ids = pending.map((p) => p.id);

  await recordSyncAttempt(tenant.schemaName, {
    syncTargetId: target.id,
    batchId,
    recordCount: pending.length,
    status: result.ok ? 'success' : 'failed',
    httpStatus: result.httpStatus,
    requestPayload: payload,
    responseBody: result.body,
    errorMessage: result.ok ? undefined : result.body,
    attempts: result.attempts,
  });

  if (result.ok) {
    await markPunchesSynced(tenant.schemaName, ids);
    await markTargetSuccess(tenant.schemaName, target.id);
    logger.info(
      { tenant: tenant.slug, target: target.name, count: pending.length, attempts: result.attempts },
      'Sync batch successful',
    );
    return pending.length;
  }

  await markPunchesFailed(tenant.schemaName, ids, result.body);
  logger.warn(
    { tenant: tenant.slug, target: target.name, count: pending.length, status: result.httpStatus, attempts: result.attempts },
    'Sync batch failed',
  );
  return 0;
}

async function markTargetSuccess(schemaName: string, targetId: string): Promise<void> {
  const sql = getTenantSql(schemaName);
  await sql`UPDATE sync_targets SET last_success_at = NOW(), updated_at = NOW() WHERE id = ${targetId}::uuid`;
}
