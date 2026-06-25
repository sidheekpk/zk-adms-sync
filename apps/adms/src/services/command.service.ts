import { getTenantSql } from '@zkc/db/client';
import { logger } from '../utils/logger';

export interface PendingCommand {
  id: string;
  command_id: number;
  command: string;
  command_type: string;
}

export async function getPendingCommands(
  schemaName: string,
  deviceId: string,
): Promise<PendingCommand[]> {
  const sql = getTenantSql(schemaName);
  return sql<PendingCommand[]>`
    SELECT id, command_id, command, command_type
    FROM device_commands
    WHERE device_id = ${deviceId}
      AND status = 'pending'
      AND expires_at > now()
    ORDER BY created_at
    LIMIT 5
  `;
}

export async function markCommandsSent(schemaName: string, ids: string[]) {
  if (ids.length === 0) return;
  const sql = getTenantSql(schemaName);
  await sql`
    UPDATE device_commands
    SET status = 'sent', sent_at = now()
    WHERE id IN ${sql(ids)}
  `;
}

export async function nextCommandId(schemaName: string, deviceId: string): Promise<number> {
  const sql = getTenantSql(schemaName);
  const rows = await sql<{ max: number | null }[]>`
    SELECT COALESCE(MAX(command_id), 0)::int AS max
    FROM device_commands
    WHERE device_id = ${deviceId}
  `;
  return (rows[0]?.max ?? 0) + 1;
}

export async function queueCommand(opts: {
  schemaName: string;
  deviceId: string;
  command: string;
  commandType: string;
  ttlMs?: number;
  issuedByUserId?: string;
  issuedByEmail?: string;
  reason?: string;
}): Promise<{ id: string; commandId: number; command: string }> {
  const sql = getTenantSql(opts.schemaName);
  const ttl = opts.ttlMs ?? 600_000;
  const cmdId = await nextCommandId(opts.schemaName, opts.deviceId);
  // Replace placeholder C:N: with the assigned id
  const finalCmd = opts.command.replace(/^C:N:/, `C:${cmdId}:`);
  const wrapped = finalCmd.startsWith('C:') ? finalCmd : `C:${cmdId}:${finalCmd}`;
  const rows = await sql<{ id: string }[]>`
    INSERT INTO device_commands (
      device_id, command_id, command, command_type, status,
      issued_by_user_id, issued_by_email, reason, expires_at
    ) VALUES (
      ${opts.deviceId}, ${cmdId}, ${wrapped}, ${opts.commandType}, 'pending',
      ${opts.issuedByUserId ?? null}, ${opts.issuedByEmail ?? null}, ${opts.reason ?? null},
      now() + (${ttl}::bigint || ' milliseconds')::interval
    )
    RETURNING id
  `;
  logger.info(
    { schemaName: opts.schemaName, deviceId: opts.deviceId, cmdId, type: opts.commandType },
    'Command queued',
  );
  return { id: rows[0]!.id, commandId: cmdId, command: wrapped };
}

export async function processCommandResult(opts: {
  schemaName: string;
  deviceId: string;
  commandId: number;
  returnCode: number;
  cmd: string;
  responseData?: string;
}) {
  const sql = getTenantSql(opts.schemaName);
  const status = opts.returnCode === 0 ? 'success' : 'failed';
  // Store the response payload (line 2+ of the device reply) if present,
  // otherwise fall back to the command name (line 1) for visibility.
  const stored = opts.responseData && opts.responseData.length > 0
    ? `${opts.cmd}\n${opts.responseData}`
    : opts.cmd;
  await sql`
    UPDATE device_commands SET
      status = ${status}::command_status,
      return_code = ${opts.returnCode},
      response_data = ${stored},
      completed_at = now()
    WHERE device_id = ${opts.deviceId}
      AND command_id = ${opts.commandId}
  `;

  // Side-effect: when the device returns any GET OPTIONS payload (a
  // single line of comma-separated key=value pairs), snapshot every
  // key into `devices.settings.deviceInfo` so the UI can show what the
  // device actually reports without re-querying.
  if (opts.responseData && opts.cmd.includes('GET OPTIONS')) {
    await snapshotDeviceInfo(sql, opts.deviceId, opts.responseData);
  }
  // Specialised network snapshot kept for backward compat — UI reads it.
  if (opts.responseData && /^(IPAddress|NetMask|GATEIPAddress|DNS|DHCP)=/m.test(opts.responseData)) {
    await snapshotNetwork(sql, opts.deviceId, opts.responseData);
  }
}

function parseKeyValueCsv(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of payload.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

async function snapshotDeviceInfo(
  sql: ReturnType<typeof getTenantSql>,
  deviceId: string,
  payload: string,
) {
  const fields = parseKeyValueCsv(payload);
  if (Object.keys(fields).length === 0) return;
  const snap = { ...fields, _capturedAt: new Date().toISOString() };
  try {
    await sql`
      UPDATE devices SET
        settings = COALESCE(settings, '{}'::jsonb) ||
          jsonb_build_object(
            'deviceInfo',
            COALESCE(settings->'deviceInfo', '{}'::jsonb)
              || ${sql.json(snap as unknown as Parameters<typeof sql.json>[0])}::jsonb
          ),
        updated_at = now()
      WHERE id = ${deviceId}
    `;
  } catch (err) {
    logger.error({ err, deviceId, fieldCount: Object.keys(fields).length }, 'snapshotDeviceInfo failed');
  }
}

interface NetworkSnapshot {
  ipAddress?: string;
  netmask?: string;
  gateway?: string;
  dns?: string;
  dhcp?: boolean;
  capturedAt: string;
}

async function snapshotNetwork(
  sql: ReturnType<typeof getTenantSql>,
  deviceId: string,
  payload: string,
) {
  // Payload looks like "IPAddress=192.168.1.201,NetMask=255.255.255.0,..."
  const snap: NetworkSnapshot = { capturedAt: new Date().toISOString() };
  for (const part of payload.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!value) continue;
    if (key === 'IPAddress') snap.ipAddress = value;
    else if (key === 'NetMask') snap.netmask = value;
    else if (key === 'GATEIPAddress') snap.gateway = value;
    else if (key === 'DNS') snap.dns = value;
    else if (key === 'DHCP') snap.dhcp = value === '1';
  }
  try {
    // postgres-js: pass the JS object via sql.json so PG sees a proper
    // jsonb object — not a JSONB-wrapped string. The previous
    // JSON.stringify-then-cast variant ended up double-encoded.
    await sql`
      UPDATE devices SET
        settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
          'network', ${sql.json(snap as unknown as Parameters<typeof sql.json>[0])}::jsonb
        ),
        updated_at = now()
      WHERE id = ${deviceId}
    `;
  } catch (err) {
    logger.error({ err, deviceId }, 'snapshotNetwork failed');
  }
}
