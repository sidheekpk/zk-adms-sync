'use client';

import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  RefreshCw,
  Loader2,
  Cpu,
  Network,
  Clock,
  Volume2,
  ScanFace,
  Lock,
  Radio,
  Info,
  Sun,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  tenantSlug: string;
  deviceId: string;
  online: boolean;
  info: Record<string, string | undefined> | null;
}

// Friendly labels + grouping for raw key=value pairs the device returns.
// If a key isn't in the map it falls back to its raw name (so we don't
// hide unknowns — operators see EVERYTHING the device exposes).
const FIELD_GROUPS: Array<{
  title: string;
  icon: React.ElementType;
  fields: Array<{ key: string; label: string; format?: (v: string) => string }>;
}> = [
  {
    title: 'Identity',
    icon: Cpu,
    fields: [
      { key: '~SerialNumber', label: 'Serial number' },
      { key: '~OS', label: 'OS' },
      { key: 'FirmVer', label: 'Firmware version' },
      { key: '~Platform', label: 'Platform' },
      { key: '~DeviceName', label: 'Device name (firmware)' },
      { key: 'DeviceID', label: 'Device ID' },
      { key: '~ZKFPVersion', label: 'ZKFP version' },
    ],
  },
  {
    title: 'Network',
    icon: Network,
    fields: [
      { key: 'IPAddress', label: 'IP address' },
      { key: 'NetMask', label: 'Subnet mask' },
      { key: 'GATEIPAddress', label: 'Gateway' },
      { key: 'DNS', label: 'DNS' },
      { key: 'MACAddress', label: 'MAC' },
      { key: 'DHCP', label: 'DHCP', format: (v) => (v === '1' ? 'on' : 'off') },
    ],
  },
  {
    title: 'Time & locale',
    icon: Clock,
    fields: [
      { key: 'Timezone', label: 'Timezone (seconds)' },
      { key: 'TZAdj', label: 'TZ adjustment (hours)' },
      { key: 'NetworkTimeSync', label: 'NTP', format: (v) => (v === '1' ? 'on' : 'off') },
      { key: 'DateFormat', label: 'Date format' },
      { key: 'TimeFormat', label: '24h?', format: (v) => (v === '1' ? '24-hour' : '12-hour') },
      { key: 'DSTSwitch', label: 'DST', format: (v) => (v === '1' ? 'on' : 'off') },
    ],
  },
  {
    title: 'Display & audio',
    icon: Volume2,
    fields: [
      { key: 'Volume', label: 'Volume', format: (v) => `${v}%` },
      { key: 'Brightness', label: 'Brightness', format: (v) => `${v}%` },
      { key: 'Language', label: 'Language ID' },
      { key: 'IdleDuration', label: 'Idle (sec)' },
      { key: 'LCDOnDuration', label: 'LCD on (sec)' },
      { key: 'VoicePrompt', label: 'Voice prompts', format: (v) => (v === '1' ? 'on' : 'off') },
    ],
  },
  {
    title: 'Access control',
    icon: Lock,
    fields: [
      { key: 'LockOpenDuration', label: 'Lock open (sec)' },
      { key: 'DoorSensorDelay', label: 'Door sensor delay (sec)' },
      { key: 'LockType', label: 'Lock type', format: (v) => (v === '0' ? 'NO' : 'NC') },
      { key: 'AntiPassbackOn', label: 'Anti-passback', format: antiPb },
      { key: 'DuressKey', label: 'Duress key', format: (v) => (v === '0' ? 'off' : v) },
      { key: 'TamperAlarmOn', label: 'Tamper alarm', format: (v) => (v === '1' ? 'on' : 'off') },
    ],
  },
  {
    title: 'Verification & thresholds',
    icon: ScanFace,
    fields: [
      { key: 'VerifyMode', label: 'Verify mode' },
      { key: 'LivenessDetect', label: 'Liveness', format: (v) => (v === '1' ? 'on' : 'off') },
      { key: 'FPThreshold', label: 'FP 1:N threshold' },
      { key: 'FP1to1Threshold', label: 'FP 1:1 threshold' },
      { key: 'FaceThreshold', label: 'Face 1:N threshold' },
      { key: 'Face1to1Threshold', label: 'Face 1:1 threshold' },
      { key: 'PalmThreshold', label: 'Palm threshold' },
      { key: 'PhotoOnVerify', label: 'Photo on verify', format: (v) => (v === '1' ? 'on' : 'off') },
      { key: 'WorkCode', label: 'Work code prompt', format: (v) => (v === '1' ? 'on' : 'off') },
    ],
  },
  {
    title: 'ADMS push behaviour',
    icon: Radio,
    fields: [
      { key: 'Delay', label: 'Heartbeat (sec)' },
      { key: 'Realtime', label: 'Realtime', format: (v) => (v === '1' ? 'on' : 'off') },
      { key: 'TransFlag', label: 'Trans flag' },
      { key: 'TransTimes', label: 'Bulk windows' },
      { key: 'TransInterval', label: 'Bulk interval (min)' },
    ],
  },
];

const KNOWN_KEYS = new Set(FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.key)).concat(['_capturedAt']));

function antiPb(v: string): string {
  return { '0': 'off', '1': 'in', '2': 'out', '3': 'in+out' }[v] ?? v;
}

function timeAgo(iso?: string): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function DeviceInfoCard({ tenantSlug, deviceId, online, info }: Props) {
  const utils = trpc.useUtils();
  const refresh = trpc.devices.queryDeviceInfo.useMutation({
    onSuccess: (r) => {
      toast.success(`Queued ${r.queued} info queries — device responds within ~30s`);
      void utils.devices.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const capturedAt = info?._capturedAt;
  const unknownKeys = useMemo(() => {
    if (!info) return [] as Array<[string, string]>;
    return Object.entries(info).filter(([k]) => !KNOWN_KEYS.has(k)) as Array<[string, string]>;
  }, [info]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md border bg-muted/30 p-2">
              <Info className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Device info — read-only</p>
              <p className="text-xs text-muted-foreground">
                Live snapshot of what the device firmware reports. Changes
                must be made directly on the device menu — this dashboard is
                view-only.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last refreshed <b>{timeAgo(capturedAt)}</b>
                {capturedAt && <> · {new Date(capturedAt).toLocaleTimeString()}</>}
              </p>
            </div>
          </div>
          <Button
            onClick={() => refresh.mutate({ tenantSlug, deviceId })}
            disabled={!online || refresh.isPending}
            title={online ? 'Re-query the device' : 'Device must be online'}
          >
            {refresh.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh from device
          </Button>
        </CardContent>
      </Card>

      {!info && (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Sun className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No snapshot yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Click <b>Refresh from device</b> above to query every option the firmware exposes.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Grouped grid */}
      {info && FIELD_GROUPS.map((group) => {
        const rows = group.fields
          .map((f) => ({ ...f, value: info[f.key] }))
          .filter((r) => r.value != null && r.value !== '');
        if (rows.length === 0) return null;
        const Icon = group.icon;
        return (
          <Card key={group.title}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4 text-muted-foreground" /> {group.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((r) => (
                  <div key={r.key} className="space-y-0.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.label}
                    </p>
                    <p className={cn('text-sm font-medium tabular-nums')}>
                      {r.format ? r.format(r.value!) : r.value}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">{r.key}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {info && unknownKeys.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Other fields the device exposed</CardTitle>
            <p className="text-xs text-muted-foreground">
              Keys we don&apos;t have a friendly label for — raw firmware values.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unknownKeys.map(([k, v]) => (
                <div key={k} className="rounded-md border p-2 text-xs">
                  <p className="font-mono text-[10px] text-muted-foreground">{k}</p>
                  <p className="mt-0.5 font-mono break-all">{v}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
