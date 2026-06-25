'use client';

import { use, useMemo, useState } from 'react';
import { ShieldCheck, Search, X, Filter } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Row = {
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

export default function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const [search, setSearch] = useState('');
  const [actor, setActor] = useState<string>('');
  const [actionPrefix, setActionPrefix] = useState<string>('');
  const [targetType, setTargetType] = useState<string>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const facets = trpc.audit.facetsTenant.useQuery({ tenantSlug: slug });

  const filters = useMemo(() => {
    const f: {
      tenantSlug: string;
      search?: string;
      actor?: string;
      action?: string;
      targetType?: string;
      from?: string;
      to?: string;
    } = { tenantSlug: slug };
    if (search.trim()) f.search = search.trim();
    if (actor) f.actor = actor;
    if (actionPrefix) f.action = actionPrefix;
    if (targetType) f.targetType = targetType;
    if (from) f.from = new Date(`${from}T00:00:00`).toISOString();
    if (to) f.to = new Date(`${to}T23:59:59`).toISOString();
    return f;
  }, [slug, search, actor, actionPrefix, targetType, from, to]);

  const list = trpc.audit.listTenant.useQuery(
    { ...filters, limit: 200 },
    { refetchInterval: 10_000 },
  );
  const rows = (list.data ?? []) as Row[];

  const hasFilters = !!(search || actor || actionPrefix || targetType || from || to);

  function reset() {
    setSearch('');
    setActor('');
    setActionPrefix('');
    setTargetType('');
    setFrom('');
    setTo('');
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Tenant', href: `/t/${slug}/dashboard` }, { label: 'Audit log' }]}
        title="Audit log"
        description="Append-only record of every action in this tenant — operator changes, device commands, member edits, sync deliveries."
      />
      <main className="flex-1 space-y-4 px-6 py-6">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="asearch" className="text-xs">
                  <Search className="mr-1 inline h-3 w-3" /> Search
                </Label>
                <Input
                  id="asearch"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="action, actor, reason…"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Actor</Label>
                <select
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All actors</option>
                  {(facets.data?.actors ?? []).map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs"><Filter className="mr-1 inline h-3 w-3" /> Action</Label>
                <select
                  value={actionPrefix}
                  onChange={(e) => setActionPrefix(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All actions</option>
                  {(facets.data?.actionPrefixes ?? []).map((p) => (
                    <option key={p} value={p}>{p}.*</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Target type</Label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All</option>
                  {(facets.data?.targetTypes ?? []).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="afrom" className="text-xs">From</Label>
                <Input id="afrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ato" className="text-xs">To</Label>
                <Input id="ato" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
              </div>
              <div className="sm:col-span-2 md:col-span-2 flex items-end justify-end">
                {hasFilters && (
                  <Button size="sm" variant="ghost" onClick={reset}>
                    <X className="mr-1 h-3 w-3" /> Clear filters
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {!list.data ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No audit entries match these filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Time</th>
                      <th className="p-3 font-medium">Actor</th>
                      <th className="p-3 font-medium">Action</th>
                      <th className="p-3 font-medium">Target</th>
                      <th className="p-3 font-medium">Result</th>
                      <th className="p-3 font-medium">Op pwd</th>
                      <th className="p-3 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="p-3 truncate">{r.actor_email}</td>
                        <td className="p-3 font-mono text-xs">{r.action}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {r.target_type ? `${r.target_type}/${r.target_id?.slice(0, 8) ?? '?'}…` : '—'}
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
                              r.result === 'ok'
                                ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                : r.result === 'denied'
                                  ? 'border-red-500/30 text-red-700 dark:text-red-300'
                                  : 'border-amber-500/30 text-amber-700 dark:text-amber-300',
                            )}
                          >
                            {r.result}
                          </span>
                        </td>
                        <td className="p-3">{r.operator_password_verified ? '✓' : '—'}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{r.ip_address ?? '—'}</td>
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
