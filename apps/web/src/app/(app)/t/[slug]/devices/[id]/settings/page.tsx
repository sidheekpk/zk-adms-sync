'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  Trash2,
  AlertTriangle,
  Loader2,
  Power,
  Activity,
  RefreshCw,
  Info,
  Fingerprint,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OperatorPasswordModal } from '@/components/operator-password-modal';
import { TimeDriftCard } from '@/components/time-drift-card';
import { ManualTimeCard } from '@/components/manual-time-card';
import { CapabilitiesCard } from '@/components/capabilities-card';
import { DeviceInfoCard } from '@/components/device-info-card';
import { LocationPicker } from '@/components/location-picker';
import { GroupPicker } from '@/components/group-picker';
import { OfflineTroubleshootingCard } from '@/components/offline-troubleshooting-card';
import { cn } from '@/lib/utils';
import type { DeviceCapabilities } from '@zkc/shared/capabilities';

type CommandRow = {
  id: string;
  command_id: number;
  command_type: string;
  status: string;
  return_code: number | null;
  reason: string | null;
  created_at: string;
  completed_at: string | null;
};

type DeviceRow = {
  id: string;
  serial_number: string;
  name: string;
  model: string | null;
  firmware_version: string | null;
  firmware_family: string;
  status: string;
  ip_address: string | null;
  timezone: string;
  timezone_synced_at: string | null;
  user_count: number | null;
  att_log_count: number | null;
  finger_count: number | null;
  face_count: number | null;
  palm_count: number | null;
  has_thermal: boolean;
  enabled: boolean;
  modelLabel: string;
  capabilities: DeviceCapabilities;
  modalities: Record<'fingerprint' | 'face' | 'palm' | 'card', boolean>;
  protocol: {
    setDateTime: boolean;
    executeShell: boolean;
    testVoiceRemote: boolean;
    setOptionsRoundTrip: boolean;
    setOptionsNetwork: boolean;
    bulkEnrollPush: boolean;
    queryNetwork: boolean;
  };
  clock: {
    timezone: string;
    serverNowMs: number;
    deviceLocalMs: number;
    deviceUnix: number;
    driftSec: number;
    driftMeasuredAt: string | null;
  };
  settings?: {
    clockDrift?: { sec: number; measuredAt: string; method?: string };
    deviceInfo?: Record<string, string>;
  };
};

type MaintenanceKind =
  | 'clear_att_log'
  | 'clear_all_data'
  | 'clear_fingerprints'
  | 'clear_faces'
  | 'clear_palms'
  | 'clear_photos'
  | 'clear_admins'
  | 'factory_reset';

export default function DeviceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  const utils = trpc.useUtils();
  const device = trpc.devices.get.useQuery(
    { tenantSlug: slug, id },
    { refetchInterval: 5000 },
  );
  const commands = trpc.devices.listCommands.useQuery(
    { tenantSlug: slug, deviceId: id, limit: 10 },
    { refetchInterval: 3000 },
  );
  const runMaintenance = trpc.devices.runMaintenance.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(`Maintenance: ${vars.kind} queued`);
      void utils.devices.listCommands.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const queue = trpc.devices.queueCommand.useMutation({
    onError: (e) => toast.error(e.message),
    onSuccess: () => void utils.devices.listCommands.invalidate(),
  });
  const setEnabled = trpc.devices.setEnabled.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(vars.enabled ? 'Device enabled' : 'Device disabled');
      void utils.devices.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const refreshConn = trpc.devices.refreshStatus.useMutation({
    onSuccess: (r) => {
      if (r.currentStatus === 'online') toast.success(r.hint);
      else toast.warning(r.hint);
      void utils.devices.get.invalidate();
      void utils.devices.notifications.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const d = device.data as DeviceRow | null | undefined;
  const [maintenanceTarget, setMaintenanceTarget] = useState<{
    kind: MaintenanceKind;
    title: string;
    description: string;
    label: string;
  } | null>(null);
  const [rebootOpen, setRebootOpen] = useState(false);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Devices', href: `/t/${slug}/devices` },
          { label: d?.name ?? 'Device', href: `/t/${slug}/devices/${id}` },
          { label: 'Settings' },
        ]}
        title="Device settings"
        description={d ? `${d.modelLabel} · ${d.firmware_version ?? 'firmware unknown'} · ${d.serial_number}` : ''}
        actions={
          <div className="flex gap-2">
            {d && (
              <>
                <Button
                  variant="outline"
                  onClick={() => refreshConn.mutate({ tenantSlug: slug, deviceId: id })}
                  disabled={refreshConn.isPending}
                  title="Re-check the latest heartbeat — flips the device back to online if it's been polling silently"
                >
                  <RefreshCw className={cn('mr-2 h-4 w-4', refreshConn.isPending && 'animate-spin')} />
                  Refresh
                </Button>
                <Button
                  variant={d.enabled ? 'outline' : 'default'}
                  onClick={() => setEnabled.mutate({ tenantSlug: slug, deviceId: id, enabled: !d.enabled })}
                >
                  <Power className="mr-2 h-4 w-4" />
                  {d.enabled ? 'Pause device' : 'Resume device'}
                </Button>
              </>
            )}
            <Button variant="outline" asChild>
              <Link href={`/t/${slug}/devices/${id}`}>← Device</Link>
            </Button>
          </div>
        }
      />
      <main className="flex-1 px-6 py-6">
        {!d ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div>
              {d.status !== 'online' && (
                <div className="mb-4">
                  <OfflineTroubleshootingCard
                    tenantSlug={slug}
                    deviceId={id}
                    deviceName={d.name || d.serial_number}
                    lastOnline={(d as unknown as { last_online: string | null }).last_online ?? null}
                    firmwareFamily={d.firmware_family}
                    lastKnownIp={
                      d.settings?.deviceInfo?.IPAddress ??
                      (d as unknown as { ip_address: string | null }).ip_address ??
                      null
                    }
                  />
                </div>
              )}

              <Tabs defaultValue="time" className="space-y-4">
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/30 p-1">
                  <TabsTrigger value="time">
                    <Clock className="mr-1.5 h-3.5 w-3.5" /> Time
                  </TabsTrigger>
                  <TabsTrigger value="info">
                    <Info className="mr-1.5 h-3.5 w-3.5" /> Device info
                  </TabsTrigger>
                  <TabsTrigger value="capabilities">
                    <Fingerprint className="mr-1.5 h-3.5 w-3.5" /> Biometrics
                  </TabsTrigger>
                  <TabsTrigger value="maintenance">
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Maintenance
                  </TabsTrigger>
                </TabsList>

                {/* ---- TIME ---- */}
                <TabsContent value="time" className="space-y-4">
                  <TimeDriftCard timezone={d.timezone} drift={d.settings?.clockDrift ?? null} />
                  <ManualTimeCard
                    tenantSlug={slug}
                    deviceId={id}
                    deviceLocalMs={d.clock.deviceLocalMs}
                    driftMeasuredAt={d.clock.driftMeasuredAt}
                    remoteSetSupported={d.protocol.setDateTime}
                  />
                </TabsContent>

                {/* ---- DEVICE INFO (READ-ONLY) ---- */}
                <TabsContent value="info">
                  <DeviceInfoCard
                    tenantSlug={slug}
                    deviceId={id}
                    online={d.status === 'online'}
                    info={d.settings?.deviceInfo ?? null}
                  />
                </TabsContent>

                {/* ---- BIOMETRICS / CAPABILITIES ---- */}
                <TabsContent value="capabilities" className="space-y-4">
                  <CapabilitiesCard
                    tenantSlug={slug}
                    deviceId={id}
                    modelLabel={d.modelLabel}
                    capabilities={d.capabilities}
                    modalities={d.modalities}
                  />
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Biometric data on device</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Stat label="Members" value={d.user_count ?? 0} />
                        <Stat label="Fingerprints" value={d.finger_count ?? 0} />
                        <Stat label="Faces" value={d.face_count ?? 0} />
                        <Stat label="Palms" value={d.palm_count ?? 0} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => queue.mutate({ tenantSlug: slug, deviceId: id, kind: 'query_users' })}
                          disabled={queue.isPending || d.status !== 'online'}
                        >
                          <Activity className="mr-2 h-4 w-4" /> Re-pull users
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => queue.mutate({ tenantSlug: slug, deviceId: id, kind: 'get_info' })}
                          disabled={queue.isPending || d.status !== 'online'}
                        >
                          <Activity className="mr-2 h-4 w-4" /> Refresh counts
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ---- MAINTENANCE ---- */}
                <TabsContent value="maintenance" className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Power className="h-4 w-4 text-muted-foreground" /> Device power
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => setRebootOpen(true)} disabled={d.status !== 'online'}>
                        <Power className="mr-2 h-4 w-4" /> Reboot device
                      </Button>
                      <p className="mt-2 text-xs text-muted-foreground">
                        ~60 second outage. All queued commands carry over.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-red-500/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Trash2 className="h-4 w-4 text-red-600" /> Data clearing
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Each action requires the tenant operator password + a written reason. Audit-logged.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <DangerBtn
                          label="Clear attendance log"
                          description="Wipes the device's local punch log only."
                          onClick={() =>
                            setMaintenanceTarget({
                              kind: 'clear_att_log',
                              title: 'Clear attendance log?',
                              description: 'On-device log is wiped. Already-synced punches stay in ZK Connect.',
                              label: 'Clear log',
                            })
                          }
                        />
                        <DangerBtn
                          label="Clear fingerprints"
                          description="All fingerprint templates wiped."
                          onClick={() =>
                            setMaintenanceTarget({
                              kind: 'clear_fingerprints',
                              title: 'Clear all fingerprints?',
                              description: 'All members must re-enroll fingerprints on the device. ZK Connect copies remain.',
                              label: 'Clear fingerprints',
                            })
                          }
                        />
                        <DangerBtn
                          label="Clear face templates"
                          description="All face templates wiped."
                          onClick={() =>
                            setMaintenanceTarget({
                              kind: 'clear_faces',
                              title: 'Clear all faces?',
                              description: 'All members must re-enroll faces on the device.',
                              label: 'Clear faces',
                            })
                          }
                        />
                        <DangerBtn
                          label="Clear palm templates"
                          description="All palm templates wiped."
                          onClick={() =>
                            setMaintenanceTarget({
                              kind: 'clear_palms',
                              title: 'Clear all palms?',
                              description: 'All members must re-enroll palms on the device.',
                              label: 'Clear palms',
                            })
                          }
                        />
                        <DangerBtn
                          label="Clear photos"
                          description="Attendance photos on the device."
                          onClick={() =>
                            setMaintenanceTarget({
                              kind: 'clear_photos',
                              title: 'Clear photos?',
                              description: 'Attendance photos stored on the device are deleted.',
                              label: 'Clear photos',
                            })
                          }
                        />
                        <DangerBtn
                          label="Clear admin users"
                          description="Resets all admin privileges on the device."
                          onClick={() =>
                            setMaintenanceTarget({
                              kind: 'clear_admins',
                              title: 'Clear admins?',
                              description: 'All admin privileges removed. Users become normal users.',
                              label: 'Clear admins',
                            })
                          }
                        />
                        <DangerBtn
                          extreme
                          label="Wipe ALL data"
                          description="Everything — users, templates, log, photos."
                          onClick={() =>
                            setMaintenanceTarget({
                              kind: 'clear_all_data',
                              title: 'Wipe ALL data on device?',
                              description: 'Erases users, templates, logs, photos. Cannot be undone. ZK Connect copies remain.',
                              label: 'Wipe all',
                            })
                          }
                        />
                        <DangerBtn
                          extreme
                          label="Factory reset"
                          description="Resets including ADMS server pointer. Needs re-pairing."
                          onClick={() =>
                            setMaintenanceTarget({
                              kind: 'factory_reset',
                              title: 'Factory reset?',
                              description: 'Resets the device including ADMS server pointer. You will need to physically re-pair.',
                              label: 'Factory reset',
                            })
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Sidebar */}
            <aside className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Device</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <Row label="Name" value={d.name} />
                  <Row label="SN" value={<code className="font-mono text-xs">{d.serial_number}</code>} />
                  <Row label="Model" value={d.model ?? '—'} />
                  <Row label="Firmware family" value={d.firmware_family} />
                  <Row label="Status" value={<StatusPill status={d.status} />} />
                  <Row label="Active" value={d.enabled ? 'Yes' : <span className="text-amber-600">Paused</span>} />
                  <div className="space-y-3 pt-2">
                    <LocationPicker
                      tenantSlug={slug}
                      deviceId={id}
                      currentLocationId={(d as unknown as { location_id: string | null }).location_id ?? null}
                    />
                    <GroupPicker
                      tenantSlug={slug}
                      deviceId={id}
                      currentGroupId={(d as unknown as { group_id: string | null }).group_id ?? null}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">What this firmware supports</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs">
                  <Capability label="Read device options" ok />
                  <Capability label="Push/remove members" ok={d.protocol.bulkEnrollPush} />
                  <Capability label="Push biometric templates" ok={d.protocol.bulkEnrollPush} />
                  <Capability label="Trigger on-device enrollment" ok />
                  <Capability label="Clear data" ok />
                  <Capability label="Reboot" ok />
                  <Capability label="Set time remotely" ok={d.protocol.setDateTime} />
                  <Capability label="Apply settings remotely" ok={false} />
                  <Capability label="Beep / test sound" ok={d.protocol.testVoiceRemote} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Recent commands</CardTitle>
                </CardHeader>
                <CardContent>
                  {!commands.data ? (
                    <p className="text-xs text-muted-foreground">Loading…</p>
                  ) : (commands.data as CommandRow[]).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No commands yet</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {(commands.data as CommandRow[]).map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span className="font-mono truncate">{c.command_type}</span>
                          <span
                            className={cn(
                              c.status === 'success' ? 'text-emerald-600' :
                              c.status === 'failed' ? 'text-red-600' :
                              c.status === 'pending' ? 'text-amber-600' :
                              'text-muted-foreground',
                            )}
                          >
                            {c.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </main>

      <OperatorPasswordModal
        open={!!maintenanceTarget}
        onOpenChange={(o) => !o && setMaintenanceTarget(null)}
        title={maintenanceTarget?.title ?? ''}
        description={maintenanceTarget?.description}
        destructiveLabel={maintenanceTarget?.label ?? 'Confirm'}
        pending={runMaintenance.isPending}
        onConfirm={async ({ operatorPassword, reason }) => {
          if (!maintenanceTarget) return;
          try {
            await runMaintenance.mutateAsync({
              tenantSlug: slug,
              deviceId: id,
              kind: maintenanceTarget.kind,
              operatorPassword,
              reason,
            });
            setMaintenanceTarget(null);
          } catch {}
        }}
      />

      <OperatorPasswordModal
        open={rebootOpen}
        onOpenChange={setRebootOpen}
        title="Reboot device?"
        description="The device will be offline for ~60 seconds, then come back with all pending config applied. Audit-logged."
        destructiveLabel="Reboot now"
        pending={queue.isPending}
        onConfirm={async ({ operatorPassword, reason }) => {
          try {
            await queue.mutateAsync({
              tenantSlug: slug,
              deviceId: id,
              kind: 'reboot',
              operatorPassword,
              reason,
            });
            toast.success('Reboot queued — device offline in ~5s, back in ~60s');
            setRebootOpen(false);
          } catch {}
        }}
      />
    </>
  );
}

// ---- Small UI helpers --------------------------------------------------
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    online: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    offline: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
    disabled: 'bg-muted text-muted-foreground border-border',
    never_seen: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        map[status] ?? map.never_seen,
      )}
    >
      {status}
    </span>
  );
}

function Capability({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={ok ? '' : 'text-muted-foreground'}>{label}</span>
      <span>
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <span className="text-xs text-muted-foreground">not on this firmware</span>
        )}
      </span>
    </div>
  );
}

function DangerBtn({
  label,
  description,
  onClick,
  extreme,
}: {
  label: string;
  description: string;
  onClick: () => void;
  extreme?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors ' +
        (extreme ? 'border-red-500/30 hover:bg-red-500/10' : 'hover:bg-muted/30')
      }
    >
      <span className={'flex items-center gap-2 text-sm font-medium ' + (extreme ? 'text-red-600' : '')}>
        {extreme && <AlertTriangle className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
