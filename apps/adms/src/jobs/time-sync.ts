// Periodically pushes the right local-clock time to each device by
// queueing a SET OPTIONS DateTime=... command. Re-runs whenever a
// device's timezone_synced_at is older than TIME_SYNC_MAX_AGE_MS, which
// gives us automatic correction across DST transitions.

import { platformDb, getTenantSql } from '@zkc/db/client';
import { tenants } from '@zkc/db/platform';
import { eq } from 'drizzle-orm';
import { deviceClockTimestamp } from '@zkc/shared/timezone';
import { queueCommand } from '../services/command.service';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

let timer: NodeJS.Timeout | null = null;

export function startTimeSync(intervalMs: number = config.TIME_SYNC_INTERVAL_MS) {
  logger.info({ intervalMs }, 'Time-sync job started');
  timer = setInterval(tick, intervalMs);
}

export function stopTimeSync() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick() {
  try {
    const ts = await platformDb
      .select({ schemaName: tenants.schemaName })
      .from(tenants)
      .where(eq(tenants.status, 'active'));
    let queued = 0;
    for (const t of ts) {
      const sql = getTenantSql(t.schemaName);
      const rows = await sql<
        Array<{ id: string; timezone: string; serial_number: string }>
      >`
        SELECT id, timezone, serial_number
        FROM devices
        WHERE enabled = true
          AND status = 'online'
          AND (timezone_synced_at IS NULL
            OR timezone_synced_at < now() - (${config.TIME_SYNC_MAX_AGE_MS}::bigint || ' milliseconds')::interval)
      `;
      for (const d of rows) {
        const unix = deviceClockTimestamp(d.timezone);
        await queueCommand({
          schemaName: t.schemaName,
          deviceId: d.id,
          command: `SET OPTIONS DateTime=${unix}`,
          commandType: 'SET_TIME',
          reason: `Scheduled time-sync to ${d.timezone}`,
        });
        await sql`UPDATE devices SET timezone_synced_at = now() WHERE id = ${d.id}`;
        queued++;
      }
    }
    if (queued > 0) logger.info({ queued }, 'Queued time-sync commands');
  } catch (err) {
    logger.error({ err }, 'time-sync tick failed');
  }
}
