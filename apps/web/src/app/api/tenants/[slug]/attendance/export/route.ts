import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { platformDb, getTenantSql } from '@zkc/db/client';
import { tenants, userTenantRoles } from '@zkc/db/platform';

interface PunchRow {
  punch_time: string;
  pin: string;
  employee_name: string | null;
  device_name: string;
  device_sn: string;
  punch_type: string;
  verify_mode: string;
  work_code: string | null;
  temperature: number | null;
  sync_status: string;
}

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve tenant + check membership (same gate as tRPC tenantProcedure).
  const [tenant] = await platformDb
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!session.user.isSuperAdmin) {
    const [role] = await platformDb
      .select()
      .from(userTenantRoles)
      .where(
        and(
          eq(userTenantRoles.userId, session.user.id),
          eq(userTenantRoles.tenantId, tenant.id),
        ),
      )
      .limit(1);
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse filters from query string (mirrors attendance.list / count).
  const qp = req.nextUrl.searchParams;
  const from = qp.get('from');
  const to = qp.get('to');
  const deviceId = qp.get('deviceId');
  const punchType = qp.get('punchType');
  const search = qp.get('search');

  const sql = getTenantSql(tenant.schemaName);

  const rows = await sql<PunchRow[]>`
    SELECT
      (a.punch_time AT TIME ZONE ${tenant.timezone})::text AS punch_time,
      a.pin,
      e.name AS employee_name,
      COALESCE(d.name, a.device_sn) AS device_name,
      a.device_sn,
      a.punch_type::text,
      a.verify_mode::text,
      a.work_code,
      a.temperature,
      a.sync_status::text
    FROM attendance_logs a
    LEFT JOIN employees e ON e.id = a.employee_id
    LEFT JOIN devices d ON d.id = a.device_id
    WHERE (${from}::timestamptz IS NULL OR a.punch_time >= ${from}::timestamptz)
      AND (${to}::timestamptz IS NULL OR a.punch_time <= ${to}::timestamptz)
      AND (${deviceId}::uuid IS NULL OR a.device_id = ${deviceId}::uuid)
      AND (${punchType}::text IS NULL OR a.punch_type::text = ${punchType}::text)
      AND (
        ${search}::text IS NULL
        OR e.name ILIKE '%' || ${search}::text || '%'
        OR a.pin ILIKE ${search}::text || '%'
      )
    ORDER BY a.punch_time DESC
  `;

  const header = [
    'punch_time',
    'pin',
    'name',
    'device',
    'device_sn',
    'type',
    'verify_method',
    'work_code',
    'temperature',
    'sync_status',
  ].join(',');

  const body = rows
    .map((r) =>
      [
        r.punch_time,
        r.pin,
        r.employee_name ?? '',
        r.device_name,
        r.device_sn,
        r.punch_type,
        r.verify_mode,
        r.work_code ?? '',
        r.temperature ?? '',
        r.sync_status,
      ]
        .map(csvCell)
        .join(','),
    )
    .join('\n');

  const csv = `${header}\n${body}\n`;
  const filename = `attendance-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
