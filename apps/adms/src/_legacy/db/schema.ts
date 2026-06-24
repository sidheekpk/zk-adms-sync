import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================
// LOCATIONS (offices/branches)
// ============================================
export const locations = sqliteTable('locations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  address: text('address'),
  timezone: text('timezone').default('Asia/Dubai'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================
// DEVICES
// ============================================
export const devices = sqliteTable('devices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  serialNumber: text('serial_number').notNull().unique(),
  name: text('name').default(''),
  model: text('model'),
  firmwareVersion: text('firmware_version'),
  ipAddress: text('ip_address'),
  macAddress: text('mac_address'),
  pushVersion: text('push_version'),
  deviceType: text('device_type'),
  platform: text('platform'),
  userCount: integer('user_count'),
  attLogCount: integer('att_log_count'),
  lastOnline: text('last_online'),
  isOnline: integer('is_online', { mode: 'boolean' }).default(false),
  lastStamp: text('last_stamp').default('0'),
  lastOpStamp: text('last_op_stamp').default('0'),
  locationId: integer('location_id').references(() => locations.id),
  heartbeatInterval: integer('heartbeat_interval').default(30),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ============================================
// ATTENDANCE LOGS (raw from devices)
// ============================================
export const attendanceLogs = sqliteTable('attendance_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deviceId: integer('device_id').notNull().references(() => devices.id),
  deviceSN: text('device_sn').notNull(),
  pin: text('pin').notNull(),
  timestamp: text('timestamp').notNull(),
  status: integer('status').notNull(),
  verifyMode: integer('verify_mode').notNull(),
  workCode: text('work_code').default('0'),
  rawData: text('raw_data'),
  sourceIp: text('source_ip'),
  syncStatus: text('sync_status').default('pending'),
  syncAttempts: integer('sync_attempts').default(0),
  lastSyncError: text('last_sync_error'),
  syncedAt: text('synced_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex('idx_unique_punch').on(table.deviceSN, table.pin, table.timestamp),
  index('idx_timestamp').on(table.timestamp),
  index('idx_sync_status').on(table.syncStatus),
  index('idx_device_pin').on(table.deviceId, table.pin),
]);

// ============================================
// DEVICE COMMANDS (queue for sending to devices)
// ============================================
export const deviceCommands = sqliteTable('device_commands', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deviceId: integer('device_id').notNull().references(() => devices.id),
  commandId: integer('command_id').notNull(),
  command: text('command').notNull(),
  commandType: text('command_type').notNull(),
  status: text('status').default('pending'),
  returnCode: integer('return_code'),
  responseData: text('response_data'),
  sentAt: text('sent_at'),
  completedAt: text('completed_at'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================
// DEVICE USERS (users enrolled on devices)
// ============================================
export const deviceUsers = sqliteTable('device_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deviceId: integer('device_id').notNull().references(() => devices.id),
  pin: text('pin').notNull(),
  name: text('name'),
  privilege: integer('privilege').default(0),
  cardNumber: text('card_number'),
  password: text('password'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex('idx_device_user').on(table.deviceId, table.pin),
]);

// ============================================
// SYNC TARGETS (HR systems to sync attendance to)
// ============================================
export const syncTargets = sqliteTable('sync_targets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull().default('webhook'),
  url: text('url').notNull(),
  method: text('method').default('POST'),
  headers: text('headers').default('{}'),
  authType: text('auth_type').default('none'),
  authValue: text('auth_value'),
  payloadTemplate: text('payload_template'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  retryAttempts: integer('retry_attempts').default(3),
  retryDelayMs: integer('retry_delay_ms').default(5000),
  batchSize: integer('batch_size').default(50),
  lastSyncAt: text('last_sync_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ============================================
// SYNC LOG (track every sync attempt)
// ============================================
export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  syncTargetId: integer('sync_target_id').notNull().references(() => syncTargets.id),
  recordCount: integer('record_count').notNull(),
  status: text('status').notNull(),
  httpStatus: integer('http_status'),
  responseBody: text('response_body'),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ============================================
// APP SETTINGS
// ============================================
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});
