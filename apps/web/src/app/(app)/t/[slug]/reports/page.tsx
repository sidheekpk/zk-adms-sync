'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Users, Cpu, Calendar } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

export default function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [days, setDays] = useState(30);

  const byEmployee = trpc.attendance.reportByEmployee.useQuery({ tenantSlug: slug, days });
  const byDevice = trpc.attendance.reportByDevice.useQuery({ tenantSlug: slug, days });
  const daily = trpc.attendance.reportDaily.useQuery({ tenantSlug: slug, days });

  const maxDaily = Math.max(1, ...(daily.data ?? []).map((d) => d.punches));

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Reports' },
        ]}
        title="Attendance reports"
        description="Aggregated views across employees, devices, and time."
        actions={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        }
      />

      <main className="flex-1 space-y-4 px-6 py-6">
        {/* Daily volume chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-muted-foreground" /> Daily punch volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!daily.data ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : daily.data.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">No data in this window.</p>
            ) : (
              <div className="space-y-2">
                {[...daily.data].reverse().map((d) => (
                  <div key={d.day} className="grid grid-cols-[110px_1fr_60px_60px] items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{d.day}</span>
                    <div className="h-5 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-primary/70"
                        style={{ width: `${(d.punches / maxDaily) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs tabular-nums">{d.punches}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {d.unique_members} members
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* By employee */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-muted-foreground" /> Top members
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                By punch count in window. Click name to see their timesheet.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {!byEmployee.data ? (
                <p className="p-6 text-sm text-muted-foreground">Loading…</p>
              ) : byEmployee.data.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No data.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">PIN</th>
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 text-right font-medium">Punches</th>
                      <th className="p-3 text-right font-medium">Active days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byEmployee.data.slice(0, 20).map((e) => (
                      <tr key={`${e.employee_id ?? 'unknown'}-${e.pin}`} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{e.pin}</td>
                        <td className="p-3">
                          {e.employee_id ? (
                            <Link href={`/t/${slug}/members/${e.employee_id}`} className="hover:underline">
                              {e.name ?? <span className="italic text-muted-foreground">unknown</span>}
                            </Link>
                          ) : (
                            <span className="italic text-muted-foreground">unknown (unmatched PIN)</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums">{e.punches}</td>
                        <td className="p-3 text-right font-mono tabular-nums">{e.active_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* By device */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4 text-muted-foreground" /> By device
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Punch volume and unique member count per device.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {!byDevice.data ? (
                <p className="p-6 text-sm text-muted-foreground">Loading…</p>
              ) : byDevice.data.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No data.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Device</th>
                      <th className="p-3 text-right font-medium">Punches</th>
                      <th className="p-3 text-right font-medium">Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byDevice.data.map((d) => (
                      <tr key={d.device_id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3">
                          <Link href={`/t/${slug}/devices/${d.device_id}`} className="hover:underline">
                            {d.device_name}
                          </Link>
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums">{d.punches}</td>
                        <td className="p-3 text-right font-mono tabular-nums">{d.unique_members}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <BarChart3 className="inline h-3 w-3 mr-1" /> Reports update live every page load. For
          row-by-row data, use the <Link href={`/t/${slug}/attendance`} className="underline">Attendance</Link> page.
        </p>
      </main>
    </>
  );
}
