'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  Clock,
  Cpu,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Persistent top notification bar visible inside any tenant scope. Shows
 * offline devices, clock-drift warnings, and pending command counts so an
 * operator always knows what's wrong before they take an action.
 */
export function NotificationBar() {
  const pathname = usePathname();
  const tenantMatch = pathname.match(/^\/t\/([^/]+)/);
  const tenantSlug = tenantMatch?.[1];
  const [expanded, setExpanded] = useState(false);

  const query = trpc.devices.notifications.useQuery(
    { tenantSlug: tenantSlug ?? '' },
    { enabled: !!tenantSlug, refetchInterval: 15_000 },
  );
  const utils = trpc.useUtils();
  const refreshConn = trpc.devices.refreshStatus.useMutation({
    onSuccess: (r) => {
      if (r.currentStatus === 'online') toast.success(r.hint);
      else toast.warning(r.hint);
      void utils.devices.notifications.invalidate();
      void utils.devices.get.invalidate();
      void utils.devices.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!tenantSlug) return null;
  if (!query.data) return null;

  const { offlineDevices, driftingDevices, pendingCommands } = query.data;
  const total = offlineDevices.length + driftingDevices.length;
  if (total === 0 && pendingCommands === 0) return null;

  const severity = offlineDevices.length > 0 || driftingDevices.length > 0 ? 'warning' : 'info';

  return (
    <div
      className={cn(
        'border-b backdrop-blur supports-[backdrop-filter]:bg-background/80 transition-colors',
        severity === 'warning'
          ? 'border-amber-500/30 bg-amber-500/10'
          : 'border-blue-500/30 bg-blue-500/5',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 text-sm"
        >
          {severity === 'warning' ? (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          ) : (
            <Bell className="h-4 w-4 text-blue-600" />
          )}
          <strong className="font-medium">
            {total > 0 ? `${total} issue${total === 1 ? '' : 's'} need attention` : `${pendingCommands} pending commands`}
          </strong>
          <span className="text-xs text-muted-foreground">
            {offlineDevices.length > 0 && `${offlineDevices.length} offline`}
            {offlineDevices.length > 0 && driftingDevices.length > 0 && ' · '}
            {driftingDevices.length > 0 && `${driftingDevices.length} clock-drift`}
            {pendingCommands > 0 && total > 0 && ' · '}
            {pendingCommands > 0 && `${pendingCommands} pending`}
          </span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {query.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="border-t bg-background/60 px-4 py-3 text-sm">
          {offlineDevices.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Cpu className="h-3 w-3" /> Offline devices
              </div>
              <ul className="space-y-1">
                {offlineDevices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link
                      href={`/t/${tenantSlug}/devices/${d.id}`}
                      className="font-medium hover:underline"
                    >
                      {d.name || d.serial_number}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        last seen{' '}
                        {d.last_online ? new Date(d.last_online).toLocaleString() : 'never'}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() =>
                          refreshConn.mutate({ tenantSlug: tenantSlug!, deviceId: d.id })
                        }
                        disabled={refreshConn.isPending}
                      >
                        <RefreshCw
                          className={cn('mr-1 h-3 w-3', refreshConn.isPending && 'animate-spin')}
                        />
                        Re-check
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {driftingDevices.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3 w-3" /> Clock drift {'>'}60s
              </div>
              <ul className="space-y-1">
                {driftingDevices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link
                      href={`/t/${tenantSlug}/devices/${d.id}/settings`}
                      className="font-medium hover:underline"
                    >
                      {d.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {Math.abs(d.drift_sec) > 3600
                        ? `${Math.round(d.drift_sec / 3600)}h off`
                        : `${Math.round(d.drift_sec / 60)}m off`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pendingCommands > 0 && (
            <p className="text-xs text-muted-foreground">
              <strong>{pendingCommands}</strong> command(s) waiting in the queue for the next
              heartbeat.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
