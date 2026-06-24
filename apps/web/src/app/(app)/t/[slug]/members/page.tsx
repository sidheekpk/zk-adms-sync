'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Users, Fingerprint, ScanFace, Hand, ArrowRight, Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const list = trpc.employees.list.useQuery({ tenantSlug: slug });
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'no_biometric' | 'admins' | 'staff'>('all');

  const filtered = useMemo(() => {
    if (!list.data) return [];
    const term = q.trim().toLowerCase();
    return list.data.filter((e) => {
      if (term) {
        const matches =
          e.name.toLowerCase().includes(term) ||
          e.pin.toLowerCase().includes(term) ||
          (e.role ?? '').toLowerCase().includes(term);
        if (!matches) return false;
      }
      if (filter === 'admins' && e.device_privilege !== 14) return false;
      if (filter === 'staff' && e.device_privilege === 14) return false;
      if (filter === 'no_biometric') {
        const f = e.biometric_flags ?? {};
        if (f.fp || f.face || f.palm) return false;
      }
      return true;
    });
  }, [list.data, q, filter]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Members' },
        ]}
        title="Members"
        description="Employees enrolled in this tenant. Edits push to the device on save."
        actions={
          <Button asChild>
            <Link href={`/t/${slug}/members/enroll`}>
              <Plus className="mr-2 h-4 w-4" /> Enroll member
            </Link>
          </Button>
        }
      />
      <main className="flex-1 space-y-4 px-6 py-6">
        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, PIN, role…"
              className="pl-9"
            />
          </div>
          <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterChip label="Admins" active={filter === 'admins'} onClick={() => setFilter('admins')} />
          <FilterChip label="Staff" active={filter === 'staff'} onClick={() => setFilter('staff')} />
          <FilterChip
            label="Missing biometric"
            active={filter === 'no_biometric'}
            onClick={() => setFilter('no_biometric')}
          />
          {list.data && (
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} of {list.data.length}
            </span>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {!list.data ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : list.data.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">No members yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enroll a member to allocate a PIN. They&apos;ll capture their biometric on the device.
                </p>
                <Button className="mt-6" asChild>
                  <Link href={`/t/${slug}/members/enroll`}>
                    <Plus className="mr-2 h-4 w-4" /> Enroll member
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-4 font-medium">PIN</th>
                      <th className="p-4 font-medium">Name</th>
                      <th className="p-4 font-medium">Role</th>
                      <th className="p-4 font-medium">Privilege</th>
                      <th className="p-4 font-medium">Biometrics</th>
                      <th className="p-4 font-medium">Status</th>
                      <th className="p-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No members match your search.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                          onClick={() => {
                            window.location.href = `/t/${slug}/members/${e.id}`;
                          }}
                        >
                          <td className="p-4 font-mono text-xs">{e.pin}</td>
                          <td className="p-4 font-medium">{e.name}</td>
                          <td className="p-4">{e.role}</td>
                          <td className="p-4">{e.device_privilege === 14 ? 'Admin' : 'User'}</td>
                          <td className="p-4">
                            <BioFlags flags={e.biometric_flags ?? {}} />
                          </td>
                          <td className="p-4">{e.enabled ? 'Active' : 'Disabled'}</td>
                          <td className="p-4 text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/t/${slug}/members/${e.id}`}>
                                Open <ArrowRight className="ml-1 h-4 w-4" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border hover:bg-muted/50',
      )}
    >
      {label}
    </button>
  );
}

function BioFlags({ flags }: { flags: Record<string, boolean> }) {
  const items = [
    { key: 'fp', icon: Fingerprint, label: 'Fingerprint' },
    { key: 'face', icon: ScanFace, label: 'Face' },
    { key: 'palm', icon: Hand, label: 'Palm' },
  ];
  return (
    <div className="flex gap-1.5">
      {items.map((it) => {
        const captured = !!flags[it.key];
        const Icon = it.icon;
        return (
          <span
            key={it.key}
            title={`${it.label}${captured ? '' : ' — not captured'}`}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-md border',
              captured
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                : 'border-dashed text-muted-foreground/40',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        );
      })}
    </div>
  );
}
