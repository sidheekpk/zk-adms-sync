'use client';

import { toast } from 'sonner';
import { Loader2, Network, RefreshCw, CircleHelp } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface NetworkSnapshot {
  ipAddress?: string;
  netmask?: string;
  gateway?: string;
  dns?: string;
  dhcp?: boolean;
  capturedAt?: string;
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

export function NetworkCard({
  tenantSlug,
  deviceId,
  snapshot,
  online,
}: {
  tenantSlug: string;
  deviceId: string;
  snapshot?: NetworkSnapshot | null;
  online: boolean;
}) {
  const utils = trpc.useUtils();
  const queue = trpc.devices.queueCommand.useMutation({
    onSuccess: () => {
      toast.success('Network query queued — refresh in ~10s');
      void utils.devices.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Network className="h-4 w-4 text-muted-foreground" /> Network
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              queue.mutate({ tenantSlug, deviceId, kind: 'query_network' })
            }
            disabled={!online || queue.isPending}
            title={online ? 'Re-query the device' : 'Device must be online'}
          >
            {queue.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!snapshot ? (
          <div className="text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <CircleHelp className="h-3.5 w-3.5" />
              No snapshot yet. Click refresh while the device is online.
            </p>
          </div>
        ) : (
          <>
            <Row label="IP address" value={snapshot.ipAddress} mono />
            <Row label="Netmask" value={snapshot.netmask} mono />
            <Row label="Gateway" value={snapshot.gateway} mono />
            <Row label="DNS" value={snapshot.dns} mono />
            <Row
              label="DHCP"
              value={
                snapshot.dhcp == null ? undefined : snapshot.dhcp ? 'enabled' : 'static'
              }
              accent={snapshot.dhcp ? 'emerald' : 'amber'}
            />
            <p className="pt-1 text-xs text-muted-foreground">
              Last queried {timeAgo(snapshot.capturedAt)}.
            </p>
          </>
        )}
        <p className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-muted-foreground">
          Read-only. Editing IP / DHCP from this UI is intentionally
          disabled until the LAN-side agent ships — a wrong push from
          ADMS bricks the device&apos;s LAN connection.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string | undefined;
  mono?: boolean;
  accent?: 'emerald' | 'amber';
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          mono && 'font-mono text-xs',
          accent === 'emerald' && 'text-emerald-600',
          accent === 'amber' && 'text-amber-600',
          !value && 'text-muted-foreground italic',
        )}
      >
        {value ?? 'unknown'}
      </span>
    </div>
  );
}
