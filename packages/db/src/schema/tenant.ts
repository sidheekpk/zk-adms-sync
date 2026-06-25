// Per-tenant schema. Defined WITHOUT a pgSchema wrapper so the same table
// definitions can be applied inside any tenant schema (search_path-scoped).
// Provisioning runs the generated SQL with `SET search_path = t_<slug>`.

import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  uuid,
  varchar,
  decimal,
  index,
  uniqueIndex,
  pgEnum,
  smallint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---- Enums (will be created inside each tenant schema) --------------------
export const deviceStatusEnum = pgEnum('device_status', [
  'online',
  'offline',
  'disabled',
  'never_seen',
]);

export const firmwareFamilyEnum = pgEnum('firmware_family', [
  'speedface',
  'biotime',
  'iface',
  'green_label',
  'unknown',
]);

export const commandStatusEnum = pgEnum('command_status', [
  'pending',
  'sent',
  'success',
  'failed',
  'expired',
  'cancelled',
]);

export const syncStatusEnum = pgEnum('sync_status', [
  'pending',
  'synced',
  'failed',
  'dlq',
]);

export const verifyModeEnum = pgEnum('verify_mode', [
  'password',
  'fingerprint',
  'card',
  'face',
  'palm',
  'multi',
  'other',
]);

export const punchTypeEnum = pgEnum('punch_type', [
  'in',
  'out',
  'break_out',
  'break_in',
  'overtime_in',
  'overtime_out',
  'other',
]);

// ---- Locations -------------------------------------------------------------
export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  address: text('address'),
  timezone: varchar('timezone', { length: 64 }),
  latitude: decimal('latitude', { precision: 10, scale: 6 }),
  longitude: decimal('longitude', { precision: 10, scale: 6 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Device groups -------------------------------------------------------
// Logical grouping for bulk operations. One device belongs to at most one
// group. Reboot / clear / push-settings can target a whole group at once.
export const deviceGroups = pgTable('device_groups', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Devices ---------------------------------------------------------------
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    serialNumber: varchar('serial_number', { length: 64 }).notNull(),
    name: text('name').notNull().default(''),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    groupId: uuid('group_id').references(() => deviceGroups.id, { onDelete: 'set null' }),
    model: text('model'),
    firmwareVersion: text('firmware_version'),
    firmwareFamily: firmwareFamilyEnum('firmware_family').notNull().default('unknown'),
    pushVersion: text('push_version'),
    deviceType: text('device_type'),
    platform: text('platform'),
    // Network
    ipAddress: text('ip_address'),
    macAddress: text('mac_address'),
    // Time / TZ
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
    timezoneSyncedAt: timestamp('timezone_synced_at', { withTimezone: true }),
    // Counters (mirror of device's own counters)
    userCount: integer('user_count'),
    fingerCount: integer('finger_count'),
    faceCount: integer('face_count'),
    palmCount: integer('palm_count'),
    attLogCount: integer('att_log_count'),
    // Liveness
    status: deviceStatusEnum('status').notNull().default('never_seen'),
    lastOnline: timestamp('last_online', { withTimezone: true }),
    heartbeatIntervalSec: integer('heartbeat_interval_sec').notNull().default(10),
    lastStamp: text('last_stamp').notNull().default('0'),
    lastOpStamp: text('last_op_stamp').notNull().default('0'),
    // mTLS cert reference
    certFingerprint: text('cert_fingerprint'),
    // Flags
    enabled: boolean('enabled').notNull().default(true),
    hasThermal: boolean('has_thermal').notNull().default(false),
    // Settings
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('devices_serial_idx').on(t.serialNumber),
    index('devices_status_idx').on(t.status),
  ],
);

// ---- Employees (device users) ---------------------------------------------
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    pin: varchar('pin', { length: 32 }).notNull(), // PIN as displayed on the device
    name: text('name').notNull().default(''),
    role: varchar('role', { length: 32 }).notNull().default('staff'), // staff/admin/manager/custom
    devicePrivilege: smallint('device_privilege').notNull().default(0), // 0=user, 14=admin
    cardNumber: text('card_number'),
    password: text('password'), // hashed if used at all
    groupId: integer('group_id').notNull().default(1),
    photoUrl: text('photo_url'),
    enabled: boolean('enabled').notNull().default(true),
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    biometricFlags: jsonb('biometric_flags').notNull().default(sql`'{}'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    /** External system identifier (e.g. Radix HR employee ID). Lets
     * inbound sync upsert by external_id even if the PIN changes. */
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('employees_pin_idx').on(t.pin)],
);

// Many-to-many: which devices an employee exists on
export const employeeDevices = pgTable(
  'employee_devices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    pushedAt: timestamp('pushed_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('employee_device_idx').on(t.employeeId, t.deviceId)],
);

// ---- Biometric templates (fingerprint / face / palm) ----------------------
export const biometricTemplates = pgTable(
  'biometric_templates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    bioType: varchar('bio_type', { length: 16 }).notNull(), // fp|face|palm|biophoto
    fid: smallint('fid').notNull().default(0), // finger index (0..9)
    size: integer('size'),
    valid: boolean('valid').notNull().default(true),
    template: text('template'), // base64 from ADMS upload
    sourceDeviceSn: varchar('source_device_sn', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('biometric_employee_idx').on(t.employeeId),
    uniqueIndex('biometric_unique_idx').on(t.employeeId, t.bioType, t.fid),
  ],
);

// ---- Attendance logs (punches) --------------------------------------------
export const attendanceLogs = pgTable(
  'attendance_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    deviceSn: varchar('device_sn', { length: 64 }).notNull(),
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    pin: varchar('pin', { length: 32 }).notNull(),
    punchTime: timestamp('punch_time', { withTimezone: true }).notNull(),
    statusCode: smallint('status_code').notNull(), // raw device status
    punchType: punchTypeEnum('punch_type').notNull().default('in'),
    verifyModeCode: smallint('verify_mode_code').notNull(),
    verifyMode: verifyModeEnum('verify_mode').notNull().default('other'),
    workCode: text('work_code').notNull().default('0'),
    temperature: decimal('temperature', { precision: 4, scale: 1 }),
    rawData: text('raw_data'),
    sourceIp: text('source_ip'),
    syncStatus: syncStatusEnum('sync_status').notNull().default('pending'),
    syncAttempts: integer('sync_attempts').notNull().default(0),
    lastSyncError: text('last_sync_error'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    // Soft-delete + manual entry (Phase 2.6 — admin correction workflow).
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: text('voided_by'), // operator email
    voidReason: text('void_reason'),
    insertedManually: boolean('inserted_manually').notNull().default(false),
    insertedBy: text('inserted_by'), // operator email
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_unique_idx').on(t.deviceSn, t.pin, t.punchTime),
    index('attendance_time_idx').on(t.punchTime),
    index('attendance_sync_idx').on(t.syncStatus),
    index('attendance_device_pin_idx').on(t.deviceId, t.pin),
  ],
);

// ---- Device commands ------------------------------------------------------
export const deviceCommands = pgTable(
  'device_commands',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    commandId: integer('command_id').notNull(),
    command: text('command').notNull(),
    commandType: varchar('command_type', { length: 64 }).notNull(),
    status: commandStatusEnum('status').notNull().default('pending'),
    returnCode: integer('return_code'),
    responseData: text('response_data'),
    issuedByUserId: text('issued_by_user_id'), // FK to platform.user — not enforced
    issuedByEmail: text('issued_by_email'), // snapshot
    reason: text('reason'), // required for destructive actions, captured for audit
    sentAt: timestamp('sent_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cmd_device_idx').on(t.deviceId),
    index('cmd_status_idx').on(t.status),
    uniqueIndex('cmd_device_cmdid_idx').on(t.deviceId, t.commandId),
  ],
);

// ---- mTLS device certs (metadata only) ------------------------------------
export const deviceCerts = pgTable(
  'device_certs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    intendedDeviceSn: varchar('intended_device_sn', { length: 64 }),
    serialNumber: text('serial_number').notNull(),
    fingerprint: text('fingerprint').notNull(),
    pem: text('pem'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
  },
  (t) => [
    uniqueIndex('cert_fingerprint_idx').on(t.fingerprint),
    index('cert_device_idx').on(t.deviceId),
  ],
);

// ---- Tenant-scoped audit log ----------------------------------------------
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    actorUserId: text('actor_user_id'),
    actorEmail: text('actor_email'),
    action: varchar('action', { length: 128 }).notNull(),
    targetType: varchar('target_type', { length: 64 }),
    targetId: text('target_id'),
    diff: jsonb('diff'),
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    result: varchar('result', { length: 16 }).notNull().default('ok'),
    errorMessage: text('error_message'),
    reason: text('reason'),
    operatorPasswordVerified: boolean('operator_password_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tenant_audit_actor_idx').on(t.actorUserId),
    index('tenant_audit_action_idx').on(t.action),
    index('tenant_audit_created_idx').on(t.createdAt),
  ],
);

// ---- Operator password (per-tenant, single row) ---------------------------
// Holds the predefined password required for critical device actions.
export const operatorPassword = pgTable('operator_password', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  passwordHash: text('password_hash').notNull(),
  updatedByUserId: text('updated_by_user_id'),
  updatedByEmail: text('updated_by_email'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Sync targets (RadixHR or other webhook) — Phase 9 --------------------
export const syncTargets = pgTable('sync_targets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  kind: varchar('kind', { length: 32 }).notNull().default('radixhr'),
  endpoint: text('endpoint').notNull(),
  workspaceId: text('workspace_id'),
  apiTokenEncrypted: text('api_token_encrypted').notNull(),
  timezoneOffsetMinutes: integer('timezone_offset_minutes').notNull().default(0),
  retryPolicy: jsonb('retry_policy').notNull().default(sql`'{}'::jsonb`),
  isActive: boolean('is_active').notNull().default(true),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Sync delivery log ----------------------------------------------------
export const syncLog = pgTable(
  'sync_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    syncTargetId: uuid('sync_target_id')
      .notNull()
      .references(() => syncTargets.id, { onDelete: 'cascade' }),
    batchId: text('batch_id').notNull(),
    recordCount: integer('record_count').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    httpStatus: integer('http_status'),
    requestPayload: jsonb('request_payload'),
    responseBody: text('response_body'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sync_log_target_idx').on(t.syncTargetId),
    index('sync_log_created_idx').on(t.createdAt),
  ],
);
