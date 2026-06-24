/**
 * Normalize a batch of internal attendance rows into the shape an outbound
 * webhook expects. Currently tuned for the Radix HR / Workly biometric_logs
 * webhook (see att-db-sync — same payload contract).
 */

export interface InternalPunchRow {
  id: string;
  pin: string;
  punchTime: Date; // proper UTC timestamptz from PG
  statusCode: number;
  punchType: string; // 'in' | 'out' | 'break_in' | ...
  verifyModeCode: number;
  verifyMode: string;
  workCode: string | null;
  temperature: number | null;
  deviceSn: string;
  deviceName: string;
}

export interface RadixBiometricLog {
  employeePin: string;
  punchTime: string; // ISO 8601 UTC
  punchType: string;
  statusCode: number;
  verifyMode: string;
  workCode: string;
  deviceSerialNumber: string;
  deviceName: string;
  temperature?: number;
}

export interface RadixPayload {
  source: 'zk-connect';
  workspaceId: string;
  batchId: string;
  sentAt: string;
  recordCount: number;
  records: RadixBiometricLog[];
}

export function transformToRadix(
  records: InternalPunchRow[],
  opts: { workspaceId: string; batchId: string },
): RadixPayload {
  return {
    source: 'zk-connect',
    workspaceId: opts.workspaceId,
    batchId: opts.batchId,
    sentAt: new Date().toISOString(),
    recordCount: records.length,
    records: records.map((r) => ({
      employeePin: r.pin,
      punchTime: r.punchTime.toISOString(),
      punchType: r.punchType,
      statusCode: r.statusCode,
      verifyMode: r.verifyMode,
      workCode: r.workCode ?? '0',
      deviceSerialNumber: r.deviceSn,
      deviceName: r.deviceName,
      ...(r.temperature != null ? { temperature: r.temperature } : {}),
    })),
  };
}
