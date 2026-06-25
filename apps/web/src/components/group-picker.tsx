'use client';

import { toast } from 'sonner';
import { Layers, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Label } from '@/components/ui/label';

export function GroupPicker({
  tenantSlug,
  deviceId,
  currentGroupId,
}: {
  tenantSlug: string;
  deviceId: string;
  currentGroupId: string | null;
}) {
  const utils = trpc.useUtils();
  const groups = trpc.deviceGroups.list.useQuery({ tenantSlug });
  const assign = trpc.deviceGroups.assignDevice.useMutation({
    onSuccess: () => {
      toast.success('Group updated');
      void utils.devices.get.invalidate();
      void utils.deviceGroups.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-xs">
        <Layers className="h-3 w-3" /> Group
      </Label>
      <select
        value={currentGroupId ?? ''}
        onChange={(e) =>
          assign.mutate({
            tenantSlug,
            deviceId,
            groupId: e.target.value || null,
          })
        }
        disabled={assign.isPending || groups.isLoading}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">— Unassigned —</option>
        {(groups.data ?? []).map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {assign.isPending && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> saving…
        </p>
      )}
    </div>
  );
}
