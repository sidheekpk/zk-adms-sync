'use client';

import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  WifiOff,
  RefreshCw,
  Copy,
  CheckCircle2,
  Server,
  Globe,
  Power,
  AlertTriangle,
  Network,
  Cable,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  tenantSlug: string;
  deviceId: string;
  deviceName: string;
  /** Last time we received a heartbeat from the device (ISO). */
  lastOnline: string | null;
  /** Firmware family — drives menu-path labels (Speedface vs BioTime vs iFace). */
  firmwareFamily: string;
  /** Stale IP the device may still have configured (from settings snapshot). */
  lastKnownIp: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.floor(h / 24)} day${Math.floor(h / 24) === 1 ? '' : 's'} ago`;
}

const MENU_PATHS: Record<string, { cloudServer: string; ethernet: string; dateTime: string }> = {
  speedface: {
    cloudServer: 'Menu → COMM → Cloud Server Setting',
    ethernet: 'Menu → COMM → Ethernet',
    dateTime: 'Menu → System → Date Time',
  },
  biotime: {
    cloudServer: 'Menu → COMM → Cloud Server Setting',
    ethernet: 'Menu → COMM → Network',
    dateTime: 'Menu → System → Date Time',
  },
  iface: {
    cloudServer: 'Menu → COMM → Cloud',
    ethernet: 'Menu → COMM → Ethernet',
    dateTime: 'Menu → System → Date Time',
  },
  green_label: {
    cloudServer: 'Menu → Comm → ADMS',
    ethernet: 'Menu → Comm → Ethernet',
    dateTime: 'Menu → System → Date',
  },
  unknown: {
    cloudServer: 'Menu → COMM → Cloud Server Setting (or similar)',
    ethernet: 'Menu → COMM → Ethernet / Network',
    dateTime: 'Menu → System → Date Time',
  },
};

export function OfflineTroubleshootingCard({
  tenantSlug,
  deviceId,
  deviceName,
  lastOnline,
  firmwareFamily,
  lastKnownIp,
}: Props) {
  const utils = trpc.useUtils();
  const refresh = trpc.devices.refreshStatus.useMutation({
    onSuccess: (r) => {
      if (r.currentStatus === 'online') {
        toast.success(`${deviceName} is back online`);
      } else {
        toast.warning(r.hint);
      }
      void utils.devices.get.invalidate();
      void utils.devices.notifications.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const paths = MENU_PATHS[firmwareFamily] ?? MENU_PATHS.unknown!;

  // The exact values the operator must verify on the device's screen.
  const admsHost = process.env.NEXT_PUBLIC_ADMS_HOST ?? '';
  const admsPort = process.env.NEXT_PUBLIC_ADMS_PORT ?? '8080';
  const admsConfigured = admsHost.length > 0;
  const usingHttps = admsPort === '443';

  const ipDrift = useMemo(() => {
    if (!lastKnownIp || !admsHost) return null;
    // Crude check: warn when device's last known IP isn't on the same /24
    // as the server it should be talking to (server hostname won't appear
    // here in dev; only meaningful when the server is also an IP).
    const ipPattern = /^\d+\.\d+\.\d+\.\d+$/;
    if (!ipPattern.test(admsHost) || !ipPattern.test(lastKnownIp)) return null;
    const a = admsHost.split('.').slice(0, 3).join('.');
    const b = lastKnownIp.split('.').slice(0, 3).join('.');
    return a !== b ? { server: admsHost, device: lastKnownIp } : null;
  }, [admsHost, lastKnownIp]);

  function copy(text: string, what: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${what}`));
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <WifiOff className="h-4 w-4 text-amber-600" />
          {deviceName} is offline — reconnection checklist
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Last heartbeat <b>{timeAgo(lastOnline)}</b>
          {lastOnline && (
            <span className="ml-1 text-xs">
              ({new Date(lastOnline).toLocaleString()})
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick refresh — useful if a heartbeat just arrived */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => refresh.mutate({ tenantSlug, deviceId })}
            disabled={refresh.isPending}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', refresh.isPending && 'animate-spin')} />
            Re-check status
          </Button>
          <p className="text-xs text-muted-foreground">
            If the device just sent a heartbeat we may not have flipped its status yet.
          </p>
        </div>

        {/* IP drift warning — most common cause in dev environments */}
        {ipDrift && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              IP mismatch detected
            </p>
            <p className="mt-1 text-xs">
              The device&apos;s last reported IP was <code className="font-mono">{ipDrift.device}</code>,
              but this server is now at <code className="font-mono">{ipDrift.server}</code>.
              The device is probably still trying to reach the old IP.
              <b> Update Server Address on the device</b> (see Step 1).
            </p>
          </div>
        )}

        {/* Step 1 — Cloud Server settings */}
        <Step n={1} title="Verify Cloud Server settings on the device">
          <p className="text-xs text-muted-foreground">
            On the device: <code className="font-mono">{paths.cloudServer}</code>
          </p>
          <div className="mt-2 space-y-1.5">
            <ConfigRow
              icon={Server}
              label="Server Address"
              value={admsConfigured ? admsHost : 'NOT CONFIGURED — set NEXT_PUBLIC_ADMS_HOST'}
              error={!admsConfigured}
              onCopy={admsConfigured ? () => copy(admsHost, 'Server Address') : undefined}
            />
            <ConfigRow
              icon={Server}
              label="Server Port"
              value={admsPort}
              onCopy={() => copy(admsPort, 'Server Port')}
            />
            <ConfigRow icon={Globe} label="Server Mode" value="ADMS" onCopy={() => copy('ADMS', 'Server Mode')} />
            <ConfigRow icon={Globe} label="Enable Domain Name" value="OFF" />
            <ConfigRow icon={Globe} label="HTTPS" value={usingHttps ? 'ON' : 'OFF'} />
            <ConfigRow icon={Globe} label="Enable Proxy Server" value="OFF" />
          </div>
          <p className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-900 dark:text-amber-200">
            ⚠️ Type each value <b>exactly</b>. A digit typo (e.g. <code className="font-mono">192.16</code> vs
            <code className="font-mono"> 192.168</code>) is the #1 cause of devices not coming back.
          </p>
        </Step>

        {/* Step 2 — Ethernet / Network */}
        <Step n={2} title="Verify network / Ethernet">
          <p className="text-xs text-muted-foreground">
            On the device: <code className="font-mono">{paths.ethernet}</code>
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Ethernet cable plugged in, link light on the device&apos;s port.</li>
            <li>DHCP enabled (or static IP set correctly for the LAN).</li>
            <li>The IP shown isn&apos;t <code className="font-mono">0.0.0.0</code>.</li>
            <li>Try toggling DHCP off and back on to force a lease refresh.</li>
          </ul>
        </Step>

        {/* Step 3 — Cloud server icon */}
        <Step n={3} title="Check the cloud sync status icon">
          <p className="text-xs text-muted-foreground">
            On the device home screen, look at the status bar:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>A <b>green</b> database icon = device thinks it&apos;s syncing.</li>
            <li>A <b>red</b> or flashing database icon = device can&apos;t reach us. Re-check Step 1 (Server Address typo).</li>
            <li>No icon = ADMS isn&apos;t enabled. Re-do Step 1.</li>
          </ul>
        </Step>

        {/* Step 4 — Power cycle */}
        <Step n={4} title="Power-cycle the device (last resort)">
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Save any pending changes in the menu.</li>
            <li>Unplug power for 30 seconds.</li>
            <li>Plug back in. After boot, the device tries Cloud Server within ~10 seconds.</li>
            <li>Watch this card — click <b>Re-check status</b> once the device boots.</li>
          </ul>
        </Step>

        {/* Quick reference at the bottom */}
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
          <p className="flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Most-common fix for &ldquo;suddenly went offline&rdquo;
          </p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
            <li>The server&apos;s IP changed (developer machine, WiFi reconnect, etc.).</li>
            <li>The device cable came loose / switch port died.</li>
            <li>The device&apos;s clock drifted so badly it can&apos;t TLS-handshake (only on HTTPS deploys).</li>
            <li>Someone factory-reset the device and the Cloud Server settings are blank.</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ConfigRow({
  icon: Icon,
  label,
  value,
  onCopy,
  error,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onCopy?: () => void;
  error?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border px-3 py-2',
        error && 'border-red-500/30 bg-red-500/5',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', error ? 'text-red-600' : 'text-muted-foreground')} />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn('truncate font-mono text-sm', error && 'text-red-700 dark:text-red-300')}>{value}</p>
        </div>
      </div>
      {onCopy && (
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// Re-export the unused icons just to silence "imported but never used" lint
// if these stop being referenced after future trimming.
void Network;
void Cable;
void Power;
