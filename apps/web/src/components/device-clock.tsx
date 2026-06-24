'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeviceClockProps {
  // Initial server snapshot
  initialDeviceLocalMs: number;
  initialServerNowMs: number;
  timezone: string;
  lastSyncedAt?: string | null; // ISO timestamp from device.timezone_synced_at
  compact?: boolean;
  className?: string;
}

/**
 * Live ticking display of "what time the device's screen would show right
 * now" for its IANA timezone. We anchor on a server-side snapshot and tick
 * locally, so the displayed time stays accurate even if the user's browser
 * clock drifts.
 */
export function DeviceClock({
  initialDeviceLocalMs,
  initialServerNowMs,
  timezone,
  lastSyncedAt,
  compact,
  className,
}: DeviceClockProps) {
  const [tick, setTick] = useState(0);
  const mountedAtRef = useRef<number | null>(null);
  if (mountedAtRef.current === null) {
    mountedAtRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
  }
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Elapsed real time since the component was first rendered, in ms.
  const nowPerf = typeof performance !== 'undefined' ? performance.now() : 0;
  const elapsed = nowPerf - (mountedAtRef.current ?? nowPerf);
  void tick; // re-render every second
  const deviceNow = new Date(initialDeviceLocalMs + elapsed);

  // Formatted as the device displays it. The Date object is just a carrier;
  // we deliberately use Intl with no timeZone option here because
  // initialDeviceLocalMs is already shifted into the device's wall clock.
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(deviceNow);
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(deviceNow);

  const driftLabel = formatSyncAge(lastSyncedAt);
  const stale = lastSyncedAt
    ? Date.now() - new Date(lastSyncedAt).getTime() > 12 * 3600 * 1000
    : false;

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-1 font-mono text-xs', className)}>
        <Clock className="h-3 w-3 text-muted-foreground" />
        {timeStr}
      </span>
    );
  }

  return (
    <div className={cn('rounded-lg border p-4', className)}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Device local time · {timezone}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
          {timeStr}
        </span>
        <span className="font-mono text-sm text-muted-foreground tabular-nums">{dateStr}</span>
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs">
        {stale ? (
          <AlertTriangle className="h-3 w-3 text-amber-500" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        )}
        <span className={cn(stale ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
          {driftLabel}
        </span>
      </div>
      {/* Hidden snapshot fields so SSR snapshot doesn't show NaN on first paint */}
      <span className="sr-only">
        server snapshot: {new Date(initialServerNowMs).toISOString()}
      </span>
    </div>
  );
}

function formatSyncAge(iso: string | null | undefined): string {
  if (!iso) return 'Time never synced from server';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Synced just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `Time synced ${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `Time synced ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Time synced ${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `Time synced ${days}d ago`;
}
