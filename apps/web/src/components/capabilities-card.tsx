'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Fingerprint, ScanFace, Hand, CreditCard, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { DeviceCapabilities } from '@zkc/shared/capabilities';
import { cn } from '@/lib/utils';

type ModalityKey = 'fingerprint' | 'face' | 'palm' | 'card';

interface Props {
  tenantSlug: string;
  deviceId: string;
  modelLabel: string;
  capabilities: DeviceCapabilities;
  modalities: Record<ModalityKey, boolean>;
}

const ICONS: Record<ModalityKey, React.ElementType> = {
  fingerprint: Fingerprint,
  face: ScanFace,
  palm: Hand,
  card: CreditCard,
};

const LABELS: Record<ModalityKey, string> = {
  fingerprint: 'Fingerprint',
  face: 'Face',
  palm: 'Palm',
  card: 'RFID card',
};

export function CapabilitiesCard({
  tenantSlug,
  deviceId,
  modelLabel,
  capabilities,
  modalities,
}: Props) {
  const utils = trpc.useUtils();
  const [local, setLocal] = useState<Record<ModalityKey, boolean>>(modalities);
  const update = trpc.devices.updateModalities.useMutation({
    onSuccess: () => {
      toast.success('Modalities updated');
      void utils.devices.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function toggle(k: ModalityKey) {
    if (!capabilities[k]) return; // unsupported by hardware
    const next = { ...local, [k]: !local[k] };
    setLocal(next);
    update.mutate({ tenantSlug, deviceId, modalities: next });
  }

  const allKeys: ModalityKey[] = ['fingerprint', 'face', 'palm', 'card'];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          Capabilities · <span className="font-normal text-muted-foreground">{modelLabel}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {allKeys.map((k) => {
            const Icon = ICONS[k];
            const supported = capabilities[k];
            const enabled = local[k];
            return (
              <li key={k} className="flex items-center justify-between">
                <span
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    !supported && 'text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" /> {LABELS[k]}
                  {!supported && (
                    <span className="text-xs italic text-muted-foreground">
                      not supported by this model
                    </span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 disabled:opacity-30"
                  onClick={() => toggle(k)}
                  disabled={!supported || update.isPending}
                >
                  {update.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : enabled ? (
                    <ToggleRight className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {capabilities.thermal && <CapBadge>Thermal</CapBadge>}
          {capabilities.camera && <CapBadge>Camera</CapBadge>}
          {capabilities.speaker && <CapBadge>Speaker</CapBadge>}
          {capabilities.doorRelay && <CapBadge>Door relay</CapBadge>}
        </ul>
      </CardContent>
    </Card>
  );
}

function CapBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
      {children}
    </span>
  );
}
