// Parsers for ADMS body payloads. The wire format is tab-separated plain
// text (NOT JSON). The parsers here are defensive — devices have been
// known to send trailing tabs, blank fields, and Windows line endings.

export interface PunchRow {
  pin: string;
  punchTime: string; // "YYYY-MM-DD HH:MM:SS" — device-local wall clock
  statusCode: number;
  verifyModeCode: number;
  workCode: string;
  temperature?: number; // some devices send body temp in the last column
  raw: string;
}

export function parseAttlogBody(body: string): PunchRow[] {
  const rows: PunchRow[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split('\t');
    if (cols.length < 4) continue;
    const [pin, punchTime, statusCode, verifyModeCode, workCode = '0', _r1 = '0', _r2 = '0', _r3 = '255', maybeTemp = '255'] = cols;
    if (!pin || !punchTime) continue;

    const temp = maybeTemp && maybeTemp !== '255' && maybeTemp !== '0'
      ? parseFloat(maybeTemp)
      : undefined;

    rows.push({
      pin: pin.trim(),
      punchTime: punchTime.trim(),
      statusCode: Number.parseInt(statusCode!, 10) || 0,
      verifyModeCode: Number.parseInt(verifyModeCode!, 10) || 0,
      workCode: workCode.trim() || '0',
      temperature: typeof temp === 'number' && temp > 30 && temp < 45 ? temp : undefined,
      raw: trimmed,
    });
  }
  return rows;
}

export interface UserRow {
  pin: string;
  name: string;
  privilege: number;
  password?: string;
  card?: string;
  groupId: number;
  startDate?: string;
  endDate?: string;
}

const USER_PIN_RE = /^USER\s+PIN=([^\t]+)/;

export function parseUserRows(body: string): UserRow[] {
  const rows: UserRow[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!USER_PIN_RE.test(line)) continue;
    const fields = Object.fromEntries(
      line.replace(/^USER\s+/, '').split('\t').map((f) => {
        const eq = f.indexOf('=');
        return eq < 0 ? [f, ''] : [f.slice(0, eq), f.slice(eq + 1)];
      }),
    ) as Record<string, string>;

    if (!fields.PIN) continue;
    rows.push({
      pin: fields.PIN,
      name: fields.Name ?? '',
      privilege: Number.parseInt(fields.Pri ?? '0', 10) || 0,
      password: fields.Passwd || undefined,
      card: fields.Card || undefined,
      groupId: Number.parseInt(fields.Grp ?? '1', 10) || 1,
      startDate: fields.StartDatetime || undefined,
      endDate: fields.EndDatetime || undefined,
    });
  }
  return rows;
}

/** Decode the device status code to a normalized punch type. */
export function decodePunchType(statusCode: number): 'in' | 'out' | 'break_out' | 'break_in' | 'overtime_in' | 'overtime_out' | 'other' {
  switch (statusCode) {
    case 0: return 'in';
    case 1: return 'out';
    case 2: return 'break_out';
    case 3: return 'break_in';
    case 4: return 'overtime_in';
    case 5: return 'overtime_out';
    default: return 'other';
  }
}

// ---- Biometric template records (from OPERLOG / FDATA) -------------------
export type BioRecordKind = 'fp' | 'face' | 'palm' | 'photo';

export interface BioRecord {
  kind: BioRecordKind;
  pin: string;
  fid: number; // finger index 0-9 for FP; ignored otherwise
  size: number;
  valid: boolean;
  template?: string; // base64 — only the first chunk is captured for the moment
  fileName?: string;
}

const BIO_PATTERNS: Array<{ kind: BioRecordKind; re: RegExp }> = [
  { kind: 'fp', re: /^FP\s+/ },
  { kind: 'face', re: /^FACE\s+/ },
  { kind: 'palm', re: /^PALM\s+/ },
  { kind: 'photo', re: /^BIOPHOTO\s+/ },
];

export function parseBioRecords(body: string): BioRecord[] {
  const out: BioRecord[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line) continue;
    const matched = BIO_PATTERNS.find((p) => p.re.test(line));
    if (!matched) continue;
    const fields = Object.fromEntries(
      line.replace(matched.re, '').split('\t').map((f) => {
        const eq = f.indexOf('=');
        return eq < 0 ? [f, ''] : [f.slice(0, eq), f.slice(eq + 1)];
      }),
    ) as Record<string, string>;
    if (!fields.PIN) continue;
    out.push({
      kind: matched.kind,
      pin: fields.PIN,
      fid: Number.parseInt(fields.FID ?? '0', 10) || 0,
      size: Number.parseInt(fields.Size ?? '0', 10) || 0,
      valid: (fields.Valid ?? '1') !== '0',
      template: fields.TMP || fields.Content || undefined,
      fileName: fields.FileName,
    });
  }
  return out;
}

/** Decode the device verify mode code to a normalized method. */
export function decodeVerifyMode(code: number): 'password' | 'fingerprint' | 'card' | 'face' | 'palm' | 'multi' | 'other' {
  // Codes vary slightly by firmware family but these are the broadly accepted defaults.
  switch (code) {
    case 0: return 'password';
    case 1: return 'fingerprint';
    case 2: return 'password';
    case 3: return 'card';
    case 4: return 'card';
    case 15: return 'face';
    case 25: return 'palm';
    default: return code > 100 ? 'multi' : 'other';
  }
}
