'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Cpu, Plus, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConnectDeviceCard } from './connect-device-card';
import { InlineDeviceClock } from '@/components/inline-device-clock';

export default function DevicesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const devices = trpc.devices.list.useQuery({ tenantSlug: slug });
  const [showConnect, setShowConnect] = useState(false);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Devices' },
        ]}
        title="Devices"
        description="ZK devices paired with this tenant. New device? Click Add device to see exactly what to configure on the machine."
        actions={
          <Button onClick={() => setShowConnect(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add device
          </Button>
        }
      />
      <main className="flex-1 space-y-6 px-6 py-6">
        {showConnect && <ConnectDeviceCard tenantSlug={slug} onClose={() => setShowConnect(false)} />}

        <Card>
          <CardContent className="p-0">
            {!devices.data ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : devices.data.length === 0 ? (
              <div className="py-16 text-center">
                <Cpu className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No devices paired yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Click <b>Add device</b> above to see the machine setup instructions.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-4 font-medium">Name</th>
                      <th className="p-4 font-medium">Serial</th>
                      <th className="p-4 font-medium">Model</th>
                      <th className="p-4 font-medium">Firmware</th>
                      <th className="p-4 font-medium">Members</th>
                      <th className="p-4 font-medium">Status</th>
                      <th className="p-4 font-medium">Device time</th>
                      <th className="p-4 font-medium">Last seen</th>
                      <th className="p-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {devices.data.map((d) => (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-4 font-medium">{d.name || '—'}</td>
                        <td className="p-4 font-mono text-xs text-muted-foreground">{d.serial_number}</td>
                        <td className="p-4">{d.model ?? '—'}</td>
                        <td className="p-4 text-xs">{d.firmware_version ?? '—'}</td>
                        <td className="p-4">{d.user_count ?? '—'}</td>
                        <td className="p-4">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="p-4">
                          <InlineDeviceClock timezone={d.timezone} showDate />
                        </td>
                        <td className="p-4 text-xs text-muted-foreground">
                          {d.last_online ? new Date(d.last_online).toLocaleString() : '—'}
                        </td>
                        <td className="p-4 text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/t/${slug}/devices/${d.id}`}>
                              Manage <ArrowRight className="ml-1 h-4 w-4" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    online: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    offline: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    disabled: 'bg-muted text-muted-foreground border-border',
    never_seen: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  };
  const cls = map[status] ?? map.never_seen;
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
