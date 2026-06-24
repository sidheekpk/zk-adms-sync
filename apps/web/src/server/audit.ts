import { platformDb, getTenantSql } from '@zkc/db/client';
import { platformAuditLog } from '@zkc/db/platform';
import type { Context } from './trpc';

interface AuditInput {
  action: string;
  targetType?: string;
  targetId?: string;
  diff?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  result?: 'ok' | 'fail' | 'denied';
  errorMessage?: string;
}

interface PlatformAudit extends AuditInput {
  tenantId?: string;
}

interface TenantAudit extends AuditInput {
  tenantSchema: string;
  reason?: string;
  operatorPasswordVerified?: boolean;
}

export async function logPlatformAction(ctx: Context, entry: PlatformAudit) {
  if (!ctx.session) return;
  await platformDb.insert(platformAuditLog).values({
    actorUserId: ctx.session.user.id,
    actorEmail: ctx.session.user.email,
    tenantId: entry.tenantId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    diff: entry.diff,
    metadata: entry.metadata,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
    result: entry.result ?? 'ok',
    errorMessage: entry.errorMessage,
  });
}

/**
 * Tenant-scoped audit log. Writes to the tenant's own `audit_log` table
 * inside its schema using a search_path-scoped connection.
 */
export async function logTenantAction(ctx: Context, entry: TenantAudit) {
  if (!ctx.session) return;
  const sql = getTenantSql(entry.tenantSchema);
  await sql`
    INSERT INTO audit_log (
      actor_user_id, actor_email, action, target_type, target_id,
      diff, metadata, ip_address, user_agent, result, error_message,
      reason, operator_password_verified
    ) VALUES (
      ${ctx.session.user.id}, ${ctx.session.user.email},
      ${entry.action}, ${entry.targetType ?? null}, ${entry.targetId ?? null},
      ${entry.diff ? sql.json(entry.diff) : null},
      ${entry.metadata ? sql.json(entry.metadata) : null},
      ${ctx.ip}, ${ctx.userAgent},
      ${entry.result ?? 'ok'}, ${entry.errorMessage ?? null},
      ${entry.reason ?? null}, ${entry.operatorPasswordVerified ?? false}
    )
  `;
}
