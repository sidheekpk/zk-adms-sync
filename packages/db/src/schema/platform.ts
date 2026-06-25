import {
  pgSchema,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  uuid,
  varchar,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// `platform` schema — global, multi-tenant control plane
// ---------------------------------------------------------------------------
export const platform = pgSchema('platform');

// ---- Enums ----------------------------------------------------------------
export const tenantStatusEnum = platform.enum('tenant_status', [
  'active',
  'suspended',
  'pending_setup',
  'archived',
]);

export const isolationModeEnum = platform.enum('isolation_mode', [
  'schema',
  'dedicated_db',
]);

export const userRoleEnum = platform.enum('user_role', [
  'super_admin',
  'ops',
  'tenant_admin',
  'operator',
  'read_only',
]);

/** Integration "kind" the tenant is wired to (single config per tenant). */
export const integrationKindEnum = platform.enum('integration_kind', [
  'none',
  'radix',
  'fitness',
  'generic',
]);

// ---------------------------------------------------------------------------
// Better Auth core tables (kept in platform schema; Better Auth drizzle
// adapter maps to these exact names + columns). We'll wire it up next phase.
// ---------------------------------------------------------------------------
export const user = platform.table(
  'user',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name'),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('user_email_idx').on(t.email)],
);

export const account = platform.table('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = platform.table(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    activeTenantId: uuid('active_tenant_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('session_token_idx').on(t.token),
    index('session_user_idx').on(t.userId),
  ],
);

export const verification = platform.table('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const twoFactor = platform.table('two_factor', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
});

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------
export const tenants = platform.table(
  'tenants',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: text('name').notNull(),
    schemaName: varchar('schema_name', { length: 63 }).notNull(),
    isolationMode: isolationModeEnum('isolation_mode').notNull().default('schema'),
    dedicatedDbUrl: text('dedicated_db_url'), // null = uses platform DB
    status: tenantStatusEnum('status').notNull().default('pending_setup'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
    // Branding
    brandColor: varchar('brand_color', { length: 16 }),
    logoUrl: text('logo_url'),
    // RadixHR mapping (DEPRECATED — superseded by integration_* below;
    // kept here so existing rows still surface in queries until migrated).
    radixhrWorkspaceId: text('radixhr_workspace_id'),
    radixhrEndpoint: text('radixhr_endpoint'),
    // ---- Platform-level integration config (2026-06-24, Phase P.1) ----
    // ONE integration per tenant. Super-admin sets this on tenant create.
    integrationKind: integrationKindEnum('integration_kind').notNull().default('none'),
    integrationEndpoint: text('integration_endpoint'),
    integrationTokenEncrypted: text('integration_token_encrypted'),
    integrationWorkspaceId: text('integration_workspace_id'),
    integrationRetryPolicy: jsonb('integration_retry_policy').notNull().default(sql`'{}'::jsonb`),
    integrationLastSuccessAt: timestamp('integration_last_success_at', { withTimezone: true }),
    integrationLastError: text('integration_last_error'),
    // Free-form settings JSON
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tenants_slug_idx').on(t.slug),
    uniqueIndex('tenants_schema_name_idx').on(t.schemaName),
  ],
);

// ---------------------------------------------------------------------------
// User ↔ Tenant role mapping (a user can have access to one or more tenants).
// Super-admins have a row with tenantId = null and role = 'super_admin'.
// ---------------------------------------------------------------------------
export const userTenantRoles = platform.table(
  'user_tenant_roles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_tenant_role_idx').on(t.userId, t.tenantId, t.role),
    index('user_tenant_user_idx').on(t.userId),
    index('user_tenant_tenant_idx').on(t.tenantId),
  ],
);

// ---------------------------------------------------------------------------
// Global (platform-level) audit log. Tenant-scoped audit lives inside the
// tenant schema; this table captures cross-tenant + super-admin actions.
// ---------------------------------------------------------------------------
export const platformAuditLog = platform.table(
  'audit_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    actorEmail: text('actor_email'), // snapshot, survives user deletion
    tenantId: uuid('tenant_id'), // nullable for platform-level actions
    action: varchar('action', { length: 128 }).notNull(),
    targetType: varchar('target_type', { length: 64 }),
    targetId: text('target_id'),
    diff: jsonb('diff'), // { before, after }
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    result: varchar('result', { length: 16 }).notNull().default('ok'), // ok|fail|denied
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_actor_idx').on(t.actorUserId),
    index('audit_tenant_idx').on(t.tenantId),
    index('audit_action_idx').on(t.action),
    index('audit_created_idx').on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Security events (auth failures, lockouts, suspicious mTLS rejects)
// ---------------------------------------------------------------------------
export const securityEvents = platform.table(
  'security_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    kind: varchar('kind', { length: 64 }).notNull(),
    severity: varchar('severity', { length: 16 }).notNull().default('info'),
    subjectEmail: text('subject_email'),
    subjectUserId: text('subject_user_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sec_events_kind_idx').on(t.kind),
    index('sec_events_created_idx').on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Device enrollment tokens — issued when a tenant is preparing to pair a
// new device. Token is consumed on first ADMS handshake.
// ---------------------------------------------------------------------------
export const deviceEnrollmentTokens = platform.table(
  'device_enrollment_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    issuedByUserId: text('issued_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    intendedDeviceName: text('intended_device_name'),
    intendedDeviceModel: text('intended_device_model'),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    consumedBySn: text('consumed_by_sn'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('enroll_token_idx').on(t.token),
    index('enroll_tenant_idx').on(t.tenantId),
  ],
);

// Convenient barrel for Better Auth's drizzle adapter
export const authSchema = { user, account, session, verification, twoFactor };
