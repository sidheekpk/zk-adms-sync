import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

import { router, authedProcedure, superAdminProcedure, tenantProcedure } from '../trpc';
import { logPlatformAction, logTenantAction } from '../audit';
import { platformDb } from '@zkc/db/client';
import { tenants, userTenantRoles, user } from '@zkc/db/platform';
import { provisionTenantSchema, tenantSchemaName, getTenantSql } from '@zkc/db';
import { hashOperatorPassword, verifyOperatorPassword } from '@/lib/operator-password';

const slugRe = /^[a-z][a-z0-9-]{1,61}[a-z0-9]$/;

export const tenantsRouter = router({
  // ---- Read --------------------------------------------------------------
  listAll: superAdminProcedure.query(async () => {
    return platformDb
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        schemaName: tenants.schemaName,
        status: tenants.status,
        timezone: tenants.timezone,
        isolationMode: tenants.isolationMode,
        brandColor: tenants.brandColor,
        integrationKind: tenants.integrationKind,
        radixhrWorkspaceId: tenants.radixhrWorkspaceId,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .orderBy(desc(tenants.createdAt));
  }),

  listMine: authedProcedure.query(async ({ ctx }) => {
    if (ctx.session.user.isSuperAdmin) {
      return platformDb
        .select({
          id: tenants.id,
          slug: tenants.slug,
          name: tenants.name,
          status: tenants.status,
          timezone: tenants.timezone,
        })
        .from(tenants)
        .orderBy(desc(tenants.createdAt));
    }
    const rows = await platformDb
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        status: tenants.status,
        timezone: tenants.timezone,
        role: userTenantRoles.role,
      })
      .from(userTenantRoles)
      .innerJoin(tenants, eq(tenants.id, userTenantRoles.tenantId))
      .where(eq(userTenantRoles.userId, ctx.session.user.id));
    return rows;
  }),

  getBySlug: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(({ ctx }) => ctx.tenant),

  rename: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        name: z.string().min(2).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await platformDb
        .select()
        .from(tenants)
        .where(eq(tenants.id, input.tenantId))
        .limit(1);
      if (!before[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      await platformDb
        .update(tenants)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(tenants.id, input.tenantId));
      await logPlatformAction(ctx, {
        action: 'tenant.rename',
        targetType: 'tenant',
        targetId: input.tenantId,
        tenantId: input.tenantId,
        diff: { before: { name: before[0].name }, after: { name: input.name } },
      });
      return { ok: true as const };
    }),

  /** Full tenant editing — super-admin can change name, default timezone, brand color, status. */
  update: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        name: z.string().min(2).max(120).optional(),
        timezone: z.string().min(2).optional(),
        brandColor: z.string().max(16).optional().nullable(),
        status: z.enum(['active', 'suspended', 'pending_setup', 'archived']).optional(),
        radixhrWorkspaceId: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [before] = await platformDb
        .select()
        .from(tenants)
        .where(eq(tenants.id, input.tenantId))
        .limit(1);
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });

      const patch: Partial<typeof tenants.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.timezone !== undefined) patch.timezone = input.timezone;
      if (input.brandColor !== undefined) patch.brandColor = input.brandColor ?? null;
      if (input.status !== undefined) patch.status = input.status;
      if (input.radixhrWorkspaceId !== undefined) patch.radixhrWorkspaceId = input.radixhrWorkspaceId ?? null;

      await platformDb.update(tenants).set(patch).where(eq(tenants.id, input.tenantId));

      await logPlatformAction(ctx, {
        action: 'tenant.update',
        targetType: 'tenant',
        targetId: input.tenantId,
        tenantId: input.tenantId,
        diff: {
          before: {
            name: before.name,
            timezone: before.timezone,
            brandColor: before.brandColor,
            status: before.status,
          },
          after: patch,
        },
      });
      return { ok: true as const };
    }),

  /** Delete a tenant (super-admin only). Drops the schema + audit entry. */
  delete: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        confirmName: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [t] = await platformDb
        .select()
        .from(tenants)
        .where(eq(tenants.id, input.tenantId))
        .limit(1);
      if (!t) throw new TRPCError({ code: 'NOT_FOUND' });
      if (input.confirmName !== t.name) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Tenant name confirmation does not match',
        });
      }
      const { dropTenantSchema } = await import('@zkc/db');
      await dropTenantSchema(t.schemaName);
      await platformDb.delete(tenants).where(eq(tenants.id, input.tenantId));
      await logPlatformAction(ctx, {
        action: 'tenant.delete',
        targetType: 'tenant',
        targetId: input.tenantId,
        tenantId: input.tenantId,
        diff: { before: { name: t.name, schemaName: t.schemaName } },
      });
      return { ok: true as const };
    }),

  // ---- Create ------------------------------------------------------------
  create: superAdminProcedure
    .input(
      z.object({
        name: z.string().min(2).max(120),
        slug: z
          .string()
          .min(3)
          .max(63)
          .regex(slugRe, 'Slug must be lowercase, start with a letter, only a-z 0-9 and -'),
        timezone: z.string().min(2).default('UTC'),
        brandColor: z.string().optional(),
        operatorPassword: z.string().min(6, 'Operator password must be at least 6 characters'),
        adminEmail: z.string().email().optional(),
        // Optional integration setup at creation time. Skip = 'none'.
        integration: z
          .object({
            kind: z.enum(['radix', 'fitness', 'generic']),
            endpoint: z.string().url(),
            token: z.string().min(8),
            workspaceId: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const schemaName = tenantSchemaName(input.slug);
      const { encrypt } = await import('@zkc/shared');

      // 1) Insert platform.tenants row
      const integrationValues = input.integration
        ? {
            integrationKind: input.integration.kind,
            integrationEndpoint: input.integration.endpoint,
            integrationTokenEncrypted: encrypt(input.integration.token),
            integrationWorkspaceId: input.integration.workspaceId ?? null,
          }
        : {};
      const [tenant] = await platformDb
        .insert(tenants)
        .values({
          slug: input.slug,
          name: input.name,
          schemaName,
          timezone: input.timezone,
          brandColor: input.brandColor,
          status: 'active',
          ...integrationValues,
        })
        .returning();
      if (!tenant) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // 2) Provision the schema + tables
      try {
        await provisionTenantSchema(schemaName);
      } catch (err) {
        await platformDb.delete(tenants).where(eq(tenants.id, tenant.id));
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Schema provisioning failed: ${(err as Error).message}`,
        });
      }

      // 3) Set the operator password inside the tenant schema
      const hash = await hashOperatorPassword(input.operatorPassword);
      const sql = getTenantSql(schemaName);
      await sql`
        INSERT INTO operator_password (password_hash, updated_by_user_id, updated_by_email)
        VALUES (${hash}, ${ctx.session.user.id}, ${ctx.session.user.email})
      `;

      // 4) If an admin email was given, link them (create user-role mapping
      //    if they already exist; otherwise just stash the email for later)
      if (input.adminEmail) {
        const [maybeUser] = await platformDb
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, input.adminEmail))
          .limit(1);
        if (maybeUser) {
          await platformDb
            .insert(userTenantRoles)
            .values({ userId: maybeUser.id, tenantId: tenant.id, role: 'tenant_admin' })
            .onConflictDoNothing();
        }
      }

      await logPlatformAction(ctx, {
        action: 'tenant.create',
        targetType: 'tenant',
        targetId: tenant.id,
        tenantId: tenant.id,
        diff: { after: { slug: tenant.slug, name: tenant.name, schemaName } },
      });

      await logTenantAction(ctx, {
        tenantSchema: schemaName,
        action: 'tenant.provisioned',
        targetType: 'tenant',
        targetId: tenant.id,
      });

      return tenant;
    }),

  // ---- Operator password -------------------------------------------------
  updateOperatorPassword: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        currentPassword: z.string().optional(),
        newPassword: z.string().min(6),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);

      // Super-admins can bypass current-password check (recovery flow).
      if (!ctx.session.user.isSuperAdmin) {
        if (!input.currentPassword) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Current operator password required',
          });
        }
        const rows = await sql<{ password_hash: string }[]>`
          SELECT password_hash FROM operator_password LIMIT 1
        `;
        const stored = rows[0]?.password_hash;
        if (!stored || !(await verifyOperatorPassword(stored, input.currentPassword))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Wrong operator password' });
        }
      }

      const hash = await hashOperatorPassword(input.newPassword);
      await sql`
        UPDATE operator_password SET
          password_hash = ${hash},
          updated_by_user_id = ${ctx.session.user.id},
          updated_by_email = ${ctx.session.user.email},
          updated_at = now()
      `;

      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'operator_password.rotate',
        targetType: 'operator_password',
      });

      return { ok: true as const };
    }),

  // ---- Platform-level integration config (super-admin) -----------------
  /** Returns the tenant's current integration config (token NOT decrypted). */
  getIntegration: superAdminProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [t] = await platformDb
        .select({
          integrationKind: tenants.integrationKind,
          integrationEndpoint: tenants.integrationEndpoint,
          integrationWorkspaceId: tenants.integrationWorkspaceId,
          integrationLastSuccessAt: tenants.integrationLastSuccessAt,
          integrationLastError: tenants.integrationLastError,
          // Whether a token is set (don't return the encrypted value)
          tokenIsSet: sql<boolean>`integration_token_encrypted IS NOT NULL`,
        })
        .from(tenants)
        .where(eq(tenants.id, input.tenantId))
        .limit(1);
      if (!t) throw new TRPCError({ code: 'NOT_FOUND' });
      return t;
    }),

  /** Set or clear the tenant's integration. Token is encrypted at rest. */
  setIntegration: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        kind: z.enum(['none', 'radix', 'fitness', 'generic']),
        endpoint: z.string().url().nullable(),
        token: z.string().min(8).nullable(), // null = leave existing token unchanged
        workspaceId: z.string().nullable(),
        retryPolicy: z.object({
          maxAttempts: z.number().int().min(1).max(10).optional(),
          baseDelayMs: z.number().int().min(100).max(60_000).optional(),
        }).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [before] = await platformDb.select().from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });

      const { encrypt } = await import('@zkc/shared');
      const patch: Partial<typeof tenants.$inferInsert> = { updatedAt: new Date() };
      patch.integrationKind = input.kind;
      patch.integrationEndpoint = input.endpoint;
      patch.integrationWorkspaceId = input.workspaceId;
      if (input.kind === 'none') {
        // Clearing — wipe token + endpoint regardless of input
        patch.integrationTokenEncrypted = null;
        patch.integrationEndpoint = null;
        patch.integrationWorkspaceId = null;
      } else if (input.token !== null) {
        patch.integrationTokenEncrypted = encrypt(input.token);
      }
      if (input.retryPolicy) patch.integrationRetryPolicy = input.retryPolicy;

      await platformDb.update(tenants).set(patch).where(eq(tenants.id, input.tenantId));

      await logPlatformAction(ctx, {
        action: 'tenant.integration.update',
        targetType: 'tenant',
        targetId: input.tenantId,
        tenantId: input.tenantId,
        diff: {
          from: { kind: before.integrationKind, endpoint: before.integrationEndpoint, workspaceId: before.integrationWorkspaceId },
          to: { kind: input.kind, endpoint: input.endpoint, workspaceId: input.workspaceId, tokenRotated: input.token != null },
        },
      });
      return { ok: true as const };
    }),

  verifyOperatorPassword: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<{ password_hash: string }[]>`
        SELECT password_hash FROM operator_password LIMIT 1
      `;
      const stored = rows[0]?.password_hash;
      const ok = !!stored && (await verifyOperatorPassword(stored, input.password));
      return { ok };
    }),

  // ---- Shift config -----------------------------------------------------
  /**
   * Default shift window for the whole tenant. Used by the attendance
   * list to tag each punch as 'late', 'early', or 'on_time'. Stored in
   * the tenant's `settings` JSONB so we don't need a migration.
   */
  getShiftConfig: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const settings = (ctx.tenant.settings ?? {}) as { shift?: ShiftConfig };
      return settings.shift ?? DEFAULT_SHIFT;
    }),

  setShiftConfig: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        shift: z.object({
          start: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM'),
          end: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM'),
          lateGraceMinutes: z.number().int().min(0).max(120),
          earlyOutGraceMinutes: z.number().int().min(0).max(120),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await platformDb
        .update(tenants)
        .set({
          settings: { ...(ctx.tenant.settings ?? {}), shift: input.shift },
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, ctx.tenant.id));
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'tenant.shift_config.update',
        diff: { after: input.shift },
      });
      return input.shift;
    }),
});

interface ShiftConfig {
  start: string; // HH:MM
  end: string;   // HH:MM
  lateGraceMinutes: number;
  earlyOutGraceMinutes: number;
}

const DEFAULT_SHIFT: ShiftConfig = {
  start: '09:00',
  end: '18:00',
  lateGraceMinutes: 10,
  earlyOutGraceMinutes: 10,
};
