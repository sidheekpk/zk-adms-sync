'use client';

import { use, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, ScanFace, Fingerprint, Hand, CreditCard, Cpu } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { DeviceCapabilities } from '@zkc/shared/capabilities';

export default function EnrollMemberPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const devices = trpc.devices.list.useQuery({ tenantSlug: slug });
  const create = trpc.employees.createForEnrollment.useMutation({
    onSuccess: (data) => {
      toast.success(`Member created — pushed to ${data.pushed.length} device(s)`);
      router.push(`/t/${slug}/members/${data.employeeId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    pin: '',
    name: '',
    role: 'staff',
    devicePrivilege: 0,
    cardNumber: '',
    deviceIds: [] as string[],
  });

  const selectedDevices = useMemo(
    () => devices.data?.filter((d) => form.deviceIds.includes(d.id)) ?? [],
    [devices.data, form.deviceIds],
  );

  function toggleDevice(id: string) {
    setForm((f) => ({
      ...f,
      deviceIds: f.deviceIds.includes(id)
        ? f.deviceIds.filter((x) => x !== id)
        : [...f.deviceIds, id],
    }));
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Members', href: `/t/${slug}/members` },
          { label: 'Enroll' },
        ]}
        title="Enroll new member"
        description="Create the member record, push them to one or more devices, then ask them to capture their biometric on the device."
      />
      <main className="flex-1 px-6 py-6">
        <form
          className="grid gap-6 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.deviceIds.length === 0) {
              toast.error('Pick at least one device for the member to enroll on');
              return;
            }
            create.mutate({
              tenantSlug: slug,
              pin: form.pin,
              name: form.name,
              role: form.role,
              devicePrivilege: form.devicePrivilege,
              cardNumber: form.cardNumber || undefined,
              deviceIds: form.deviceIds,
            });
          }}
        >
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Member identity</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pin">PIN (used on device keypad)</Label>
                  <Input
                    id="pin"
                    inputMode="numeric"
                    value={form.pin}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))
                    }
                    placeholder="e.g. 13"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name (displayed on device)</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Mohammed Ali"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priv">Device privilege</Label>
                  <select
                    id="priv"
                    value={form.devicePrivilege}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, devicePrivilege: Number(e.target.value) }))
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="0">User (0) — normal access</option>
                    <option value="14">Admin (14) — can change device settings</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="card">RFID card number (optional)</Label>
                  <Input
                    id="card"
                    value={form.cardNumber}
                    onChange={(e) => setForm((f) => ({ ...f, cardNumber: e.target.value }))}
                    placeholder="Hex or decimal card UID"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Devices to enroll on</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Pick the device(s) the member will use. We&apos;ll push their PIN/name to each. They&apos;ll capture their biometric on the device itself.
                </p>
              </CardHeader>
              <CardContent>
                {!devices.data ? (
                  <p className="text-sm text-muted-foreground">Loading devices…</p>
                ) : devices.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No devices yet. Add a device first under <b>Devices</b>.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {devices.data.map((d) => {
                      const checked = form.deviceIds.includes(d.id);
                      return (
                        <li
                          key={d.id}
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer transition-colors',
                            checked && 'border-primary bg-primary/5',
                          )}
                          onClick={() => toggleDevice(d.id)}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDevice(d.id)}
                              className="h-4 w-4"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Cpu className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium text-sm">{d.name || d.serial_number}</p>
                              <p className="text-xs text-muted-foreground">
                                {d.serial_number} · {d.status}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">What happens next</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Step n={1}>
                  We create the member record in this tenant.
                </Step>
                <Step n={2}>
                  We queue a <code className="font-mono text-xs">DATA UPDATE USERINFO</code> command on each selected device — pushes the PIN + name.
                </Step>
                <Step n={3}>
                  Walk the new member up to the device. Tell them to enroll their biometric there: <b>Menu → User → Find PIN → New face/finger/palm</b>.
                </Step>
                <Step n={4}>
                  The device uploads the templates back to us. We&apos;ll show live progress on the next page.
                </Step>
              </CardContent>
            </Card>

            {selectedDevices.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Biometric options on selected device(s)</CardTitle>
                </CardHeader>
                <CardContent>
                  <SelectedDeviceCapabilities tenantSlug={slug} deviceIds={form.deviceIds} />
                </CardContent>
              </Card>
            )}

            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Create member & start enrollment'
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
        {n}
      </span>
      <p>{children}</p>
    </div>
  );
}

function SelectedDeviceCapabilities({
  tenantSlug,
  deviceIds,
}: {
  tenantSlug: string;
  deviceIds: string[];
}) {
  const queries = trpc.useQueries((t) =>
    deviceIds.map((id) => t.devices.get({ tenantSlug, id })),
  );
  if (queries.some((q) => !q.data)) {
    return <p className="text-xs text-muted-foreground">Loading…</p>;
  }

  // Union of capabilities so we can show one row per modality.
  const caps: DeviceCapabilities = {
    fingerprint: false,
    face: false,
    palm: false,
    card: false,
    pin: true,
    thermal: false,
    speaker: false,
    camera: false,
    doorRelay: false,
  };
  for (const q of queries) {
    const c = (q.data as { capabilities: DeviceCapabilities } | null)?.capabilities;
    if (!c) continue;
    (Object.keys(caps) as (keyof DeviceCapabilities)[]).forEach((k) => {
      if (c[k]) caps[k] = true;
    });
  }

  return (
    <ul className="space-y-2 text-sm">
      <CapRow icon={Fingerprint} ok={caps.fingerprint}>
        Fingerprint
      </CapRow>
      <CapRow icon={ScanFace} ok={caps.face}>
        Face
      </CapRow>
      <CapRow icon={Hand} ok={caps.palm}>
        Palm
      </CapRow>
      <CapRow icon={CreditCard} ok={caps.card}>
        RFID card
      </CapRow>
    </ul>
  );
}

function CapRow({
  icon: Icon,
  ok,
  children,
}: {
  icon: React.ElementType;
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className={cn('flex items-center gap-2', !ok && 'text-muted-foreground italic')}>
      <Icon className="h-4 w-4" />
      {children}
      {!ok && <span className="text-xs">(not supported)</span>}
    </li>
  );
}
