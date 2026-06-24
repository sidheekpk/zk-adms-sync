import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { router, tenantProcedure } from '../trpc';
import { logTenantAction } from '../audit';
import { getTenantSql } from '@zkc/db/client';
import { encrypt } from '@zkc/shared';

const createInput = z.object({
  tenantSlug: z.string(),
  name: z.string().min(1).max(80),
  kind: z.enum(['radixhr', 'webhook']).default('radixhr'),
  endpoint: z.string().url(),
  workspaceId: z.string().nullable(),
  apiToken: z.string().min(8),
  retryPolicy: z
    .object({ maxAttempts: z.number().min(1).max(10).optional(), baseDelayMs: z.number().min(100).max(60_000).optional() })
    .optional(),
});

const updateInput = z.object({
  tenantSlug: z.string(),
  id: z.string().uuid(),
  name: z.string().min(1).max(80).optional(),
  endpoint: z.string().url().optional(),
  workspaceId: z.string().nullable().optional(),
  apiToken: z.string().min(8).optional(), // only if rotating
  isActive: z.boolean().optional(),
  retryPolicy: z
    .object({ maxAttempts: z.number().min(1).max(10).optional(), baseDelayMs: z.number().min(100).max(60_000).optional() })
    .optional(),
});

export const syncTargetsRouter = router({
  list: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          id: string;
          name: string;
          kind: string;
          endpoint: string;
          workspaceId: string | null;
          isActive: boolean;
          lastSuccessAt: string | null;
          createdAt: string;
          updatedAt: string;
        }>
      >`
        SELECT id, name, kind, endpoint, workspace_id AS "workspaceId",
               is_active AS "isActive",
               last_success_at AS "lastSuccessAt",
               created_at AS "createdAt",
               updated_at AS "updatedAt"
        FROM sync_targets
        ORDER BY created_at DESC
      `;
    }),

  recentDeliveries: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), targetId: z.string().uuid(), limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          id: string;
          batchId: string;
          recordCount: number;
          status: string;
          attempts: number;
          httpStatus: number | null;
          errorMessage: string | null;
          createdAt: string;
        }>
      >`
        SELECT id, batch_id AS "batchId", record_count AS "recordCount",
               status, attempts, http_status AS "httpStatus",
               error_message AS "errorMessage", created_at AS "createdAt"
        FROM sync_log
        WHERE sync_target_id = ${input.targetId}::uuid
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `;
    }),

  pendingCount: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<Array<{ pending: number; failed: number }>>`
        SELECT
          COUNT(*) FILTER (WHERE sync_status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE sync_status = 'failed')::int AS failed
        FROM attendance_logs
      `;
      return rows[0] ?? { pending: 0, failed: 0 };
    }),

  create: tenantProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const tokenEnc = encrypt(input.apiToken);
      const rows = await sql<Array<{ id: string }>>`
        INSERT INTO sync_targets (name, kind, endpoint, workspace_id, api_token_encrypted, retry_policy, is_active)
        VALUES (
          ${input.name}, ${input.kind}, ${input.endpoint},
          ${input.workspaceId ?? null},
          ${tokenEnc},
          ${input.retryPolicy ? sql.json(input.retryPolicy) : sql.json({})}::jsonb,
          true
        )
        RETURNING id
      `;
      const id = rows[0]!.id;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'sync_target.create',
        targetType: 'sync_target',
        targetId: id,
        diff: { name: input.name, kind: input.kind, endpoint: input.endpoint },
      });
      return { id };
    }),

  update: tenantProcedure
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const current = await sql<Array<{ name: string; endpoint: string; workspaceId: string | null; isActive: boolean }>>`
        SELECT name, endpoint, workspace_id AS "workspaceId", is_active AS "isActive"
        FROM sync_targets WHERE id = ${input.id}::uuid
      `;
      if (current.length === 0) throw new TRPCError({ code: 'NOT_FOUND' });
      const cur = current[0]!;

      const next = {
        name: input.name ?? cur.name,
        endpoint: input.endpoint ?? cur.endpoint,
        workspaceId: input.workspaceId !== undefined ? input.workspaceId : cur.workspaceId,
        isActive: input.isActive ?? cur.isActive,
      };
      const tokenEnc = input.apiToken ? encrypt(input.apiToken) : null;

      await sql`
        UPDATE sync_targets SET
          name = ${next.name},
          endpoint = ${next.endpoint},
          workspace_id = ${next.workspaceId},
          is_active = ${next.isActive},
          ${tokenEnc ? sql`api_token_encrypted = ${tokenEnc},` : sql``}
          ${input.retryPolicy ? sql`retry_policy = ${sql.json(input.retryPolicy)}::jsonb,` : sql``}
          updated_at = NOW()
        WHERE id = ${input.id}::uuid
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'sync_target.update',
        targetType: 'sync_target',
        targetId: input.id,
        diff: { from: cur, to: { ...next, tokenRotated: !!tokenEnc } },
      });
      return { id: input.id };
    }),

  delete: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      await sql`DELETE FROM sync_targets WHERE id = ${input.id}::uuid`;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'sync_target.delete',
        targetType: 'sync_target',
        targetId: input.id,
      });
      return { ok: true };
    }),

  retryFailed: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .mutation(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const result = await sql`
        UPDATE attendance_logs
        SET sync_status = 'pending', sync_attempts = 0, last_sync_error = NULL
        WHERE sync_status = 'failed'
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'sync_target.retry_failed',
        targetType: 'sync_target',
        diff: { reset: result.count },
      });
      return { reset: result.count };
    }),
});
