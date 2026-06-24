'use client';

import { AlertTriangle, CheckCircle2, Clock, Wrench, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface ClockDrift {
  sec: number;
  measuredAt: string;
  method?: string;
}

interface Props {
  timezone: string;
  drift?: ClockDrift | null;
}

function formatDuration(seconds: number): string {
  const s = Math.abs(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m}m${sec ? ` ${sec}s` : ''}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h${mm ? ` ${mm}m` : ''}`;
}

function formatMeasuredAgo(measuredAt: string): string {
  const ms = Date.now() - new Date(measuredAt).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function TimeDriftCard({ timezone, drift }: Props) {
  if (!drift) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Clock drift unknown — waiting for the next punch to measure.</span>
          </div>
          <p className="mt-2 text-xs">
            We compute drift on every punch by comparing the device&apos;s reported wall-clock
            against real UTC + {timezone} offset.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sec = drift.sec;
  const accurate = Math.abs(sec) <= 30;
  const slow = sec < 0;

  return (
    <Card
      className={cn(
        accurate
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-red-500/40 bg-red-500/5',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {accurate ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-600" />
          )}
          <div className="flex-1">
            <p className="font-semibold">
              {accurate ? (
                <>Device clock is accurate</>
              ) : (
                <>
                  Device clock is{' '}
                  <span className="text-red-700 dark:text-red-400">
                    {formatDuration(sec)} {slow ? 'behind' : 'ahead of'}
                  </span>{' '}
                  real time
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last measured {formatMeasuredAgo(drift.measuredAt)} (from a real punch). Timezone: {timezone}.
            </p>
          </div>
        </div>

        {!accurate && (
          <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Wrench className="h-4 w-4" />
              Members will see this wrong time on the device screen.
            </p>
            <p className="mt-2 text-xs">
              Use the <b>Set device time</b> card on the right — tap the live helper to fill the
              fields with current {timezone} time, then <b>Save &amp; push</b>. The value you type
              is sent to the device as-is. No fallback, no timezone math.
            </p>
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3" />
              Drift refreshes on every punch — push the time, punch once, this card will turn green.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
