// Server-side helpers for queueing commands into a tenant's device_commands
// table from the web app (mirrors apps/adms/src/services/command.service.ts).

import { getTenantSql } from '@zkc/db/client';
import {
  pickCommand,
  buildReboot,
  buildClearLog,
  buildClearData,
  buildGetInfo,
  buildGetOptions,
  buildSyncTime,
  buildDisableNetworkTimeSync,
  buildDeleteUser,
  buildUnlockDoor,
  buildPushFingerprint,
  buildPushFace,
  buildPushPalm,
  buildPushBiophoto,
  type FirmwareFamily,
  type CommandPayload,
} from '@zkc/shared/firmware';
import { deviceClockTimestamp } from '@zkc/shared/timezone';

export type CommandKind =
  | 'sync_time'
  | 'disable_ntp'
  | 'get_info'
  | 'get_options'
  | 'query_network'
  | 'query_users'
  | 'reboot'
  | 'clear_log'
  | 'clear_data'
  | 'open_door'
  | 'add_user'
  | 'delete_user'
  | 'push_fp'
  | 'push_face'
  | 'push_palm'
  | 'push_photo';

interface BuildOpts {
  kind: CommandKind;
  family: FirmwareFamily;
  timezone: string;
  params?: Record<string, unknown>;
}

export function buildCommandPayload({ kind, family, timezone, params }: BuildOpts): CommandPayload {
  switch (kind) {
    case 'sync_time':
      return buildSyncTime(deviceClockTimestamp(timezone));
    case 'disable_ntp':
      return buildDisableNetworkTimeSync();
    case 'get_info':
      return buildGetInfo();
    case 'get_options':
      return buildGetOptions();
    case 'query_network':
      // Single multi-field GET so the device returns all four in one
      // payload (single-field GET for IPAddress returns empty on V5L,
      // but multi-field works — verified 2026-06-23).
      return {
        type: 'GET_OPTIONS',
        payload: 'GET OPTIONS IPAddress,NetMask,GATEIPAddress,DNS,DHCP',
      };
    case 'query_users':
      return pickCommand(family, 'queryUsers')();
    case 'reboot':
      return buildReboot();
    case 'clear_log':
      return buildClearLog();
    case 'clear_data':
      return buildClearData();
    case 'open_door':
      return buildUnlockDoor((params?.seconds as number) ?? 3);
    case 'add_user':
      return pickCommand(family, 'addUser')(
        params as { pin: string; name: string; privilege?: number; password?: string; card?: string },
      );
    case 'delete_user':
      return buildDeleteUser((params as { pin: string }).pin);
    case 'push_fp':
      return buildPushFingerprint(params as Parameters<typeof buildPushFingerprint>[0]);
    case 'push_face':
      return buildPushFace(params as Parameters<typeof buildPushFace>[0]);
    case 'push_palm':
      return buildPushPalm(params as Parameters<typeof buildPushPalm>[0]);
    case 'push_photo':
      return buildPushBiophoto(params as Parameters<typeof buildPushBiophoto>[0]);
  }
}

export async function nextCommandId(schemaName: string, deviceId: string): Promise<number> {
  const sql = getTenantSql(schemaName);
  const rows = await sql<Array<{ max: number | null }>>`
    SELECT COALESCE(MAX(command_id), 0)::int AS max
    FROM device_commands
    WHERE device_id = ${deviceId}
  `;
  return (rows[0]?.max ?? 0) + 1;
}

interface QueueArgs {
  schemaName: string;
  deviceId: string;
  payload: CommandPayload;
  ttlMs?: number;
  issuedByUserId: string;
  issuedByEmail: string;
  reason?: string | null;
}

export async function queueCommand({
  schemaName,
  deviceId,
  payload,
  ttlMs = 600_000,
  issuedByUserId,
  issuedByEmail,
  reason,
}: QueueArgs): Promise<{ id: string; commandId: number; command: string }> {
  const sql = getTenantSql(schemaName);
  const cmdId = await nextCommandId(schemaName, deviceId);
  const command = `C:${cmdId}:${payload.payload}`;
  const rows = await sql<Array<{ id: string }>>`
    INSERT INTO device_commands (
      device_id, command_id, command, command_type, status,
      issued_by_user_id, issued_by_email, reason, expires_at
    ) VALUES (
      ${deviceId}, ${cmdId}, ${command}, ${payload.type}, 'pending',
      ${issuedByUserId}, ${issuedByEmail}, ${reason ?? null},
      now() + (${ttlMs}::bigint || ' milliseconds')::interval
    )
    RETURNING id
  `;
  return { id: rows[0]!.id, commandId: cmdId, command };
}
