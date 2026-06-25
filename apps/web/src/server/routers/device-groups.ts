import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { router, tenantProcedure } from '../trpc';
import { logTenantAction } from '../audit';
import { getTenantSql } from '@zkc/db/client';
import { verifyOperatorPassword } from '@/lib/operator-password';
import { buildReboot, buildClearLog } from '@zkc/shared/firmware';
import { queueCommand } from '../device-commands';

export const deviceGroupsRouter = router({
  list: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          id: string;
          name: string;
          description: string | null;
          device_count: number;
          online_count: number;
          created_at: string;
        }>
      >`
        SELECT g.id, g.name, g.description,
          (SELECT COUNT(*)::int FROM devices d WHERE d.group_id = g.id) AS device_count,
          (SELECT COUNT(*)::int FROM devices d WHERE d.group_id = g.id AND d.status = 'online') AS online_count,
          g.created_at
        FROM device_groups g
        ORDER BY g.name
      `;
    }),

  create: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), name: z.string().min(1).max(120), description: z.string().max(280).optional() }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<Array<{ id: string }>>`
        INSERT INTO device_groups (name, description)
        VALUES (${input.name}, ${input.description ?? null})
        RETURNING id
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device_group.create',
        targetType: 'device_group',
        targetId: rows[0]!.id,
        diff: { after: input },
      });
      return rows[0]!;
    }),

  update: tenantProcedure
    .input(z.object({
      tenantSlug: z.string(),
      id: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(280).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const before = await sql<{ name: string; description: string | null }[]>`
        SELECT name, description FROM device_groups WHERE id = ${input.id}::uuid
      `;
      if (!before[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      const next = {
        name: input.name ?? before[0].name,
        description: input.description === undefined ? before[0].description : input.description,
      };
      await sql`
        UPDATE device_groups SET name = ${next.name}, description = ${next.description}, updated_at = NOW()
        WHERE id = ${input.id}::uuid
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device_group.update',
        targetType: 'device_group',
        targetId: input.id,
        diff: { before: before[0], after: next },
      });
      return { ok: true as const };
    }),

  delete: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      // devices.group_id ON DELETE SET NULL — deleting a group just
      // unassigns its devices (they keep their data).
      await sql`DELETE FROM device_groups WHERE id = ${input.id}::uuid`;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device_group.delete',
        targetType: 'device_group',
        targetId: input.id,
      });
      return { ok: true as const };
    }),

  assignDevice: tenantProcedure
    .input(z.object({
      tenantSlug: z.string(),
      deviceId: z.string().uuid(),
      groupId: z.string().uuid().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      await sql`
        UPDATE devices SET group_id = ${input.groupId}, updated_at = NOW()
        WHERE id = ${input.deviceId}::uuid
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device.group.assign',
        targetType: 'device',
        targetId: input.deviceId,
        diff: { after: { groupId: input.groupId } },
      });
      return { ok: true as const };
    }),

  // ---- Bulk operations -------------------------------------------------
  /** Reboot every online device in the group. Operator-password gated. */
  bulkReboot: tenantProcedure
    .input(z.object({
      tenantSlug: z.string(),
      groupId: z.string().uuid(),
      operatorPassword: z.string().min(1),
      reason: z.string().min(3).max(280),
    }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const opRows = await sql<{ password_hash: string }[]>`SELECT password_hash FROM operator_password LIMIT 1`;
      const stored = opRows[0]?.password_hash;
      if (!stored || !(await verifyOperatorPassword(stored, input.operatorPassword))) {
        await logTenantAction(ctx, {
          tenantSchema: ctx.tenant.schemaName,
          action: 'device_group.bulk_reboot.denied',
          targetType: 'device_group',
          targetId: input.groupId,
          result: 'denied',
          reason: input.reason,
        });
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Wrong operator password' });
      }
      const devs = await sql<{ id: string }[]>`
        SELECT id FROM devices
        WHERE group_id = ${input.groupId}::uuid
          AND status = 'online'
          AND enabled = true
      `;
      const queued: number[] = [];
      for (const d of devs) {
        const q = await queueCommand({
          schemaName: ctx.tenant.schemaName,
          deviceId: d.id,
          payload: buildReboot(),
          issuedByUserId: ctx.session.user.id,
          issuedByEmail: ctx.session.user.email,
          reason: `Bulk reboot — ${input.reason}`,
        });
        queued.push(q.commandId);
      }
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device_group.bulk_reboot',
        targetType: 'device_group',
        targetId: input.groupId,
        reason: input.reason,
        operatorPasswordVerified: true,
        metadata: { count: queued.length },
      });
      return { devicesRebooted: queued.length };
    }),

  /** Clear attendance log on every online device in the group. */
  bulkClearLog: tenantProcedure
    .input(z.object({
      tenantSlug: z.string(),
      groupId: z.string().uuid(),
      operatorPassword: z.string().min(1),
      reason: z.string().min(3).max(280),
    }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const opRows = await sql<{ password_hash: string }[]>`SELECT password_hash FROM operator_password LIMIT 1`;
      const stored = opRows[0]?.password_hash;
      if (!stored || !(await verifyOperatorPassword(stored, input.operatorPassword))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Wrong operator password' });
      }
      const devs = await sql<{ id: string }[]>`
        SELECT id FROM devices
        WHERE group_id = ${input.groupId}::uuid
          AND status = 'online'
          AND enabled = true
      `;
      const queued: number[] = [];
      for (const d of devs) {
        const q = await queueCommand({
          schemaName: ctx.tenant.schemaName,
          deviceId: d.id,
          payload: buildClearLog(),
          issuedByUserId: ctx.session.user.id,
          issuedByEmail: ctx.session.user.email,
          reason: `Bulk clear log — ${input.reason}`,
        });
        queued.push(q.commandId);
      }
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device_group.bulk_clear_log',
        targetType: 'device_group',
        targetId: input.groupId,
        reason: input.reason,
        operatorPasswordVerified: true,
        metadata: { count: queued.length },
      });
      return { devicesCleared: queued.length };
    }),
});
