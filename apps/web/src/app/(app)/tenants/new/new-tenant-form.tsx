'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const TIMEZONES = [
  'UTC',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Singapore',
];

export function NewTenantForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const create = trpc.tenants.create.useMutation();
  const [form, setForm] = useState({
    name: '',
    slug: '',
    timezone: 'Asia/Dubai',
    operatorPassword: '',
    confirmOperatorPassword: '',
    adminEmail: '',
  });

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function autoSlug(name: string) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 63);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.operatorPassword !== form.confirmOperatorPassword) {
      toast.error('Operator passwords do not match');
      return;
    }
    if (form.operatorPassword.length < 6) {
      toast.error('Operator password must be at least 6 characters');
      return;
    }
    startTransition(async () => {
      try {
        const tenant = await create.mutateAsync({
          name: form.name,
          slug: form.slug,
          timezone: form.timezone,
          operatorPassword: form.operatorPassword,
          adminEmail: form.adminEmail || undefined,
        });
        toast.success('Tenant provisioned');
        router.push(`/t/${tenant.slug}/dashboard`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create tenant';
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Tenant name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => {
                  setField('name', e.target.value);
                  if (!form.slug) setField('slug', autoSlug(e.target.value));
                }}
                placeholder="2DOT4 Diamonds LLC"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">URL slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => setField('slug', e.target.value)}
                pattern="[a-z][a-z0-9-]+[a-z0-9]"
                placeholder="2dot4-diamonds"
                required
              />
              <p className="text-xs text-muted-foreground">
                Used in URLs and as the Postgres schema name <code className="font-mono">t_{form.slug || 'slug'}</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">Default timezone</Label>
              <select
                id="tz"
                value={form.timezone}
                onChange={(e) => setField('timezone', e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz}>{tz}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Devices in this tenant will be initialized to this timezone (you can override per device).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operator password</CardTitle>
            <p className="text-sm text-muted-foreground">
              Required to confirm destructive actions on this tenant&apos;s devices (CLEAR DATA, delete user, etc.). Separate from login passwords; share it only with trusted operators.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="op">Set operator password</Label>
              <Input
                id="op"
                type="password"
                value={form.operatorPassword}
                onChange={(e) => setField('operatorPassword', e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="op2">Confirm</Label>
              <Input
                id="op2"
                type="password"
                value={form.confirmOperatorPassword}
                onChange={(e) => setField('confirmOperatorPassword', e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">First tenant admin (optional)</CardTitle>
            <p className="text-sm text-muted-foreground">
              If this user already has a platform account, they&apos;ll be linked to this tenant with the <b>tenant_admin</b> role. If not, you can invite them later.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-md">
              <Label htmlFor="adminEmail">Admin email</Label>
              <Input
                id="adminEmail"
                type="email"
                value={form.adminEmail}
                onChange={(e) => setField('adminEmail', e.target.value)}
                placeholder="hr@2dot4.ae"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What this creates</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-2">
              <li>· A row in <code className="font-mono text-xs">platform.tenants</code></li>
              <li>· A new Postgres schema <code className="font-mono text-xs">t_{form.slug || 'slug'}</code> with 12 tables</li>
              <li>· An operator-password record (scrypt-hashed)</li>
              <li>· A platform-level audit entry</li>
            </ul>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create tenant'}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
