'use client';

import { use, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Cpu,
  Power,
  ClipboardX,
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
import { OperatorPasswordModal } from '@/components/operator-password-modal';

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  device_count: number;
  online_count: number;
  created_at: string;
}

type BulkKind = 'reboot' | 'clear_log';

export default function GroupsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const utils = trpc.useUtils();
  const list = trpc.deviceGroups.list.useQuery({ tenantSlug: slug }, { refetchInterval: 5_000 });

  const create = trpc.deviceGroups.create.useMutation({
    onSuccess: () => {
      toast.success('Group created');
      setShowAdd(false);
      setForm({ name: '', description: '' });
      void utils.deviceGroups.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.deviceGroups.update.useMutation({
    onSuccess: () => {
      toast.success('Group updated');
      setEditTarget(null);
      void utils.deviceGroups.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.deviceGroups.delete.useMutation({
    onSuccess: () => {
      toast.success('Group deleted — devices unassigned');
      void utils.deviceGroups.list.invalidate();
      void utils.devices.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const bulkReboot = trpc.deviceGroups.bulkReboot.useMutation({
    onSuccess: (r) => {
      toast.success(`Rebooting ${r.devicesRebooted} device(s) in group`);
      setBulkTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const bulkClearLog = trpc.deviceGroups.bulkClearLog.useMutation({
    onSuccess: (r) => {
      toast.success(`Cleared log on ${r.devicesCleared} device(s)`);
      setBulkTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<GroupRow | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [bulkTarget, setBulkTarget] = useState<{ group: GroupRow; kind: BulkKind } | null>(null);

  const rows = (list.data ?? []) as GroupRow[];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Device groups' },
        ]}
        title="Device groups"
        description="Bundle devices for bulk operations — reboot all, wipe attendance on all, push the same setting to all."
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add group
          </Button>
        }
      />

      <main className="flex-1 px-6 py-6">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Layers className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No groups yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a group to bulk-operate on multiple devices (e.g. &ldquo;Lobby
                turnstiles&rdquo;, &ldquo;Warehouse&rdquo;).
              </p>
              <Button className="mt-6" onClick={() => setShowAdd(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add first group
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((g, i) => (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="rounded-md border bg-muted/30 p-1.5">
                            <Layers className="h-3.5 w-3.5" />
                          </div>
                          <h3 className="truncate font-semibold">{g.name}</h3>
                        </div>
                        {g.description && (
                          <p className="mt-2 text-sm text-muted-foreground">{g.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditTarget(g);
                            setForm({ name: g.name, description: g.description ?? '' });
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => {
                            if (confirm(`Delete group "${g.name}"? Devices become unassigned (not deleted).`)) {
                              del.mutate({ tenantSlug: slug, id: g.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono tabular-nums">{g.device_count}</span>
                        <span className="text-muted-foreground">
                          device{g.device_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-mono tabular-nums">
                        {g.online_count} online
                      </span>
                    </div>
                    {g.device_count > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={g.online_count === 0}
                          onClick={() => setBulkTarget({ group: g, kind: 'reboot' })}
                          title={g.online_count === 0 ? 'No online devices in this group' : ''}
                        >
                          <Power className="mr-1.5 h-3.5 w-3.5" /> Reboot all
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          disabled={g.online_count === 0}
                          onClick={() => setBulkTarget({ group: g, kind: 'clear_log' })}
                        >
                          <ClipboardX className="mr-1.5 h-3.5 w-3.5" /> Clear log all
                        </Button>
                      </div>
                    )}
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
            setForm({ name: '', description: '' });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit group' : 'Add group'}</DialogTitle>
            <DialogDescription>
              Logical bundling of devices for bulk reboot / clear / settings push.
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
                  description: form.description.trim() || null,
                });
              } else {
                create.mutate({
                  tenantSlug: slug,
                  name: form.name.trim(),
                  description: form.description.trim() || undefined,
                });
              }
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="gname" className="text-xs">Name</Label>
              <Input
                id="gname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Lobby turnstiles"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gdesc" className="text-xs">Description (optional)</Label>
              <Input
                id="gdesc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. All entry-side V5Ls on shift A"
              />
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
                {editTarget ? 'Save changes' : 'Create group'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk operation password modal */}
      <OperatorPasswordModal
        open={!!bulkTarget}
        onOpenChange={(o) => !o && setBulkTarget(null)}
        title={bulkTarget ? `${bulkTarget.kind === 'reboot' ? 'Reboot' : 'Clear log on'} all devices in "${bulkTarget.group.name}"?` : ''}
        description={
          bulkTarget && (
            <>
              {bulkTarget.kind === 'reboot'
                ? `${bulkTarget.group.online_count} online device(s) will reboot. ~60-second outage per device.`
                : `${bulkTarget.group.online_count} online device(s) will have their attendance log wiped. Already-synced punches stay in ZK Connect.`}
            </>
          )
        }
        destructiveLabel={bulkTarget?.kind === 'reboot' ? 'Reboot all' : 'Clear log all'}
        pending={bulkReboot.isPending || bulkClearLog.isPending}
        onConfirm={async ({ operatorPassword, reason }) => {
          if (!bulkTarget) return;
          try {
            if (bulkTarget.kind === 'reboot') {
              await bulkReboot.mutateAsync({
                tenantSlug: slug,
                groupId: bulkTarget.group.id,
                operatorPassword,
                reason,
              });
            } else {
              await bulkClearLog.mutateAsync({
                tenantSlug: slug,
                groupId: bulkTarget.group.id,
                operatorPassword,
                reason,
              });
            }
          } catch {
            // toast handled
          }
        }}
      />
    </>
  );
}
