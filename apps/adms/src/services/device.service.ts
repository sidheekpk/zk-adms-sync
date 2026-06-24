import { getTenantSql } from '@zkc/db/client';
import { detectFirmwareFamily, type FirmwareFamily } from '@zkc/shared/firmware';
import { logger } from '../utils/logger';

interface UpsertOnHandshakeInput {
  schemaName: string;
  deviceId: string;
  sn: string;
  firmwareVersion?: string;
  deviceType?: string;
  pushVersion?: string;
  language?: string;
  ip?: string | null;
}

export async function upsertOnHandshake(input: UpsertOnHandshakeInput): Promise<{
  firmwareFamily: FirmwareFamily;
  isFirstHandshake: boolean;
  timezone: string;
}> {
  const sql = getTenantSql(input.schemaName);
  const family = detectFirmwareFamily({
    firmwareVersion: input.firmwareVersion,
    deviceType: input.deviceType,
  });

  // Read prior state before mutating so we can detect first handshake.
  const prior = await sql<Array<{ last_online: string | null; timezone: string }>>`
    SELECT last_online, timezone FROM devices WHERE id = ${input.deviceId} LIMIT 1
  `;
  const isFirst = !prior[0]?.last_online;

  await sql`
    UPDATE devices
    SET firmware_version = COALESCE(${input.firmwareVersion ?? null}, firmware_version),
        firmware_family = ${family}::firmware_family,
        push_version = COALESCE(${input.pushVersion ?? null}, push_version),
        device_type = COALESCE(${input.deviceType ?? null}, device_type),
        ip_address = COALESCE(${input.ip ?? null}, ip_address),
        last_online = now(),
        status = 'online',
        updated_at = now()
    WHERE id = ${input.deviceId}
  `;
  const rows = prior;
  if (isFirst) {
    logger.info({ sn: input.sn, family }, 'First handshake from device');
  }
  return {
    firmwareFamily: family,
    isFirstHandshake: isFirst,
    timezone: rows[0]?.timezone ?? 'UTC',
  };
}

export async function touchHeartbeat(schemaName: string, deviceId: string, infoLine?: string) {
  const sql = getTenantSql(schemaName);
  await sql`
    UPDATE devices
    SET last_online = now(),
        status = 'online',
        updated_at = now()
    WHERE id = ${deviceId}
  `;
  if (infoLine) parseInfoLine(schemaName, deviceId, infoLine);
}

async function parseInfoLine(schemaName: string, deviceId: string, info: string) {
  // INFO format observed on SpeedFace V5L (firmware ZAM170-NF-Ver1.3.11):
  //   firmwareVer,userCount,fingerCount,attLogCount,ip,?,?,faceCount,palmCount,flags
  const parts = info.split(',');
  if (parts.length < 5) return;
  const [firmwareVerRaw, userCount, fingerCount, attLogCount, ip, , , faceCount, palmCount] = parts;
  const firmwareVer = firmwareVerRaw?.trim() || null;
  const model = firmwareVer ? firmwareVer.split(/[-_ ]?Ver/i)[0] ?? null : null;

  // Re-detect firmware family from the model string the device just
  // gave us. The handshake-time detection only sees `pushver` (e.g.
  // "2.4.1"), which can't distinguish SpeedFace from BioTime — but the
  // INFO string carries the real model identifier.
  const family = detectFirmwareFamily({
    model,
    firmwareVersion: firmwareVer,
  });

  const sql = getTenantSql(schemaName);
  await sql`
    UPDATE devices SET
      firmware_version = COALESCE(${firmwareVer}, firmware_version),
      model = COALESCE(${model}, model),
      firmware_family = CASE
        WHEN ${family} = 'unknown' THEN firmware_family
        ELSE ${family}::firmware_family
      END,
      user_count = COALESCE(${parseIntOrNull(userCount)}, user_count),
      finger_count = COALESCE(${parseIntOrNull(fingerCount)}, finger_count),
      att_log_count = COALESCE(${parseIntOrNull(attLogCount)}, att_log_count),
      face_count = COALESCE(${parseIntOrNull(faceCount)}, face_count),
      palm_count = COALESCE(${parseIntOrNull(palmCount)}, palm_count),
      ip_address = COALESCE(${ip ?? null}, ip_address)
    WHERE id = ${deviceId}
  `;
}

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function markTimezoneSynced(schemaName: string, deviceId: string) {
  const sql = getTenantSql(schemaName);
  await sql`UPDATE devices SET timezone_synced_at = now() WHERE id = ${deviceId}`;
}
