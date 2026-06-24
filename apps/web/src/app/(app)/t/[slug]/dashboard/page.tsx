'use client';

import { use } from 'react';
import Link from 'next/link';
import { Cpu, Users, Clock, ArrowRight, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function TenantDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const tenant = trpc.tenants.getBySlug.useQuery({ tenantSlug: slug });
  const devices = trpc.devices.list.useQuery({ tenantSlug: slug });
  const employees = trpc.employees.list.useQuery({ tenantSlug: slug });

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
      <main className="flex-1 px-6 py-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Devices"
            value={devices.data?.length ?? '—'}
            sub={
              devices.data
                ? `${devices.data.filter((d) => d.status === 'online').length} online`
                : ''
            }
            icon={Cpu}
            href={`/t/${slug}/devices`}
          />
          <KpiCard
            label="Members"
            value={employees.data?.length ?? '—'}
            icon={Users}
            href={`/t/${slug}/members`}
          />
          <KpiCard
            label="Punches today"
            value="—"
            sub="Live once ADMS service is wired to PG"
            icon={Clock}
            href={`/t/${slug}/attendance`}
          />
        </div>

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

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  href?: string;
}) {
  const body = (
    <CardContent className="flex items-start justify-between p-5">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </div>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </CardContent>
  );
  return href ? (
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/30">{body}</Card>
    </Link>
  ) : (
    <Card>{body}</Card>
  );
}
