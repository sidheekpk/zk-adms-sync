import { buildHandshakeResponse, formatCommands } from './response';
import { resolveTenantBySn } from '../tenant/router';
import {
  upsertOnHandshake,
  touchHeartbeat,
  markTimezoneSynced,
} from '../services/device.service';
import { ingestAttlog, ingestOperlog } from '../services/attendance.service';
import { ingestBioRecords } from '../services/biometric.service';
import {
  getPendingCommands,
  markCommandsSent,
  processCommandResult,
  queueCommand,
} from '../services/command.service';
import { deviceClockTimestamp } from '@zkc/shared/timezone';
import { logger } from '../utils/logger';

interface HandshakeOptions {
  pushver?: string;
  deviceType?: string;
  language?: string;
  ip?: string | null;
}

export async function handleHandshake(
  sn: string,
  opts: HandshakeOptions,
): Promise<string> {
  const tenant = await resolveTenantBySn(sn, { ip: opts.ip });
  if (!tenant) {
    return `GET OPTION FROM: ${sn}\nError=UnknownDevice`;
  }

  await upsertOnHandshake({
    schemaName: tenant.schemaName,
    deviceId: tenant.deviceId,
    sn,
    pushVersion: opts.pushver,
    deviceType: opts.deviceType,
    ip: opts.ip,
  });

  // IMPORTANT: do NOT auto-push time or timezone here. Doing so on the
  // SpeedFace V5L (ZAM170-NF firmware) corrupts the device's internal
  // time state — once we push Timezone= it locks the value and manual
  // menu entries thereafter revert within ~20s. The user manually
  // configures time on the device; we never touch the clock unless an
  // operator explicitly clicks Save & Push in the UI.

  return buildHandshakeResponse(sn);
}

export async function handleDataUpload(
  sn: string,
  table: string | undefined,
  _stamp: string | undefined,
  body: string,
  ip: string | null,
) {
  const tenant = await resolveTenantBySn(sn, { ip });
  if (!tenant) return;

  if (table === 'ATTLOG') {
    await ingestAttlog({
      schemaName: tenant.schemaName,
      deviceId: tenant.deviceId,
      deviceSn: sn,
      body,
      sourceIp: ip,
    });
  } else if (table === 'OPERLOG') {
    await ingestOperlog({
      schemaName: tenant.schemaName,
      deviceSn: sn,
      body,
    });
    // OPERLOG payloads often carry biometric template records alongside USER rows.
    await ingestBioRecords({
      schemaName: tenant.schemaName,
      deviceSn: sn,
      body,
    });
  } else if (table === 'options') {
    logger.debug({ sn, table }, 'Received options table (ignored)');
  } else {
    logger.debug({ sn, table }, 'Unknown table received');
  }
}

export async function handleHeartbeat(
  sn: string,
  info?: string | null,
): Promise<string> {
  const tenant = await resolveTenantBySn(sn);
  if (!tenant) return 'OK';

  await touchHeartbeat(tenant.schemaName, tenant.deviceId, info ?? undefined);

  const pending = await getPendingCommands(tenant.schemaName, tenant.deviceId);
  if (pending.length === 0) return 'OK';

  await markCommandsSent(tenant.schemaName, pending.map((p) => p.id));
  return formatCommands(pending);
}

export async function handleCommandResult(sn: string, body: string) {
  const tenant = await resolveTenantBySn(sn);
  if (!tenant) return;

  // Device replies have two parts separated by newline:
  //   line 1: ID=N&Return=0&CMD=<command name>
  //   line 2+: free-form payload (e.g. "NetMask=255.255.255.0,DHCP=1,")
  // The previous parser split on `&` over the whole body, mangling the
  // payload. Parse the first line as URL-encoded params, keep everything
  // after the first newline as the response data.
  const newlineIdx = body.indexOf('\n');
  const headerLine = newlineIdx >= 0 ? body.slice(0, newlineIdx) : body;
  const responseData = newlineIdx >= 0 ? body.slice(newlineIdx + 1).trim() : '';

  const map: Record<string, string> = {};
  for (const part of headerLine.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    map[part.slice(0, eq)] = part.slice(eq + 1);
  }

  const id = Number.parseInt(map.ID ?? '0', 10);
  const ret = Number.parseInt(map.Return ?? '0', 10);
  const cmd = map.CMD ?? '';
  if (!id) return;

  await processCommandResult({
    schemaName: tenant.schemaName,
    deviceId: tenant.deviceId,
    commandId: id,
    returnCode: ret,
    cmd,
    responseData,
  });
}
