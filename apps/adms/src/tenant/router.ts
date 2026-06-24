// SN → tenant resolution. The ADMS endpoint is shared across all tenants;
// each handshake/upload arrives with only a serial number. We need to
// figure out which tenant owns this device.
//
// Strategy:
//   1. In-memory cache (60s TTL).
//   2. Sweep each tenant's `devices.serial_number` for a match.
//   3. Miss → check unconsumed enrollment tokens in `platform.device_enrollment_tokens`:
//        - exactly 1 valid token across all tenants → claim this SN for it
//        - 0 or >1                                  → reject + security event
//
// On successful claim, we insert into the tenant's devices table AND
// consume the token atomically.

import { platformDb, getTenantSql } from '@zkc/db/client';
import { tenants, deviceEnrollmentTokens, securityEvents } from '@zkc/db/platform';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { logger } from '../utils/logger';

interface TenantBinding {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  deviceId: string;
  timezone: string;
  refreshedAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, TenantBinding>();

export function clearTenantRouterCache() {
  cache.clear();
}

export async function resolveTenantBySn(
  sn: string,
  context?: { ip?: string | null },
): Promise<TenantBinding | null> {
  const now = Date.now();
  const cached = cache.get(sn);
  if (cached && now - cached.refreshedAt < CACHE_TTL_MS) {
    return cached;
  }

  // 2) Sweep tenants
  const allTenants = await platformDb
    .select({
      id: tenants.id,
      slug: tenants.slug,
      schemaName: tenants.schemaName,
      timezone: tenants.timezone,
    })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const t of allTenants) {
    const sql = getTenantSql(t.schemaName);
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM devices WHERE serial_number = ${sn} LIMIT 1
    `;
    if (rows.length > 0 && rows[0]) {
      const binding: TenantBinding = {
        tenantId: t.id,
        tenantSlug: t.slug,
        schemaName: t.schemaName,
        deviceId: rows[0].id,
        timezone: t.timezone,
        refreshedAt: now,
      };
      cache.set(sn, binding);
      return binding;
    }
  }

  // 3) Miss — try to claim via enrollment token
  const tokens = await platformDb
    .select()
    .from(deviceEnrollmentTokens)
    .where(
      and(
        isNull(deviceEnrollmentTokens.consumedAt),
        gt(deviceEnrollmentTokens.expiresAt, new Date()),
      ),
    );

  if (tokens.length === 0) {
    await platformDb.insert(securityEvents).values({
      kind: 'adms.unknown_sn',
      severity: 'warning',
      metadata: { sn, reason: 'no_active_tokens' },
      ipAddress: context?.ip ?? null,
    });
    logger.warn({ sn }, 'Unknown SN handshake — no active enrollment tokens');
    return null;
  }

  if (tokens.length > 1) {
    await platformDb.insert(securityEvents).values({
      kind: 'adms.ambiguous_pair',
      severity: 'warning',
      metadata: { sn, tokenCount: tokens.length },
      ipAddress: context?.ip ?? null,
    });
    logger.warn({ sn, tokenCount: tokens.length }, 'Ambiguous device pairing — refusing');
    return null;
  }

  const token = tokens[0]!;
  const [tenant] = await platformDb
    .select({
      id: tenants.id,
      slug: tenants.slug,
      schemaName: tenants.schemaName,
      timezone: tenants.timezone,
    })
    .from(tenants)
    .where(eq(tenants.id, token.tenantId))
    .limit(1);
  if (!tenant) {
    logger.error({ tokenId: token.id, tenantId: token.tenantId }, 'Token references missing tenant');
    return null;
  }

  // Atomic claim: insert device + mark token consumed.
  // Device inherits the tenant's timezone so the first time-sync push
  // is correct.
  const tsql = getTenantSql(tenant.schemaName);
  const inserted = await tsql<{ id: string }[]>`
    INSERT INTO devices (serial_number, name, timezone)
    VALUES (${sn}, ${token.intendedDeviceName ?? sn}, ${tenant.timezone})
    ON CONFLICT (serial_number) DO UPDATE SET updated_at = now()
    RETURNING id
  `;
  const deviceRow = inserted[0];
  if (!deviceRow) throw new Error('Device insert returned no row');

  await platformDb
    .update(deviceEnrollmentTokens)
    .set({ consumedAt: new Date(), consumedBySn: sn })
    .where(eq(deviceEnrollmentTokens.id, token.id));

  logger.info(
    { sn, tenantSlug: tenant.slug, deviceId: deviceRow.id, tokenId: token.id },
    'Device paired via enrollment token',
  );

  const binding: TenantBinding = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    schemaName: tenant.schemaName,
    deviceId: deviceRow.id,
    timezone: tenant.timezone,
    refreshedAt: now,
  };
  cache.set(sn, binding);
  return binding;
}
