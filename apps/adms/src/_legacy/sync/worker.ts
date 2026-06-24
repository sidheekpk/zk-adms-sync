import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { getActiveSyncTargets, logSyncAttempt } from '../services/sync.service.js';
import { getPendingAttendanceLogs, markLogsSynced, markLogsFailed } from '../services/attendance.service.js';
import { syncToTarget } from './dispatcher.js';
import { sseManager } from '../sse/manager.js';

let syncTimer: ReturnType<typeof setInterval> | null = null;

export function startSyncWorker() {
  const intervalMs = config.SYNC_INTERVAL_MS;
  logger.info({ intervalMs }, 'Sync worker started');

  syncTimer = setInterval(runSyncCycle, intervalMs);
}

export function stopSyncWorker() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    logger.info('Sync worker stopped');
  }
}

export async function runSyncCycle() {
  try {
    const targets = getActiveSyncTargets();
    if (targets.length === 0) return;

    for (const target of targets) {
      const pending = getPendingAttendanceLogs(target.batchSize || 50);
      if (pending.length === 0) continue;

      const result = await syncToTarget(target, pending);
      const ids = pending.map(r => r.id);

      logSyncAttempt({
        syncTargetId: target.id,
        recordCount: pending.length,
        status: result.success ? 'success' : 'failed',
        httpStatus: result.status || undefined,
        responseBody: result.body.substring(0, 1000),
        errorMessage: result.success ? undefined : result.body,
        durationMs: result.durationMs,
      });

      if (result.success) {
        markLogsSynced(ids);
        logger.info({ target: target.name, count: pending.length }, 'Sync batch successful');

        sseManager.broadcast('sync:complete', {
          target: target.name,
          count: pending.length,
          time: new Date().toISOString(),
        });
      } else {
        markLogsFailed(ids, result.body);
        logger.warn({ target: target.name, count: pending.length, error: result.body }, 'Sync batch failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Sync worker cycle error');
  }
}
