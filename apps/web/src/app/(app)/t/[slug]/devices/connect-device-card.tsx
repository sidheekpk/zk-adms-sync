'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Copy,
  RefreshCw,
  X,
  Clock,
  Server,
  Globe,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DeviceListRow {
  id: string;
  serial_number: string;
  name: string;
  status: string;
  created_at: string;
}

export function ConnectDeviceCard({
  tenantSlug,
  onClose,
}: {
  tenantSlug: string;
  onClose: () => void;
}) {
  const issue = trpc.devices.issueEnrollmentToken.useMutation();
  const [deviceName, setDeviceName] = useState('Main Entrance');
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  // Snapshot the device list at the moment the card opens — anything new
  // that arrives after this is the pairing target.
  const [openedAt] = useState(() => new Date());
  const devices = trpc.devices.list.useQuery(
    { tenantSlug },
    { refetchInterval: 3_000 },
  );
  const newlyArrived = useMemo(() => {
    const rows = (devices.data ?? []) as DeviceListRow[];
    return rows.filter((d) => new Date(d.created_at) > openedAt);
  }, [devices.data, openedAt]);

  const admsHost = process.env.NEXT_PUBLIC_ADMS_HOST ?? '';
  const admsPort = process.env.NEXT_PUBLIC_ADMS_PORT ?? '8080';
  const admsConfigured = admsHost.length > 0;

  async function generateToken() {
    const res = await issue.mutateAsync({
      tenantSlug,
      intendedDeviceName: deviceName,
      ttlMinutes: 60,
    });
    setToken(res.token);
    setExpiresAt(new Date(res.expiresAt));
    toast.success('Enrollment token active — first new device handshake will auto-pair');
  }

  useEffect(() => {
    void generateToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copy(text: string, what: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${what}`));
  }

  const remainingMinutes = expiresAt
    ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60_000))
    : null;

  return (
    <Card className="border-primary/30 shadow-lg shadow-primary/5">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Connect a new device</CardTitle>
          <p className="text-sm text-muted-foreground">
            Issue a token (auto-done below). Configure the device&apos;s Cloud
            Server Setting with the values shown. First new device that
            handshakes within the 60-minute window auto-pairs to this tenant.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-5">
        {/* Left — config values + arrival panel */}
        <div className="space-y-4 lg:col-span-3">
          {!admsConfigured && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
              <p className="font-medium text-red-700 dark:text-red-400">ADMS host not configured</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Set <code className="font-mono">NEXT_PUBLIC_ADMS_HOST</code> in <code className="font-mono">.env</code> to the public hostname (production) or your Mac&apos;s LAN IP (dev) and restart the web app.
              </p>
            </div>
          )}

          {/* Arrival panel — visible while we wait */}
          {newlyArrived.length > 0 ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Device paired successfully
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {newlyArrived.map((d) => (
                  <li key={d.id} className="font-mono">
                    {d.serial_number} → {d.name} ({d.status})
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                You can close this dialog and open the device to configure it further.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 animate-spin" /> Waiting for device handshake
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                The device will appear here within ~10s of its first heartbeat.
                Make sure DHCP is on and the Cloud Server values below match exactly.
              </p>
            </div>
          )}

          {/* The values to type on the device */}
          <div className="space-y-3 border-t pt-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              On the device — Cloud Server Setting
            </Label>
            <ConfigRow
              icon={Server}
              label="Server Address"
              value={admsHost || 'set NEXT_PUBLIC_ADMS_HOST'}
              onCopy={admsConfigured ? copy : undefined}
            />
            <ConfigRow icon={Server} label="Server Port" value={admsPort} onCopy={copy} />
            <ConfigRow icon={Globe} label="Server Mode" value="ADMS" onCopy={copy} />
            <ConfigRow icon={Globe} label="Enable Domain Name" value="OFF" />
            <ConfigRow icon={Globe} label="HTTPS" value={admsPort === '443' ? 'ON' : 'OFF'} />
            <ConfigRow icon={Globe} label="Enable Proxy Server" value="OFF" />
          </div>

          {/* Token panel — informational only, no manual entry needed */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Pairing token (no device-side entry)
              </Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={generateToken}
                disabled={issue.isPending}
              >
                {issue.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Re-issue
                  </>
                )}
              </Button>
            </div>
            {token ? (
              <div className="flex items-center gap-2 rounded-md bg-muted p-2">
                <code className="flex-1 truncate font-mono text-xs">{token}</code>
                <Button size="icon" variant="ghost" onClick={() => copy(token, 'token')}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Generating…</p>
            )}
            {expiresAt && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Expires in {remainingMinutes}m
                ({expiresAt.toLocaleTimeString()})
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              The token is held server-side. You do NOT type it on the device — any new device
              handshaking with these server settings while the token is active will auto-pair to
              this tenant.
            </p>
          </div>

          {/* Device name */}
          <div className="space-y-2 border-t pt-3">
            <Label htmlFor="deviceName" className="text-xs">
              Device name (saved for your records when it pairs)
            </Label>
            <Input
              id="deviceName"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Main Entrance"
            />
          </div>
        </div>

        {/* Right — step-by-step + troubleshooting */}
        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Step by step
            </p>
            <ol className="mt-3 space-y-2 text-sm">
              <li>
                <Bullet n={1} /> On the device: <b>Menu → COMM → Ethernet</b>.
                Confirm DHCP is on and the device is on the network (status icon green).
              </li>
              <li>
                <Bullet n={2} /> <b>Menu → COMM → Cloud Server Setting</b>.
                Enter every value from the panel on the left, exactly as shown.
              </li>
              <li>
                <Bullet n={3} /> Save. The device may reboot once. The status icon should
                stay green afterwards.
              </li>
              <li>
                <Bullet n={4} /> Watch the green panel above — the device appears within ~10s.
              </li>
              <li>
                <Bullet n={5} /> Once paired, set the on-device timezone:{' '}
                <b>Menu → System → Date Time → Timezone</b>. (Required — ADMS cannot set
                this remotely on most firmware.)
              </li>
            </ol>
          </div>

          <div className="rounded-lg border bg-amber-500/5 p-4 text-xs">
            <p className="flex items-center gap-1 font-medium text-amber-900 dark:text-amber-200">
              <WifiOff className="h-3.5 w-3.5" /> Device not showing up?
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-800 dark:text-amber-300">
              <li>Re-check Server Address — typos (e.g. <code className="font-mono">192.16</code> vs <code className="font-mono">192.168</code>) are the #1 cause.</li>
              <li>Ping the device IP from your machine — confirm it&apos;s actually on the LAN.</li>
              <li>Verify the device&apos;s Cloud Server status icon isn&apos;t flashing red (a red database icon means cloud-sync failure).</li>
              <li>Power-cycle the device after saving Cloud Server settings.</li>
              <li>Check the token hasn&apos;t expired (re-issue if needed).</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Bullet({ n }: { n: number }) {
  return (
    <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
      {n}
    </span>
  );
}

function ConfigRow({
  icon: Icon,
  label,
  value,
  onCopy,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onCopy?: (text: string, what: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-sm">{value}</p>
        </div>
      </div>
      {onCopy && (
        <Button size="icon" variant="ghost" onClick={() => onCopy(value, label)}>
          <Copy className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
