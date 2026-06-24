import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, tenantProcedure } from '../trpc';
import { logTenantAction } from '../audit';
import { getTenantSql } from '@zkc/db/client';
import { pickCommand, buildDeleteUser, type FirmwareFamily } from '@zkc/shared/firmware';
import { buildCommandPayload, queueCommand } from '../device-commands';

export const employeesRouter = router({
  list: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          id: string;
          pin: string;
          name: string;
          role: string;
          device_privilege: number;
          enabled: boolean;
          biometric_flags: Record<string, boolean>;
        }>
      >`
        SELECT id, pin, name, role, device_privilege, enabled, biometric_flags
        FROM employees
        ORDER BY (pin)::text ASC
      `;
    }),

  get: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql`SELECT * FROM employees WHERE id = ${input.id} LIMIT 1`;
      return rows[0] ?? null;
    }),

  /** Returns the member's stored photo (base64) if a BIOPHOTO record exists. */
  getPhoto: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), employeeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<
        Array<{ template: string | null; source_device_sn: string | null; created_at: string }>
      >`
        SELECT template, source_device_sn, created_at
        FROM biometric_templates
        WHERE employee_id = ${input.employeeId} AND bio_type = 'photo'
        ORDER BY created_at DESC LIMIT 1
      `;
      const row = rows[0];
      if (!row?.template) return null;
      return {
        dataUrl: `data:image/jpeg;base64,${row.template}`,
        sourceDeviceSn: row.source_device_sn,
        capturedAt: row.created_at,
      };
    }),

  /** Recent attendance for one member. */
  recentActivity: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        employeeId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          id: string;
          punch_time: string;
          punch_type: string;
          verify_mode: string;
          device_name: string;
          sync_status: string;
        }>
      >`
        SELECT a.id, a.punch_time, a.punch_type::text, a.verify_mode::text,
               d.name AS device_name, a.sync_status::text
        FROM attendance_logs a
        LEFT JOIN devices d ON d.id = a.device_id
        WHERE a.employee_id = ${input.employeeId}
        ORDER BY a.punch_time DESC
        LIMIT ${input.limit}
      `;
    }),

  /**
   * Daily timesheet. Returns one row per calendar day (in tenant tz)
   * within the requested range, with the first IN, last OUT, count of
   * punches, and a worked-minutes total (last OUT minus first IN if
   * both are present that day).
   */
  timesheet: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        employeeId: z.string().uuid(),
        days: z.number().int().min(1).max(90).default(14),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const tz = ctx.tenant.timezone;
      return sql<
        Array<{
          day: string;
          first_in: string | null;
          last_out: string | null;
          first_punch: string;
          last_punch: string;
          punches: number;
          worked_minutes: number | null;
        }>
      >`
        WITH daily_punches AS (
          SELECT
            a.id,
            a.punch_time,
            a.punch_type,
            (a.punch_time AT TIME ZONE ${tz})::date AS local_day
          FROM attendance_logs a
          WHERE a.employee_id = ${input.employeeId}
            AND a.punch_time >= NOW() - (${input.days}::int || ' days')::interval
        )
        SELECT
          to_char(local_day, 'YYYY-MM-DD') AS day,
          MIN(punch_time) FILTER (WHERE punch_type = 'in') AS first_in,
          MAX(punch_time) FILTER (WHERE punch_type = 'out') AS last_out,
          MIN(punch_time) AS first_punch,
          MAX(punch_time) AS last_punch,
          COUNT(*)::int AS punches,
          CASE
            WHEN MIN(punch_time) FILTER (WHERE punch_type = 'in') IS NULL
              OR MAX(punch_time) FILTER (WHERE punch_type = 'out') IS NULL
              THEN NULL
            ELSE EXTRACT(EPOCH FROM (
              MAX(punch_time) FILTER (WHERE punch_type = 'out')
              - MIN(punch_time) FILTER (WHERE punch_type = 'in')
            ))::int / 60
          END AS worked_minutes
        FROM daily_punches
        GROUP BY local_day
        ORDER BY local_day DESC
      `;
    }),

  /** Edit a member's profile (no biometric capture, no device push). */
  update: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        employeeId: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        role: z.string().max(32).optional(),
        devicePrivilege: z.number().int().min(0).max(14).optional(),
        cardNumber: z.string().max(64).optional().nullable(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const before = await sql<
        Array<{
          name: string;
          role: string;
          device_privilege: number;
          card_number: string | null;
          enabled: boolean;
        }>
      >`
        SELECT name, role, device_privilege, card_number, enabled
        FROM employees WHERE id = ${input.employeeId} LIMIT 1
      `;
      if (!before[0]) throw new TRPCError({ code: 'NOT_FOUND' });

      // postgres-js rejects `undefined` in template parameters, so feed
      // each optional column explicitly with a sentinel approach.
      const newName = input.name ?? before[0].name;
      const newRole = input.role ?? before[0].role;
      const newPriv = input.devicePrivilege ?? before[0].device_privilege;
      const newCard = input.cardNumber === undefined ? before[0].card_number : input.cardNumber;
      const newEnabled = input.enabled ?? before[0].enabled;
      await sql`
        UPDATE employees SET
          name = ${newName},
          role = ${newRole},
          device_privilege = ${newPriv},
          card_number = ${newCard},
          enabled = ${newEnabled},
          updated_at = now()
        WHERE id = ${input.employeeId}
      `;

      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'employee.update',
        targetType: 'employee',
        targetId: input.employeeId,
        diff: { before: before[0], after: input },
      });
      return { ok: true as const };
    }),

  /** After editing, re-push the USER record to every paired device. */
  pushUpdateToDevices: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        employeeId: z.string().uuid(),
        deviceIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const emp = await sql<
        Array<{
          pin: string;
          name: string;
          device_privilege: number;
          card_number: string | null;
          password: string | null;
        }>
      >`
        SELECT pin, name, device_privilege, card_number, password
        FROM employees WHERE id = ${input.employeeId} LIMIT 1
      `;
      if (!emp[0]) throw new TRPCError({ code: 'NOT_FOUND' });

      const targetIds = input.deviceIds
        ? input.deviceIds
        : (
            await sql<Array<{ device_id: string }>>`
              SELECT device_id FROM employee_devices WHERE employee_id = ${input.employeeId}
            `
          ).map((r) => r.device_id);
      if (targetIds.length === 0) return { queued: 0 };

      const devs = await sql<Array<{ id: string; firmware_family: FirmwareFamily }>>`
        SELECT id, firmware_family FROM devices WHERE id IN ${sql(targetIds)}
      `;

      let queued = 0;
      for (const dev of devs) {
        const payload = pickCommand(dev.firmware_family, 'addUser')({
          pin: emp[0].pin,
          name: emp[0].name,
          privilege: emp[0].device_privilege,
          password: emp[0].password ?? undefined,
          card: emp[0].card_number ?? undefined,
        });
        await queueCommand({
          schemaName: ctx.tenant.schemaName,
          deviceId: dev.id,
          payload,
          issuedByUserId: ctx.session.user.id,
          issuedByEmail: ctx.session.user.email,
          reason: `Sync update for ${emp[0].name} (PIN ${emp[0].pin})`,
        });
        queued++;
      }
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'employee.push_update',
        targetType: 'employee',
        targetId: input.employeeId,
        metadata: { deviceIds: targetIds, commandsQueued: queued },
      });
      return { queued };
    }),

  // ---- Create + push to device(s) so biometric capture can happen --------
  createForEnrollment: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        pin: z.string().min(1).max(32),
        name: z.string().min(1).max(120),
        role: z.string().default('staff'),
        devicePrivilege: z.number().int().default(0),
        cardNumber: z.string().optional(),
        password: z.string().optional(),
        deviceIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);

      // Make sure the PIN is unique within the tenant
      const existing = await sql<{ id: string }[]>`
        SELECT id FROM employees WHERE pin = ${input.pin} LIMIT 1
      `;
      if (existing[0]) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `PIN ${input.pin} is already in use`,
        });
      }

      const [created] = await sql<{ id: string }[]>`
        INSERT INTO employees (pin, name, role, device_privilege, card_number, password)
        VALUES (${input.pin}, ${input.name}, ${input.role}, ${input.devicePrivilege},
                ${input.cardNumber ?? null}, ${input.password ?? null})
        RETURNING id
      `;
      const employeeId = created!.id;

      // Look up the devices, build the right per-firmware ADD_USER command
      const devs = await sql<
        Array<{ id: string; firmware_family: FirmwareFamily; name: string; serial_number: string }>
      >`
        SELECT id, firmware_family, name, serial_number
        FROM devices WHERE id IN ${sql(input.deviceIds)}
      `;
      if (devs.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No matching devices' });
      }

      const queued: Array<{ deviceId: string; serial_number: string; commandId: number }> = [];
      for (const d of devs) {
        // Per-firmware add_user (SpeedFace needs USERINFO syntax, BioTime
        // can take the modern parametric one).
        const payload = pickCommand(d.firmware_family, 'addUser')({
          pin: input.pin,
          name: input.name,
          privilege: input.devicePrivilege,
          password: input.password,
          card: input.cardNumber,
        });
        const q = await queueCommand({
          schemaName: ctx.tenant.schemaName,
          deviceId: d.id,
          payload,
          issuedByUserId: ctx.session.user.id,
          issuedByEmail: ctx.session.user.email,
          reason: `Enroll member ${input.name} (PIN ${input.pin})`,
        });
        await sql`
          INSERT INTO employee_devices (employee_id, device_id, pushed_at)
          VALUES (${employeeId}, ${d.id}, now())
          ON CONFLICT (employee_id, device_id) DO UPDATE SET pushed_at = now()
        `;
        queued.push({ deviceId: d.id, serial_number: d.serial_number, commandId: q.commandId });
      }

      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'employee.enroll',
        targetType: 'employee',
        targetId: employeeId,
        diff: {
          after: { pin: input.pin, name: input.name },
        },
        metadata: { deviceIds: input.deviceIds },
      });

      return { employeeId, pushed: queued };
    }),

  /**
   * Trigger enrollment mode on a device for a specific member. The device
   * goes into enrollment mode for the given PIN — the member must then
   * walk up and physically capture their biometric. This is how BioTime
   * does remote enrollment too. There is no way to capture from the
   * server alone (no camera/sensor stream over ADMS).
   */
  triggerEnrollmentOnDevice: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        employeeId: z.string().uuid(),
        deviceId: z.string().uuid(),
        modality: z.enum(['fingerprint', 'face', 'palm']),
        fid: z.number().int().min(0).max(9).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const emp = await sql<Array<{ pin: string; name: string }>>`
        SELECT pin, name FROM employees WHERE id = ${input.employeeId} LIMIT 1
      `;
      if (!emp[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      const { pin, name } = emp[0];

      const { buildEnrollFingerprint, buildEnrollFace, buildEnrollPalm } = await import(
        '@zkc/shared/firmware'
      );
      const payload =
        input.modality === 'fingerprint'
          ? buildEnrollFingerprint({ pin, fid: input.fid })
          : input.modality === 'face'
          ? buildEnrollFace({ pin })
          : buildEnrollPalm({ pin });

      const q = await queueCommand({
        schemaName: ctx.tenant.schemaName,
        deviceId: input.deviceId,
        payload,
        issuedByUserId: ctx.session.user.id,
        issuedByEmail: ctx.session.user.email,
        reason: `Remote ${input.modality} enrollment for ${name} (PIN ${pin})`,
      });

      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'employee.enrollment.trigger',
        targetType: 'employee',
        targetId: input.employeeId,
        metadata: {
          deviceId: input.deviceId,
          modality: input.modality,
          fid: input.fid,
          commandId: q.commandId,
        },
      });

      return { commandId: q.commandId, modality: input.modality };
    }),

  /** Push captured biometric templates from our DB onto one or more devices. */
  pushBiometricsToDevices: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        employeeId: z.string().uuid(),
        deviceIds: z.array(z.string().uuid()).min(1),
        kinds: z
          .array(z.enum(['fp', 'face', 'palm', 'photo']))
          .min(1)
          .default(['fp', 'face', 'palm', 'photo']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const emp = await sql<Array<{ pin: string; name: string }>>`
        SELECT pin, name FROM employees WHERE id = ${input.employeeId} LIMIT 1
      `;
      if (!emp[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
      const { pin, name } = emp[0];

      const templates = await sql<
        Array<{
          bio_type: string;
          fid: number;
          size: number | null;
          template: string | null;
          valid: boolean;
        }>
      >`
        SELECT bio_type, fid, size, template, valid
        FROM biometric_templates
        WHERE employee_id = ${input.employeeId}
          AND bio_type IN ${sql(input.kinds)}
          AND template IS NOT NULL
      `;
      if (templates.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No captured templates to push. Capture on a device first.',
        });
      }

      const devs = await sql<Array<{ id: string; firmware_family: FirmwareFamily }>>`
        SELECT id, firmware_family FROM devices WHERE id IN ${sql(input.deviceIds)}
      `;

      const results: Array<{
        deviceId: string;
        commandId: number;
        kind: string;
      }> = [];

      for (const dev of devs) {
        // Make sure the user row exists on the target device first.
        const addUser = pickCommand(dev.firmware_family, 'addUser')({
          pin,
          name,
          privilege: 0,
        });
        const userCmd = await queueCommand({
          schemaName: ctx.tenant.schemaName,
          deviceId: dev.id,
          payload: addUser,
          issuedByUserId: ctx.session.user.id,
          issuedByEmail: ctx.session.user.email,
          reason: `Sync member ${name} (PIN ${pin}) before biometric push`,
        });
        results.push({ deviceId: dev.id, commandId: userCmd.commandId, kind: 'add_user' });

        for (const t of templates) {
          const kindMap: Record<string, 'push_fp' | 'push_face' | 'push_palm' | 'push_photo'> = {
            fp: 'push_fp',
            face: 'push_face',
            palm: 'push_palm',
            photo: 'push_photo',
          };
          const cmdKind = kindMap[t.bio_type];
          if (!cmdKind) continue;
          if (!t.template) continue;
          const params: Record<string, unknown> =
            cmdKind === 'push_photo'
              ? { pin, size: t.size ?? 0, content: t.template, fileName: `${pin}.jpg` }
              : cmdKind === 'push_fp'
              ? { pin, fid: t.fid, size: t.size ?? 0, template: t.template, valid: t.valid }
              : { pin, size: t.size ?? 0, template: t.template, valid: t.valid };
          const payload = buildCommandPayload({
            kind: cmdKind,
            family: dev.firmware_family,
            timezone: 'UTC',
            params,
          });
          const q = await queueCommand({
            schemaName: ctx.tenant.schemaName,
            deviceId: dev.id,
            payload,
            issuedByUserId: ctx.session.user.id,
            issuedByEmail: ctx.session.user.email,
            reason: `Push ${t.bio_type} for ${name} (PIN ${pin})`,
          });
          results.push({ deviceId: dev.id, commandId: q.commandId, kind: cmdKind });
        }

        await sql`
          INSERT INTO employee_devices (employee_id, device_id, pushed_at)
          VALUES (${input.employeeId}, ${dev.id}, now())
          ON CONFLICT (employee_id, device_id) DO UPDATE SET pushed_at = now()
        `;
      }

      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'employee.biometrics.push',
        targetType: 'employee',
        targetId: input.employeeId,
        metadata: {
          deviceIds: input.deviceIds,
          templates: templates.length,
          commandsQueued: results.length,
        },
      });

      return { queued: results.length, results };
    }),

  /** Used by the "Waiting for biometric" page to poll for capture progress. */
  getEnrollmentStatus: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), employeeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<
        Array<{
          id: string;
          name: string;
          pin: string;
          biometric_flags: Record<string, boolean>;
        }>
      >`
        SELECT id, name, pin, biometric_flags
        FROM employees WHERE id = ${input.employeeId} LIMIT 1
      `;
      const e = rows[0];
      if (!e) throw new TRPCError({ code: 'NOT_FOUND' });
      const templates = await sql<
        Array<{ bio_type: string; fid: number; source_device_sn: string; created_at: string }>
      >`
        SELECT bio_type, fid, source_device_sn, created_at
        FROM biometric_templates
        WHERE employee_id = ${input.employeeId}
        ORDER BY created_at DESC
      `;
      return { employee: e, templates };
    }),

  // ---- Light edit (no biometric capture) --------------------------------
  create: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        pin: z.string().min(1).max(32),
        name: z.string().min(1).max(120),
        role: z.string().default('staff'),
        devicePrivilege: z.number().int().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const [row] = await sql<Array<{ id: string }>>`
        INSERT INTO employees (pin, name, role, device_privilege)
        VALUES (${input.pin}, ${input.name}, ${input.role}, ${input.devicePrivilege})
        RETURNING id
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'employee.create',
        targetType: 'employee',
        targetId: row?.id,
        diff: { after: input },
      });
      return row;
    }),

  delete: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        employeeId: z.string().uuid(),
        operatorPassword: z.string(),
        reason: z.string().min(1).max(280),
        alsoRemoveFromDevices: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const opRows = await sql<Array<{ password_hash: string }>>`
        SELECT password_hash FROM operator_password LIMIT 1
      `;
      const stored = opRows[0]?.password_hash;
      const { verifyOperatorPassword } = await import('@/lib/operator-password');
      if (!stored || !(await verifyOperatorPassword(stored, input.operatorPassword))) {
        await logTenantAction(ctx, {
          tenantSchema: ctx.tenant.schemaName,
          action: 'employee.delete.denied',
          targetType: 'employee',
          targetId: input.employeeId,
          result: 'denied',
          reason: input.reason,
          errorMessage: 'Wrong operator password',
        });
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Wrong operator password' });
      }

      const emp = await sql<Array<{ pin: string; name: string }>>`
        SELECT pin, name FROM employees WHERE id = ${input.employeeId} LIMIT 1
      `;
      if (!emp[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      const { pin, name } = emp[0];

      if (input.alsoRemoveFromDevices) {
        const targetDevices = await sql<Array<{ device_id: string }>>`
          SELECT device_id FROM employee_devices WHERE employee_id = ${input.employeeId}
        `;
        for (const t of targetDevices) {
          const payload = buildDeleteUser(pin);
          await queueCommand({
            schemaName: ctx.tenant.schemaName,
            deviceId: t.device_id,
            payload,
            issuedByUserId: ctx.session.user.id,
            issuedByEmail: ctx.session.user.email,
            reason: `Remove ${name} (PIN ${pin}) — ${input.reason}`,
          });
        }
      }

      await sql`DELETE FROM employees WHERE id = ${input.employeeId}`;

      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'employee.delete',
        targetType: 'employee',
        targetId: input.employeeId,
        reason: input.reason,
        operatorPasswordVerified: true,
        diff: { before: { pin, name } },
      });
      return { ok: true as const };
    }),
});
