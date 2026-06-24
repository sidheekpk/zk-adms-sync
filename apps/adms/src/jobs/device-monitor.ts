import { platformDb, getTenantSql } from '@zkc/db/client';
import { tenants } from '@zkc/db/platform';
import { eq } from 'drizzle-orm';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

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
      .select({ schemaName: tenants.schemaName })
      .from(tenants)
      .where(eq(tenants.status, 'active'));
    let total = 0;
    for (const t of ts) {
      const sql = getTenantSql(t.schemaName);
      const result = await sql`
        UPDATE devices
        SET status = 'offline'
        WHERE status = 'online'
          AND (last_online IS NULL
            OR last_online < now() - (${config.DEVICE_OFFLINE_TIMEOUT_MS}::bigint || ' milliseconds')::interval)
      `;
      total += result.count ?? 0;
    }
    if (total > 0) logger.info({ count: total }, 'Marked devices offline');
  } catch (err) {
    logger.error({ err }, 'device-monitor tick failed');
  }
}
