// Safety guard: refuses to push commands to devices that are currently
// offline (unless the caller explicitly opts in to queueing for later
// delivery). Centralising this avoids accidentally bricking remote
// configuration when a device is unreachable.

import { TRPCError } from '@trpc/server';
import { getTenantSql } from '@zkc/db/client';

export interface DeviceLiveness {
  status: string;
  enabled: boolean;
  lastOnline: string | null;
  ageMs: number;
}

export async function assertDeviceOnline(
  schemaName: string,
  deviceId: string,
  opts: { allowOffline?: boolean } = {},
): Promise<DeviceLiveness> {
  const sql = getTenantSql(schemaName);
  const rows = await sql<
    Array<{ status: string; enabled: boolean; last_online: string | null }>
  >`
    SELECT status::text AS status, enabled, last_online
    FROM devices WHERE id = ${deviceId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Device not found' });
  }
  const ageMs = row.last_online ? Date.now() - new Date(row.last_online).getTime() : Infinity;
  const liveness: DeviceLiveness = {
    status: row.status,
    enabled: row.enabled,
    lastOnline: row.last_online,
    ageMs,
  };
  if (opts.allowOffline) return liveness;
  if (!row.enabled) {
    throw new TRPCError({
      code: 'FAILED_PRECONDITION',
      message: 'Device is paused. Resume it before pushing commands.',
    });
  }
  if (row.status !== 'online') {
    throw new TRPCError({
      code: 'FAILED_PRECONDITION',
      message: `Device is ${row.status}. Settings cannot be pushed while the device is offline. (To queue anyway, pass allowOffline=true.)`,
    });
  }
  return liveness;
}
