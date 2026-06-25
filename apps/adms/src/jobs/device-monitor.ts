import { platformDb, getTenantSql } from '@zkc/db/client';
import { tenants } from '@zkc/db/platform';
import { eq } from 'drizzle-orm';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { emitDeviceStatusChange } from '../services/sync.service';

let timer: NodeJS.Timeout | null = null;

export function startDeviceMonitor(intervalMs: number = 30_000) {
  logger.info('Device monitor started');
  timer = setInterval(tick, intervalMs);
}

export function stopDeviceMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick() {
  try {
    const ts = await platformDb
      .select({ id: tenants.id, schemaName: tenants.schemaName })
      .from(tenants)
      .where(eq(tenants.status, 'active'));
    let total = 0;
    for (const t of ts) {
      const sql = getTenantSql(t.schemaName);
      // RETURNING the flipped rows so we can fire device-status webhooks
      // to the tenant's integration. Each row had status='online' before
      // this UPDATE; transitioning to 'offline' is a real state change.
      const flipped = await sql<{ id: string; serial_number: string; name: string }[]>`
        UPDATE devices
        SET status = 'offline'
        WHERE status = 'online'
          AND (last_online IS NULL
            OR last_online < now() - (${config.DEVICE_OFFLINE_TIMEOUT_MS}::bigint || ' milliseconds')::interval)
        RETURNING id, serial_number, name
      `;
      total += flipped.length;
      for (const dev of flipped) {
        // Best-effort fire-and-forget; integration may not exist or be 'none'
        void emitDeviceStatusChange({
          tenantId: t.id,
          deviceId: dev.id,
          deviceSn: dev.serial_number,
          deviceName: dev.name,
          status: 'offline',
          at: new Date(),
        }).catch((err) => logger.warn({ err, deviceId: dev.id }, 'device-status webhook failed'));
      }
    }
    if (total > 0) logger.info({ count: total }, 'Marked devices offline');
  } catch (err) {
    logger.error({ err }, 'device-monitor tick failed');
  }
}
