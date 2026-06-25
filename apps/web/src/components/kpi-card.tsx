'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Smoothly counts from `from` to `to` over `duration` ms.
 * Re-runs when `to` changes (new server value).
 */
function useCountUp(target: number | string, durationMs = 700): number | string {
  const isNumber = typeof target === 'number' && Number.isFinite(target);
  const [value, setValue] = useState<number>(isNumber ? (target as number) : 0);
  useEffect(() => {
    if (!isNumber) return;
    const start = value;
    const end = target as number;
    if (start === end) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setValue(Math.round(start + (end - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  if (!isNumber) return target;
  return value;
}

interface Props {
  label: string;
  value: number | string;
  /** Optional baseline for the delta indicator (e.g. yesterday's value). */
  compareTo?: number;
  /** Optional small text below the value. */
  sub?: string;
  icon: React.ElementType;
  href?: string;
  accent?: 'emerald' | 'amber' | 'red' | 'sky' | 'violet';
}

export function KpiCard({ label, value, compareTo, sub, icon: Icon, href, accent }: Props) {
  const animated = useCountUp(value);
  const isNumber = typeof value === 'number' && typeof compareTo === 'number';
  const delta = isNumber ? (value as number) - (compareTo as number) : null;
  const pct = isNumber && (compareTo as number) > 0
    ? Math.round(((value as number) - (compareTo as number)) / (compareTo as number) * 100)
    : null;

  const accentBg =
    accent === 'emerald' ? 'bg-emerald-500/10 text-emerald-600' :
    accent === 'amber' ? 'bg-amber-500/10 text-amber-600' :
    accent === 'red' ? 'bg-red-500/10 text-red-600' :
    accent === 'sky' ? 'bg-sky-500/10 text-sky-600' :
    accent === 'violet' ? 'bg-violet-500/10 text-violet-600' :
    'bg-muted/40 text-muted-foreground';

  const body = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <motion.p
            key={String(value)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-2 text-3xl font-semibold tracking-tight tabular-nums"
          >
            {animated}
          </motion.p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-md', accentBg)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {delta != null && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          {delta > 0 ? (
            <>
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              <span className="font-medium text-emerald-600 tabular-nums">+{delta}</span>
            </>
          ) : delta < 0 ? (
            <>
              <TrendingDown className="h-3 w-3 text-red-600" />
              <span className="font-medium text-red-600 tabular-nums">{delta}</span>
            </>
          ) : (
            <>
              <Minus className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground tabular-nums">no change</span>
            </>
          )}
          {pct != null && delta !== 0 && (
            <span className="text-muted-foreground">({pct > 0 ? '+' : ''}{pct}%)</span>
          )}
          <span className="ml-1 text-muted-foreground">vs yesterday</span>
        </div>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href} className="group">
        <Card className="transition-shadow group-hover:shadow-md">{body}</Card>
      </Link>
    );
  }
  return <Card>{body}</Card>;
}
