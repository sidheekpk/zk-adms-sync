/**
 * Per-integration-kind adapters. Source of truth for HOW we shape the
 * outbound payload to each connected app. The common "source" is the
 * attendance row from the device — adapters transform it.
 *
 * Add a new kind by:
 *   1. Adding it to `IntegrationKind` (and the platform.integration_kind enum)
 *   2. Implementing the `SyncAdapter` interface here
 *   3. Registering in `ADAPTERS`
 *
 * The sync worker picks the adapter based on `tenant.integration_kind`.
 */

export type IntegrationKind = 'none' | 'radix' | 'fitness' | 'generic';

export interface InternalPunchRow {
  id: string;
  pin: string;
  externalId?: string | null;
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

export interface SyncOpts {
  tenantId: string;
  tenantSlug: string;
  workspaceId: string | null;
  batchId: string;
}

export interface SyncAdapter {
  kind: IntegrationKind;
  /**
   * Friendly label shown in the super-admin tenant edit form.
   */
  label: string;
  /** What the operator sets up in the tenant config — endpoint + token + optional workspaceId. */
  configFields: Array<{
    key: 'endpoint' | 'token' | 'workspaceId';
    label: string;
    required: boolean;
    hint?: string;
    placeholder?: string;
  }>;
  /** Per-batch transformer producing the body we'll POST. */
  transformBatch(records: InternalPunchRow[], opts: SyncOpts): unknown;
  /** Per-device-status transformer (optional — adapter can omit if not supported). */
  transformDeviceStatus?(args: {
    deviceId: string;
    deviceSn: string;
    deviceName: string;
    status: 'online' | 'offline';
    at: Date;
  }, opts: SyncOpts): unknown;
}

// ---------------------------------------------------------------------------
// Radix HR / Workly
// ---------------------------------------------------------------------------
const radix: SyncAdapter = {
  kind: 'radix',
  label: 'Radix HR / Workly',
  configFields: [
    { key: 'endpoint', label: 'Webhook URL', required: true, placeholder: 'https://api.radixhrservice.com/biometric/webhook' },
    { key: 'token', label: 'API token', required: true, hint: 'Bearer token issued by Radix HR for this workspace' },
    { key: 'workspaceId', label: 'Workspace ID', required: true, placeholder: 'UUID issued by Radix HR' },
  ],
  transformBatch(records, opts) {
    return {
      source: 'zk-connect',
      kind: 'radix',
      workspaceId: opts.workspaceId,
      batchId: opts.batchId,
      sentAt: new Date().toISOString(),
      recordCount: records.length,
      records: records.map((r) => ({
        employeePin: r.pin,
        externalId: r.externalId ?? null,
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
  },
  transformDeviceStatus(args, opts) {
    return {
      source: 'zk-connect',
      kind: 'radix',
      event: 'device_status',
      workspaceId: opts.workspaceId,
      at: args.at.toISOString(),
      device: {
        id: args.deviceId,
        serialNumber: args.deviceSn,
        name: args.deviceName,
        status: args.status,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Fitness app
// ---------------------------------------------------------------------------
const fitness: SyncAdapter = {
  kind: 'fitness',
  label: 'Fitness app (gym/membership)',
  configFields: [
    { key: 'endpoint', label: 'Check-in webhook URL', required: true, placeholder: 'https://yourfitnessapp.example/api/checkins' },
    { key: 'token', label: 'API token', required: true },
    { key: 'workspaceId', label: 'Gym / location ID (optional)', required: false },
  ],
  transformBatch(records, opts) {
    return {
      source: 'zk-connect',
      kind: 'fitness',
      gymId: opts.workspaceId,
      batchId: opts.batchId,
      sentAt: new Date().toISOString(),
      checkins: records.map((r) => ({
        memberId: r.externalId ?? r.pin,
        pin: r.pin,
        checkedInAt: r.punchTime.toISOString(),
        kind: r.punchType, // 'in' / 'out' both valid for gym entry/exit
        method: r.verifyMode,
        deviceName: r.deviceName,
      })),
    };
  },
  transformDeviceStatus(args, opts) {
    return {
      source: 'zk-connect',
      kind: 'fitness',
      event: 'turnstile_status',
      gymId: opts.workspaceId,
      at: args.at.toISOString(),
      turnstile: {
        id: args.deviceId,
        name: args.deviceName,
        online: args.status === 'online',
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Generic webhook — any HTTPS receiver, flat shape
// ---------------------------------------------------------------------------
const generic: SyncAdapter = {
  kind: 'generic',
  label: 'Generic webhook',
  configFields: [
    { key: 'endpoint', label: 'Webhook URL', required: true, placeholder: 'https://your-api.example/zk-events' },
    { key: 'token', label: 'Bearer token (optional)', required: false },
    { key: 'workspaceId', label: 'Workspace / tenant marker (optional)', required: false, hint: 'Echoed back as `workspaceId` so your receiver can route' },
  ],
  transformBatch(records, opts) {
    return {
      source: 'zk-connect',
      kind: 'generic',
      tenantSlug: opts.tenantSlug,
      workspaceId: opts.workspaceId,
      batchId: opts.batchId,
      sentAt: new Date().toISOString(),
      recordCount: records.length,
      records: records.map((r) => ({
        id: r.id,
        pin: r.pin,
        externalId: r.externalId ?? null,
        punchTime: r.punchTime.toISOString(),
        punchType: r.punchType,
        verifyMode: r.verifyMode,
        workCode: r.workCode,
        deviceSerialNumber: r.deviceSn,
        deviceName: r.deviceName,
        ...(r.temperature != null ? { temperature: r.temperature } : {}),
      })),
    };
  },
  transformDeviceStatus(args, opts) {
    return {
      source: 'zk-connect',
      kind: 'generic',
      event: 'device_status',
      tenantSlug: opts.tenantSlug,
      workspaceId: opts.workspaceId,
      at: args.at.toISOString(),
      device: {
        id: args.deviceId,
        serialNumber: args.deviceSn,
        name: args.deviceName,
        status: args.status,
      },
    };
  },
};

export const ADAPTERS: Record<Exclude<IntegrationKind, 'none'>, SyncAdapter> = {
  radix,
  fitness,
  generic,
};

export function getAdapter(kind: IntegrationKind): SyncAdapter | null {
  if (kind === 'none') return null;
  return ADAPTERS[kind] ?? null;
}
