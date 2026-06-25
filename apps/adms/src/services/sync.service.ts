import { randomUUID } from 'node:crypto';
import { getTenantSql, getPlatformSql } from '@zkc/db/client';
import { decrypt, getAdapter, type IntegrationKind, type InternalPunchRow, type SyncOpts } from '@zkc/shared';
import { logger } from '../utils/logger';
import { postSyncBatch, type SyncTarget } from './sync-dispatcher';

const BATCH_SIZE = 50;
const MAX_FAILED_ATTEMPTS = 5;

export interface ActiveTenant {
  id: string;
  slug: string;
  schemaName: string;
  integrationKind: IntegrationKind;
  endpoint: string | null;
  tokenEncrypted: string | null;
  workspaceId: string | null;
  retryPolicy: { maxAttempts?: number; baseDelayMs?: number };
}

/**
 * List every tenant that has an active integration configured. Worker
 * iterates these and each runs ENTIRELY inside its own schema-scoped sql
 * connection (`getTenantSql(schemaName)`), so cross-tenant data can never
 * leak between batches.
 */
export async function listTenantsWithIntegration(): Promise<ActiveTenant[]> {
  const sql = getPlatformSql();
  const rows = await sql<
    Array<{
      id: string;
      slug: string;
      schemaName: string;
      integrationKind: IntegrationKind;
      endpoint: string | null;
      tokenEncrypted: string | null;
      workspaceId: string | null;
      retryPolicy: { maxAttempts?: number; baseDelayMs?: number } | null;
    }>
  >`
    SELECT id, slug,
           schema_name AS "schemaName",
           integration_kind AS "integrationKind",
           integration_endpoint AS "endpoint",
           integration_token_encrypted AS "tokenEncrypted",
           integration_workspace_id AS "workspaceId",
           integration_retry_policy AS "retryPolicy"
    FROM platform.tenants
    WHERE status = 'active'
      AND integration_kind <> 'none'
      AND integration_endpoint IS NOT NULL
      AND integration_token_encrypted IS NOT NULL
  `;
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    schemaName: r.schemaName,
    integrationKind: r.integrationKind,
    endpoint: r.endpoint,
    tokenEncrypted: r.tokenEncrypted,
    workspaceId: r.workspaceId,
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
      e.external_id AS "externalId",
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
    LEFT JOIN employees e ON e.id = a.employee_id
    LEFT JOIN devices d ON d.id = a.device_id
    WHERE a.sync_status = 'pending'
      AND a.voided_at IS NULL
      AND a.sync_attempts < ${MAX_FAILED_ATTEMPTS}
    ORDER BY a.punch_time ASC
    LIMIT ${limit}
  `;
}

export async function markPunchesSynced(schemaName: string, ids: string[]): Promise<void> {
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

async function markTenantSuccess(tenantId: string): Promise<void> {
  await getPlatformSql()`
    UPDATE platform.tenants
    SET integration_last_success_at = NOW(),
        integration_last_error = NULL,
        updated_at = NOW()
    WHERE id = ${tenantId}::uuid
  `;
}

async function markTenantError(tenantId: string, error: string): Promise<void> {
  await getPlatformSql()`
    UPDATE platform.tenants
    SET integration_last_error = ${error.slice(0, 500)},
        updated_at = NOW()
    WHERE id = ${tenantId}::uuid
  `;
}

/**
 * Drain one batch of pending punches for a single tenant. Returns the
 * number of records successfully synced (0 if no pending or fully failed).
 */
export async function runOneBatch(tenant: ActiveTenant): Promise<number> {
  const adapter = getAdapter(tenant.integrationKind);
  if (!adapter) return 0;
  if (!tenant.endpoint || !tenant.tokenEncrypted) return 0;

  const pending = await fetchPendingPunches(tenant.schemaName);
  if (pending.length === 0) return 0;

  const batchId = randomUUID();
  const syncOpts: SyncOpts = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    workspaceId: tenant.workspaceId,
    batchId,
  };
  const payload = adapter.transformBatch(pending, syncOpts);

  const apiToken = decrypt(tenant.tokenEncrypted);
  const target: SyncTarget = {
    id: tenant.id,
    name: `${tenant.slug} → ${tenant.integrationKind}`,
    kind: tenant.integrationKind,
    endpoint: tenant.endpoint,
    workspaceId: tenant.workspaceId,
    apiToken,
    retryPolicy: tenant.retryPolicy,
  };
  const result = await postSyncBatch(target, payload);
  const ids = pending.map((p) => p.id);

  if (result.ok) {
    await markPunchesSynced(tenant.schemaName, ids);
    await markTenantSuccess(tenant.id);
    logger.info(
      { tenant: tenant.slug, kind: tenant.integrationKind, count: pending.length, attempts: result.attempts },
      'Sync batch successful',
    );
    return pending.length;
  }

  await markPunchesFailed(tenant.schemaName, ids, result.body);
  await markTenantError(tenant.id, `HTTP ${result.httpStatus}: ${result.body.slice(0, 200)}`);
  logger.warn(
    { tenant: tenant.slug, kind: tenant.integrationKind, count: pending.length, status: result.httpStatus, attempts: result.attempts },
    'Sync batch failed',
  );
  return 0;
}

/**
 * Fire a one-shot device-status event (online / offline) to the tenant's
 * configured integration. No batching, no retry beyond the dispatcher's
 * inline retries — this is best-effort.
 */
export async function emitDeviceStatusChange(args: {
  tenantId: string;
  deviceId: string;
  deviceSn: string;
  deviceName: string;
  status: 'online' | 'offline';
  at: Date;
}): Promise<void> {
  const sql = getPlatformSql();
  const rows = await sql<
    Array<{
      slug: string;
      integrationKind: IntegrationKind;
      endpoint: string | null;
      tokenEncrypted: string | null;
      workspaceId: string | null;
      retryPolicy: { maxAttempts?: number; baseDelayMs?: number } | null;
    }>
  >`
    SELECT slug,
           integration_kind AS "integrationKind",
           integration_endpoint AS "endpoint",
           integration_token_encrypted AS "tokenEncrypted",
           integration_workspace_id AS "workspaceId",
           integration_retry_policy AS "retryPolicy"
    FROM platform.tenants
    WHERE id = ${args.tenantId}::uuid
      AND status = 'active'
      AND integration_kind <> 'none'
      AND integration_endpoint IS NOT NULL
      AND integration_token_encrypted IS NOT NULL
    LIMIT 1
  `;
  if (rows.length === 0) return;
  const t = rows[0]!;
  const adapter = getAdapter(t.integrationKind);
  if (!adapter || !adapter.transformDeviceStatus) return;
  if (!t.endpoint || !t.tokenEncrypted) return;

  const apiToken = decrypt(t.tokenEncrypted);
  const payload = adapter.transformDeviceStatus(args, {
    tenantId: args.tenantId,
    tenantSlug: t.slug,
    workspaceId: t.workspaceId,
    batchId: randomUUID(),
  });
  const result = await postSyncBatch(
    {
      id: args.tenantId,
      name: `${t.slug} status`,
      kind: t.integrationKind,
      endpoint: t.endpoint,
      workspaceId: t.workspaceId,
      apiToken,
      retryPolicy: t.retryPolicy ?? {},
    },
    payload,
  );
  if (!result.ok) {
    logger.warn({ tenant: t.slug, status: args.status, http: result.httpStatus }, 'Device status webhook failed');
  } else {
    logger.info({ tenant: t.slug, status: args.status }, 'Device status webhook delivered');
  }
}
