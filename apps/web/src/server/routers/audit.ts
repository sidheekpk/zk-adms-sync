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
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql`
        SELECT id, actor_email, action, target_type, target_id, result,
               reason, operator_password_verified, ip_address, created_at
        FROM audit_log
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `;
    }),
});
