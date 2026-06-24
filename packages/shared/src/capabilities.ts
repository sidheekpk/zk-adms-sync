// Per-model capability matrix. Most ZK devices encode their feature set
// in the model string + firmware family. We use this map as the seed,
// then let an operator override per device (stored in devices.settings).

export interface DeviceCapabilities {
  fingerprint: boolean;
  face: boolean;
  palm: boolean;
  card: boolean;
  pin: boolean;
  thermal: boolean;
  speaker: boolean;
  camera: boolean;
  doorRelay: boolean;
}

/**
 * Per-firmware-family ADMS protocol surface. What we KNOW works vs what
 * the firmware silently swallows. The UI uses this to hide buttons that
 * would lie to operators (e.g. "Set device time" on V5L which firmware
 * accepts with Return=0 but never applies).
 *
 * Discovered through 2026-06-22/23 audits on SpeedFace V5L (ZAM170-NF
 * v1.3.11). Other families are conservative defaults until we have a
 * device of that family to probe.
 */
export interface ProtocolCapabilities {
  /** SET OPTIONS DateTime=<unix> changes the device's wall clock */
  setDateTime: boolean;
  /** EXECUTE shell commands (date -s, hwclock -w, etc.) are accepted */
  executeShell: boolean;
  /** Any remote command produces an audible beep/voice */
  testVoiceRemote: boolean;
  /** Standard SET OPTIONS for display/access/verify settings round-trips */
  setOptionsRoundTrip: boolean;
  /** Safe to push network IP/DHCP changes from ADMS without bricking LAN */
  setOptionsNetwork: boolean;
  /** DATA UPDATE FINGERTMP/FACE/PALM/BIOPHOTO push works */
  bulkEnrollPush: boolean;
  /** Device exposes IPAddress/NetMask/etc via GET OPTIONS (multi-field) */
  queryNetwork: boolean;
}

const PROTOCOL_DEFAULTS: Record<import('./firmware').FirmwareFamily, ProtocolCapabilities> = {
  // SpeedFace V5L (ZAM170-NF v1.3.11): everything-via-menu firmware.
  // Confirmed via raw-dump audit 2026-06-22 / 2026-06-23.
  speedface: {
    setDateTime: false, // SET OPTIONS DateTime → Return=0, display unchanged
    executeShell: false, // EXECUTE date / hwclock → Return=-1002
    testVoiceRemote: false, // BEEP/VOICE/PLAY/CHECK all silent
    setOptionsRoundTrip: true, // 28/28 display/access/verify/push settings verified
    setOptionsNetwork: false, // Unsafe — wrong push bricks LAN. Park until LAN Agent.
    bulkEnrollPush: true, // DATA UPDATE FINGERTMP / FACE / PALM / BIOPHOTO work
    queryNetwork: true, // multi-field GET OPTIONS returns IPAddress,NetMask,Gateway,DNS,DHCP
  },
  // BioTime / iClock — modern firmware, generally accepts the wider command set.
  // Until we audit a real device we assume the optimistic defaults the
  // ADMS protocol docs describe.
  biotime: {
    setDateTime: true,
    executeShell: true,
    testVoiceRemote: true,
    setOptionsRoundTrip: true,
    setOptionsNetwork: true,
    bulkEnrollPush: true,
    queryNetwork: true,
  },
  iface: {
    setDateTime: true,
    executeShell: false,
    testVoiceRemote: true,
    setOptionsRoundTrip: true,
    setOptionsNetwork: false,
    bulkEnrollPush: true,
    queryNetwork: true,
  },
  green_label: {
    setDateTime: true,
    executeShell: false,
    testVoiceRemote: false,
    setOptionsRoundTrip: true,
    setOptionsNetwork: false,
    bulkEnrollPush: true,
    queryNetwork: false,
  },
  // Conservative — assume nothing works. UI hides almost everything for
  // unknown firmwares. Operators can override per device once they
  // confirm what works.
  unknown: {
    setDateTime: false,
    executeShell: false,
    testVoiceRemote: false,
    setOptionsRoundTrip: true, // safe — these are read-only echoes if unsupported
    setOptionsNetwork: false,
    bulkEnrollPush: false,
    queryNetwork: false,
  },
};

export function protocolCapabilitiesFor(family: import('./firmware').FirmwareFamily): ProtocolCapabilities {
  return { ...PROTOCOL_DEFAULTS[family] };
}

const NONE: DeviceCapabilities = {
  fingerprint: false,
  face: false,
  palm: false,
  card: false,
  pin: true, // every ADMS device supports PIN entry
  thermal: false,
  speaker: false,
  camera: false,
  doorRelay: false,
};

const FULL_BIOMETRIC: DeviceCapabilities = {
  ...NONE,
  fingerprint: true,
  face: true,
  palm: true,
  card: true,
  speaker: true,
  camera: true,
  doorRelay: true,
};

const FACE_PALM: DeviceCapabilities = {
  ...NONE,
  face: true,
  palm: true,
  speaker: true,
  camera: true,
  doorRelay: true,
};

const FP_CARD: DeviceCapabilities = {
  ...NONE,
  fingerprint: true,
  card: true,
  speaker: true,
};

const FP_FACE_CARD: DeviceCapabilities = {
  ...NONE,
  fingerprint: true,
  face: true,
  card: true,
  speaker: true,
  camera: true,
};

interface ModelRule {
  match: RegExp;
  caps: DeviceCapabilities;
  label: string;
}

const MODELS: ModelRule[] = [
  { match: /speedface[-_ ]?v5l/i, caps: { ...FULL_BIOMETRIC, thermal: true }, label: 'SpeedFace V5L' },
  { match: /speedface[-_ ]?v4l/i, caps: { ...FULL_BIOMETRIC, thermal: true }, label: 'SpeedFace V4L' },
  { match: /speedface/i, caps: FACE_PALM, label: 'SpeedFace family' },
  { match: /zam170/i, caps: { ...FULL_BIOMETRIC, thermal: true }, label: 'ZAM170 (SpeedFace)' },
  { match: /uface/i, caps: FP_FACE_CARD, label: 'uFace' },
  { match: /iface/i, caps: FP_FACE_CARD, label: 'iFace' },
  { match: /\bf22\b/i, caps: FP_CARD, label: 'ZK F22' },
  { match: /silkbio/i, caps: FP_CARD, label: 'SilkBio' },
  { match: /u580/i, caps: FP_CARD, label: 'ZK U580' },
  { match: /iclock/i, caps: FP_FACE_CARD, label: 'iClock' },
];

export function detectCapabilities(input: {
  model?: string | null;
  firmwareVersion?: string | null;
  deviceType?: string | null;
}): { caps: DeviceCapabilities; modelLabel: string } {
  const hay = `${input.model ?? ''} ${input.firmwareVersion ?? ''} ${input.deviceType ?? ''}`;
  for (const rule of MODELS) {
    if (rule.match.test(hay)) return { caps: { ...rule.caps }, modelLabel: rule.label };
  }
  return { caps: { ...FP_CARD }, modelLabel: 'Unknown' };
}

export type ModalityKey = 'fingerprint' | 'face' | 'palm' | 'card';

export interface ModalitySettings {
  fingerprint?: boolean;
  face?: boolean;
  palm?: boolean;
  card?: boolean;
}

export function effectiveModalities(
  caps: DeviceCapabilities,
  overrides: ModalitySettings | undefined,
): Record<ModalityKey, boolean> {
  const r = (k: ModalityKey) => {
    if (!caps[k]) return false;
    return overrides?.[k] ?? true;
  };
  return {
    fingerprint: r('fingerprint'),
    face: r('face'),
    palm: r('palm'),
    card: r('card'),
  };
}
