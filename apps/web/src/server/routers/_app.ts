import { router } from '../trpc';
import { tenantsRouter } from './tenants';
import { devicesRouter } from './devices';
import { employeesRouter } from './employees';
import { attendanceRouter } from './attendance';
import { auditRouter } from './audit';
import { syncTargetsRouter } from './sync-targets';
import { inboundKeysRouter } from './inbound-keys';
import { locationsRouter } from './locations';
import { deviceGroupsRouter } from './device-groups';

export const appRouter = router({
  tenants: tenantsRouter,
  devices: devicesRouter,
  employees: employeesRouter,
  attendance: attendanceRouter,
  audit: auditRouter,
  syncTargets: syncTargetsRouter,
  inboundKeys: inboundKeysRouter,
  locations: locationsRouter,
  deviceGroups: deviceGroupsRouter,
});

export type AppRouter = typeof appRouter;
