// High-level "set option X" helper that queues the right commands in the
// right order against the device. Used by the Settings tRPC mutations.

import { getTenantSql } from '@zkc/db/client';
import {
  buildDisableNetworkTimeSync,
  buildDisableAllNetworkTimeSyncVariants,
  buildEnableNetworkTimeSync,
  buildSyncTime,
  buildSyncTimeString,
  buildExecuteDateSet,
  buildExecuteHwclockWrite,
  buildReloadOptions,
  buildSetVolume,
  buildSetLanguage,
  buildSetIdleDuration,
  buildSetLCDOnDuration,
  buildSetVoicePrompt,
  buildSetLockOpenDuration,
  buildSetAntiPassback,
  buildSetVerifyMode,
  buildSetFpThreshold,
  buildSetFaceThreshold,
  buildSetLiveness,
  buildSetBrightness,
  buildSetDateFormat,
  buildSetTimeFormat,
  buildSetDst,
  buildSetDoorSensorDelay,
  buildSetLockType,
  buildSetDuressKey,
  buildSetTamperAlarm,
  buildSetFp1to1Threshold,
  buildSetFace1to1Threshold,
  buildSetPalmThreshold,
  buildSetPhotoOnVerify,
  buildSetWorkCodeEnable,
  buildSetHeartbeatInterval,
  buildSetTransFlag,
  buildSetTransTimes,
  buildSetTransInterval,
  buildSetRealtimeMode,
  buildEnrollFingerprint,
  buildEnrollFace,
  buildEnrollPalm,
  buildClearAttLog,
  buildClearAttPhotos,
  buildClearAllData,
  buildClearFingerprints,
  buildClearFaces,
  buildClearPalms,
  buildClearPhotos,
  buildClearAdmin,
  buildFactoryReset,
  type CommandPayload,
} from '@zkc/shared/firmware';
import { getZoneOffsetMs } from '@zkc/shared/timezone';
import { queueCommand } from './device-commands';

interface BaseArgs {
  schemaName: string;
  deviceId: string;
  issuedByUserId: string;
  issuedByEmail: string;
  reason?: string;
}

// REMOVED: pushFullTimeSync and pushForceTimeSync.
//
// They pushed SET OPTIONS DateTime (and variants) at the device. On
// SpeedFace V5L (ZAM170-NF v1.3.11) the firmware accepts the command
// (Return=0) but silently drops it. The wall-clock offset is owned by
// the device menu's Timezone selector, which has no remote API surface.
// Until the LAN-side agent ships (Sprint 2 — CMD_SET_TIME over TCP 4370),
// V5L time is set from the device menu. pushManualTime is kept below
// because it still works on older BioTime devices and is a harmless
// no-op on V5L.

interface SettingsPatch {
  // Display & audio
  volume?: number;
  languageId?: number;
  brightness?: number;
  idleDurationSec?: number;
  lcdOnDurationSec?: number;
  voicePromptOn?: boolean;
  // Date/time display formats
  dateFormat?: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY/MM/DD';
  timeFormat?: 12 | 24;
  dstOn?: boolean;
  // Access control
  lockOpenDurationSec?: number;
  antiPassbackMode?: 0 | 1 | 2 | 3;
  doorSensorDelaySec?: number;
  lockType?: 'NO' | 'NC';
  duressKey?: number;
  tamperAlarmOn?: boolean;
  // Verification
  verifyMode?: number;
  fpThreshold?: number;
  fp1to1Threshold?: number;
  faceThreshold?: number;
  face1to1Threshold?: number;
  palmThreshold?: number;
  livenessOn?: boolean;
  photoOnVerify?: boolean;
  workCodeOn?: boolean;
  // ADMS push behaviour
  heartbeatIntervalSec?: number;
  transFlag?: string;
  transTimes?: string;
  transIntervalMin?: number;
  realtimeOn?: boolean;
}

/** Push a batch of display/access/verify/etc. settings to the device. */
export async function pushSettingsPatch(args: BaseArgs & SettingsPatch) {
  const queued: number[] = [];
  const ops: Array<{ key: string; build: () => CommandPayload }> = [];

  if (args.volume !== undefined) ops.push({ key: 'volume', build: () => buildSetVolume(args.volume!) });
  if (args.languageId !== undefined) ops.push({ key: 'languageId', build: () => buildSetLanguage(args.languageId!) });
  if (args.brightness !== undefined) ops.push({ key: 'brightness', build: () => buildSetBrightness(args.brightness!) });
  if (args.idleDurationSec !== undefined) ops.push({ key: 'idleDurationSec', build: () => buildSetIdleDuration(args.idleDurationSec!) });
  if (args.lcdOnDurationSec !== undefined) ops.push({ key: 'lcdOnDurationSec', build: () => buildSetLCDOnDuration(args.lcdOnDurationSec!) });
  if (args.voicePromptOn !== undefined) ops.push({ key: 'voicePromptOn', build: () => buildSetVoicePrompt(args.voicePromptOn!) });
  if (args.dateFormat !== undefined) ops.push({ key: 'dateFormat', build: () => buildSetDateFormat(args.dateFormat!) });
  if (args.timeFormat !== undefined) ops.push({ key: 'timeFormat', build: () => buildSetTimeFormat(args.timeFormat!) });
  if (args.dstOn !== undefined) ops.push({ key: 'dstOn', build: () => buildSetDst(args.dstOn!) });
  if (args.lockOpenDurationSec !== undefined) ops.push({ key: 'lockOpenDurationSec', build: () => buildSetLockOpenDuration(args.lockOpenDurationSec!) });
  if (args.antiPassbackMode !== undefined) ops.push({ key: 'antiPassbackMode', build: () => buildSetAntiPassback(args.antiPassbackMode!) });
  if (args.doorSensorDelaySec !== undefined) ops.push({ key: 'doorSensorDelaySec', build: () => buildSetDoorSensorDelay(args.doorSensorDelaySec!) });
  if (args.lockType !== undefined) ops.push({ key: 'lockType', build: () => buildSetLockType(args.lockType!) });
  if (args.duressKey !== undefined) ops.push({ key: 'duressKey', build: () => buildSetDuressKey(args.duressKey!) });
  if (args.tamperAlarmOn !== undefined) ops.push({ key: 'tamperAlarmOn', build: () => buildSetTamperAlarm(args.tamperAlarmOn!) });
  if (args.verifyMode !== undefined) ops.push({ key: 'verifyMode', build: () => buildSetVerifyMode(args.verifyMode!) });
  if (args.fpThreshold !== undefined) ops.push({ key: 'fpThreshold', build: () => buildSetFpThreshold(args.fpThreshold!) });
  if (args.fp1to1Threshold !== undefined) ops.push({ key: 'fp1to1Threshold', build: () => buildSetFp1to1Threshold(args.fp1to1Threshold!) });
  if (args.faceThreshold !== undefined) ops.push({ key: 'faceThreshold', build: () => buildSetFaceThreshold(args.faceThreshold!) });
  if (args.face1to1Threshold !== undefined) ops.push({ key: 'face1to1Threshold', build: () => buildSetFace1to1Threshold(args.face1to1Threshold!) });
  if (args.palmThreshold !== undefined) ops.push({ key: 'palmThreshold', build: () => buildSetPalmThreshold(args.palmThreshold!) });
  if (args.livenessOn !== undefined) ops.push({ key: 'livenessOn', build: () => buildSetLiveness(args.livenessOn!) });
  if (args.photoOnVerify !== undefined) ops.push({ key: 'photoOnVerify', build: () => buildSetPhotoOnVerify(args.photoOnVerify!) });
  if (args.workCodeOn !== undefined) ops.push({ key: 'workCodeOn', build: () => buildSetWorkCodeEnable(args.workCodeOn!) });
  if (args.heartbeatIntervalSec !== undefined) ops.push({ key: 'heartbeatIntervalSec', build: () => buildSetHeartbeatInterval(args.heartbeatIntervalSec!) });
  if (args.transFlag !== undefined) ops.push({ key: 'transFlag', build: () => buildSetTransFlag(args.transFlag!) });
  if (args.transTimes !== undefined) ops.push({ key: 'transTimes', build: () => buildSetTransTimes(args.transTimes!) });
  if (args.transIntervalMin !== undefined) ops.push({ key: 'transIntervalMin', build: () => buildSetTransInterval(args.transIntervalMin!) });
  if (args.realtimeOn !== undefined) ops.push({ key: 'realtimeOn', build: () => buildSetRealtimeMode(args.realtimeOn!) });

  for (const op of ops) {
    const q = await queueCommand({
      schemaName: args.schemaName,
      deviceId: args.deviceId,
      payload: op.build(),
      issuedByUserId: args.issuedByUserId,
      issuedByEmail: args.issuedByEmail,
      reason: args.reason ?? `Update setting: ${op.key}`,
    });
    queued.push(q.commandId);
  }

  if (ops.length > 0) {
    const q = await queueCommand({
      schemaName: args.schemaName,
      deviceId: args.deviceId,
      payload: buildReloadOptions(),
      issuedByUserId: args.issuedByUserId,
      issuedByEmail: args.issuedByEmail,
      reason: 'Reload options after settings update',
    });
    queued.push(q.commandId);
  }

  // Save the patched settings on our side too so we can render them.
  const sql = getTenantSql(args.schemaName);
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (
      v !== undefined &&
      ![
        'schemaName',
        'deviceId',
        'issuedByUserId',
        'issuedByEmail',
        'reason',
      ].includes(k)
    ) {
      patch[k] = v;
    }
  }
  if (Object.keys(patch).length > 0) {
    await sql`
      UPDATE devices SET
        settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('deviceOptions', COALESCE(settings->'deviceOptions', '{}'::jsonb) || ${sql.json(patch)}::jsonb),
        updated_at = now()
      WHERE id = ${args.deviceId}
    `;
  }

  return { queuedCommandIds: queued };
}

export type MaintenanceKind =
  | 'clear_att_log'
  | 'clear_all_data'
  | 'clear_fingerprints'
  | 'clear_faces'
  | 'clear_palms'
  | 'clear_photos'
  | 'clear_admins'
  | 'factory_reset';

const MAINTENANCE_BUILDERS: Record<MaintenanceKind, () => ReturnType<typeof buildClearAttLog>> = {
  clear_att_log: buildClearAttLog,
  clear_all_data: buildClearAllData,
  clear_fingerprints: buildClearFingerprints,
  clear_faces: buildClearFaces,
  clear_palms: buildClearPalms,
  clear_photos: buildClearPhotos,
  clear_admins: buildClearAdmin,
  factory_reset: buildFactoryReset,
};

export async function pushMaintenance(args: BaseArgs & { kind: MaintenanceKind }) {
  const payload = MAINTENANCE_BUILDERS[args.kind]();
  return queueCommand({
    schemaName: args.schemaName,
    deviceId: args.deviceId,
    payload,
    issuedByUserId: args.issuedByUserId,
    issuedByEmail: args.issuedByEmail,
    reason: args.reason ?? `Maintenance: ${args.kind}`,
  });
}

export async function pushNtp(
  args: BaseArgs & { enabled: boolean; ntpServer?: string },
) {
  const payload = args.enabled
    ? buildEnableNetworkTimeSync(args.ntpServer)
    : buildDisableNetworkTimeSync();
  return queueCommand({
    schemaName: args.schemaName,
    deviceId: args.deviceId,
    payload,
    issuedByUserId: args.issuedByUserId,
    issuedByEmail: args.issuedByEmail,
    reason: args.reason ?? `NTP ${args.enabled ? 'enable' : 'disable'}`,
  });
}

/**
 * Set a user-specified wall-clock time on the device. The user types the
 * exact date+time in 24h format (no timezone math on our side); we push
 * it as-is via every known time-set primitive ZK devices accept.
 *
 * Useful when the device's RTC is wrong and the operator wants to set it
 * to a literal value — e.g. "right now in this room it's 13:18:00".
 */
export async function pushManualTime(
  args: BaseArgs & {
    /** Format: "YYYY-MM-DD HH:MM:SS" (24h, exact value to push to RTC) */
    dateTime: string;
  },
) {
  const reason = args.reason ?? `Manual time set to ${args.dateTime}`;
  const utc = Math.floor(new Date(`${args.dateTime}Z`).getTime() / 1000);
  const queued: number[] = [];

  const sequence: ReturnType<typeof buildSyncTime>[] = [
    // Try every NTP-disable variant so the manual value sticks
    ...buildDisableAllNetworkTimeSyncVariants(),
    // Push the time in multiple formats — the device firmware will pick
    // whichever one it understands.
    buildSyncTime(utc), // unix-seconds
    buildSyncTimeString(args.dateTime), // "YYYY-MM-DD HH:MM:SS" (no quotes)
    // SpeedFace V5L is Linux-based; if shell `EXECUTE` is allowed this
    // is the only reliable path.
    buildExecuteDateSet(args.dateTime),
    buildExecuteHwclockWrite(),
    buildReloadOptions(),
  ];

  for (const payload of sequence) {
    const q = await queueCommand({
      schemaName: args.schemaName,
      deviceId: args.deviceId,
      payload,
      issuedByUserId: args.issuedByUserId,
      issuedByEmail: args.issuedByEmail,
      reason,
    });
    queued.push(q.commandId);
  }

  const sql = getTenantSql(args.schemaName);
  const lastManualPush = {
    dateTime: args.dateTime,
    utcUnix: utc,
    queuedCommandIds: queued,
    at: new Date().toISOString(),
  };
  await sql`
    UPDATE devices SET
      timezone_synced_at = now(),
      settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('lastManualTimePush', ${sql.json(lastManualPush)}::jsonb),
      updated_at = now()
    WHERE id = ${args.deviceId}
  `;

  return { dateTime: args.dateTime, commandsQueued: queued.length };
}

