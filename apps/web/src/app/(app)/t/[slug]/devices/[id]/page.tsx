'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  Cpu,
  Globe,
  Info,
  LockKeyhole,
  Power,
  Trash2,
  Users,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DeviceClock } from '@/components/device-clock';
import { OperatorPasswordModal } from '@/components/operator-password-modal';
import { TimezoneCard } from '@/components/timezone-card';
import { CapabilitiesCard } from '@/components/capabilities-card';
import { NetworkCard, type NetworkSnapshot } from '@/components/network-card';
import { cn } from '@/lib/utils';
import type { DeviceCapabilities } from '@zkc/shared/capabilities';

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
  user_count: number | null;
  att_log_count: number | null;
  has_thermal: boolean;
  timezone_synced_at: string | null;
  enabled: boolean;
  clock: {
    timezone: string;
    serverNowMs: number;
    deviceLocalMs: number;
    deviceUnix: number;
    driftSec: number;
    driftMeasuredAt: string | null;
  };
  capabilities: DeviceCapabilities;
  modalities: Record<'fingerprint' | 'face' | 'palm' | 'card', boolean>;
  modelLabel: string;
  protocol: {
    setDateTime: boolean;
    executeShell: boolean;
    testVoiceRemote: boolean;
    setOptionsRoundTrip: boolean;
    setOptionsNetwork: boolean;
    bulkEnrollPush: boolean;
    queryNetwork: boolean;
  };
  settings?: {
    network?: NetworkSnapshot;
    clockDrift?: { sec: number; measuredAt: string; method?: string };
    deviceOptions?: Record<string, number | boolean | string>;
  } | null;
};

type CommandKind =
  | 'sync_time'
  | 'get_info'
  | 'get_options'
  | 'query_users'
  | 'reboot'
  | 'clear_log'
  | 'clear_data'
  | 'open_door';

interface PendingDestructive {
  kind: CommandKind;
  title: string;
  description: React.ReactNode;
  destructiveLabel: string;
}

export default function DeviceDetailPage({
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
    { tenantSlug: slug, deviceId: id, limit: 15 },
    { refetchInterval: 3000 },
  );

  const queue = trpc.devices.queueCommand.useMutation({
    onSuccess: () => {
      toast.success('Command queued — delivers on next heartbeat');
      void utils.devices.listCommands.invalidate();
      void utils.devices.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancel = trpc.devices.cancelCommand.useMutation({
    onSuccess: () => {
      toast.success('Command cancelled');
      void utils.devices.listCommands.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const setEnabled = trpc.devices.setEnabled.useMutation({
    onSuccess: (_data, vars) => {
      toast.success(vars.enabled ? 'Device enabled' : 'Device disabled');
      void utils.devices.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [pendingDestructive, setPendingDestructive] = useState<PendingDestructive | null>(null);

  function safeQueue(kind: Exclude<CommandKind, 'reboot' | 'clear_log' | 'clear_data' | 'open_door'>) {
    queue.mutate({ tenantSlug: slug, deviceId: id, kind });
  }

  function askDestructive(kind: 'reboot' | 'clear_log' | 'clear_data' | 'open_door') {
    const map: Record<typeof kind, PendingDestructive> = {
      reboot: {
        kind,
        title: 'Reboot device?',
        description: 'The device will go offline for ~30 seconds. Attendance still on the device buffer is preserved.',
        destructiveLabel: 'Reboot',
      },
      open_door: {
        kind,
        title: 'Unlock door?',
        description: 'Triggers the relay for 3 seconds. Operator password is required because this bypasses normal access control.',
        destructiveLabel: 'Open door',
      },
      clear_log: {
        kind,
        title: 'Clear attendance log on device?',
        description: 'Permanently deletes the device-side log. Data already pulled into ZK Connect is unaffected.',
        destructiveLabel: 'Clear log',
      },
      clear_data: {
        kind,
        title: 'Wipe all data on the device?',
        description: 'Permanently deletes users, biometrics, and logs from the device itself. This cannot be undone.',
        destructiveLabel: 'Wipe device',
      },
    };
    setPendingDestructive(map[kind]);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Devices', href: `/t/${slug}/devices` },
          { label: (device.data as DeviceRow | null | undefined)?.name ?? 'Device' },
        ]}
        title={(device.data as DeviceRow | null | undefined)?.name ?? 'Device'}
        description={(device.data as DeviceRow | null | undefined)?.serial_number ?? ''}
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href={`/t/${slug}/devices/${id}/settings`}>Settings</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/t/${slug}/devices`}>Back</Link>
            </Button>
          </div>
        }
      />
      <main className="flex-1 space-y-6 px-6 py-6">
        {!device.data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <DeviceShell
            tenantSlug={slug}
            device={device.data as DeviceRow}
            queuePending={queue.isPending}
            onSafe={safeQueue}
            onDestructive={askDestructive}
            commands={(commands.data as CommandRow[] | undefined) ?? []}
            onCancel={(commandId) => cancel.mutate({ tenantSlug: slug, commandId })}
            onSetEnabled={(enabled) => setEnabled.mutate({ tenantSlug: slug, deviceId: id, enabled })}
          />
        )}
      </main>

      <OperatorPasswordModal
        open={!!pendingDestructive}
        onOpenChange={(o) => !o && setPendingDestructive(null)}
        title={pendingDestructive?.title ?? ''}
        description={pendingDestructive?.description}
        destructiveLabel={pendingDestructive?.destructiveLabel ?? 'Confirm'}
        pending={queue.isPending}
        onConfirm={async ({ operatorPassword, reason }) => {
          if (!pendingDestructive) return;
          try {
            await queue.mutateAsync({
              tenantSlug: slug,
              deviceId: id,
              kind: pendingDestructive.kind,
              operatorPassword,
              reason,
            });
            setPendingDestructive(null);
          } catch {
            // toast already shown by onError; keep modal open
          }
        }}
      />
    </>
  );
}

interface CommandRow {
  id: string;
  command_id: number;
  command: string;
  command_type: string;
  status: string;
  return_code: number | null;
  response_data: string | null;
  issued_by_email: string | null;
  reason: string | null;
  sent_at: string | null;
  completed_at: string | null;
  expires_at: string;
  created_at: string;
}

function DeviceShell({
  tenantSlug,
  device,
  queuePending,
  onSafe,
  onDestructive,
  commands,
  onCancel,
  onSetEnabled,
}: {
  tenantSlug: string;
  device: DeviceRow;
  queuePending: boolean;
  onSafe: (kind: 'sync_time' | 'get_info' | 'get_options' | 'query_users') => void;
  onDestructive: (kind: 'reboot' | 'clear_log' | 'clear_data' | 'open_door') => void;
  commands: CommandRow[];
  onCancel: (commandId: string) => void;
  onSetEnabled: (enabled: boolean) => void;
}) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <DeviceClock
          className="lg:col-span-2"
          timezone={device.clock.timezone}
          initialDeviceLocalMs={device.clock.deviceLocalMs}
          initialServerNowMs={device.clock.serverNowMs}
          lastSyncedAt={device.timezone_synced_at}
        />
        <StatusCard device={device} onSetEnabled={onSetEnabled} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TimezoneCard
          tenantSlug={tenantSlug}
          deviceId={device.id}
          currentTimezone={device.timezone}
        />
        <NetworkCard
          tenantSlug={tenantSlug}
          deviceId={device.id}
          snapshot={device.settings?.network ?? null}
          online={device.status === 'online'}
        />
        <CapabilitiesCard
          tenantSlug={tenantSlug}
          deviceId={device.id}
          modelLabel={device.modelLabel}
          capabilities={device.capabilities}
          modalities={device.modalities}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Command center</CardTitle>
            <p className="text-sm text-muted-foreground">
              Commands queue and deliver on the device&apos;s next heartbeat (~10s). Destructive actions require the operator password.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <CommandButton onClick={() => onSafe('sync_time')} disabled={queuePending} icon={Clock}>
                Sync time
              </CommandButton>
              <CommandButton onClick={() => onSafe('get_info')} disabled={queuePending} icon={Info}>
                Get info
              </CommandButton>
              <CommandButton onClick={() => onSafe('query_users')} disabled={queuePending} icon={Users}>
                Query users
              </CommandButton>
              <CommandButton onClick={() => onSafe('get_options')} disabled={queuePending} icon={Globe}>
                Get options
              </CommandButton>
              <CommandButton onClick={() => onDestructive('open_door')} disabled={queuePending} icon={LockKeyhole} amber>
                Open door
              </CommandButton>
              <CommandButton onClick={() => onDestructive('reboot')} disabled={queuePending} icon={Power} amber>
                Reboot
              </CommandButton>
              <CommandButton onClick={() => onDestructive('clear_log')} disabled={queuePending} icon={Trash2} amber>
                Clear log
              </CommandButton>
              <CommandButton onClick={() => onDestructive('clear_data')} disabled={queuePending} icon={Trash2} danger>
                Wipe device data
              </CommandButton>
            </div>

            <div>
              <h4 className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
                Recent commands
              </h4>
              <div className="mt-2 overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                      <th className="px-3 py-2 font-medium">By</th>
                      <th className="px-3 py-2 font-medium">Reason</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {commands.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No commands yet
                        </td>
                      </tr>
                    ) : (
                      commands.map((c) => (
                        <tr key={c.id} className="border-t hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono text-xs">
                            {new Date(c.created_at).toLocaleTimeString()}
                          </td>
                          <td className="px-3 py-2 text-xs">{c.command_type}</td>
                          <td className="px-3 py-2">
                            <CommandStatusBadge status={c.status} returnCode={c.return_code} />
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {c.return_code !== null && `code ${c.return_code}`}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {c.issued_by_email ?? 'system'}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{c.reason ?? '—'}</td>
                          <td className="px-3 py-2 text-right">
                            {c.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onCancel(c.id)}
                              >
                                Cancel
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Device info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Serial" value={<code className="font-mono text-xs">{device.serial_number}</code>} />
              <Row label="Model" value={device.model ?? '—'} />
              <Row label="Firmware" value={device.firmware_version ?? '—'} />
              <Row label="Family" value={device.firmware_family} />
              <Row label="Status" value={device.status} />
              <Row label="IP" value={device.ip_address ?? '—'} />
              <Row label="Members" value={device.user_count ?? '—'} />
              <Row label="Att log count" value={device.att_log_count ?? '—'} />
              <Row label="Has thermal" value={device.has_thermal ? 'Yes' : 'No'} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatusCard({
  device,
  onSetEnabled,
}: {
  device: DeviceRow;
  onSetEnabled: (enabled: boolean) => void;
}) {
  const online = device.status === 'online';
  return (
    <Card className="flex flex-col justify-center">
      <CardContent className="flex flex-col items-start gap-3 p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Cpu className="h-3.5 w-3.5" /> Status
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              online ? 'bg-emerald-500' : 'bg-red-500',
            )}
          />
          <span className="font-semibold capitalize">{device.status}</span>
        </div>
        <p className="text-xs text-muted-foreground">{device.timezone}</p>
        <div className="pt-2 border-t w-full flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Device {device.enabled ? 'is active' : 'is paused'}</p>
            <p className="text-xs text-muted-foreground">
              {device.enabled
                ? 'Receiving punches & commands.'
                : 'Ignored by sync jobs.'}
            </p>
          </div>
          <Button
            size="sm"
            variant={device.enabled ? 'outline' : 'default'}
            onClick={() => onSetEnabled(!device.enabled)}
          >
            {device.enabled ? 'Pause' : 'Resume'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CommandButton({
  onClick,
  disabled,
  icon: Icon,
  children,
  amber,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ElementType;
  children: React.ReactNode;
  amber?: boolean;
  danger?: boolean;
}) {
  return (
    <Button
      variant={danger ? 'destructive' : amber ? 'outline' : 'outline'}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'justify-start',
        amber && !danger && 'border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400',
      )}
    >
      <Icon className="mr-2 h-4 w-4" />
      {children}
    </Button>
  );
}

function CommandStatusBadge({ status, returnCode }: { status: string; returnCode: number | null }) {
  const isOk = status === 'success' && returnCode === 0;
  const isFail = status === 'failed';
  const isPending = status === 'pending';
  const isSent = status === 'sent';
  const Icon = isOk ? CheckCircle2 : isFail ? XCircle : isSent ? ChevronRight : Loader2;

  const cls = isOk
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
    : isFail
    ? 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'
    : isPending
    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
    : isSent
    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'
    : 'bg-muted text-muted-foreground border-border';

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium', cls)}>
      <Icon className={cn('h-3 w-3', isPending && 'animate-spin')} />
      {status}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
