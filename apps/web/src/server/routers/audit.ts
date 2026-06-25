import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { router, superAdminProcedure, tenantProcedure } from '../trpc';
import { platformDb } from '@zkc/db/client';
import { platformAuditLog } from '@zkc/db/platform';
import { getTenantSql } from '@zkc/db';

export const auditRouter = router({
  listPlatform: superAdminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ input }) => {
      return platformDb
        .select()
        .from(platformAuditLog)
        .orderBy(desc(platformAuditLog.createdAt))
        .limit(input?.limit ?? 50);
    }),

  listTenant: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        limit: z.number().int().min(1).max(500).default(100),
        actor: z.string().optional(),
        action: z.string().optional(), // prefix match
        targetType: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        search: z.string().min(1).max(120).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql`
        SELECT id, actor_email, action, target_type, target_id, result,
               reason, operator_password_verified, ip_address, created_at
        FROM audit_log
        WHERE (${input.actor ?? null}::text IS NULL OR actor_email = ${input.actor ?? null}::text)
          AND (${input.action ?? null}::text IS NULL OR action LIKE ${input.action ?? null}::text || '%')
          AND (${input.targetType ?? null}::text IS NULL OR target_type = ${input.targetType ?? null}::text)
          AND (${input.from ?? null}::timestamptz IS NULL OR created_at >= ${input.from ?? null}::timestamptz)
          AND (${input.to ?? null}::timestamptz IS NULL OR created_at <= ${input.to ?? null}::timestamptz)
          AND (
            ${input.search ?? null}::text IS NULL
            OR action ILIKE '%' || ${input.search ?? null}::text || '%'
            OR COALESCE(actor_email, '') ILIKE '%' || ${input.search ?? null}::text || '%'
            OR COALESCE(reason, '') ILIKE '%' || ${input.search ?? null}::text || '%'
          )
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `;
    }),

  /** Distinct values for filter dropdowns. */
  facetsTenant: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const actors = await sql<Array<{ actor_email: string | null }>>`
        SELECT DISTINCT actor_email FROM audit_log
        WHERE actor_email IS NOT NULL
        ORDER BY actor_email
        LIMIT 50
      `;
      const actions = await sql<Array<{ action: string }>>`
        SELECT DISTINCT split_part(action, '.', 1) AS action FROM audit_log
        ORDER BY action
        LIMIT 50
      `;
      const types = await sql<Array<{ target_type: string | null }>>`
        SELECT DISTINCT target_type FROM audit_log
        WHERE target_type IS NOT NULL
        ORDER BY target_type
        LIMIT 50
      `;
      return {
        actors: actors.map((r) => r.actor_email).filter(Boolean) as string[],
        actionPrefixes: actions.map((r) => r.action),
        targetTypes: types.map((r) => r.target_type).filter(Boolean) as string[],
      };
    }),
});
