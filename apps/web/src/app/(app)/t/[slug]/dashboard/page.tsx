'use client';

import { use } from 'react';
import Link from 'next/link';
import { Cpu, Users, Clock, ArrowRight, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LiveAttendanceFeed } from '@/components/live-attendance-feed';
import { KpiCard } from '@/components/kpi-card';

export default function TenantDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const tenant = trpc.tenants.getBySlug.useQuery({ tenantSlug: slug });
  const devices = trpc.devices.list.useQuery({ tenantSlug: slug });
  const employees = trpc.employees.list.useQuery({ tenantSlug: slug });
  const stats = trpc.attendance.stats.useQuery(
    { tenantSlug: slug },
    { refetchInterval: 10_000 },
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Tenants', href: '/tenants' }, { label: tenant.data?.name ?? slug }]}
        title={tenant.data?.name ?? 'Tenant'}
        description={`${tenant.data?.timezone ?? '—'} · ${tenant.data?.status ?? '—'}`}
        actions={
          <Button asChild>
            <Link href={`/t/${slug}/devices`}>
              <Plus className="mr-2 h-4 w-4" /> Add device
            </Link>
          </Button>
        }
      />
      <main className="flex-1 space-y-6 px-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Devices"
            value={devices.data?.length ?? 0}
            sub={
              devices.data
                ? `${devices.data.filter((d) => d.status === 'online').length} online`
                : ''
            }
            icon={Cpu}
            href={`/t/${slug}/devices`}
            accent="sky"
          />
          <KpiCard
            label="Members"
            value={employees.data?.length ?? 0}
            icon={Users}
            href={`/t/${slug}/members`}
            accent="violet"
          />
          <KpiCard
            label="Punches today"
            value={stats.data?.today ?? 0}
            compareTo={stats.data?.yesterday}
            sub={stats.data ? `${stats.data.unique_today} unique members` : ''}
            icon={Clock}
            href={`/t/${slug}/attendance`}
            accent="emerald"
          />
          <KpiCard
            label="This week"
            value={stats.data?.week ?? 0}
            sub={stats.data ? `${stats.data.total} all-time` : ''}
            icon={Clock}
            href={`/t/${slug}/reports`}
            accent="amber"
          />
        </div>

        {/* Live feed — animated, refreshes every 3s */}
        <LiveAttendanceFeed tenantSlug={slug} />

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Devices</CardTitle>
          </CardHeader>
          <CardContent>
            {!devices.data ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : devices.data.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center">
                <Cpu className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No devices paired yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start with one — we&apos;ll show you exactly what to set on the machine.
                </p>
                <Button className="mt-6" asChild>
                  <Link href={`/t/${slug}/devices`}>
                    <Plus className="mr-2 h-4 w-4" /> Add a device
                  </Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {devices.data.slice(0, 5).map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{d.name || d.serial_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.serial_number} · {d.model ?? 'Unknown model'} · {d.status}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/t/${slug}/devices/${d.id}`}>
                        Manage <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

// (KpiCard moved to @/components/kpi-card — supports count-up + delta)
