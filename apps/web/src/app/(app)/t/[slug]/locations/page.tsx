'use client';

import { use, useState } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Cpu,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LocationRow {
  id: string;
  name: string;
  address: string | null;
  timezone: string | null;
  device_count: number;
  member_count: number;
  created_at: string;
}

export default function LocationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const utils = trpc.useUtils();
  const list = trpc.locations.list.useQuery({ tenantSlug: slug });
  const create = trpc.locations.create.useMutation({
    onSuccess: () => {
      toast.success('Location created');
      setShowAdd(false);
      setForm({ name: '', address: '', timezone: '' });
      void utils.locations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.locations.update.useMutation({
    onSuccess: () => {
      toast.success('Location updated');
      setEditTarget(null);
      void utils.locations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.locations.delete.useMutation({
    onSuccess: () => {
      toast.success('Location deleted — devices unassigned');
      void utils.locations.list.invalidate();
      void utils.devices.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<LocationRow | null>(null);
  const [form, setForm] = useState({ name: '', address: '', timezone: '' });

  const rows = (list.data ?? []) as LocationRow[];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Locations' },
        ]}
        title="Locations"
        description="Sites where devices live. Assign devices to a location to filter attendance + reports by site."
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add location
          </Button>
        }
      />

      <main className="flex-1 px-6 py-6">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No locations yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a location to group devices by site. Optional — single-site
                tenants can skip this entirely.
              </p>
              <Button className="mt-6" onClick={() => setShowAdd(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add first location
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((loc, i) => (
              <motion.div
                key={loc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className="group transition-shadow hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="rounded-md border bg-muted/30 p-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                          </div>
                          <h3 className="truncate font-semibold">{loc.name}</h3>
                        </div>
                        {loc.address && (
                          <p className="mt-2 text-sm text-muted-foreground">{loc.address}</p>
                        )}
                        {loc.timezone && (
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {loc.timezone}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditTarget(loc);
                            setForm({
                              name: loc.name,
                              address: loc.address ?? '',
                              timezone: loc.timezone ?? '',
                            });
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => {
                            if (
                              confirm(
                                `Delete location "${loc.name}"? Devices here become unassigned (not deleted).`,
                              )
                            ) {
                              del.mutate({ tenantSlug: slug, id: loc.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono tabular-nums">{loc.device_count}</span>
                        <span className="text-muted-foreground">device{loc.device_count === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Add / Edit dialog */}
      <Dialog
        open={showAdd || !!editTarget}
        onOpenChange={(o) => {
          if (!o) {
            setShowAdd(false);
            setEditTarget(null);
            setForm({ name: '', address: '', timezone: '' });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit location' : 'Add location'}</DialogTitle>
            <DialogDescription>
              Locations group devices by site. Optional but useful for multi-site tenants.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (editTarget) {
                update.mutate({
                  tenantSlug: slug,
                  id: editTarget.id,
                  name: form.name.trim(),
                  address: form.address.trim() || null,
                  timezone: form.timezone.trim() || null,
                });
              } else {
                create.mutate({
                  tenantSlug: slug,
                  name: form.name.trim(),
                  address: form.address.trim() || undefined,
                  timezone: form.timezone.trim() || undefined,
                });
              }
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="locname" className="text-xs">Name</Label>
              <Input
                id="locname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Main entrance"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="locaddr" className="text-xs">Address (optional)</Label>
              <Input
                id="locaddr"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Building A, 123 Main St"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="loctz" className="text-xs">Timezone override (optional)</Label>
              <Input
                id="loctz"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                placeholder="Asia/Kolkata"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                If empty, the tenant&apos;s timezone applies.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowAdd(false);
                  setEditTarget(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!form.name.trim() || create.isPending || update.isPending}>
                {(create.isPending || update.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editTarget ? 'Save changes' : 'Create location'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
