import { serve } from '@hono/node-server';
import { app } from './server';
import { config } from './utils/config';
import { logger } from './utils/logger';
import { startCommandExpiry } from './jobs/command-expiry';
import { startDeviceMonitor } from './jobs/device-monitor';
import { startSyncWorker } from './jobs/sync-worker';
// NOTE: time-sync job removed. Background time pushes corrupt SpeedFace
// V5L (ZAM170-NF) firmware — once we send any Timezone= the device locks
// the value and manual menu entries revert within ~20s. Operators manage
// device time manually via the device menu; the UI only pushes time when
// they explicitly click Save & Push.

startCommandExpiry();
startDeviceMonitor();
startSyncWorker(Number(process.env.SYNC_INTERVAL_MS ?? 30_000));

logger.info(
  {
    port: config.ADMS_PORT,
    host: config.ADMS_HOST,
    env: config.NODE_ENV,
    rawDumpEnabled: config.RAW_DUMP_ENABLED,
  },
  'Starting ZK Connect ADMS endpoint',
);

serve(
  {
    fetch: app.fetch,
    port: config.ADMS_PORT,
    hostname: config.ADMS_HOST,
  },
  (info) => {
    logger.info(`Listening on http://${config.ADMS_HOST}:${info.port}`);
    logger.info(`ADMS path: http://${config.ADMS_HOST}:${info.port}/iclock/`);
  },
);
