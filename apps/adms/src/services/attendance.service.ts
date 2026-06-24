import { getTenantSql } from '@zkc/db/client';
import { parseAttlogBody, parseUserRows, decodePunchType, decodeVerifyMode } from '@zkc/shared/parser';
import { getZoneOffsetMs } from '@zkc/shared/timezone';
import { logger } from '../utils/logger';

/**
 * Convert a device-reported wall clock ("YYYY-MM-DD HH:MM:SS" in the
 * device's IANA timezone) into a UTC ISO string.
 *
 * Bypasses Postgres `AT TIME ZONE` — postgres-js binds the string param
 * as `timestamptz`, so the SQL cast `${str}::timestamp AT TIME ZONE tz`
 * ends up applying the offset twice and silently shifts the punch by
 * -5:30h on Kolkata. Doing the math in Node is unambiguous and avoids
 * any parameter-binding quirks.
 */
function deviceWallToUtcIso(wallString: string, timezone: string): string {
  const wallAsIfUtc = Date.parse(`${wallString}Z`); // treat as UTC moment for arithmetic
  if (!Number.isFinite(wallAsIfUtc)) throw new Error(`Bad wall string: ${wallString}`);
  const offsetMs = getZoneOffsetMs(timezone, new Date(wallAsIfUtc));
  // wall = real_UTC + offset  ⇒  real_UTC = wall - offset
  return new Date(wallAsIfUtc - offsetMs).toISOString();
}

export async function ingestAttlog(opts: {
  schemaName: string;
  deviceId: string;
  deviceSn: string;
  body: string;
  sourceIp?: string | null;
}) {
  const rows = parseAttlogBody(opts.body);
  if (rows.length === 0) return { count: 0 };

  const sql = getTenantSql(opts.schemaName);
  let inserted = 0;

  // The device reports punch_time as its local wall clock (e.g. "2026-06-22
  // 19:30:00" when the operator's phone shows 19:30 IST). To store it as
  // proper UTC, we need to interpret it through the device's configured
  // timezone. The device's IANA timezone is stored on the row.
  const dev = await sql<Array<{ timezone: string }>>`
    SELECT timezone FROM devices WHERE id = ${opts.deviceId} LIMIT 1
  `;
  const deviceTimezone = dev[0]?.timezone ?? 'UTC';

  // Track drift in settings for visibility, but ALWAYS use the device's
  // own reported time — operator explicitly does not want server-side
  // substitution.
  await measureDriftFromPunch(sql, opts.deviceId, rows[rows.length - 1]!.punchTime);

  for (const r of rows) {
    try {
      const emp = await sql<{ id: string }[]>`
        SELECT id FROM employees WHERE pin = ${r.pin} LIMIT 1
      `;
      const employeeId = emp[0]?.id ?? null;

      const punchType = decodePunchType(r.statusCode);
      const verifyMode = decodeVerifyMode(r.verifyModeCode);

      // Convert the device's wall-clock string into a UTC ISO string in
      // Node, avoiding postgres-js's timestamptz binding quirk. The
      // resulting ISO is unambiguous and inserts cleanly.
      const punchUtcIso = deviceWallToUtcIso(r.punchTime, deviceTimezone);

      const result = await sql`
        INSERT INTO attendance_logs (
          device_id, device_sn, employee_id, pin, punch_time,
          status_code, punch_type, verify_mode_code, verify_mode,
          work_code, temperature, raw_data, source_ip
        ) VALUES (
          ${opts.deviceId}, ${opts.deviceSn}, ${employeeId}, ${r.pin},
          ${punchUtcIso}::timestamptz,
          ${r.statusCode}, ${punchType}::punch_type,
          ${r.verifyModeCode}, ${verifyMode}::verify_mode,
          ${r.workCode}, ${r.temperature ?? null},
          ${r.raw}, ${opts.sourceIp ?? null}
        )
        ON CONFLICT (device_sn, pin, punch_time) DO NOTHING
      `;
      if (result.count > 0) inserted++;
    } catch (err) {
      logger.error({ err, row: r }, 'Failed to insert attendance row');
    }
  }
  if (inserted > 0) {
    logger.info({ deviceSn: opts.deviceSn, inserted, total: rows.length }, 'Ingested ATTLOG batch');
  }
  return { count: inserted };
}

async function measureDriftFromPunch(
  sql: ReturnType<typeof getTenantSql>,
  deviceId: string,
  punchTime: string,
) {
  try {
    // Find the device's configured timezone
    const dev = await sql<Array<{ timezone: string }>>`
      SELECT timezone FROM devices WHERE id = ${deviceId} LIMIT 1
    `;
    if (!dev[0]) return;

    const tzOffsetMs = getZoneOffsetMs(dev[0].timezone);
    const reportedDeviceWallMs = Date.parse(`${punchTime}Z`); // treat the bare timestamp as UTC for the math
    if (!Number.isFinite(reportedDeviceWallMs)) return;

    const expectedDeviceWallMs = Date.now() + tzOffsetMs;
    const driftSec = Math.round((reportedDeviceWallMs - expectedDeviceWallMs) / 1000);

    const driftPayload = {
      sec: driftSec,
      measuredAt: new Date().toISOString(),
      method: 'punch',
    };
    await sql`
      UPDATE devices SET
        settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('clockDrift', ${sql.json(driftPayload)}::jsonb),
        updated_at = now()
      WHERE id = ${deviceId}
    `;
    if (Math.abs(driftSec) > 30) {
      logger.warn(
        { deviceId, driftSec, timezone: dev[0].timezone },
        'Device clock drift detected',
      );
    }
  } catch (err) {
    logger.error({ err }, 'measureDriftFromPunch failed');
  }
}

export async function ingestOperlog(opts: {
  schemaName: string;
  deviceSn: string;
  body: string;
}) {
  const users = parseUserRows(opts.body);
  if (users.length === 0) return { users: 0 };

  const sql = getTenantSql(opts.schemaName);
  let upserted = 0;
  for (const u of users) {
    try {
      await sql`
        INSERT INTO employees (pin, name, device_privilege, card_number, password)
        VALUES (${u.pin}, ${u.name}, ${u.privilege}, ${u.card ?? null}, ${u.password ?? null})
        ON CONFLICT (pin) DO UPDATE SET
          name = EXCLUDED.name,
          device_privilege = EXCLUDED.device_privilege,
          card_number = EXCLUDED.card_number,
          updated_at = now()
      `;
      upserted++;
    } catch (err) {
      logger.error({ err, user: u }, 'Failed to upsert employee from OPERLOG');
    }
  }
  if (upserted > 0) {
    logger.info({ deviceSn: opts.deviceSn, upserted }, 'Ingested USER records from OPERLOG');
  }
  return { users: upserted };
}
