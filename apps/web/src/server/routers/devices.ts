import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import { router, tenantProcedure } from '../trpc';
import { logTenantAction } from '../audit';
import { platformDb, getTenantSql } from '@zkc/db/client';
import { deviceEnrollmentTokens } from '@zkc/db/platform';
import { deviceClockTimestamp, getZoneOffsetMs, isValidTimezone } from '@zkc/shared/timezone';
import type { FirmwareFamily } from '@zkc/shared/firmware';
import { buildSyncTime } from '@zkc/shared/firmware';
import {
  detectCapabilities,
  effectiveModalities,
  protocolCapabilitiesFor,
  type DeviceCapabilities,
  type ModalitySettings,
} from '@zkc/shared/capabilities';
import { verifyOperatorPassword } from '@/lib/operator-password';
import {
  buildCommandPayload,
  queueCommand,
  type CommandKind,
} from '../device-commands';
import {
  pushManualTime,
  pushMaintenance,
  pushNtp,
  type MaintenanceKind,
} from '../device-settings';
import { assertDeviceOnline } from '../device-guards';

const DESTRUCTIVE_KINDS = new Set<CommandKind>([
  'reboot',
  'clear_log',
  'clear_data',
  'open_door',
  'delete_user',
]);

// Returns the firmware_family + timezone for a device in a given tenant.
async function getDeviceContext(schemaName: string, deviceId: string) {
  const sql = getTenantSql(schemaName);
  const rows = await sql<
    Array<{
      id: string;
      serial_number: string;
      firmware_family: FirmwareFamily;
      timezone: string;
      name: string;
    }>
  >`
    SELECT id, serial_number, firmware_family, timezone, name
    FROM devices WHERE id = ${deviceId} LIMIT 1
  `;
  if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Device not found' });
  return rows[0];
}

async function checkOperatorPassword(schemaName: string, candidate: string) {
  const sql = getTenantSql(schemaName);
  const rows = await sql<Array<{ password_hash: string }>>`
    SELECT password_hash FROM operator_password LIMIT 1
  `;
  const stored = rows[0]?.password_hash;
  if (!stored) return false;
  return verifyOperatorPassword(stored, candidate);
}

export const devicesRouter = router({
  // ---- Read --------------------------------------------------------------
  list: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          id: string;
          serial_number: string;
          name: string;
          model: string | null;
          firmware_version: string | null;
          firmware_family: string;
          status: string;
          last_online: string | null;
          att_log_count: number | null;
          user_count: number | null;
          timezone: string;
          enabled: boolean;
          location_id: string | null;
          location_name: string | null;
        }>
      >`
        SELECT d.id, d.serial_number, d.name, d.model, d.firmware_version, d.firmware_family,
               d.status, d.last_online, d.att_log_count, d.user_count, d.timezone, d.enabled,
               d.location_id, l.name AS location_name
        FROM devices d
        LEFT JOIN locations l ON l.id = d.location_id
        ORDER BY d.name, d.serial_number
      `;
    }),

  get: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql`
        SELECT * FROM devices WHERE id = ${input.id} LIMIT 1
      `;
      const device = rows[0] ?? null;
      if (!device) return null;

      const d = device as Record<string, unknown>;
      const tz = d.timezone as string;
      const serverNowMs = Date.now();
      const tzOffsetMs = getZoneOffsetMs(tz, new Date(serverNowMs));

      const { caps, modelLabel } = detectCapabilities({
        model: d.model as string | null,
        firmwareVersion: d.firmware_version as string | null,
        deviceType: d.device_type as string | null,
      });
      const settings = (d.settings as {
        capabilities?: Partial<DeviceCapabilities>;
        modalities?: ModalitySettings;
        clockDrift?: { sec: number; measuredAt: string };
      }) ?? {};
      const effectiveCaps: DeviceCapabilities = { ...caps, ...(settings.capabilities ?? {}) };
      const modalities = effectiveModalities(effectiveCaps, settings.modalities);

      const protocol = protocolCapabilitiesFor(d.firmware_family as FirmwareFamily);

      // Device's reported wall clock = real_UTC + tz_offset + drift.
      // The drift is measured on every real punch (attendance.service.ts:
      // device_reported_time - expected_wall_at_punch). If the operator
      // set the device clock differently, drift captures it on the very
      // next punch — and this calculation reflects the new value.
      const driftSec = settings.clockDrift?.sec ?? 0;
      const deviceLocalMs = serverNowMs + tzOffsetMs + driftSec * 1000;
      const driftMeasuredAt = settings.clockDrift?.measuredAt ?? null;

      return {
        ...device,
        clock: {
          timezone: tz,
          serverNowMs,
          deviceLocalMs,
          deviceUnix: deviceClockTimestamp(tz),
          driftSec,
          driftMeasuredAt,
        },
        capabilities: effectiveCaps,
        modalities,
        modelLabel,
        protocol,
      };
    }),

  // Updates the device's IANA timezone label in our DB only. We deliberately
  // do NOT push to the device — yesterday's V5L diagnosis proved that
  // SET OPTIONS DateTime is silently swallowed and the wall-clock offset is
  // owned by the menu's Timezone selector, which only the on-site operator
  // can change. The label here is used by our own attendance ingestion
  // (interpreting device wall as local time) and drift card math.
  updateTimezone: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        deviceId: z.string().uuid(),
        timezone: z.string().min(1).refine(isValidTimezone, 'Invalid IANA timezone'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      await sql`
        UPDATE devices SET timezone = ${input.timezone}, updated_at = now()
        WHERE id = ${input.deviceId}
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device.timezone.update',
        targetType: 'device',
        targetId: input.deviceId,
        diff: { after: { timezone: input.timezone } },
      });
      return { timezone: input.timezone };
    }),

  // ---- Device Info (READ-ONLY) ----------------------------------------
  // Fires multi-field GET OPTIONS bundles across every category. The
  // device's responses are parsed by command.service.snapshotDeviceInfo
  // and stored in `devices.settings.deviceInfo` (JSONB). The UI reads
  // that JSONB and renders. We deliberately have NO write mutations
  // for device settings — V5L firmware accepts SET OPTIONS but never
  // applies them; we're not lying to operators about that anymore.
  queryDeviceInfo: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), deviceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertDeviceOnline(ctx.tenant.schemaName, input.deviceId);
      // Categories — each one is a single multi-field GET OPTIONS call.
      // Single-field GETs return empty on V5L for some keys, but a
      // multi-field call returns everything the device exposes.
      const bundles: string[] = [
        'IPAddress,NetMask,GATEIPAddress,DNS,DHCP,MACAddress',
        'Timezone,TZAdj,NetworkTimeSync,DateTimeFormat,DSTSwitch',
        'Volume,Brightness,Language,IdleDuration,LCDOnDuration,VoicePrompt',
        'DateFormat,TimeFormat,DSTSwitch',
        'LockOpenDuration,DoorSensorDelay,LockType,AntiPassbackOn,DuressKey,TamperAlarmOn',
        'VerifyMode,LivenessDetect,FPThreshold,FP1to1Threshold,FaceThreshold,Face1to1Threshold,PalmThreshold,PhotoOnVerify,WorkCode',
        'Delay,Realtime,TransFlag,TransTimes,TransInterval',
        '~OS,FirmVer,~SerialNumber,~ZKFPVersion,~Platform,~DeviceName,DeviceID',
      ];
      const queuedCommandIds: number[] = [];
      for (const fields of bundles) {
        const q = await queueCommand({
          schemaName: ctx.tenant.schemaName,
          deviceId: input.deviceId,
          payload: { type: 'GET_OPTIONS', payload: `GET OPTIONS ${fields}` },
          issuedByUserId: ctx.session.user.id,
          issuedByEmail: ctx.session.user.email,
          reason: 'Device Info refresh',
        });
        queuedCommandIds.push(q.commandId);
      }
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device.info.query',
        targetType: 'device',
        targetId: input.deviceId,
        metadata: { bundleCount: bundles.length },
      });
      return { queued: queuedCommandIds.length };
    }),

  notifications: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const offline = await sql<
        Array<{ id: string; serial_number: string; name: string; last_online: string | null }>
      >`
        SELECT id, serial_number, name, last_online
        FROM devices
        WHERE enabled = true AND status != 'online'
        ORDER BY last_online DESC NULLS LAST
      `;
      const drifting = await sql<
        Array<{ id: string; name: string; drift_sec: number }>
      >`
        SELECT id, name,
          (settings->'clockDrift'->>'sec')::int AS drift_sec
        FROM devices
        WHERE settings ? 'clockDrift'
          AND abs((settings->'clockDrift'->>'sec')::int) > 60
      `;
      const pending = await sql<Array<{ count: string }>>`
        SELECT count(*)::text AS count
        FROM device_commands
        WHERE status = 'pending'
      `;
      return {
        offlineDevices: offline,
        driftingDevices: drifting,
        pendingCommands: Number(pending[0]?.count ?? 0),
      };
    }),

  setManualTime: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        deviceId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
        second: z.number().int().min(0).max(59).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertDeviceOnline(ctx.tenant.schemaName, input.deviceId);
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateTime = `${input.date} ${pad(input.hour)}:${pad(input.minute)}:${pad(input.second)}`;
      const result = await pushManualTime({
        schemaName: ctx.tenant.schemaName,
        deviceId: input.deviceId,
        dateTime,
        issuedByUserId: ctx.session.user.id,
        issuedByEmail: ctx.session.user.email,
      });
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device.time.manual_set',
        targetType: 'device',
        targetId: input.deviceId,
        metadata: { dateTime, ...result },
      });
      return result;
    }),

  // Removed: forceTimeSync / pushFullTimeSync — both pushed SET OPTIONS
  // DateTime + Timezone + TZAdj as a chain. On SpeedFace V5L (ZAM170-NF) the
  // DateTime SET is silently swallowed by firmware (no display change), and
  // the wall-clock offset is owned by the menu's Timezone selector which
  // our ADMS commands cannot reach. Until the LAN-side agent ships (Sprint
  // 2 — uses CMD_SET_TIME 0xCA over TCP 4370), time must be set manually
  // from the device menu. `setManualTime` is kept because it still works
  // on older BioTime devices that accept SET OPTIONS DateTime.

  updateNtp: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        deviceId: z.string().uuid(),
        enabled: z.boolean(),
        ntpServer: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertDeviceOnline(ctx.tenant.schemaName, input.deviceId);
      const queued = await pushNtp({
        schemaName: ctx.tenant.schemaName,
        deviceId: input.deviceId,
        issuedByUserId: ctx.session.user.id,
        issuedByEmail: ctx.session.user.email,
        enabled: input.enabled,
        ntpServer: input.ntpServer,
      });
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: input.enabled ? 'device.ntp.enable' : 'device.ntp.disable',
        targetType: 'device',
        targetId: input.deviceId,
      });
      return queued;
    }),

  runMaintenance: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        deviceId: z.string().uuid(),
        kind: z.enum([
          'clear_att_log',
          'clear_all_data',
          'clear_fingerprints',
          'clear_faces',
          'clear_palms',
          'clear_photos',
          'clear_admins',
          'factory_reset',
        ]),
        operatorPassword: z.string(),
        reason: z.string().min(1).max(280),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertDeviceOnline(ctx.tenant.schemaName, input.deviceId);
      const ok = await checkOperatorPassword(ctx.tenant.schemaName, input.operatorPassword);
      if (!ok) {
        await logTenantAction(ctx, {
          tenantSchema: ctx.tenant.schemaName,
          action: `device.maintenance.${input.kind}.denied`,
          targetType: 'device',
          targetId: input.deviceId,
          result: 'denied',
          reason: input.reason,
          errorMessage: 'Wrong operator password',
        });
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Wrong operator password' });
      }
      const result = await pushMaintenance({
        schemaName: ctx.tenant.schemaName,
        deviceId: input.deviceId,
        kind: input.kind as MaintenanceKind,
        reason: input.reason,
        issuedByUserId: ctx.session.user.id,
        issuedByEmail: ctx.session.user.email,
      });
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: `device.maintenance.${input.kind}`,
        targetType: 'device',
        targetId: input.deviceId,
        reason: input.reason,
        operatorPasswordVerified: true,
      });
      return result;
    }),

  updateModalities: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        deviceId: z.string().uuid(),
        modalities: z.object({
          fingerprint: z.boolean().optional(),
          face: z.boolean().optional(),
          palm: z.boolean().optional(),
          card: z.boolean().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      await sql`
        UPDATE devices SET
          settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('modalities', ${sql.json(input.modalities)}::jsonb),
          updated_at = now()
        WHERE id = ${input.deviceId}
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device.modalities.update',
        targetType: 'device',
        targetId: input.deviceId,
        diff: { after: input.modalities },
      });
      return { ok: true as const };
    }),

  refreshStatus: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), deviceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<
        Array<{
          serial_number: string;
          status: string;
          last_online: string | null;
          last_online_age_ms: number | null;
        }>
      >`
        SELECT serial_number, status::text AS status, last_online,
          CASE
            WHEN last_online IS NULL THEN NULL
            ELSE EXTRACT(EPOCH FROM (now() - last_online))::int * 1000
          END AS last_online_age_ms
        FROM devices WHERE id = ${input.deviceId} LIMIT 1
      `;
      const row = rows[0];
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Device not found' });

      const OFFLINE_TIMEOUT_MS = 90_000;
      const isLive =
        row.last_online_age_ms !== null && row.last_online_age_ms < OFFLINE_TIMEOUT_MS;

      await sql`
        UPDATE devices
        SET status = ${isLive ? 'online' : 'offline'}::device_status,
            updated_at = now()
        WHERE id = ${input.deviceId}
      `;

      return {
        serialNumber: row.serial_number,
        previousStatus: row.status,
        currentStatus: isLive ? 'online' : 'offline',
        lastOnlineAgeMs: row.last_online_age_ms,
        hint: isLive
          ? 'Device is alive — status corrected to online.'
          : 'No recent heartbeat. Check: device powered on, on the same network, ADMS server pointing here?',
      };
    }),

  setEnabled: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        deviceId: z.string().uuid(),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      await sql`
        UPDATE devices SET enabled = ${input.enabled}, updated_at = now()
        WHERE id = ${input.deviceId}
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: input.enabled ? 'device.enable' : 'device.disable',
        targetType: 'device',
        targetId: input.deviceId,
      });
      return { ok: true as const };
    }),

  // ---- Enrollment tokens ------------------------------------------------
  issueEnrollmentToken: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        intendedDeviceName: z.string().min(1).max(120).optional(),
        intendedDeviceModel: z.string().optional(),
        ttlMinutes: z.number().int().min(5).max(1440).default(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const token = randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + input.ttlMinutes * 60_000);

      const [row] = await platformDb
        .insert(deviceEnrollmentTokens)
        .values({
          tenantId: ctx.tenant.id,
          token,
          issuedByUserId: ctx.session.user.id,
          intendedDeviceName: input.intendedDeviceName,
          intendedDeviceModel: input.intendedDeviceModel,
          expiresAt,
        })
        .returning();

      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device.enrollment_token.issue',
        targetType: 'enrollment_token',
        targetId: row?.id,
        metadata: { intendedDeviceName: input.intendedDeviceName },
      });

      return {
        token,
        expiresAt,
        intendedDeviceName: input.intendedDeviceName,
      };
    }),

  // ---- Commands ----------------------------------------------------------
  listCommands: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        deviceId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          id: string;
          command_id: number;
          command: string;
          command_type: string;
          status: string;
          return_code: number | null;
          response_data: string | null;
          issued_by_email: string | null;
          reason: string | null;
          sent_at: string | null;
          completed_at: string | null;
          expires_at: string;
          created_at: string;
        }>
      >`
        SELECT id, command_id, command, command_type, status::text AS status,
               return_code, response_data, issued_by_email, reason,
               sent_at, completed_at, expires_at, created_at
        FROM device_commands
        WHERE device_id = ${input.deviceId}
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `;
    }),

  queueCommand: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        deviceId: z.string().uuid(),
        kind: z.enum([
          'sync_time',
          'get_info',
          'get_options',
          'query_network',
          'query_users',
          'reboot',
          'clear_log',
          'clear_data',
          'open_door',
          'add_user',
          'delete_user',
        ]),
        params: z.record(z.unknown()).optional(),
        reason: z.string().max(280).optional(),
        operatorPassword: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertDeviceOnline(ctx.tenant.schemaName, input.deviceId);
      const kind = input.kind as CommandKind;
      const isDestructive = DESTRUCTIVE_KINDS.has(kind);

      let operatorOk = false;
      if (isDestructive) {
        if (!input.operatorPassword) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Operator password required for this action',
          });
        }
        operatorOk = await checkOperatorPassword(ctx.tenant.schemaName, input.operatorPassword);
        if (!operatorOk) {
          await logTenantAction(ctx, {
            tenantSchema: ctx.tenant.schemaName,
            action: `device.command.${kind}.denied`,
            targetType: 'device',
            targetId: input.deviceId,
            result: 'denied',
            reason: input.reason,
            errorMessage: 'Wrong operator password',
          });
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Wrong operator password' });
        }
        if (!input.reason) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'A reason is required for destructive actions',
          });
        }
      }

      const dev = await getDeviceContext(ctx.tenant.schemaName, input.deviceId);
      const payload = buildCommandPayload({
        kind,
        family: dev.firmware_family,
        timezone: dev.timezone,
        params: input.params,
      });

      const queued = await queueCommand({
        schemaName: ctx.tenant.schemaName,
        deviceId: input.deviceId,
        payload,
        issuedByUserId: ctx.session.user.id,
        issuedByEmail: ctx.session.user.email,
        reason: input.reason ?? null,
      });

      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: `device.command.${kind}`,
        targetType: 'device',
        targetId: input.deviceId,
        reason: input.reason,
        operatorPasswordVerified: operatorOk,
        metadata: { commandId: queued.commandId, command: queued.command },
      });

      return queued;
    }),

  cancelCommand: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), commandId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const updated = await sql<Array<{ id: string }>>`
        UPDATE device_commands
        SET status = 'cancelled',
            completed_at = now()
        WHERE id = ${input.commandId} AND status = 'pending'
        RETURNING id
      `;
      if (!updated[0]) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Command is not pending — cannot cancel',
        });
      }
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device.command.cancel',
        targetType: 'device_command',
        targetId: input.commandId,
      });
      return { ok: true as const };
    }),
});
