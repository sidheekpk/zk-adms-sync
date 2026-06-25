import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, getTenantSql } from '@zkc/db/client';
import { tenants } from '@zkc/db/platform';
import {
  pickCommand,
  type FirmwareFamily,
} from '@zkc/shared/firmware';

/**
 * POST /api/inbound/[slug]/members
 *
 * External HR systems (Radix HR, custom in-house tools, …) POST members
 * here. We upsert by `externalId` if provided, else by PIN. Newly-active
 * members are pushed to every online device the tenant owns via
 * DATA UPDATE USERINFO.
 *
 * Auth: `Authorization: Bearer zkci_xxx…` — token must match a non-
 * revoked row in this tenant's `inbound_api_keys`.
 *
 * Body: a single member, or an array of members. Each:
 *   {
 *     externalId?: string,         // upsert key (preferred)
 *     pin: string,                 // required, must be unique per tenant
 *     name: string,
 *     role?: string,
 *     devicePrivilege?: number,    // 0=user, 14=admin
 *     cardNumber?: string | null,
 *     password?: string | null,
 *     enabled?: boolean,
 *     deviceIds?: string[],        // restrict push to specific devices (optional)
 *   }
 *
 * Response 200:
 *   { results: [{ externalId?, pin, employeeId, action: 'created'|'updated', pushedTo: string[] }] }
 */

const memberSchema = z.object({
  externalId: z.string().min(1).max(120).optional(),
  pin: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  role: z.string().max(32).optional(),
  devicePrivilege: z.number().int().min(0).max(14).optional(),
  cardNumber: z.string().max(64).nullable().optional(),
  password: z.string().max(128).nullable().optional(),
  enabled: z.boolean().optional(),
  deviceIds: z.array(z.string().uuid()).optional(),
});

const bodySchema = z.union([memberSchema, z.array(memberSchema).min(1).max(500)]);

function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

function hashKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // ---- Resolve tenant -------------------------------------------------
  const [tenant] = await platformDb.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (!tenant) {
    return NextResponse.json({ error: 'tenant not found' }, { status: 404 });
  }

  // ---- Auth: validate bearer token against inbound_api_keys ----------
  const token = bearer(req);
  if (!token) {
    return NextResponse.json({ error: 'missing Authorization: Bearer …' }, { status: 401 });
  }
  if (!token.startsWith('zkci_')) {
    return NextResponse.json({ error: 'malformed token' }, { status: 401 });
  }

  const sql = getTenantSql(tenant.schemaName);
  const prefix = token.slice(0, 8);
  const tokenHash = hashKey(token);
  const keyRows = await sql<{ id: string; scopes: string[] }[]>`
    SELECT id, scopes
    FROM inbound_api_keys
    WHERE key_prefix = ${prefix}
      AND key_hash = ${tokenHash}
      AND revoked_at IS NULL
    LIMIT 1
  `;
  if (keyRows.length === 0) {
    return NextResponse.json({ error: 'invalid or revoked token' }, { status: 401 });
  }
  const key = keyRows[0]!;
  if (!key.scopes.includes('members:write')) {
    return NextResponse.json({ error: 'token lacks members:write scope' }, { status: 403 });
  }

  // ---- Parse + validate body -----------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const members = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

  // ---- Resolve target devices (default = all online) ------------------
  const allDevices = await sql<
    Array<{ id: string; firmware_family: FirmwareFamily; status: string }>
  >`
    SELECT id, firmware_family, status FROM devices WHERE enabled = true
  `;
  const onlineByDefault = allDevices.filter((d) => d.status === 'online').map((d) => d.id);

  const results: Array<{
    externalId?: string;
    pin: string;
    employeeId?: string;
    action: 'created' | 'updated' | 'claimed' | 'error';
    pushedTo?: string[];
    error?: string;
  }> = [];

  // ---- Upsert each member + queue device pushes ----------------------
  for (const m of members) {
    try {
      // Find existing: prefer externalId; fall back to PIN; if PIN matches a
      // row that has no external_id, "claim" it (set external_id on it).
      let row: { id: string } | null = null;
      let action: 'created' | 'updated' | 'claimed' = 'updated';

      if (m.externalId) {
        const byExt = await sql<{ id: string }[]>`
          SELECT id FROM employees WHERE external_id = ${m.externalId} LIMIT 1
        `;
        if (byExt.length > 0) {
          row = byExt[0]!;
        } else {
          // No row for this externalId yet — see if a row with this PIN
          // exists that we can "claim" by setting external_id on it.
          const byPin = await sql<{ id: string; external_id: string | null }[]>`
            SELECT id, external_id FROM employees WHERE pin = ${m.pin} LIMIT 1
          `;
          if (byPin.length > 0 && byPin[0]!.external_id == null) {
            row = { id: byPin[0]!.id };
            action = 'claimed';
          } else if (byPin.length > 0 && byPin[0]!.external_id !== m.externalId) {
            throw new Error(`PIN ${m.pin} already owned by a different externalId`);
          }
        }
      } else {
        const byPin = await sql<{ id: string }[]>`
          SELECT id FROM employees WHERE pin = ${m.pin} LIMIT 1
        `;
        if (byPin.length > 0) row = byPin[0]!;
      }

      let employeeId: string;
      if (row) {
        employeeId = row.id;
        await sql`
          UPDATE employees SET
            pin = ${m.pin},
            name = ${m.name},
            role = ${m.role ?? 'staff'},
            device_privilege = ${m.devicePrivilege ?? 0},
            card_number = ${m.cardNumber ?? null},
            password = ${m.password ?? null},
            enabled = ${m.enabled ?? true},
            external_id = ${m.externalId ?? null},
            updated_at = now()
          WHERE id = ${employeeId}::uuid
        `;
      } else {
        const ins = await sql<{ id: string }[]>`
          INSERT INTO employees (pin, name, role, device_privilege, card_number, password, enabled, external_id)
          VALUES (${m.pin}, ${m.name}, ${m.role ?? 'staff'}, ${m.devicePrivilege ?? 0},
                  ${m.cardNumber ?? null}, ${m.password ?? null},
                  ${m.enabled ?? true}, ${m.externalId ?? null})
          RETURNING id
        `;
        employeeId = ins[0]!.id;
        action = 'created';
      }

      // Fan-out push
      const targets = m.deviceIds && m.deviceIds.length > 0 ? m.deviceIds : onlineByDefault;
      const devs = allDevices.filter((d) => targets.includes(d.id) && d.status === 'online');
      const pushedTo: string[] = [];
      for (const d of devs) {
        const payload = pickCommand(d.firmware_family, 'addUser')({
          pin: m.pin,
          name: m.name,
          privilege: m.devicePrivilege ?? 0,
          password: m.password ?? undefined,
          card: m.cardNumber ?? undefined,
        });
        const nextIdRow = await sql<{ next: number }[]>`
          SELECT COALESCE(MAX(command_id), 0) + 1 AS next FROM device_commands WHERE device_id = ${d.id}::uuid
        `;
        const cmdId = nextIdRow[0]!.next;
        const wrapped = `C:${cmdId}:${payload.payload}`;
        await sql`
          INSERT INTO device_commands (
            device_id, command_id, command, command_type, status,
            issued_by_email, reason, expires_at
          ) VALUES (
            ${d.id}::uuid, ${cmdId}, ${wrapped}, ${payload.type}, 'pending'::command_status,
            ${`inbound api key ${prefix}…`}, ${`Inbound sync: ${action} ${m.name} (PIN ${m.pin})`},
            NOW() + INTERVAL '5 minutes'
          )
        `;
        pushedTo.push(d.id);
        await sql`
          INSERT INTO employee_devices (employee_id, device_id, pushed_at)
          VALUES (${employeeId}::uuid, ${d.id}::uuid, now())
          ON CONFLICT (employee_id, device_id) DO UPDATE SET pushed_at = now()
        `;
      }

      results.push({
        ...(m.externalId ? { externalId: m.externalId } : {}),
        pin: m.pin,
        employeeId,
        action,
        pushedTo,
      });
    } catch (err) {
      results.push({
        ...(m.externalId ? { externalId: m.externalId } : {}),
        pin: m.pin,
        action: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ---- Audit + key last-use ------------------------------------------
  await sql`
    UPDATE inbound_api_keys
    SET last_used_at = NOW(),
        last_used_ip = ${req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null}
    WHERE id = ${key.id}::uuid
  `;
  await sql`
    INSERT INTO audit_log (
      actor_user_id, actor_email, action, target_type,
      diff, metadata, ip_address, user_agent, result
    ) VALUES (
      NULL, ${`inbound_api_key:${prefix}…`},
      'inbound.members.upsert', 'employee',
      ${sql.json({ count: results.length, actions: results.map((r) => r.action) })},
      ${sql.json({ keyId: key.id })},
      ${req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null},
      ${req.headers.get('user-agent') ?? null},
      'ok'
    )
  `;

  return NextResponse.json({ results });
}
