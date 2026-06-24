import { VERIFY_LABELS } from '../adms/constants.js';

export interface RawAttendanceRow {
  id: number;
  deviceSN: string;
  pin: string;
  timestamp: string;
  status: number;
  verifyMode: number;
  workCode: string | null;
}

export function transformToDefaultPayload(records: RawAttendanceRow[], deviceNames?: Map<string, string>) {
  return {
    source: 'zk-connect',
    syncedAt: new Date().toISOString(),
    recordCount: records.length,
    records: records.map(r => ({
      employeePin: r.pin,
      punchTime: r.timestamp,
      punchType: statusToType(r.status),
      statusCode: r.status,
      verificationMethod: VERIFY_LABELS[r.verifyMode] || 'Unknown',
      deviceSerialNumber: r.deviceSN,
      deviceName: deviceNames?.get(r.deviceSN) || r.deviceSN,
      workCode: r.workCode || '0',
    })),
  };
}

export function applyTemplate(template: string, records: RawAttendanceRow[]): unknown {
  try {
    // Simple template replacement: {{records}} gets replaced with the records array
    const payload = template
      .replace('{{records}}', JSON.stringify(records))
      .replace('{{count}}', String(records.length))
      .replace('{{syncedAt}}', new Date().toISOString());
    return JSON.parse(payload);
  } catch {
    // Fall back to default format if template is invalid
    return transformToDefaultPayload(records);
  }
}

function statusToType(status: number): string {
  switch (status) {
    case 0: return 'IN';
    case 1: return 'OUT';
    case 2: return 'BREAK_OUT';
    case 3: return 'BREAK_IN';
    case 4: return 'OT_IN';
    case 5: return 'OT_OUT';
    default: return `STATUS_${status}`;
  }
}
