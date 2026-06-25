'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ArrowUpRight, ScanFace, Fingerprint, Hand, CreditCard, Hash } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Row {
  id: string;
  punch_time: string;
  pin: string;
  employee_id: string | null;
  employee_name: string | null;
  device_name: string;
  punch_type: string;
  verify_mode: string;
  marker: string;
}

const verifyIcon: Record<string, React.ElementType> = {
  face: ScanFace,
  fingerprint: Fingerprint,
  palm: Hand,
  card: CreditCard,
  password: Hash,
  multi: ScanFace,
  other: Hash,
};

const punchColors: Record<string, string> = {
  in: 'border-emerald-500/30 bg-emerald-500/5',
  out: 'border-amber-500/30 bg-amber-500/5',
  break_in: 'border-sky-500/30 bg-sky-500/5',
  break_out: 'border-sky-500/30 bg-sky-500/5',
  overtime_in: 'border-violet-500/30 bg-violet-500/5',
  overtime_out: 'border-violet-500/30 bg-violet-500/5',
};

const markerLabel: Record<string, { label: string; cls: string }> = {
  on_time: { label: 'on time', cls: 'text-emerald-700 dark:text-emerald-300' },
  late: { label: 'late', cls: 'text-red-700 dark:text-red-300' },
  early_out: { label: 'early', cls: 'text-amber-700 dark:text-amber-300' },
  off_shift: { label: '', cls: '' },
  unknown: { label: '', cls: '' },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 5_000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function LiveAttendanceFeed({ tenantSlug }: { tenantSlug: string }) {
  const list = trpc.attendance.list.useQuery(
    { tenantSlug, limit: 6, offset: 0 },
    { refetchInterval: 3_000 },
  );
  const data = (list.data ?? []) as Row[];

  // Detect newly-arrived rows since last render so we can punch up the
  // entry animation specifically for them.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (data.length === 0) return;
    const incoming = data.map((r) => r.id);
    const fresh = new Set<string>();
    for (const id of incoming) {
      if (!seenIdsRef.current.has(id)) fresh.add(id);
      seenIdsRef.current.add(id);
    }
    if (fresh.size > 0) {
      setFreshIds(fresh);
      const t = setTimeout(() => setFreshIds(new Set()), 3000);
      return () => clearTimeout(t);
    }
  }, [data]);

  // Pulse heart: tick a counter every second so "X seconds ago" stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            Live attendance
          </CardTitle>
          <Link
            href={`/t/${tenantSlug}/attendance`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Waiting for punches</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A live feed appears here as soon as a device sends an ATTLOG.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            <AnimatePresence initial={false}>
              {data.map((r) => {
                const VerifyIcon = verifyIcon[r.verify_mode] ?? Hash;
                const tone = punchColors[r.punch_type] ?? '';
                const marker = markerLabel[r.marker] ?? markerLabel.unknown;
                const isFresh = freshIds.has(r.id);
                return (
                  <motion.li
                    key={r.id}
                    layout
                    initial={isFresh ? { opacity: 0, x: -20, backgroundColor: 'hsl(142 76% 36% / 0.18)' } : { opacity: 1 }}
                    animate={{ opacity: 1, x: 0, backgroundColor: 'transparent' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.4 }}
                    className={cn('flex items-center gap-3 px-4 py-3', isFresh && 'border-l-2 border-emerald-500')}
                  >
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-md border', tone)}>
                      <VerifyIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {r.employee_id ? (
                          <Link
                            href={`/t/${tenantSlug}/members/${r.employee_id}`}
                            className="truncate font-medium hover:underline"
                          >
                            {r.employee_name ?? <span className="italic text-muted-foreground">unknown</span>}
                          </Link>
                        ) : (
                          <span className="truncate font-medium italic text-muted-foreground">unknown PIN {r.pin}</span>
                        )}
                        <span className="font-mono text-xs text-muted-foreground">#{r.pin}</span>
                        {marker.label && (
                          <span className={cn('text-[10px] uppercase tracking-wider font-medium', marker.cls)}>
                            {marker.label}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="uppercase tracking-wider">{r.punch_type.replace('_', ' ')}</span>
                        <span>·</span>
                        <span>{r.device_name}</span>
                        <span>·</span>
                        <span>{r.verify_mode}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-mono tabular-nums">{formatTime(r.punch_time)}</p>
                      <p className="text-muted-foreground">{timeAgo(r.punch_time)}</p>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
