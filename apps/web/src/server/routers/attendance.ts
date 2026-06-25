import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, tenantProcedure } from '../trpc';
import { logTenantAction } from '../audit';
import { getTenantSql } from '@zkc/db';
import { verifyOperatorPassword as verifyOpPwd } from '@/lib/operator-password';

type Marker = 'on_time' | 'late' | 'early_out' | 'off_shift' | 'unknown';

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function classifyPunch(
  punchType: string,
  localTimeHm: string,
  shift: { start: string; end: string; lateGraceMinutes: number; earlyOutGraceMinutes: number },
): Marker {
  const minute = hmToMinutes(localTimeHm);
  const start = hmToMinutes(shift.start);
  const end = hmToMinutes(shift.end);
  if (punchType === 'in') {
    if (minute > start + shift.lateGraceMinutes) return 'late';
    return 'on_time';
  }
  if (punchType === 'out') {
    if (minute < end - shift.earlyOutGraceMinutes) return 'early_out';
    return 'on_time';
  }
  return 'off_shift';
}

const punchTypeEnum = z.enum(['in', 'out', 'break_in', 'break_out', 'ot_in', 'ot_out', 'unknown']);

const filtersSchema = z.object({
  tenantSlug: z.string(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  deviceId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  pin: z.string().min(1).max(64).optional(),
  punchType: punchTypeEnum.nullable().optional(),
  search: z.string().min(1).max(120).optional(), // matches employee name (case-insensitive) or pin
});

export type AttendanceFilters = z.infer<typeof filtersSchema>;

export const attendanceRouter = router({
  list: tenantProcedure
    .input(
      filtersSchema.extend({
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<
        Array<{
          id: string;
          punch_time: string;
          pin: string;
          employee_id: string | null;
          employee_name: string | null;
          device_id: string;
          device_name: string;
          punch_type: string;
          verify_mode: string;
          sync_status: string;
          local_time: string;
        }>
      >`
        SELECT a.id, a.punch_time, a.pin,
               a.employee_id,
               e.name AS employee_name,
               a.device_id,
               COALESCE(d.name, a.device_sn) AS device_name,
               a.punch_type::text, a.verify_mode::text, a.sync_status::text,
               to_char(a.punch_time AT TIME ZONE ${ctx.tenant.timezone}, 'HH24:MI') AS local_time
        FROM attendance_logs a
        LEFT JOIN employees e ON e.id = a.employee_id
        LEFT JOIN devices d ON d.id = a.device_id
        WHERE a.voided_at IS NULL
          AND (${input.from ?? null}::timestamptz IS NULL OR a.punch_time >= ${input.from ?? null}::timestamptz)
          AND (${input.to ?? null}::timestamptz IS NULL OR a.punch_time <= ${input.to ?? null}::timestamptz)
          AND (${input.deviceId ?? null}::uuid IS NULL OR a.device_id = ${input.deviceId ?? null}::uuid)
          AND (${input.locationId ?? null}::uuid IS NULL OR a.device_id IN (SELECT id FROM devices WHERE location_id = ${input.locationId ?? null}::uuid))
          AND (${input.employeeId ?? null}::uuid IS NULL OR a.employee_id = ${input.employeeId ?? null}::uuid)
          AND (${input.pin ?? null}::text IS NULL OR a.pin = ${input.pin ?? null}::text)
          AND (${input.punchType ?? null}::text IS NULL OR a.punch_type::text = ${input.punchType ?? null}::text)
          AND (
            ${input.search ?? null}::text IS NULL
            OR e.name ILIKE '%' || ${input.search ?? null}::text || '%'
            OR a.pin ILIKE ${input.search ?? null}::text || '%'
          )
        ORDER BY a.punch_time DESC
        LIMIT ${input.limit}
        OFFSET ${input.offset}
      `;

      // Tag each row with late / early / on_time / off_shift based on the
      // tenant's configured shift window. Computation is server-side so
      // the rule is one source of truth (shared with CSV export later).
      const shift = (ctx.tenant.settings as { shift?: { start: string; end: string; lateGraceMinutes: number; earlyOutGraceMinutes: number } } | undefined)?.shift;
      return rows.map((r) => ({ ...r, marker: shift ? classifyPunch(r.punch_type, r.local_time, shift) : 'unknown' as const }));
    }),

  count: tenantProcedure
    .input(filtersSchema)
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM attendance_logs a
        LEFT JOIN employees e ON e.id = a.employee_id
        WHERE a.voided_at IS NULL
          AND (${input.from ?? null}::timestamptz IS NULL OR a.punch_time >= ${input.from ?? null}::timestamptz)
          AND (${input.to ?? null}::timestamptz IS NULL OR a.punch_time <= ${input.to ?? null}::timestamptz)
          AND (${input.deviceId ?? null}::uuid IS NULL OR a.device_id = ${input.deviceId ?? null}::uuid)
          AND (${input.locationId ?? null}::uuid IS NULL OR a.device_id IN (SELECT id FROM devices WHERE location_id = ${input.locationId ?? null}::uuid))
          AND (${input.employeeId ?? null}::uuid IS NULL OR a.employee_id = ${input.employeeId ?? null}::uuid)
          AND (${input.pin ?? null}::text IS NULL OR a.pin = ${input.pin ?? null}::text)
          AND (${input.punchType ?? null}::text IS NULL OR a.punch_type::text = ${input.punchType ?? null}::text)
          AND (
            ${input.search ?? null}::text IS NULL
            OR e.name ILIKE '%' || ${input.search ?? null}::text || '%'
            OR a.pin ILIKE ${input.search ?? null}::text || '%'
          )
      `;
      return rows[0]?.total ?? 0;
    }),

  /** Top employees by punch count in window. */
  reportByEmployee: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          employee_id: string | null;
          pin: string;
          name: string | null;
          punches: number;
          active_days: number;
          first_punch: string | null;
          last_punch: string | null;
        }>
      >`
        SELECT
          a.employee_id,
          a.pin,
          e.name,
          COUNT(*)::int AS punches,
          COUNT(DISTINCT (a.punch_time AT TIME ZONE ${ctx.tenant.timezone})::date)::int AS active_days,
          MIN(a.punch_time) AS first_punch,
          MAX(a.punch_time) AS last_punch
        FROM attendance_logs a
        LEFT JOIN employees e ON e.id = a.employee_id
        WHERE a.voided_at IS NULL
          AND a.punch_time >= NOW() - (${input.days}::int || ' days')::interval
        GROUP BY a.employee_id, a.pin, e.name
        ORDER BY punches DESC
        LIMIT 100
      `;
    }),

  /** Volume per device in window. */
  reportByDevice: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          device_id: string;
          device_name: string;
          punches: number;
          unique_members: number;
          first_punch: string | null;
          last_punch: string | null;
        }>
      >`
        SELECT
          a.device_id,
          COALESCE(d.name, a.device_sn) AS device_name,
          COUNT(*)::int AS punches,
          COUNT(DISTINCT a.employee_id)::int AS unique_members,
          MIN(a.punch_time) AS first_punch,
          MAX(a.punch_time) AS last_punch
        FROM attendance_logs a
        LEFT JOIN devices d ON d.id = a.device_id
        WHERE a.voided_at IS NULL
          AND a.punch_time >= NOW() - (${input.days}::int || ' days')::interval
        GROUP BY a.device_id, d.name, a.device_sn
        ORDER BY punches DESC
      `;
    }),

  /** Daily punch volume + unique members per day (last N days). */
  reportDaily: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), days: z.number().int().min(1).max(180).default(30) }))
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const tz = ctx.tenant.timezone;
      return sql<
        Array<{
          day: string;
          punches: number;
          unique_members: number;
        }>
      >`
        SELECT
          to_char((a.punch_time AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS punches,
          COUNT(DISTINCT a.employee_id)::int AS unique_members
        FROM attendance_logs a
        WHERE a.voided_at IS NULL
          AND a.punch_time >= NOW() - (${input.days}::int || ' days')::interval
        GROUP BY (a.punch_time AT TIME ZONE ${tz})::date
        ORDER BY (a.punch_time AT TIME ZONE ${tz})::date DESC
      `;
    }),

  /**
   * Dashboard stats: today / yesterday / this week / unique today,
   * computed in the tenant's timezone, voids excluded.
   */
  stats: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const tz = ctx.tenant.timezone;
      const rows = await sql<
        Array<{
          total: number;
          today: number;
          yesterday: number;
          week: number;
          unique_today: number;
          unique_yesterday: number;
        }>
      >`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE (punch_time AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date)::int AS today,
          COUNT(*) FILTER (WHERE (punch_time AT TIME ZONE ${tz})::date = ((NOW() AT TIME ZONE ${tz})::date - 1))::int AS yesterday,
          COUNT(*) FILTER (WHERE punch_time >= date_trunc('week', NOW() AT TIME ZONE ${tz}) AT TIME ZONE ${tz})::int AS week,
          COUNT(DISTINCT employee_id) FILTER (WHERE (punch_time AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date)::int AS unique_today,
          COUNT(DISTINCT employee_id) FILTER (WHERE (punch_time AT TIME ZONE ${tz})::date = ((NOW() AT TIME ZONE ${tz})::date - 1))::int AS unique_yesterday
        FROM attendance_logs
        WHERE voided_at IS NULL
      `;
      return rows[0] ?? { total: 0, today: 0, yesterday: 0, week: 0, unique_today: 0, unique_yesterday: 0 };
    }),

  // ---- Correction workflow ----------------------------------------------

  void: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        id: z.string().uuid(),
        operatorPassword: z.string().min(1),
        reason: z.string().min(3).max(280),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const opRows = await sql<{ password_hash: string }[]>`SELECT password_hash FROM operator_password LIMIT 1`;
      const stored = opRows[0]?.password_hash;
      if (!stored || !(await verifyOpPwd(stored, input.operatorPassword))) {
        await logTenantAction(ctx, {
          tenantSchema: ctx.tenant.schemaName,
          action: 'attendance.void.denied',
          targetType: 'attendance_log',
          targetId: input.id,
          result: 'denied',
          reason: input.reason,
          errorMessage: 'Wrong operator password',
        });
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Wrong operator password' });
      }
      const rs = await sql`
        UPDATE attendance_logs
        SET voided_at = NOW(),
            voided_by = ${ctx.session.user.email},
            void_reason = ${input.reason}
        WHERE id = ${input.id}::uuid AND voided_at IS NULL
      `;
      if (rs.count === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Punch already voided or missing' });
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'attendance.void',
        targetType: 'attendance_log',
        targetId: input.id,
        reason: input.reason,
        operatorPasswordVerified: true,
      });
      return { ok: true as const };
    }),

  insertManual: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        deviceId: z.string().uuid(),
        employeeId: z.string().uuid(),
        punchTime: z.string().datetime(),
        punchType: z.enum(['in', 'out', 'break_in', 'break_out', 'overtime_in', 'overtime_out', 'other']),
        operatorPassword: z.string().min(1),
        reason: z.string().min(3).max(280),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const opRows = await sql<{ password_hash: string }[]>`SELECT password_hash FROM operator_password LIMIT 1`;
      const stored = opRows[0]?.password_hash;
      if (!stored || !(await verifyOpPwd(stored, input.operatorPassword))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Wrong operator password' });
      }
      const emp = await sql<{ pin: string }[]>`SELECT pin FROM employees WHERE id = ${input.employeeId}::uuid LIMIT 1`;
      if (emp.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
      const dev = await sql<{ serial_number: string }[]>`SELECT serial_number FROM devices WHERE id = ${input.deviceId}::uuid LIMIT 1`;
      if (dev.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Device not found' });

      const rows = await sql<{ id: string }[]>`
        INSERT INTO attendance_logs (
          device_id, device_sn, employee_id, pin, punch_time,
          status_code, punch_type, verify_mode_code, verify_mode,
          work_code, sync_status, inserted_manually, inserted_by
        ) VALUES (
          ${input.deviceId}::uuid, ${dev[0]!.serial_number}, ${input.employeeId}::uuid, ${emp[0]!.pin},
          ${input.punchTime}::timestamptz,
          0, ${input.punchType}::punch_type, 0, 'other'::verify_mode,
          '0', 'pending'::sync_status, true, ${ctx.session.user.email}
        )
        RETURNING id
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'attendance.insert_manual',
        targetType: 'attendance_log',
        targetId: rows[0]?.id,
        reason: input.reason,
        operatorPasswordVerified: true,
        metadata: { punchTime: input.punchTime, punchType: input.punchType },
      });
      return { id: rows[0]!.id };
    }),

  // ---- Duplicate detection (Phase 2.7) ---------------------------------

  duplicates: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), days: z.number().int().min(1).max(90).default(14) }))
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          group_key: string;
          employee_id: string | null;
          employee_name: string | null;
          pin: string;
          minute: string;
          count: number;
          ids: string[];
        }>
      >`
        SELECT
          a.pin || '|' || to_char(date_trunc('minute', a.punch_time), 'YYYY-MM-DD HH24:MI') AS group_key,
          a.employee_id,
          e.name AS employee_name,
          a.pin,
          to_char(date_trunc('minute', a.punch_time) AT TIME ZONE ${ctx.tenant.timezone}, 'YYYY-MM-DD HH24:MI') AS minute,
          COUNT(*)::int AS count,
          array_agg(a.id::text ORDER BY a.created_at) AS ids
        FROM attendance_logs a
        LEFT JOIN employees e ON e.id = a.employee_id
        WHERE a.voided_at IS NULL
          AND a.punch_time >= NOW() - (${input.days}::int || ' days')::interval
        GROUP BY a.pin, a.employee_id, e.name, date_trunc('minute', a.punch_time)
        HAVING COUNT(*) > 1
        ORDER BY date_trunc('minute', a.punch_time) DESC
      `;
    }),
});
