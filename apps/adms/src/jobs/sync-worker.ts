import { logger } from '../utils/logger';
import { listTenantsWithIntegration, runOneBatch } from '../services/sync.service';

const DEFAULT_INTERVAL_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let cycleInFlight = false;

export function startSyncWorker(intervalMs = DEFAULT_INTERVAL_MS) {
  if (timer) return;
  logger.info({ intervalMs }, 'Sync worker starting');
  timer = setInterval(() => {
    void runCycle();
  }, intervalMs);
  // First cycle immediately on boot
  void runCycle();
}

export function stopSyncWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('Sync worker stopped');
  }
}

export async function runCycle(): Promise<void> {
  if (cycleInFlight) return;
  cycleInFlight = true;
  try {
    const tenants = await listTenantsWithIntegration();
    if (tenants.length === 0) return;
    for (const tenant of tenants) {
      try {
        // Drain each tenant in isolation. The tenant-scoped sql connection
        // (search_path = t_<slug>, public) means cross-tenant data can never
        // be selected — same PIN in tenant A and B stays separated.
        let drained = 0;
        let safety = 0;
        while (safety++ < 20) {
          const synced = await runOneBatch(tenant);
          if (synced === 0) break;
          drained += synced;
        }
        if (drained > 0) {
          logger.info({ tenant: tenant.slug, kind: tenant.integrationKind, drained }, 'Tenant drained');
        }
      } catch (err) {
        logger.error({ err, tenant: tenant.slug }, 'Sync worker tenant error');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Sync worker cycle error');
  } finally {
    cycleInFlight = false;
  }
}
