'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Save, Trash2, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InboundKeysCard } from '@/components/inbound-keys-card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Qatar',
  'Asia/Muscat',
  'Asia/Karachi',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Africa/Cairo',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

const STATUSES: Array<'active' | 'suspended' | 'pending_setup' | 'archived'> = [
  'active',
  'suspended',
  'pending_setup',
  'archived',
];

export default function EditTenantPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();
  const tenants = trpc.tenants.listAll.useQuery();
  const tenant = tenants.data?.find((t) => t.id === tenantId);

  const [form, setForm] = useState<{
    name?: string;
    timezone?: string;
    brandColor?: string;
    status?: 'active' | 'suspended' | 'pending_setup' | 'archived';
    radixhrWorkspaceId?: string;
  }>({});

  const update = trpc.tenants.update.useMutation({
    onSuccess: () => {
      toast.success('Tenant updated');
      void utils.tenants.listAll.invalidate();
      void utils.tenants.listMine.invalidate();
      setForm({});
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.tenants.delete.useMutation({
    onSuccess: () => {
      toast.success('Tenant deleted');
      router.push('/tenants');
    },
    onError: (e) => toast.error(e.message),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  function eff<K extends keyof typeof form>(k: K, fallback: string): string {
    if (form[k] !== undefined) return String(form[k]);
    return String((tenant as Record<string, unknown> | undefined)?.[k] ?? fallback);
  }

  const dirty = Object.values(form).some((v) => v !== undefined);

  if (!tenant) {
    return (
      <main className="flex-1 px-6 py-6">
        <p className="text-sm text-muted-foreground">
          {tenants.isLoading ? 'Loading…' : 'Tenant not found.'}
        </p>
      </main>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Platform', href: '/dashboard' },
          { label: 'Tenants', href: '/tenants' },
          { label: tenant.name, href: `/t/${tenant.slug}/dashboard` },
          { label: 'Edit' },
        ]}
        title={`Edit ${tenant.name}`}
        description={`t/${tenant.slug} · schema ${tenant.schemaName}`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/tenants">Back</Link>
          </Button>
        }
      />
      <main className="flex-1 px-6 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Tenant name</Label>
              <Input
                id="name"
                value={eff('name', tenant.name)}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug (read-only)</Label>
              <Input id="slug" value={tenant.slug} readOnly className="font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">Default timezone</Label>
              <select
                id="tz"
                value={eff('timezone', tenant.timezone)}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {TIMEZONES.includes(tenant.timezone)
                  ? null
                  : <option value={tenant.timezone}>{tenant.timezone}</option>}
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                New devices in this tenant inherit this timezone.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Brand color (hex)</Label>
              <Input
                id="brand"
                value={eff('brandColor', tenant.brandColor ?? '')}
                onChange={(e) => setForm((f) => ({ ...f, brandColor: e.target.value }))}
                placeholder="#1F2937"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={eff('status', tenant.status)}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof STATUSES[number] }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws">RadixHR Workspace ID</Label>
              <Input
                id="ws"
                value={eff('radixhrWorkspaceId', tenant.radixhrWorkspaceId ?? '')}
                onChange={(e) =>
                  setForm((f) => ({ ...f, radixhrWorkspaceId: e.target.value }))
                }
                className="font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Read-only metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            <Field label="Schema name" value={<code className="font-mono text-xs">{tenant.schemaName}</code>} />
            <Field label="Isolation" value={tenant.isolationMode} />
            <Field label="Created" value={new Date(tenant.createdAt).toLocaleString()} />
          </CardContent>
        </Card>

        <IntegrationCard tenantId={tenantId} />
        <InboundKeysCard tenantSlug={tenant.slug} />

        <div className="flex items-center justify-between gap-2">
          <Button
            onClick={() => update.mutate({ tenantId, ...form })}
            disabled={!dirty || update.isPending}
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" />Save changes</>}
          </Button>
          <Button variant="ghost" onClick={() => setForm({})} disabled={!dirty}>
            Discard
          </Button>
        </div>

        <Card className="border-red-500/30">
          <CardHeader>
            <CardTitle className="text-base text-red-600">
              <AlertTriangle className="mr-2 inline h-4 w-4" /> Danger zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Deleting this tenant <strong>permanently drops the Postgres schema</strong>{' '}
              <code className="font-mono text-xs">{tenant.schemaName}</code>: every device, member,
              biometric template, audit row, and attendance log for this tenant is removed. This
              cannot be undone.
            </p>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete tenant…
            </Button>
          </CardContent>
        </Card>
      </main>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" /> Delete tenant
            </DialogTitle>
            <DialogDescription>
              This drops <code className="font-mono">{tenant.schemaName}</code> and all data inside.
              To confirm, type the tenant name <strong>{tenant.name}</strong> below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirmName">Type to confirm</Label>
            <Input
              id="confirmName"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={tenant.name}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== tenant.name || remove.isPending}
              onClick={() => remove.mutate({ tenantId, confirmName: deleteConfirm })}
            >
              {remove.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Delete forever'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

// ---- Integration config card (Phase P.1) ---------------------------------
type IntegrationKind = 'none' | 'radix' | 'fitness' | 'generic';

const KIND_LABELS: Record<IntegrationKind, string> = {
  none: 'No integration',
  radix: 'Radix HR / Workly',
  fitness: 'Fitness app (gym/membership)',
  generic: 'Generic webhook',
};

const KIND_HINTS: Record<IntegrationKind, string> = {
  none: 'Tenant punches stay in ZK Connect only — nothing is pushed out.',
  radix:
    'Tuned payload shape for Radix HR / Workly. Sets workspaceId on every batch + device-status events.',
  fitness:
    'Member check-in shape (gym/membership). Each punch is a check-in keyed by externalId or PIN.',
  generic:
    'Flat JSON shape for any HTTPS receiver. Sends our raw record fields with no remapping.',
};

function IntegrationCard({ tenantId }: { tenantId: string }) {
  const utils = trpc.useUtils();
  const config = trpc.tenants.getIntegration.useQuery({ tenantId });
  const save = trpc.tenants.setIntegration.useMutation({
    onSuccess: () => {
      toast.success('Integration saved');
      void utils.tenants.getIntegration.invalidate();
      setToken(''); // never re-show the entered token after save
    },
    onError: (e) => toast.error(e.message),
  });

  const [kind, setKind] = useState<IntegrationKind>('none');
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Hydrate form from server data once
  if (config.data && !initialized) {
    setKind(config.data.integrationKind as IntegrationKind);
    setEndpoint(config.data.integrationEndpoint ?? '');
    setWorkspaceId(config.data.integrationWorkspaceId ?? '');
    setInitialized(true);
  }

  const tokenAlreadySet = config.data?.tokenIsSet;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      tenantId,
      kind,
      endpoint: kind === 'none' ? null : endpoint.trim() || null,
      // Only send a token if the operator typed one. null = keep existing.
      token: kind === 'none' ? null : token || null,
      workspaceId: kind === 'none' ? null : workspaceId.trim() || null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integration</CardTitle>
        <p className="text-sm text-muted-foreground">
          One outbound integration per tenant — set by super-admin. Sync runs every 30s when
          configured. Attendance + device-status events flow to the chosen kind&apos;s endpoint.
        </p>
      </CardHeader>
      <CardContent>
        {!config.data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1">
              <Label htmlFor="ikind">Kind</Label>
              <select
                id="ikind"
                value={kind}
                onChange={(e) => setKind(e.target.value as IntegrationKind)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {(Object.keys(KIND_LABELS) as IntegrationKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{KIND_HINTS[kind]}</p>
            </div>

            {kind !== 'none' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="iendpoint">Endpoint URL</Label>
                  <Input
                    id="iendpoint"
                    type="url"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    required
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="itoken">
                    API token {tokenAlreadySet && <span className="text-xs text-muted-foreground">(leave blank to keep existing)</span>}
                  </Label>
                  <Input
                    id="itoken"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={tokenAlreadySet ? '•••••• (encrypted on save)' : ''}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Stored AES-256-GCM encrypted at rest.</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="iworkspace">Workspace / external ID (optional)</Label>
                  <Input
                    id="iworkspace"
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-xs">
              <div>
                <p className="font-medium">Status</p>
                <p className="mt-0.5 text-muted-foreground">
                  {config.data.integrationKind === 'none' ? (
                    'Disabled — no outbound sync.'
                  ) : config.data.integrationLastError ? (
                    <>Last error: <span className="text-red-600">{config.data.integrationLastError}</span></>
                  ) : config.data.integrationLastSuccessAt ? (
                    <>Last successful delivery: {new Date(config.data.integrationLastSuccessAt).toLocaleString()}</>
                  ) : (
                    'Configured but no batches sent yet.'
                  )}
                </p>
              </div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save integration
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
