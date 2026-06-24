'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Calendar, Send, Clock3, RefreshCw, AlertCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface Props {
  tenantSlug: string;
  deviceId: string;
  /** Server's best estimate of what the device wall clock shows right now,
   * in ms epoch. Includes drift measured from the most recent punch. */
  deviceLocalMs: number;
  /** When drift was last measured (= last punch time), ISO string. */
  driftMeasuredAt: string | null;
  /** If false, the firmware silently swallows SET DateTime — render disabled informational mode. */
  remoteSetSupported: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Split a ms-epoch value into its calendar parts, treating the timestamp
 * as already shifted into the target wall clock (i.e. UTC parts on a
 * value that's `realUTC + offset`).
 */
function partsFromShiftedMs(ms: number) {
  const d = new Date(ms);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

/**
 * SNAPSHOT (not live-ticked): the device clock at the moment of the last
 * punch, as the server computed it. We deliberately do NOT advance it
 * forward client-side — that gave a false sense of "this is what the
 * device is showing right now" even when the device was actually drifted.
 * The user clicks "Sync new time" after they punch on the device to get
 * a fresh snapshot.
 */
function useDeviceClockSnapshot(deviceLocalMs: number) {
  return useMemo(() => partsFromShiftedMs(deviceLocalMs), [deviceLocalMs]);
}

export function ManualTimeCard({
  tenantSlug,
  deviceId,
  deviceLocalMs,
  driftMeasuredAt,
  remoteSetSupported,
}: Props) {
  const utils = trpc.useUtils();
  const liveDeviceTime = useDeviceClockSnapshot(deviceLocalMs);
  const measuredAgo = useMemo(() => formatAgo(driftMeasuredAt), [driftMeasuredAt]);

  // -------- Disabled / informational mode (V5L et al) ----------------
  if (!remoteSetSupported) {
    const isStale = !driftMeasuredAt
      || (Date.now() - new Date(driftMeasuredAt).getTime()) > 5 * 60 * 1000;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock3 className="h-4 w-4" />
            Device clock — last known
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            This is the clock value the device reported on its most recent
            punch. Not live — if you changed the device clock, it stays the
            same here until the next punch.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className={cn(
              'rounded-md p-4 text-center',
              isStale ? 'bg-amber-500/5 border border-amber-500/30' : 'bg-muted/30',
            )}
          >
            <p className="font-mono text-2xl tabular-nums">
              {driftMeasuredAt ? (
                <>
                  {liveDeviceTime.date} {pad(liveDeviceTime.hour)}:{pad(liveDeviceTime.minute)}:{pad(liveDeviceTime.second)}
                </>
              ) : (
                <span className="text-muted-foreground">no punch recorded yet</span>
              )}
            </p>
            <p className="mt-1 text-[11px]">
              {driftMeasuredAt ? (
                <>
                  snapshot from a punch <b>{measuredAgo}</b>
                  {isStale && <span className="ml-2 text-amber-700 dark:text-amber-400">(stale)</span>}
                </>
              ) : (
                <span className="text-muted-foreground">make a punch on the device to populate this</span>
              )}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              void utils.devices.get.invalidate();
              toast.success('Refreshed — value updates once the device sends a punch');
            }}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Sync new time
          </Button>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
              How to update the clock on this device
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>On the device: <b>Menu → System → Date Time → Manual Date and Time</b>.</li>
              <li>Enter the new time, save.</li>
              <li><b>Punch once</b> on the device (face / fingerprint / PIN). This is what tells us the new clock value.</li>
              <li>Click <b>Sync new time</b> above. The snapshot updates to the value you just set.</li>
            </ol>
            <p className="mt-2 text-muted-foreground">
              SpeedFace V5L firmware doesn&apos;t respond to clock queries from
              ADMS, so a punch is the only way for us to learn the time.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // -------- Active mode (firmware that accepts remote DateTime) ------
  return <ActiveTimeCard
    tenantSlug={tenantSlug}
    deviceId={deviceId}
    liveDeviceTime={liveDeviceTime}
  />;
}

function ActiveTimeCard({
  tenantSlug,
  deviceId,
  liveDeviceTime,
}: {
  tenantSlug: string;
  deviceId: string;
  liveDeviceTime: { date: string; hour: number; minute: number; second: number };
}) {
  const utils = trpc.useUtils();
  const [date, setDate] = useState(liveDeviceTime.date);
  const [hour, setHour] = useState(liveDeviceTime.hour);
  const [minute, setMinute] = useState(liveDeviceTime.minute);
  const [second, setSecond] = useState(liveDeviceTime.second);

  const push = trpc.devices.setManualTime.useMutation({
    onSuccess: (r) => {
      toast.success(`Pushed ${r.dateTime} to device`);
      void utils.devices.get.invalidate();
      void utils.devices.listCommands.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function snapToDevice() {
    setDate(liveDeviceTime.date);
    setHour(liveDeviceTime.hour);
    setMinute(liveDeviceTime.minute);
    setSecond(liveDeviceTime.second);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock3 className="h-4 w-4" />
          Set device time
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Type the exact value you want the device clock to show, then push.
          No timezone math on our side.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live device clock helper */}
        <button
          type="button"
          onClick={snapToDevice}
          className="w-full rounded-md border border-dashed bg-muted/30 p-3 text-left transition-colors hover:bg-muted/60"
        >
          <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Tap to load device&apos;s current time
          </p>
          <p className="mt-1 font-mono text-lg tabular-nums">
            {liveDeviceTime.date} {pad(liveDeviceTime.hour)}:{pad(liveDeviceTime.minute)}:{pad(liveDeviceTime.second)}
          </p>
        </button>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="date" className="text-xs">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hh" className="text-xs">HH (00-23)</Label>
            <Input
              id="hh"
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value || 0))))}
              className={cn('h-9 font-mono tabular-nums text-center')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mm" className="text-xs">MM</Label>
            <Input
              id="mm"
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(e) => setMinute(Math.max(0, Math.min(59, Number(e.target.value || 0))))}
              className="h-9 font-mono tabular-nums text-center"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ss" className="text-xs">SS</Label>
            <Input
              id="ss"
              type="number"
              min={0}
              max={59}
              value={second}
              onChange={(e) => setSecond(Math.max(0, Math.min(59, Number(e.target.value || 0))))}
              className="h-9 font-mono tabular-nums text-center"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Will push</p>
            <p className="mt-1 font-mono text-base">
              {date} {pad(hour)}:{pad(minute)}:{pad(second)}
            </p>
          </div>
          <Button
            onClick={() => push.mutate({ tenantSlug, deviceId, date, hour, minute, second })}
            disabled={push.isPending}
          >
            {push.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-4 w-4" />Save &amp; push</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatAgo(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
