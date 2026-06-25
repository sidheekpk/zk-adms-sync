'use client';

import { use, useMemo, useState } from 'react';
import {
  Clock,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Cpu,
  MapPin,
  Trash2,
  AlertTriangle,
  Users as UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OperatorPasswordModal } from '@/components/operator-password-modal';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const PUNCH_TYPES = [
  { value: 'in', label: 'In', tone: 'emerald' },
  { value: 'out', label: 'Out', tone: 'amber' },
  { value: 'break_in', label: 'Break in', tone: 'sky' },
  { value: 'break_out', label: 'Break out', tone: 'sky' },
  { value: 'ot_in', label: 'OT in', tone: 'violet' },
  { value: 'ot_out', label: 'OT out', tone: 'violet' },
] as const;

type PunchType = (typeof PUNCH_TYPES)[number]['value'];

export default function AttendancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  // ---- Filter state ----
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState<string>(''); // YYYY-MM-DD (local input)
  const [to, setTo] = useState<string>('');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [punchType, setPunchType] = useState<PunchType | null>(null);
  const [page, setPage] = useState(0);

  // Convert local-date inputs to ISO datetime range
  const filters = useMemo(() => {
    const f: {
      tenantSlug: string;
      from?: string;
      to?: string;
      deviceId?: string | null;
      locationId?: string | null;
      punchType?: PunchType | null;
      search?: string;
    } = { tenantSlug: slug };
    if (from) f.from = new Date(`${from}T00:00:00`).toISOString();
    if (to) f.to = new Date(`${to}T23:59:59`).toISOString();
    if (deviceId) f.deviceId = deviceId;
    if (locationId) f.locationId = locationId;
    if (punchType) f.punchType = punchType;
    if (search.trim()) f.search = search.trim();
    return f;
  }, [slug, from, to, deviceId, locationId, punchType, search]);

  const list = trpc.attendance.list.useQuery(
    { ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    { refetchInterval: 10_000 },
  );
  const count = trpc.attendance.count.useQuery(filters, { refetchInterval: 10_000 });
  const stats = trpc.attendance.stats.useQuery({ tenantSlug: slug }, { refetchInterval: 15_000 });
  const devices = trpc.devices.list.useQuery({ tenantSlug: slug });
  const locations = trpc.locations.list.useQuery({ tenantSlug: slug });
  const duplicates = trpc.attendance.duplicates.useQuery({ tenantSlug: slug, days: 14 });

  const utils = trpc.useUtils();
  const voidPunch = trpc.attendance.void.useMutation({
    onSuccess: () => {
      toast.success('Punch voided');
      void utils.attendance.list.invalidate();
      void utils.attendance.count.invalidate();
      void utils.attendance.duplicates.invalidate();
      setVoidTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const [voidTarget, setVoidTarget] = useState<{ id: string; label: string } | null>(null);

  const total = count.data ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters =
    !!from || !!to || !!deviceId || !!locationId || !!punchType || !!search.trim();

  function resetFilters() {
    setSearch('');
    setFrom('');
    setTo('');
    setDeviceId(null);
    setLocationId(null);
    setPunchType(null);
    setPage(0);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Attendance' },
        ]}
        title="Attendance"
        description="All punches across this tenant's devices, name-resolved."
        actions={
          <Button asChild variant="outline">
            <a
              href={`/api/tenants/${slug}/attendance/export?${new URLSearchParams({
                ...(filters.from ? { from: filters.from } : {}),
                ...(filters.to ? { to: filters.to } : {}),
                ...(filters.deviceId ? { deviceId: filters.deviceId } : {}),
                ...(filters.punchType ? { punchType: filters.punchType } : {}),
                ...(filters.search ? { search: filters.search } : {}),
              }).toString()}`}
              download={`attendance-${slug}-${new Date().toISOString().slice(0, 10)}.csv`}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </a>
          </Button>
        }
      />

      <main className="flex-1 space-y-4 px-6 py-6">
        {/* Stat row */}
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Total punches" value={stats.data?.total ?? '—'} />
          <Stat label="Today" value={stats.data?.today ?? '—'} />
          <Stat label="Unique today" value={stats.data?.unique_today ?? '—'} sub="members" />
          <Stat label="This week" value={stats.data?.week ?? '—'} />
        </div>

        {/* Filter bar */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="search" className="text-xs">
                  <Search className="mr-1 inline h-3 w-3" /> Search
                </Label>
                <Input
                  id="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Name or PIN"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="from" className="text-xs">From</Label>
                <Input
                  id="from"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(0);
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to" className="text-xs">To</Label>
                <Input
                  id="to"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(0);
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="device" className="text-xs">
                  <Cpu className="mr-1 inline h-3 w-3" /> Device
                </Label>
                <select
                  id="device"
                  value={deviceId ?? ''}
                  onChange={(e) => {
                    setDeviceId(e.target.value || null);
                    setPage(0);
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All devices</option>
                  {(devices.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              {(locations.data ?? []).length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="location" className="text-xs">
                    <MapPin className="mr-1 inline h-3 w-3" /> Location
                  </Label>
                  <select
                    id="location"
                    value={locationId ?? ''}
                    onChange={(e) => {
                      setLocationId(e.target.value || null);
                      setPage(0);
                    }}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">All locations</option>
                    {(locations.data ?? []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Punch type chips + reset */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                <Filter className="mr-1 inline h-3 w-3" /> Type:
              </span>
              <Chip
                active={!punchType}
                onClick={() => {
                  setPunchType(null);
                  setPage(0);
                }}
              >
                All
              </Chip>
              {PUNCH_TYPES.map((t) => (
                <Chip
                  key={t.value}
                  active={punchType === t.value}
                  tone={t.tone}
                  onClick={() => {
                    setPunchType(t.value);
                    setPage(0);
                  }}
                >
                  {t.label}
                </Chip>
              ))}
              {hasFilters && (
                <Button size="sm" variant="ghost" onClick={resetFilters} className="ml-auto h-7 text-xs">
                  <X className="mr-1 h-3 w-3" /> Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Duplicates */}
        {duplicates.data && duplicates.data.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Possible duplicate punches ({duplicates.data.length} groups, last 14 days)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Same employee + same minute. Void the duplicate keeping the original.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {duplicates.data.slice(0, 10).map((g) => (
                <div key={g.group_key} className="flex items-center justify-between rounded-md border p-2 text-xs">
                  <div className="flex-1">
                    <span className="font-medium">{g.employee_name ?? `PIN ${g.pin}`}</span>
                    <span className="ml-2 font-mono text-muted-foreground">{g.minute}</span>
                    <span className="ml-2 text-muted-foreground">×{g.count}</span>
                  </div>
                  <div className="flex gap-1">
                    {g.ids.slice(1).map((id, i) => (
                      <Button
                        key={id}
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-600 hover:text-red-700"
                        onClick={() =>
                          setVoidTarget({
                            id,
                            label: `Duplicate #${i + 2} of ${g.employee_name ?? g.pin} at ${g.minute}`,
                          })
                        }
                      >
                        <Trash2 className="mr-1 h-3 w-3" /> Void dup #{i + 2}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {!list.data ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : list.data.length === 0 ? (
              <div className="py-16 text-center">
                <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">
                  {hasFilters ? 'No punches match your filters' : 'No punches yet'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasFilters
                    ? 'Try widening the date range or clearing the search.'
                    : 'Punches appear here once a device sends ATTLOG to the ADMS endpoint.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Time</th>
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">PIN</th>
                      <th className="p-3 font-medium">Type</th>
                      <th className="p-3 font-medium">Shift</th>
                      <th className="p-3 font-medium">Method</th>
                      <th className="p-3 font-medium">Device</th>
                      <th className="p-3 font-medium">Sync</th>
                      <th className="p-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((a) => (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">
                          {new Date(a.punch_time).toLocaleString()}
                        </td>
                        <td className="p-3 font-medium">{a.employee_name ?? <span className="text-muted-foreground italic">unknown</span>}</td>
                        <td className="p-3 font-mono text-xs">{a.pin}</td>
                        <td className="p-3"><TypeBadge type={a.punch_type} /></td>
                        <td className="p-3"><MarkerBadge marker={a.marker} /></td>
                        <td className="p-3 text-xs">{a.verify_mode}</td>
                        <td className="p-3 text-xs">{a.device_name}</td>
                        <td className="p-3">
                          <SyncBadge status={a.sync_status} />
                        </td>
                        <td className="p-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() =>
                              setVoidTarget({
                                id: a.id,
                                label: `${a.employee_name ?? a.pin} · ${new Date(a.punch_time).toLocaleString()} · ${a.punch_type}`,
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {list.data && list.data.length > 0 && (
              <div className="flex items-center justify-between border-t p-3 text-xs">
                <p className="text-muted-foreground">
                  Showing{' '}
                  <b>{page * PAGE_SIZE + 1}–{page * PAGE_SIZE + list.data.length}</b> of{' '}
                  <b>{total}</b>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Prev
                  </Button>
                  <span className="tabular-nums">
                    Page {page + 1} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <OperatorPasswordModal
        open={!!voidTarget}
        onOpenChange={(o) => !o && setVoidTarget(null)}
        title="Void this punch?"
        description={
          <>
            <p>You are about to void:</p>
            <p className="mt-1 rounded-md bg-muted p-2 font-mono text-xs">{voidTarget?.label}</p>
            <p className="mt-2">Soft-delete — the row stays in the database but is hidden from
              all views, reports, and exports. Audit-logged with your reason.</p>
          </>
        }
        destructiveLabel="Void punch"
        pending={voidPunch.isPending}
        onConfirm={async ({ operatorPassword, reason }) => {
          if (!voidTarget) return;
          try {
            await voidPunch.mutateAsync({
              tenantSlug: slug,
              id: voidTarget.id,
              operatorPassword,
              reason,
            });
          } catch {
            // toast handled
          }
        }}
      />
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-baseline gap-1 text-2xl font-semibold tabular-nums">
        {value}
        {sub && <span className="text-xs font-normal text-muted-foreground">{sub}</span>}
      </p>
    </div>
  );
}

function Chip({
  active,
  tone,
  children,
  onClick,
}: {
  active: boolean;
  tone?: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background hover:bg-muted',
        tone === 'emerald' && active && 'border-emerald-700 bg-emerald-600',
        tone === 'amber' && active && 'border-amber-700 bg-amber-600',
        tone === 'sky' && active && 'border-sky-700 bg-sky-600',
        tone === 'violet' && active && 'border-violet-700 bg-violet-600',
      )}
    >
      {children}
    </button>
  );
}

function TypeBadge({ type }: { type: string }) {
  const def = PUNCH_TYPES.find((p) => p.value === type);
  const tone = def?.tone ?? 'gray';
  const label = def?.label ?? type;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
        tone === 'emerald' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        tone === 'amber' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        tone === 'sky' && 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
        tone === 'violet' && 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
        tone === 'gray' && 'border-border bg-muted',
      )}
    >
      {label}
    </span>
  );
}

function MarkerBadge({ marker }: { marker: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    on_time: { label: 'on time', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
    late: { label: 'late', cls: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' },
    early_out: { label: 'early out', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
    off_shift: { label: 'off-shift', cls: 'border-border bg-muted text-muted-foreground' },
    unknown: { label: '—', cls: 'border-border bg-muted text-muted-foreground' },
  };
  const m = map[marker] ?? map.unknown!;
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs', m.cls)}>
      {m.label}
    </span>
  );
}

function SyncBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
        status === 'synced' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        status === 'pending' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        status === 'failed' && 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
      )}
    >
      {status}
    </span>
  );
}
// suppress unused import lint for icons we may bring back when correction UI lands
void UsersIcon;
