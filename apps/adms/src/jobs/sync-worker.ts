import { logger } from '../utils/logger';
import { listActiveTenants, listActiveTargets, runOneBatch } from '../services/sync.service';

const DEFAULT_INTERVAL_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let cycleInFlight = false;

export function startSyncWorker(intervalMs = DEFAULT_INTERVAL_MS) {
  if (timer) return;
  logger.info({ intervalMs }, 'Sync worker starting');
  timer = setInterval(() => {
    void runCycle();
  }, intervalMs);
  // run one cycle immediately on boot so we're not blocked on the first
  // interval tick.
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
  if (cycleInFlight) return; // single-flight: don't overlap cycles
  cycleInFlight = true;
  try {
    const tenants = await listActiveTenants();
    for (const tenant of tenants) {
      try {
        const targets = await listActiveTargets(tenant.schemaName);
        if (targets.length === 0) continue;
        for (const target of targets) {
          // drain pending punches in batches until empty or batch fails
          let drained = 0;
          let safety = 0;
          while (safety++ < 20) {
            const synced = await runOneBatch(tenant, target);
            if (synced === 0) break;
            drained += synced;
          }
          if (drained > 0) {
            logger.info({ tenant: tenant.slug, target: target.name, drained }, 'Sync batches drained');
          }
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
