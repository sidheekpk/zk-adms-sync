'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  Fingerprint,
  ScanFace,
  Hand,
  Camera,
  CheckCircle2,
  Loader2,
  Send,
  Cpu,
  Pencil,
  Activity as ActivityIcon,
  User as UserIcon,
  Clock,
  CalendarRange,
  RefreshCw,
  AlertCircle,
  Trash2,
  Save,
  ArrowRightLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { OperatorPasswordModal } from '@/components/operator-password-modal';
import { TransferMemberModal } from '@/components/transfer-member-modal';
import { cn } from '@/lib/utils';

type BioKind = 'fp' | 'face' | 'palm' | 'photo';

const BIO_META: Record<BioKind, { icon: React.ElementType; label: string }> = {
  fp: { icon: Fingerprint, label: 'Fingerprint' },
  face: { icon: ScanFace, label: 'Face' },
  palm: { icon: Hand, label: 'Palm' },
  photo: { icon: Camera, label: 'Photo' },
};

export default function MemberPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  const utils = trpc.useUtils();

  const status = trpc.employees.getEnrollmentStatus.useQuery(
    { tenantSlug: slug, employeeId: id },
    { refetchInterval: 2000 },
  );
  const photo = trpc.employees.getPhoto.useQuery({ tenantSlug: slug, employeeId: id });
  const activity = trpc.employees.recentActivity.useQuery(
    { tenantSlug: slug, employeeId: id, limit: 50 },
    { refetchInterval: 10_000 },
  );
  const devices = trpc.devices.list.useQuery({ tenantSlug: slug });

  const update = trpc.employees.update.useMutation({
    onSuccess: () => {
      toast.success('Member updated — push to devices to sync');
      void utils.employees.getEnrollmentStatus.invalidate();
      setEditForm({});
    },
    onError: (e) => toast.error(e.message),
  });

  const pushUpdate = trpc.employees.pushUpdateToDevices.useMutation({
    onSuccess: (r) => {
      if (r.queued === 0) toast.info('Member is not on any device yet.');
      else toast.success(`Synced to ${r.queued} device(s)`);
      void utils.devices.listCommands.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const triggerEnroll = trpc.employees.triggerEnrollmentOnDevice.useMutation({
    onSuccess: (r) =>
      toast.success(
        `${r.modality} enrollment triggered — ask the member to walk up to the device now`,
      ),
    onError: (e) => toast.error(e.message),
  });

  const pushBiometrics = trpc.employees.pushBiometricsToDevices.useMutation({
    onSuccess: (data) => {
      toast.success(`Queued ${data.queued} commands`);
      void utils.devices.listCommands.invalidate();
      setPushTargets(new Set());
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.employees.delete.useMutation({
    onSuccess: () => {
      toast.success('Member deleted');
      window.location.href = `/t/${slug}/members`;
    },
    onError: (e) => toast.error(e.message),
  });

  const [editForm, setEditForm] = useState<{
    name?: string;
    role?: string;
    devicePrivilege?: number;
    cardNumber?: string;
    enabled?: boolean;
  }>({});
  const [pushTargets, setPushTargets] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferFromDeviceId, setTransferFromDeviceId] = useState<string | null>(null);

  const employee = status.data?.employee;
  const templates = status.data?.templates ?? [];
  const capturedKinds = new Set(templates.map((t) => t.bio_type as BioKind));

  if (!employee) {
    return (
      <main className="flex-1 px-6 py-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const editDirty = Object.values(editForm).some((v) => v !== undefined);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Members', href: `/t/${slug}/members` },
          { label: employee.name },
        ]}
        title={employee.name}
        description={`PIN ${employee.pin}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/t/${slug}/members`}>← Back</Link>
            </Button>
          </div>
        }
      />
      <main className="flex-1 px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Left sidebar: photo + summary */}
          <aside className="space-y-4">
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-5">
                <Avatar className="h-32 w-32">
                  {photo.data?.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.data.dataUrl} alt={employee.name} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <AvatarFallback className="text-3xl">
                      {employee.name?.[0]?.toUpperCase() ?? '?'}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="text-center">
                  <p className="text-lg font-semibold">{employee.name}</p>
                  <p className="text-xs text-muted-foreground">PIN {employee.pin}</p>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {(['fp', 'face', 'palm'] as BioKind[]).map((k) => {
                    const captured = capturedKinds.has(k);
                    const meta = BIO_META[k];
                    return (
                      <span
                        key={k}
                        title={`${meta.label}${captured ? ' — captured' : ' — not captured'}`}
                        className={cn(
                          'inline-flex h-7 w-7 items-center justify-center rounded-md border',
                          captured
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                            : 'border-dashed text-muted-foreground/40',
                        )}
                      >
                        <meta.icon className="h-4 w-4" />
                      </span>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            {photo.data && (
              <p className="text-center text-xs text-muted-foreground">
                Photo captured on{' '}
                <code className="font-mono">{photo.data.sourceDeviceSn ?? '—'}</code>
                <br />
                {new Date(photo.data.capturedAt).toLocaleString()}
              </p>
            )}
          </aside>

          {/* Right: tabs */}
          <div>
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview">
                  <UserIcon className="mr-1.5 h-3.5 w-3.5" /> Overview
                </TabsTrigger>
                <TabsTrigger value="biometrics">
                  <Fingerprint className="mr-1.5 h-3.5 w-3.5" /> Biometrics
                </TabsTrigger>
                <TabsTrigger value="activity">
                  <ActivityIcon className="mr-1.5 h-3.5 w-3.5" /> Activity
                </TabsTrigger>
                <TabsTrigger value="timesheet">
                  <CalendarRange className="mr-1.5 h-3.5 w-3.5" /> Timesheet
                </TabsTrigger>
                <TabsTrigger value="edit">
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                </TabsTrigger>
              </TabsList>

              {/* ---- OVERVIEW ---- */}
              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                    <Field label="PIN" value={employee.pin} mono />
                    <Field label="Name" value={employee.name} />
                    <Field
                      label="Captured biometrics"
                      value={
                        Object.entries(employee.biometric_flags ?? {})
                          .filter(([, v]) => v)
                          .map(([k]) => k)
                          .join(', ') || 'none yet'
                      }
                    />
                    <Field
                      label="Last activity"
                      value={
                        activity.data && activity.data.length > 0
                          ? new Date(activity.data[0]!.punch_time).toLocaleString()
                          : 'never'
                      }
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ---- BIOMETRICS / ENROLLMENT ---- */}
              <TabsContent value="biometrics" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Biometric capture status</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Live status — auto-refreshes every 2s.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {(['face', 'fp', 'palm', 'photo'] as BioKind[]).map((k) => {
                        const captured = capturedKinds.has(k);
                        const meta = BIO_META[k];
                        return (
                          <div
                            key={k}
                            className={cn(
                              'flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors',
                              captured
                                ? 'border-emerald-500/40 bg-emerald-500/5'
                                : 'border-dashed text-muted-foreground',
                            )}
                          >
                            <meta.icon className="h-7 w-7" />
                            <div className="text-sm font-medium">{meta.label}</div>
                            <div className="flex items-center gap-1 text-xs">
                              {captured ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Captured
                                </>
                              ) : (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" /> Waiting…
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Trigger remote enrollment</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Tells a device to enter enrollment mode for <b>{employee.name}</b> (PIN{' '}
                      {employee.pin}). The member then walks up and physically captures their
                      biometric on the device. We cannot capture from the server — no ZK device
                      exposes the camera/sensor over ADMS.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {!devices.data ? (
                      <p className="text-sm text-muted-foreground">Loading devices…</p>
                    ) : devices.data.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No devices paired yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {devices.data.map((dev) => {
                          const isOnline = dev.status === 'online';
                          return (
                            <div
                              key={dev.id}
                              className={cn(
                                'rounded-md border p-3',
                                !isOnline && 'opacity-50',
                              )}
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Cpu className="h-4 w-4 text-muted-foreground" />
                                  <p className="text-sm font-medium">
                                    {dev.name || dev.serial_number}
                                  </p>
                                  <span
                                    className={cn(
                                      'text-xs rounded-md border px-1.5 py-0.5',
                                      isOnline
                                        ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                                        : 'border-red-500/30 text-red-700 dark:text-red-400',
                                    )}
                                  >
                                    {dev.status}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    triggerEnroll.mutate({
                                      tenantSlug: slug,
                                      employeeId: id,
                                      deviceId: dev.id,
                                      modality: 'face',
                                    })
                                  }
                                  disabled={!isOnline || triggerEnroll.isPending}
                                >
                                  <ScanFace className="mr-2 h-4 w-4" /> Enroll face
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    triggerEnroll.mutate({
                                      tenantSlug: slug,
                                      employeeId: id,
                                      deviceId: dev.id,
                                      modality: 'fingerprint',
                                    })
                                  }
                                  disabled={!isOnline || triggerEnroll.isPending}
                                >
                                  <Fingerprint className="mr-2 h-4 w-4" /> Enroll fingerprint
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    triggerEnroll.mutate({
                                      tenantSlug: slug,
                                      employeeId: id,
                                      deviceId: dev.id,
                                      modality: 'palm',
                                    })
                                  }
                                  disabled={!isOnline || triggerEnroll.isPending}
                                >
                                  <Hand className="mr-2 h-4 w-4" /> Enroll palm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="ml-auto"
                                  onClick={() => setTransferFromDeviceId(dev.id)}
                                  disabled={(devices.data ?? []).length < 2}
                                  title={
                                    (devices.data ?? []).length < 2
                                      ? 'Need at least 2 devices to transfer'
                                      : 'Move or copy this member to another device'
                                  }
                                >
                                  <ArrowRightLeft className="mr-2 h-4 w-4" /> Transfer
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {templates.length > 0 && devices.data && devices.data.length > 1 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Copy templates to another device</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Push the captured templates from our DB onto another device. Useful for
                        getting a new device ready without re-enrolling.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {devices.data.map((dev) => {
                          const selected = pushTargets.has(dev.id);
                          return (
                            <li
                              key={dev.id}
                              className={cn(
                                'flex items-center gap-3 rounded-md border p-3 cursor-pointer',
                                selected && 'border-primary bg-primary/5',
                                dev.status !== 'online' && 'opacity-50 cursor-not-allowed',
                              )}
                              onClick={() => {
                                if (dev.status !== 'online') return;
                                const next = new Set(pushTargets);
                                if (selected) next.delete(dev.id);
                                else next.add(dev.id);
                                setPushTargets(next);
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {}}
                                disabled={dev.status !== 'online'}
                                className="h-4 w-4"
                              />
                              <Cpu className="h-4 w-4 text-muted-foreground" />
                              <div className="flex-1">
                                <p className="text-sm font-medium">
                                  {dev.name || dev.serial_number}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {dev.status}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-4 flex justify-end">
                        <Button
                          disabled={pushTargets.size === 0 || pushBiometrics.isPending}
                          onClick={() =>
                            pushBiometrics.mutate({
                              tenantSlug: slug,
                              employeeId: id,
                              deviceIds: Array.from(pushTargets),
                            })
                          }
                        >
                          {pushBiometrics.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Send className="mr-2 h-4 w-4" />
                              Push to {pushTargets.size || 0} device(s)
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ---- ACTIVITY ---- */}
              <TabsContent value="activity">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent punches</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Last 50 attendance events for {employee.name}.
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    {!activity.data ? (
                      <p className="p-6 text-sm text-muted-foreground">Loading…</p>
                    ) : activity.data.length === 0 ? (
                      <p className="p-6 text-center text-sm text-muted-foreground">
                        No activity yet — once this member punches on a device, events will appear
                        here within a couple of seconds.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                            <tr>
                              <th className="p-3 font-medium">Time</th>
                              <th className="p-3 font-medium">Type</th>
                              <th className="p-3 font-medium">Method</th>
                              <th className="p-3 font-medium">Device</th>
                              <th className="p-3 font-medium">Sync</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activity.data.map((a) => (
                              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="p-3 font-mono text-xs">
                                  {new Date(a.punch_time).toLocaleString()}
                                </td>
                                <td className="p-3">{a.punch_type}</td>
                                <td className="p-3">{a.verify_mode}</td>
                                <td className="p-3">{a.device_name ?? '—'}</td>
                                <td className="p-3 text-xs">
                                  <span
                                    className={cn(
                                      'inline-flex items-center rounded-md border px-2 py-0.5',
                                      a.sync_status === 'synced'
                                        ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                                        : 'border-amber-500/30 text-amber-700 dark:text-amber-400',
                                    )}
                                  >
                                    {a.sync_status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ---- TIMESHEET ---- */}
              <TabsContent value="timesheet">
                <TimesheetTab tenantSlug={slug} employeeId={employee.id} employeeName={employee.name} />
              </TabsContent>

              {/* ---- EDIT ---- */}
              <TabsContent value="edit" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Edit profile</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Changes save to our DB first. Click <b>Push update to devices</b> after to
                      sync the new values to every paired device.
                    </p>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={editForm.name ?? employee.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <select
                        value={editForm.role ?? (employee as { role?: string }).role ?? 'staff'}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Device privilege</Label>
                      <select
                        value={String(
                          editForm.devicePrivilege ?? (employee as { device_privilege?: number }).device_privilege ?? 0,
                        )}
                        onChange={(e) => setEditForm((f) => ({ ...f, devicePrivilege: Number(e.target.value) }))}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="0">User (0) — normal access</option>
                        <option value="14">Admin (14) — can change device settings</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>RFID card number (optional)</Label>
                      <Input
                        value={editForm.cardNumber ?? (employee as { card_number?: string | null }).card_number ?? ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, cardNumber: e.target.value }))}
                        placeholder="Card UID"
                      />
                    </div>
                    <div className="flex items-center justify-between sm:col-span-2 rounded-md border p-3">
                      <div>
                        <Label>Active</Label>
                        <p className="text-xs text-muted-foreground">
                          Disabled members can&apos;t punch (device-side block, if pushed).
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={
                          (editForm.enabled ?? (employee as { enabled?: boolean }).enabled ?? true)
                            ? 'default'
                            : 'outline'
                        }
                        onClick={() =>
                          setEditForm((f) => ({
                            ...f,
                            enabled: !(f.enabled ?? (employee as { enabled?: boolean }).enabled ?? true),
                          }))
                        }
                      >
                        {(editForm.enabled ?? (employee as { enabled?: boolean }).enabled ?? true) ? 'On' : 'Off'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        update.mutate({
                          tenantSlug: slug,
                          employeeId: id,
                          ...editForm,
                        })
                      }
                      disabled={!editDirty || update.isPending}
                    >
                      {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" />Save changes</>}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        pushUpdate.mutate({ tenantSlug: slug, employeeId: id })
                      }
                      disabled={pushUpdate.isPending}
                      title="Push the current profile to every paired device"
                    >
                      {pushUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="mr-2 h-4 w-4" />Push to devices</>}
                    </Button>
                    {editDirty && (
                      <Button variant="ghost" onClick={() => setEditForm({})}>
                        Discard
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete member
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <OperatorPasswordModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${employee.name}?`}
        description={
          <>
            Removes the member from this tenant + queues a <code className="font-mono text-xs">DATA DEL_USER</code>{' '}
            on every paired device. Their captured biometric templates in our DB are also dropped.
            Past attendance rows are kept (audit) but their <code>employee_id</code> link becomes
            null.
          </>
        }
        destructiveLabel="Delete forever"
        pending={remove.isPending}
        onConfirm={async ({ operatorPassword, reason }) => {
          try {
            await remove.mutateAsync({
              tenantSlug: slug,
              employeeId: id,
              operatorPassword,
              reason,
              alsoRemoveFromDevices: true,
            });
          } catch {
            // toast handled
          }
        }}
      />

      <TransferMemberModal
        open={!!transferFromDeviceId}
        onOpenChange={(o) => !o && setTransferFromDeviceId(null)}
        tenantSlug={slug}
        employeeId={id}
        employeeName={employee.name}
        employeePin={employee.pin}
        fromDevice={
          (devices.data ?? []).find((d) => d.id === transferFromDeviceId) ?? null
        }
        allDevices={(devices.data ?? []) as Array<{
          id: string;
          name: string;
          serial_number: string;
          status: string;
        }>}
      />
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={mono ? 'font-mono text-sm mt-1' : 'mt-1 text-sm font-medium'}>{value}</p>
    </div>
  );
}

function TimesheetTab({
  tenantSlug,
  employeeId,
  employeeName,
}: {
  tenantSlug: string;
  employeeId: string;
  employeeName: string;
}) {
  const [days, setDays] = useState(14);
  const ts = trpc.employees.timesheet.useQuery(
    { tenantSlug, employeeId, days },
    { refetchInterval: 15_000 },
  );

  const data = ts.data ?? [];
  const presentDays = data.filter((d) => d.punches > 0).length;
  const totalMinutes = data.reduce((sum, d) => sum + (d.worked_minutes ?? 0), 0);
  const avgPerDay = presentDays > 0 ? Math.round(totalMinutes / presentDays) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Timesheet — {employeeName}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Daily first IN, last OUT, and worked time. Worked time is the
            span between the first IN and last OUT of the day (no break
            deduction).
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Present days</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {presentDays}
              <span className="ml-1 text-xs font-normal text-muted-foreground">/ {days}</span>
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total worked</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatHours(totalMinutes)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg / present day</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatHours(avgPerDay)}
            </p>
          </div>
        </div>

        {!ts.data ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No punches in the last {days} days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Day</th>
                  <th className="p-3 font-medium">First IN</th>
                  <th className="p-3 font-medium">Last OUT</th>
                  <th className="p-3 font-medium">Worked</th>
                  <th className="p-3 font-medium">Punches</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.day} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs">{d.day}</td>
                    <td className="p-3 font-mono text-xs">
                      {d.first_in ? new Date(d.first_in).toLocaleTimeString() : <span className="text-muted-foreground italic">—</span>}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {d.last_out ? new Date(d.last_out).toLocaleTimeString() : <span className="text-muted-foreground italic">—</span>}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {d.worked_minutes != null ? formatHours(d.worked_minutes) : <span className="text-muted-foreground italic">incomplete</span>}
                    </td>
                    <td className="p-3 text-xs">{d.punches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatHours(mins: number): string {
  if (mins <= 0) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
