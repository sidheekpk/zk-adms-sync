'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Lightweight, name-only clock for table cells. Anchors on the current
 * server time at first render and ticks locally. Computes the timezone
 * offset once on mount; that's fine for the precision we need at this
 * granularity.
 */
export function InlineDeviceClock({
  timezone,
  className,
  showDate,
}: {
  timezone: string;
  className?: string;
  showDate?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  let time = '';
  let date = '';
  try {
    time = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
    date = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    time = '—';
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono tabular-nums text-xs', className)}>
      <Clock className="h-3 w-3 text-muted-foreground" />
      <span>{time}</span>
      {showDate && <span className="text-muted-foreground">{date}</span>}
    </span>
  );
}
