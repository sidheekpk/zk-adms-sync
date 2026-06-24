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
