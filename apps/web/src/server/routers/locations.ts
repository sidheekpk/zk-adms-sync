import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { router, tenantProcedure } from '../trpc';
import { logTenantAction } from '../audit';
import { getTenantSql } from '@zkc/db/client';

export const locationsRouter = router({
  list: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          id: string;
          name: string;
          address: string | null;
          timezone: string | null;
          latitude: string | null;
          longitude: string | null;
          device_count: number;
          member_count: number;
          created_at: string;
        }>
      >`
        SELECT
          l.id, l.name, l.address, l.timezone, l.latitude, l.longitude,
          (SELECT COUNT(*)::int FROM devices d WHERE d.location_id = l.id) AS device_count,
          0::int AS member_count,
          l.created_at
        FROM locations l
        ORDER BY l.name
      `;
    }),

  get: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<
        Array<{ id: string; name: string; address: string | null; timezone: string | null }>
      >`
        SELECT id, name, address, timezone FROM locations WHERE id = ${input.id}::uuid LIMIT 1
      `;
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      return rows[0];
    }),

  create: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        name: z.string().min(1).max(120),
        address: z.string().max(280).optional(),
        timezone: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<Array<{ id: string }>>`
        INSERT INTO locations (name, address, timezone)
        VALUES (${input.name}, ${input.address ?? null}, ${input.timezone ?? null})
        RETURNING id
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'location.create',
        targetType: 'location',
        targetId: rows[0]!.id,
        diff: { after: input },
      });
      return rows[0]!;
    }),

  update: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        address: z.string().max(280).nullable().optional(),
        timezone: z.string().max(64).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const before = await sql<{ name: string; address: string | null; timezone: string | null }[]>`
        SELECT name, address, timezone FROM locations WHERE id = ${input.id}::uuid LIMIT 1
      `;
      if (!before[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      const next = {
        name: input.name ?? before[0].name,
        address: input.address === undefined ? before[0].address : input.address,
        timezone: input.timezone === undefined ? before[0].timezone : input.timezone,
      };
      await sql`
        UPDATE locations SET
          name = ${next.name},
          address = ${next.address},
          timezone = ${next.timezone},
          updated_at = NOW()
        WHERE id = ${input.id}::uuid
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'location.update',
        targetType: 'location',
        targetId: input.id,
        diff: { before: before[0], after: next },
      });
      return { ok: true as const };
    }),

  delete: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      // Devices.location_id ON DELETE SET NULL — so deleting a location
      // just unassigns its devices, which is the expected behavior.
      await sql`DELETE FROM locations WHERE id = ${input.id}::uuid`;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'location.delete',
        targetType: 'location',
        targetId: input.id,
      });
      return { ok: true as const };
    }),

  /** Assign a device to a location (or null to clear). */
  assignDevice: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        deviceId: z.string().uuid(),
        locationId: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      await sql`
        UPDATE devices SET location_id = ${input.locationId}, updated_at = NOW()
        WHERE id = ${input.deviceId}::uuid
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'device.location.assign',
        targetType: 'device',
        targetId: input.deviceId,
        diff: { after: { locationId: input.locationId } },
      });
      return { ok: true as const };
    }),
});
