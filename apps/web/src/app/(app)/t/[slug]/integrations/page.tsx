'use client';

import { use, useState } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Plus, Trash2, Pencil, Send } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type TargetRow = {
  id: string;
  name: string;
  kind: string;
  endpoint: string;
  workspaceId: string | null;
  isActive: boolean;
  lastSuccessAt: string | null;
};

type DeliveryRow = {
  id: string;
  batchId: string;
  recordCount: number;
  status: string;
  attempts: number;
  httpStatus: number | null;
  errorMessage: string | null;
  createdAt: string;
};

export default function IntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const utils = trpc.useUtils();

  const targets = trpc.syncTargets.list.useQuery({ tenantSlug: slug }, { refetchInterval: 10_000 });
  const counts = trpc.syncTargets.pendingCount.useQuery({ tenantSlug: slug }, { refetchInterval: 5_000 });

  const create = trpc.syncTargets.create.useMutation({
    onSuccess: () => {
      toast.success('Integration created');
      void utils.syncTargets.list.invalidate();
      setShowAdd(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.syncTargets.update.useMutation({
    onSuccess: () => {
      toast.success('Integration updated');
      void utils.syncTargets.list.invalidate();
      setEditTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const del = trpc.syncTargets.delete.useMutation({
    onSuccess: () => {
      toast.success('Integration deleted');
      void utils.syncTargets.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const retryFailed = trpc.syncTargets.retryFailed.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.reset} failed punches re-queued`);
      void utils.syncTargets.pendingCount.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<TargetRow | null>(null);
  const [showDeliveries, setShowDeliveries] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Integrations' },
        ]}
        title="Integrations"
        description="Webhook destinations for attendance sync — Radix HR, Workly, or any custom HTTPS endpoint."
        actions={
          <Button onClick={() => setShowAdd(true)} disabled={create.isPending}>
            <Plus className="mr-2 h-4 w-4" /> Add integration
          </Button>
        }
      />

      <main className="flex-1 space-y-6 px-6 py-6">
        {/* Pending / failed punches summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sync queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                label="Pending sync"
                value={counts.data?.pending ?? 0}
                tone={counts.data?.pending ? 'amber' : 'neutral'}
              />
              <Stat
                label="Failed (exhausted retries)"
                value={counts.data?.failed ?? 0}
                tone={counts.data?.failed ? 'red' : 'neutral'}
              />
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retryFailed.mutate({ tenantSlug: slug })}
                  disabled={retryFailed.isPending || !counts.data?.failed}
                >
                  <RefreshCw className={cn('mr-2 h-4 w-4', retryFailed.isPending && 'animate-spin')} />
                  Retry failed
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Targets list */}
        {targets.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading integrations…</p>
        ) : (targets.data as TargetRow[] | undefined)?.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No integrations configured yet.</p>
              <Button className="mt-4" onClick={() => setShowAdd(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add your first integration
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(targets.data as TargetRow[]).map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {t.isActive ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <h3 className="font-semibold">{t.name}</h3>
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs uppercase tracking-wider">{t.kind}</span>
                        {!t.isActive && <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700">paused</span>}
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground truncate">{t.endpoint}</p>
                      {t.workspaceId && (
                        <p className="mt-0.5 text-xs text-muted-foreground">workspace: <code className="font-mono">{t.workspaceId}</code></p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last success: {t.lastSuccessAt ? new Date(t.lastSuccessAt).toLocaleString() : 'never'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setShowDeliveries(showDeliveries === t.id ? null : t.id)}>
                        <Send className="mr-1 h-3.5 w-3.5" /> Deliveries
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditTarget(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          if (confirm(`Delete integration "${t.name}"?`)) {
                            del.mutate({ tenantSlug: slug, id: t.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {showDeliveries === t.id && <DeliveriesPanel tenantSlug={slug} targetId={t.id} />}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {showAdd && (
        <TargetForm
          mode="create"
          onClose={() => setShowAdd(false)}
          onSubmit={(values) => {
            if (!values.apiToken) return; // form enforces this client-side
            create.mutate({
              tenantSlug: slug,
              name: values.name,
              kind: values.kind,
              endpoint: values.endpoint,
              workspaceId: values.workspaceId,
              apiToken: values.apiToken,
            });
          }}
          pending={create.isPending}
        />
      )}
      {editTarget && (
        <TargetForm
          mode="edit"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(values) => update.mutate({ tenantSlug: slug, id: editTarget.id, ...values })}
          pending={update.isPending}
        />
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'red' | 'neutral' }) {
  const cls =
    tone === 'amber' ? 'border-amber-500/30 bg-amber-500/5' :
    tone === 'red' ? 'border-red-500/30 bg-red-500/5' :
    '';
  return (
    <div className={cn('rounded-md border p-3', cls)}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DeliveriesPanel({ tenantSlug, targetId }: { tenantSlug: string; targetId: string }) {
  const deliveries = trpc.syncTargets.recentDeliveries.useQuery(
    { tenantSlug, targetId, limit: 10 },
    { refetchInterval: 5_000 },
  );
  return (
    <div className="mt-4 border-t pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Last 10 deliveries</p>
      {!deliveries.data || (deliveries.data as DeliveryRow[]).length === 0 ? (
        <p className="text-xs text-muted-foreground">No deliveries yet.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {(deliveries.data as DeliveryRow[]).map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded border p-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {d.status === 'success' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                )}
                <span className="font-mono">{new Date(d.createdAt).toLocaleString()}</span>
                <span>· {d.recordCount} record{d.recordCount === 1 ? '' : 's'}</span>
                <span>· HTTP {d.httpStatus ?? '—'}</span>
                <span>· {d.attempts} attempt{d.attempts === 1 ? '' : 's'}</span>
              </div>
              {d.errorMessage && (
                <span className="truncate text-red-600" title={d.errorMessage}>{d.errorMessage}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface FormValues {
  name: string;
  kind: 'radixhr' | 'webhook';
  endpoint: string;
  workspaceId: string | null;
  apiToken?: string;
  isActive?: boolean;
}

function TargetForm({
  mode,
  initial,
  onClose,
  onSubmit,
  pending,
}: {
  mode: 'create' | 'edit';
  initial?: TargetRow;
  onClose: () => void;
  onSubmit: (v: FormValues) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<'radixhr' | 'webhook'>((initial?.kind as 'radixhr' | 'webhook') ?? 'radixhr');
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? 'https://api.radixhrservice.com/biometric/webhook');
  const [workspaceId, setWorkspaceId] = useState(initial?.workspaceId ?? '');
  const [apiToken, setApiToken] = useState('');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'create' && !apiToken) {
      toast.error('API token is required when creating');
      return;
    }
    const v: FormValues = {
      name: name.trim(),
      kind,
      endpoint: endpoint.trim(),
      workspaceId: workspaceId.trim() || null,
      ...(apiToken ? { apiToken } : {}),
      ...(mode === 'edit' ? { isActive } : {}),
    };
    onSubmit(v);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{mode === 'create' ? 'Add integration' : 'Edit integration'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Radix HR (production)" required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kind</Label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'radixhr' | 'webhook')}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="radixhr">Radix HR / Workly</option>
                <option value="webhook">Generic webhook</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Endpoint URL</Label>
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://…" required className="font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Workspace ID (sent as X-Workspace-Id)</Label>
              <Input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} placeholder="96a0c8ca-3574-…" className="font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                API token {mode === 'edit' && <span className="text-muted-foreground">(leave blank to keep)</span>}
              </Label>
              <Input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder={mode === 'create' ? 'Bearer token' : '••••••••'}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Encrypted at rest with AES-256-GCM.</p>
            </div>
            {mode === 'edit' && (
              <div className="flex items-center justify-between">
                <Label className="text-xs">Active</Label>
                <Button type="button" size="sm" variant={isActive ? 'default' : 'outline'} onClick={() => setIsActive(!isActive)}>
                  {isActive ? 'On' : 'Paused'}
                </Button>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : mode === 'create' ? 'Create integration' : 'Save changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
