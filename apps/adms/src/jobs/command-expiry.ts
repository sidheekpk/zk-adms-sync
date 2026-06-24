import { platformDb, getTenantSql } from '@zkc/db/client';
import { tenants } from '@zkc/db/platform';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

let timer: NodeJS.Timeout | null = null;

export function startCommandExpiry(intervalMs: number = 60_000) {
  logger.info('Command expiry job started');
  timer = setInterval(tick, intervalMs);
}

export function stopCommandExpiry() {
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
        UPDATE device_commands
        SET status = 'expired'
        WHERE status = 'pending' AND expires_at < now()
      `;
      total += result.count ?? 0;
    }
    if (total > 0) logger.info({ count: total }, 'Expired stale commands');
  } catch (err) {
    logger.error({ err }, 'command-expiry tick failed');
  }
}
