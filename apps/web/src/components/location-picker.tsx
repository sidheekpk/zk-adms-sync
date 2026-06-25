'use client';

import { toast } from 'sonner';
import { MapPin, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Label } from '@/components/ui/label';

export function LocationPicker({
  tenantSlug,
  deviceId,
  currentLocationId,
}: {
  tenantSlug: string;
  deviceId: string;
  currentLocationId: string | null;
}) {
  const utils = trpc.useUtils();
  const locations = trpc.locations.list.useQuery({ tenantSlug });
  const assign = trpc.locations.assignDevice.useMutation({
    onSuccess: () => {
      toast.success('Location updated');
      void utils.devices.get.invalidate();
      void utils.locations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-xs">
        <MapPin className="h-3 w-3" /> Location
      </Label>
      <select
        value={currentLocationId ?? ''}
        onChange={(e) =>
          assign.mutate({
            tenantSlug,
            deviceId,
            locationId: e.target.value || null,
          })
        }
        disabled={assign.isPending || locations.isLoading}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">— Unassigned —</option>
        {(locations.data ?? []).map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
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
