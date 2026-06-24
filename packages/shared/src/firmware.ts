// Firmware dialect detection + command dispatch.
//
// Different ZKTeco product lines accept slightly different ADMS commands.
// We learned the hard way on 2026-06-18 that SpeedFace-V5L (ZAM170-NF
// firmware) rejects the new-style `DATA QUERY tablename=user,fielddesc=*,
// filter=*` syntax with -1004 ("command not supported") and requires the
// legacy form `DATA QUERY USERINFO`.
//
// This module centralises that knowledge so we can pick the right wire
// form based on what we know about the device.

export type FirmwareFamily =
  | 'speedface'   // SpeedFace V5L, ZAM170-NF, etc. — legacy DATA QUERY syntax
  | 'biotime'     // BioTime / older iClock — modern parameterised syntax
  | 'iface'       // iFace family
  | 'green_label' // SilkBio / Green Label
  | 'unknown';

/**
 * Best-effort detection from the device's handshake/info string.
 * The handshake includes a firmware identifier such as
 * "ZAM170-NF-Ver1.3.11" (SpeedFace) or "Ver 6.60 Nov 11 2019" (BioTime).
 */
export function detectFirmwareFamily(input: {
  firmwareVersion?: string;
  deviceType?: string;
  platform?: string;
}): FirmwareFamily {
  const v = `${input.firmwareVersion ?? ''} ${input.deviceType ?? ''} ${input.platform ?? ''}`
    .toLowerCase();

  if (v.includes('zam170') || v.includes('speedface') || v.includes('zem900')) return 'speedface';
  if (v.includes('zem8') || v.includes('biotime') || v.includes('iclock')) return 'biotime';
  if (v.includes('iface')) return 'iface';
  if (v.includes('silkbio') || v.includes('green')) return 'green_label';
  return 'unknown';
}

// ---- Command builders -----------------------------------------------------
// All builders return a payload-only string — the calling code prefixes it
// with the per-device command id ("C:42:") before sending.

export interface CommandPayload {
  type: string;
  payload: string;
  destructive?: boolean; // requires operator-password confirmation
}

const SAFE_DEFAULT = (input: string): string => input;

interface UserUpsert {
  pin: string;
  name: string;
  privilege?: number;
  password?: string;
  card?: string;
}

function legacyUserUpsertPayload(p: UserUpsert): string {
  // SpeedFace + iFace use legacy "DATA UPDATE USERINFO" with tab-separated fields.
  const parts = [
    `PIN=${p.pin}`,
    `Name=${p.name}`,
    `Pri=${p.privilege ?? 0}`,
    `Passwd=${p.password ?? ''}`,
    `Card=${p.card ?? ''}`,
    `Grp=1`,
    `TZ=0000000000000000`,
    `Verify=-1`,
  ];
  return `DATA UPDATE USERINFO ${parts.join('\t')}`;
}

function modernUserUpsertPayload(p: UserUpsert): string {
  const parts = [
    `PIN=${p.pin}`,
    `Name=${p.name}`,
    `Pri=${p.privilege ?? 0}`,
    `Passwd=${p.password ?? ''}`,
    `Card=${p.card ?? ''}`,
  ];
  return `DATA UPDATE user ${parts.join('\t')}`;
}

// Each family overrides specific commands; unspecified ones fall back to
// the "modern" default (BioTime / iClock style).
export const dialects = {
  unknown: {
    queryUsers(): CommandPayload {
      return {
        type: 'DATA_QUERY_USER',
        payload: 'DATA QUERY tablename=user,fielddesc=*,filter=*',
      };
    },
    addUser(p: UserUpsert): CommandPayload {
      return { type: 'DATA_UPDATE_USER', payload: modernUserUpsertPayload(p) };
    },
  },
  biotime: {
    queryUsers(): CommandPayload {
      return {
        type: 'DATA_QUERY_USER',
        payload: 'DATA QUERY tablename=user,fielddesc=*,filter=*',
      };
    },
    addUser(p: UserUpsert): CommandPayload {
      return { type: 'DATA_UPDATE_USER', payload: modernUserUpsertPayload(p) };
    },
  },
  iface: {
    queryUsers(): CommandPayload {
      return { type: 'DATA_QUERY_USER', payload: 'DATA QUERY USERINFO' };
    },
    addUser(p: UserUpsert): CommandPayload {
      return { type: 'DATA_UPDATE_USER', payload: legacyUserUpsertPayload(p) };
    },
  },
  green_label: {
    queryUsers(): CommandPayload {
      return {
        type: 'DATA_QUERY_USER',
        payload: 'DATA QUERY tablename=user,fielddesc=*,filter=*',
      };
    },
    addUser(p: UserUpsert): CommandPayload {
      return { type: 'DATA_UPDATE_USER', payload: modernUserUpsertPayload(p) };
    },
  },
  speedface: {
    queryUsers(): CommandPayload {
      // Confirmed working on ZAM170-NF-Ver1.3.11 (2026-06-18)
      return { type: 'DATA_QUERY_USER', payload: 'DATA QUERY USERINFO' };
    },
    addUser(p: UserUpsert): CommandPayload {
      // Modern syntax returns -1004 on SpeedFace; legacy USERINFO works.
      return { type: 'DATA_UPDATE_USER', payload: legacyUserUpsertPayload(p) };
    },
  },
} satisfies Record<
  FirmwareFamily,
  { queryUsers(): CommandPayload; addUser(p: UserUpsert): CommandPayload }
>;

// ---- Universal commands (same syntax across families, for now) -----------
export function buildReboot(): CommandPayload {
  return { type: 'REBOOT', payload: 'REBOOT', destructive: true };
}

export function buildClearLog(): CommandPayload {
  return { type: 'CLEAR_LOG', payload: 'CLEAR LOG', destructive: true };
}

export function buildClearData(): CommandPayload {
  return { type: 'CLEAR_DATA', payload: 'CLEAR DATA', destructive: true };
}

export function buildGetInfo(): CommandPayload {
  return { type: 'INFO', payload: 'INFO' };
}

export function buildGetOptions(fields: string[] = [
  '~SerialNumber',
  'FirmVer',
  'IPAddress',
  'MACAddress',
  'UserCount',
  'AttLogCount',
]): CommandPayload {
  return {
    type: 'GET_OPTIONS',
    payload: `GET OPTIONS ${fields.join(',')}`,
  };
}

/**
 * Set DateTime as a raw value. Most devices want unix-seconds. The
 * interpretation (UTC vs local wall-clock) depends on the device's
 * Timezone setting — see `buildSetTimezoneOffset`.
 */
export function buildSyncTime(unixSeconds?: number): CommandPayload {
  const ts = unixSeconds ?? Math.floor(Date.now() / 1000);
  return {
    type: 'SET_TIME',
    payload: `SET OPTIONS DateTime=${ts}`,
  };
}

/**
 * Tell the device its timezone offset in seconds. For Asia/Dubai (+4)
 * this is 14400; for Asia/Kolkata (+5:30) this is 19800.
 *
 * IMPORTANT: on SpeedFace V5L (ZAM170 firmware) the `Timezone` field is
 * essentially metadata — the wall-clock display is driven by a SEPARATE
 * `TZAdj` field (hours, decimal). Pushing only `Timezone` leaves a stale
 * `TZAdj` behind and the display stays at the OLD offset. Always pair
 * this with `buildSetTZAdj()` — see `pushFullTimeSync`.
 */
export function buildSetTimezoneOffset(offsetSeconds: number): CommandPayload {
  return {
    type: 'SET_OPTIONS_TZ',
    payload: `SET OPTIONS Timezone=${offsetSeconds}`,
  };
}

/**
 * Set the operative timezone offset on SpeedFace V5L (ZAM170) and similar
 * firmwares. The unit is decimal HOURS — accepts half-hours (5.5 for
 * Kerala +5:30) and quarter-hours (5.75 for Nepal +5:45). The device
 * computes wall clock as `RTC_UTC + TZAdj`.
 *
 * Pair with `buildSetTimezoneOffset()` so both fields stay in sync.
 */
export function buildSetTZAdj(hoursDecimal: number): CommandPayload {
  return {
    type: 'SET_OPTIONS_TZ_ADJ',
    payload: `SET OPTIONS TZAdj=${hoursDecimal}`,
  };
}

/**
 * Disable NTP so the device respects our pushed DateTime instead of
 * silently overwriting it on the next NTP cycle. Many SpeedFace
 * deployments ship with this enabled by default which is why "Sync time"
 * appears to succeed but the device clock doesn't change.
 */
export function buildDisableNetworkTimeSync(): CommandPayload {
  return {
    type: 'SET_OPTIONS_NTP_OFF',
    payload: 'SET OPTIONS NetworkTimeSync=0',
  };
}

export function buildEnableNetworkTimeSync(ntpServer?: string): CommandPayload {
  const payload = ntpServer
    ? `SET OPTIONS NetworkTimeSync=1\nSET OPTIONS NTPServer=${ntpServer}`
    : 'SET OPTIONS NetworkTimeSync=1';
  return { type: 'SET_OPTIONS_NTP_ON', payload };
}

/**
 * SpeedFace V5L (ZAM170 firmware) often ships with cloud-time-sync enabled
 * under a key name that's NOT `NetworkTimeSync`. The device returns Return=0
 * for every SET OPTIONS regardless of whether it understood the key, so we
 * can't tell from the response which key actually toggled. We push every
 * known variant — whichever the firmware accepts will stick.
 */
export function buildDisableAllNetworkTimeSyncVariants(): CommandPayload[] {
  const keys = [
    'NetworkTimeSync',
    'CloudTimeSync',
    'AutoTimeSync',
    'ServerTimeSync',
    'TimeSyncWithServer',
    'OnlySyncCloudTime',
    'UseTimeServer',
    'NTPSwitch',
    '~CloudTimeSync',
  ];
  return keys.map((key) => ({
    type: `SET_OPTIONS_NTP_OFF_${key}`,
    payload: `SET OPTIONS ${key}=0`,
  }));
}

/**
 * String-format DateTime push. Some ZK firmwares (newer Linux-based)
 * accept this instead of unix-seconds. Format: "YYYY-MM-DD HH:MM:SS".
 */
export function buildSyncTimeString(dateString: string): CommandPayload {
  return {
    type: 'SET_TIME_STRING',
    payload: `SET OPTIONS DateTime=${dateString}`,
  };
}

/**
 * SpeedFace V5L runs Linux internally and accepts shell `EXECUTE` commands
 * on some firmwares (ZAM170). This bypasses the silently-ignored
 * `SET OPTIONS DateTime` path by setting the system clock directly via
 * the device's shell.
 */
export function buildExecuteDateSet(dateString: string): CommandPayload {
  // dateString format expected: "YYYY-MM-DD HH:MM:SS"
  return {
    type: 'EXECUTE_DATE',
    payload: `EXECUTE date -s "${dateString}"`,
  };
}

export function buildExecuteHwclockWrite(): CommandPayload {
  // Persist the system clock to the hardware RTC so it survives reboot.
  return {
    type: 'EXECUTE_HWCLOCK',
    payload: 'EXECUTE hwclock -w',
  };
}

/**
 * Force the device to reload its options from storage. Some firmwares
 * cache option values in RAM and only commit on next reboot or this
 * explicit command.
 */
export function buildReloadOptions(): CommandPayload {
  return { type: 'RELOAD_OPTIONS', payload: 'RELOAD OPTIONS' };
}

// ---- Display / audio settings -------------------------------------------
export function buildSetVolume(volume: number): CommandPayload {
  const v = Math.max(0, Math.min(100, Math.round(volume)));
  return { type: 'SET_OPTIONS_VOLUME', payload: `SET OPTIONS Volume=${v}` };
}

export function buildSetLanguage(languageId: number): CommandPayload {
  return { type: 'SET_OPTIONS_LANG', payload: `SET OPTIONS Language=${languageId}` };
}

export function buildSetIdleDuration(seconds: number): CommandPayload {
  return { type: 'SET_OPTIONS_IDLE', payload: `SET OPTIONS IdleDuration=${Math.max(0, seconds)}` };
}

export function buildSetLCDOnDuration(seconds: number): CommandPayload {
  return {
    type: 'SET_OPTIONS_LCD',
    payload: `SET OPTIONS LCDOnDuration=${Math.max(0, seconds)}`,
  };
}

export function buildSetVoicePrompt(on: boolean): CommandPayload {
  return { type: 'SET_OPTIONS_VOICE', payload: `SET OPTIONS VoicePrompt=${on ? 1 : 0}` };
}

// ---- Access control settings ---------------------------------------------
export function buildSetLockOpenDuration(seconds: number): CommandPayload {
  const v = Math.max(1, Math.min(10, Math.round(seconds)));
  return {
    type: 'SET_OPTIONS_LOCK_DURATION',
    payload: `SET OPTIONS LockOpenDuration=${v}`,
  };
}

export function buildSetAntiPassback(mode: 0 | 1 | 2 | 3): CommandPayload {
  return {
    type: 'SET_OPTIONS_ANTIPASSBACK',
    payload: `SET OPTIONS AntiPassbackOn=${mode}`,
  };
}

// ---- Verification ------------------------------------------------------
export function buildSetVerifyMode(mode: number): CommandPayload {
  return {
    type: 'SET_OPTIONS_VERIFY_MODE',
    payload: `SET OPTIONS VerifyMode=${mode}`,
  };
}

export function buildSetFpThreshold(threshold: number): CommandPayload {
  const v = Math.max(0, Math.min(100, Math.round(threshold)));
  return { type: 'SET_OPTIONS_FP_THRESHOLD', payload: `SET OPTIONS FPThreshold=${v}` };
}

export function buildSetFaceThreshold(threshold: number): CommandPayload {
  const v = Math.max(0, Math.min(100, Math.round(threshold)));
  return {
    type: 'SET_OPTIONS_FACE_THRESHOLD',
    payload: `SET OPTIONS FaceThreshold=${v}`,
  };
}

export function buildSetLiveness(on: boolean): CommandPayload {
  return {
    type: 'SET_OPTIONS_LIVENESS',
    payload: `SET OPTIONS LivenessDetect=${on ? 1 : 0}`,
  };
}

// ---- Maintenance -------------------------------------------------------
export function buildClearAttLog(): CommandPayload {
  return { type: 'CLEAR_LOG', payload: 'CLEAR LOG', destructive: true };
}

export function buildClearAllData(): CommandPayload {
  return { type: 'CLEAR_DATA', payload: 'CLEAR DATA', destructive: true };
}

export function buildClearFingerprints(): CommandPayload {
  return { type: 'CLEAR_FP', payload: 'CLEAR FINGERTMP', destructive: true };
}

export function buildClearFaces(): CommandPayload {
  return { type: 'CLEAR_FACE', payload: 'CLEAR FACE', destructive: true };
}

export function buildClearPalms(): CommandPayload {
  return { type: 'CLEAR_PALM', payload: 'CLEAR PALMTMP', destructive: true };
}

export function buildClearPhotos(): CommandPayload {
  return { type: 'CLEAR_PHOTO', payload: 'CLEAR PHOTO', destructive: true };
}

export function buildClearAdmin(): CommandPayload {
  return { type: 'CLEAR_ADMIN', payload: 'CLEAR ADMIN', destructive: true };
}

export function buildFactoryReset(): CommandPayload {
  return { type: 'FACTORY_RESET', payload: 'SET OPTIONS DefaultSetting=1', destructive: true };
}

// ---- Display additions --------------------------------------------------
export function buildSetBrightness(n: number): CommandPayload {
  return { type: 'SET_OPTIONS_BRIGHTNESS', payload: `SET OPTIONS Brightness=${Math.max(1, Math.min(100, Math.round(n)))}` };
}

export function buildSetDateFormat(fmt: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY/MM/DD'): CommandPayload {
  return { type: 'SET_OPTIONS_DATEFMT', payload: `SET OPTIONS DateFormat=${fmt}` };
}

export function buildSetTimeFormat(hours: 12 | 24): CommandPayload {
  return { type: 'SET_OPTIONS_TIMEFMT', payload: `SET OPTIONS TimeFormat=${hours === 12 ? 0 : 1}` };
}

export function buildSetDst(on: boolean): CommandPayload {
  return { type: 'SET_OPTIONS_DST', payload: `SET OPTIONS DSTSwitch=${on ? 1 : 0}` };
}

// ---- Access-control additions -------------------------------------------
export function buildSetDoorSensorDelay(seconds: number): CommandPayload {
  return { type: 'SET_OPTIONS_DOOR_SENSOR_DELAY', payload: `SET OPTIONS DoorSensorDelay=${Math.max(0, Math.min(60, Math.round(seconds)))}` };
}

export function buildSetLockType(t: 'NO' | 'NC'): CommandPayload {
  // NO = normally open (locked when energised); NC = normally closed
  return { type: 'SET_OPTIONS_LOCK_TYPE', payload: `SET OPTIONS LockType=${t === 'NO' ? 0 : 1}` };
}

export function buildSetDuressKey(key: number): CommandPayload {
  return { type: 'SET_OPTIONS_DURESS', payload: `SET OPTIONS DuressKey=${key}` };
}

export function buildSetTamperAlarm(on: boolean): CommandPayload {
  return { type: 'SET_OPTIONS_TAMPER', payload: `SET OPTIONS TamperAlarmOn=${on ? 1 : 0}` };
}

// ---- Verification additions ---------------------------------------------
export function buildSetFp1to1Threshold(n: number): CommandPayload {
  return { type: 'SET_OPTIONS_FP_1TO1', payload: `SET OPTIONS FP1to1Threshold=${Math.max(0, Math.min(100, Math.round(n)))}` };
}

export function buildSetFace1to1Threshold(n: number): CommandPayload {
  return { type: 'SET_OPTIONS_FACE_1TO1', payload: `SET OPTIONS Face1to1Threshold=${Math.max(0, Math.min(100, Math.round(n)))}` };
}

export function buildSetPalmThreshold(n: number): CommandPayload {
  return { type: 'SET_OPTIONS_PALM_THRESH', payload: `SET OPTIONS PalmThreshold=${Math.max(0, Math.min(100, Math.round(n)))}` };
}

export function buildSetPhotoOnVerify(on: boolean): CommandPayload {
  return { type: 'SET_OPTIONS_PHOTO_ON_VERIFY', payload: `SET OPTIONS PhotoOnVerify=${on ? 1 : 0}` };
}

export function buildSetWorkCodeEnable(on: boolean): CommandPayload {
  return { type: 'SET_OPTIONS_WORK_CODE', payload: `SET OPTIONS WorkCode=${on ? 1 : 0}` };
}

// ---- ADMS push settings -------------------------------------------------
export function buildSetHeartbeatInterval(sec: number): CommandPayload {
  return { type: 'SET_OPTIONS_HEARTBEAT', payload: `SET OPTIONS Delay=${Math.max(5, Math.min(600, Math.round(sec)))}` };
}

export function buildSetTransFlag(flag: string): CommandPayload {
  // 10-char binary string controlling which tables auto-upload.
  // Default 1111000000 = att+oplog+user+fp + nothing else.
  return { type: 'SET_OPTIONS_TRANSFLAG', payload: `SET OPTIONS TransFlag=${flag}` };
}

export function buildSetTransTimes(window: string): CommandPayload {
  // "HH:MM;HH:MM" — two daily windows when device performs bulk upload.
  return { type: 'SET_OPTIONS_TRANSTIMES', payload: `SET OPTIONS TransTimes=${window}` };
}

export function buildSetTransInterval(min: number): CommandPayload {
  return { type: 'SET_OPTIONS_TRANSINTERVAL', payload: `SET OPTIONS TransInterval=${Math.max(1, Math.min(60, Math.round(min)))}` };
}

export function buildSetRealtimeMode(on: boolean): CommandPayload {
  return { type: 'SET_OPTIONS_REALTIME', payload: `SET OPTIONS Realtime=${on ? 1 : 0}` };
}

// ---- Network ------------------------------------------------------------
export function buildSetStaticIp(p: { ip: string; mask: string; gateway: string; dns?: string }): CommandPayload {
  const parts = [
    `IPAddress=${p.ip}`,
    `NetMask=${p.mask}`,
    `GATEIPAddress=${p.gateway}`,
  ];
  if (p.dns) parts.push(`DNSIPAddress=${p.dns}`);
  return { type: 'SET_OPTIONS_NETWORK', payload: `SET OPTIONS ${parts.join('\nSET OPTIONS ')}` };
}

export function buildSetDhcp(on: boolean): CommandPayload {
  return { type: 'SET_OPTIONS_DHCP', payload: `SET OPTIONS DHCPEnable=${on ? 1 : 0}` };
}

export function buildSetWiFi(p: { ssid: string; password: string }): CommandPayload {
  return {
    type: 'SET_OPTIONS_WIFI',
    payload: `SET OPTIONS WIFIOn=1\nSET OPTIONS WIFISSID=${p.ssid}\nSET OPTIONS WIFIPwd=${p.password}`,
  };
}

// ---- Remote enrollment trigger ------------------------------------------
// These commands DO NOT capture a biometric on the server. They tell the
// device to enter enrollment mode for a specific PIN — the operator must
// then physically interact with the device (place finger, look at camera,
// place palm) to complete capture. BioTime works the same way.
export interface EnrollTrigger {
  pin: string;
  fid?: number; // 0..9 for fingerprint index
}

export function buildEnrollFingerprint(p: EnrollTrigger): CommandPayload {
  return {
    type: 'ENROLL_FP',
    payload: `ENROLL_FP PIN=${p.pin}\tFID=${p.fid ?? 0}`,
  };
}

export function buildEnrollFace(p: EnrollTrigger): CommandPayload {
  return { type: 'ENROLL_FACE', payload: `ENROLL_FACE PIN=${p.pin}` };
}

export function buildEnrollPalm(p: EnrollTrigger): CommandPayload {
  return { type: 'ENROLL_PALM', payload: `ENROLL_PALM PIN=${p.pin}` };
}

// ---- Specific maintenance clears ---------------------------------------
export function buildClearAttPhotos(): CommandPayload {
  return { type: 'CLEAR_ATT_PHOTO', payload: 'CLEAR ATTPHOTO', destructive: true };
}

// ---- Data query helpers -------------------------------------------------
export function buildQueryAttlog(): CommandPayload {
  return { type: 'DATA_QUERY_ATTLOG', payload: 'DATA QUERY ATTLOG' };
}

export function buildQueryOperlog(): CommandPayload {
  return { type: 'DATA_QUERY_OPERLOG', payload: 'DATA QUERY OPERLOG' };
}

export function buildQueryFingerprints(): CommandPayload {
  return { type: 'DATA_QUERY_FINGERTMP', payload: 'DATA QUERY FINGERTMP' };
}

export function buildQueryFaces(): CommandPayload {
  return { type: 'DATA_QUERY_FACE', payload: 'DATA QUERY FACE' };
}

export function buildQueryPalms(): CommandPayload {
  return { type: 'DATA_QUERY_PALMTMP', payload: 'DATA QUERY PALMTMP' };
}

export function buildAddUser(p: UserUpsert): CommandPayload {
  // Default to the modern syntax for callers that don't know the family.
  // Prefer pickCommand(family, 'addUser') for firmware-aware dispatch.
  return dialects.unknown.addUser(p);
}

export function buildDeleteUser(pin: string): CommandPayload {
  return {
    type: 'DATA_DEL_USER',
    payload: `DATA DEL_USER PIN=${pin}`,
    destructive: true,
  };
}

export function buildUnlockDoor(seconds: number = 3): CommandPayload {
  return {
    type: 'AC_UNLOCK',
    payload: `AC_UNLOCK Lock=1 Duration=${seconds}`,
  };
}

// ---- Biometric template push --------------------------------------------
// Standard ZK push format for sending a captured template TO a device.

export interface FpPush {
  pin: string;
  fid: number; // 0..9
  size: number;
  template: string; // base64 of the fp template
  valid?: boolean;
}

export function buildPushFingerprint(p: FpPush): CommandPayload {
  const parts = [
    `PIN=${p.pin}`,
    `FID=${p.fid}`,
    `Size=${p.size}`,
    `Valid=${p.valid === false ? 0 : 1}`,
    `TMP=${p.template}`,
  ];
  return {
    type: 'DATA_UPDATE_FP',
    payload: `DATA UPDATE FINGERTMP ${parts.join('\t')}`,
  };
}

export interface FaceOrPalmPush {
  pin: string;
  size: number;
  template: string;
  valid?: boolean;
}

export function buildPushFace(p: FaceOrPalmPush): CommandPayload {
  const parts = [
    `PIN=${p.pin}`,
    `FID=0`,
    `Size=${p.size}`,
    `Valid=${p.valid === false ? 0 : 1}`,
    `TMP=${p.template}`,
  ];
  return {
    type: 'DATA_UPDATE_FACE',
    payload: `DATA UPDATE FACE ${parts.join('\t')}`,
  };
}

export function buildPushPalm(p: FaceOrPalmPush): CommandPayload {
  const parts = [
    `PIN=${p.pin}`,
    `FID=0`,
    `Size=${p.size}`,
    `Valid=${p.valid === false ? 0 : 1}`,
    `TMP=${p.template}`,
  ];
  return {
    type: 'DATA_UPDATE_PALM',
    payload: `DATA UPDATE PALMTMP ${parts.join('\t')}`,
  };
}

export interface PhotoPush {
  pin: string;
  fileName?: string;
  size: number;
  content: string; // base64 JPG
}

export function buildPushBiophoto(p: PhotoPush): CommandPayload {
  const parts = [
    `PIN=${p.pin}`,
    `FileName=${p.fileName ?? `${p.pin}.jpg`}`,
    `Type=9`,
    `Size=${p.size}`,
    `Content=${p.content}`,
  ];
  return {
    type: 'DATA_UPDATE_BIOPHOTO',
    payload: `DATA UPDATE BIOPHOTO ${parts.join('\t')}`,
  };
}

// Dispatcher: returns the right command-builder function for the device's
// firmware family. Use like:
//   pickCommand(family, 'queryUsers')()        // → CommandPayload
//   pickCommand(family, 'addUser')({pin, ...}) // → CommandPayload
export function pickCommand<K extends keyof (typeof dialects)['speedface']>(
  family: FirmwareFamily,
  name: K,
): (typeof dialects)['speedface'][K] {
  const fam = (dialects[family] ?? dialects.unknown) as (typeof dialects)['speedface'];
  return (fam[name] ?? (dialects.unknown as (typeof dialects)['speedface'])[name]) as (typeof dialects)['speedface'][K];
}
