'use client';

import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, KeyRound, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const tenant = trpc.tenants.getBySlug.useQuery({ tenantSlug: slug });
  const rotate = trpc.tenants.updateOperatorPassword.useMutation({
    onSuccess: () => toast.success('Operator password rotated'),
    onError: (e) => toast.error(e.message),
  });
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Settings' },
        ]}
        title="Settings"
        description="Tenant-level configuration and security."
      />
      <main className="flex-1 space-y-6 px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={tenant.data?.name} />
            <Field label="Slug" value={tenant.data?.slug} mono />
            <Field label="Schema" value={tenant.data?.schemaName} mono />
            <Field label="Timezone" value={tenant.data?.timezone} />
            <Field label="Status" value={tenant.data?.status} />
            <Field label="Isolation" value={tenant.data?.isolationMode} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <KeyRound className="mr-2 inline h-4 w-4" />
              Operator password
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Required to confirm destructive device actions. Separate from your login password.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-3 sm:items-end max-w-2xl"
              onSubmit={(e) => {
                e.preventDefault();
                if (form.next !== form.confirm) {
                  toast.error('Passwords do not match');
                  return;
                }
                rotate.mutate({
                  tenantSlug: slug,
                  currentPassword: form.current || undefined,
                  newPassword: form.next,
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="cur">Current</Label>
                <Input
                  id="cur"
                  type="password"
                  value={form.current}
                  onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nxt">New</Label>
                <Input
                  id="nxt"
                  type="password"
                  value={form.next}
                  onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnf">Confirm</Label>
                <Input
                  id="cnf"
                  type="password"
                  value={form.confirm}
                  onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                />
              </div>
              <Button type="submit" className="sm:col-span-3 max-w-fit" disabled={rotate.isPending}>
                {rotate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update operator password'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <ShiftCard tenantSlug={slug} />
      </main>
    </>
  );
}

function ShiftCard({ tenantSlug }: { tenantSlug: string }) {
  const utils = trpc.useUtils();
  const config = trpc.tenants.getShiftConfig.useQuery({ tenantSlug });
  const save = trpc.tenants.setShiftConfig.useMutation({
    onSuccess: () => {
      toast.success('Shift window saved');
      void utils.tenants.getShiftConfig.invalidate();
      void utils.attendance.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [lateGrace, setLateGrace] = useState(10);
  const [earlyOutGrace, setEarlyOutGrace] = useState(10);

  useEffect(() => {
    if (config.data) {
      setStart(config.data.start);
      setEnd(config.data.end);
      setLateGrace(config.data.lateGraceMinutes);
      setEarlyOutGrace(config.data.earlyOutGraceMinutes);
    }
  }, [config.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <Clock className="mr-2 inline h-4 w-4" />
          Default shift window
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Used to tag each punch as on-time / late / early. One window applies tenant-wide for now;
          per-member schedules come later.
        </p>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-4 sm:items-end max-w-3xl"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              tenantSlug,
              shift: {
                start,
                end,
                lateGraceMinutes: lateGrace,
                earlyOutGraceMinutes: earlyOutGrace,
              },
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="start">Shift start (HH:MM)</Label>
            <Input
              id="start"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end">Shift end (HH:MM)</Label>
            <Input
              id="end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grace1">Late grace (min)</Label>
            <Input
              id="grace1"
              type="number"
              min={0}
              max={120}
              value={lateGrace}
              onChange={(e) => setLateGrace(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grace2">Early-out grace (min)</Label>
            <Input
              id="grace2"
              type="number"
              min={0}
              max={120}
              value={earlyOutGrace}
              onChange={(e) => setEarlyOutGrace(Number(e.target.value) || 0)}
            />
          </div>
          <Button type="submit" className="sm:col-span-4 max-w-fit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save shift'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, mono }: { label: string; value: string | undefined; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 ${mono ? 'font-mono text-sm' : 'text-sm font-medium'}`}>{value ?? '—'}</p>
    </div>
  );
}
