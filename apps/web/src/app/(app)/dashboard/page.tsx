'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Cpu, ScrollText, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function PlatformDashboard() {
  const router = useRouter();
  const tenants = trpc.tenants.listMine.useQuery();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Platform' }]}
        title="Welcome back"
        description="Cross-tenant view. Pick a tenant from the sidebar switcher to drop into its console."
        actions={
          <Button onClick={() => router.push('/tenants/new')}>
            <Building2 className="mr-2 h-4 w-4" /> New tenant
          </Button>
        }
      />
      <main className="flex-1 px-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Tenants" value={tenants.data?.length ?? '—'} icon={Building2} />
          <KpiCard label="Devices online" value="—" icon={Cpu} hint="Tracks once ADMS service is live" />
          <KpiCard label="Punches today" value="—" icon={ScrollText} hint="Tracks once ADMS service is live" />
          <KpiCard label="2FA enabled" value="—" icon={ShieldCheck} />
        </div>

        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Tenants</CardTitle>
              <p className="text-sm text-muted-foreground">All clients on the platform</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/tenants">
                Manage <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!tenants.data ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : tenants.data.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center">
                <p className="text-sm font-medium">No tenants yet</p>
                <p className="text-sm text-muted-foreground">
                  Add your first client to start onboarding devices.
                </p>
                <Button className="mt-4" onClick={() => router.push('/tenants/new')}>
                  <Building2 className="mr-2 h-4 w-4" /> Add tenant
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {tenants.data.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        t/{t.slug} · {t.timezone} · {t.status}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/t/${t.slug}/dashboard`}>
                        Open <ArrowRight className="ml-1 h-4 w-4" />
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
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
