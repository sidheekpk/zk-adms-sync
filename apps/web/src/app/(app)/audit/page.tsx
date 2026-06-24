'use client';

import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

export default function PlatformAuditPage() {
  const list = trpc.audit.listPlatform.useQuery({ limit: 100 });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Platform', href: '/dashboard' }, { label: 'Audit log' }]}
        title="Platform audit log"
        description="Every action across the platform — tenant CRUD, security events, super-admin operations."
      />
      <main className="flex-1 px-6 py-6">
        <Card>
          <CardContent className="p-0">
            {!list.data ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : list.data.length === 0 ? (
              <div className="py-16 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No platform events yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-4 font-medium">Time</th>
                      <th className="p-4 font-medium">Actor</th>
                      <th className="p-4 font-medium">Action</th>
                      <th className="p-4 font-medium">Target</th>
                      <th className="p-4 font-medium">Tenant</th>
                      <th className="p-4 font-medium">Result</th>
                      <th className="p-4 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-4 font-mono text-xs">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="p-4">{r.actorEmail ?? '—'}</td>
                        <td className="p-4 font-mono text-xs">{r.action}</td>
                        <td className="p-4 text-xs text-muted-foreground">
                          {r.targetType ? `${r.targetType}/${r.targetId?.slice(0, 8)}…` : '—'}
                        </td>
                        <td className="p-4 text-xs">{r.tenantId?.slice(0, 8) ?? '—'}</td>
                        <td className="p-4">{r.result}</td>
                        <td className="p-4 font-mono text-xs text-muted-foreground">{r.ipAddress ?? '—'}</td>
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
