'use client';

import { use } from 'react';
import { ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';

export default function AuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const list = trpc.audit.listTenant.useQuery({ tenantSlug: slug, limit: 100 });

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Audit log' },
        ]}
        title="Audit log"
        description="Append-only record of every action taken in this tenant."
      />
      <main className="flex-1 px-6 py-6">
        <Card>
          <CardContent className="p-0">
            {!list.data ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : list.data.length === 0 ? (
              <div className="py-16 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No audit entries yet</p>
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
                      <th className="p-4 font-medium">Result</th>
                      <th className="p-4 font-medium">Op pwd</th>
                      <th className="p-4 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((row: Record<string, unknown>) => {
                      const r = row as {
                        id: string;
                        actor_email: string;
                        action: string;
                        target_type: string | null;
                        target_id: string | null;
                        result: string;
                        operator_password_verified: boolean;
                        ip_address: string | null;
                        created_at: string;
                      };
                      return (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-4 font-mono text-xs">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                          <td className="p-4">{r.actor_email}</td>
                          <td className="p-4 font-mono text-xs">{r.action}</td>
                          <td className="p-4 text-xs text-muted-foreground">
                            {r.target_type ? `${r.target_type}/${r.target_id?.slice(0, 8)}…` : '—'}
                          </td>
                          <td className="p-4">{r.result}</td>
                          <td className="p-4">{r.operator_password_verified ? 'yes' : '—'}</td>
                          <td className="p-4 font-mono text-xs text-muted-foreground">{r.ip_address ?? '—'}</td>
                        </tr>
                      );
                    })}
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
