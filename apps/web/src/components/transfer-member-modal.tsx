'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Cpu } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface DeviceRow {
  id: string;
  name: string;
  serial_number: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  employeeId: string;
  employeeName: string;
  employeePin: string;
  /** The device the member is currently on (source). */
  fromDevice: DeviceRow | null;
  /** All available devices to choose as destination. */
  allDevices: DeviceRow[];
}

export function TransferMemberModal({
  open,
  onOpenChange,
  tenantSlug,
  employeeId,
  employeeName,
  employeePin,
  fromDevice,
  allDevices,
}: Props) {
  const [toDeviceId, setToDeviceId] = useState<string>('');
  const [mode, setMode] = useState<'move' | 'copy'>('move');
  const [reason, setReason] = useState('');

  const candidates = allDevices.filter((d) => d.id !== fromDevice?.id);

  const transfer = trpc.employees.transfer.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.mode === 'move'
          ? `Member moved — push queued #${r.pushQueued}, remove queued #${r.removeQueued}`
          : `Member copied — push queued #${r.pushQueued}`,
      );
      onOpenChange(false);
      setToDeviceId('');
      setReason('');
    },
    onError: (e) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromDevice || !toDeviceId) return;
    transfer.mutate({
      tenantSlug,
      employeeId,
      fromDeviceId: fromDevice.id,
      toDeviceId,
      mode,
      reason,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer member</DialogTitle>
          <DialogDescription>
            {mode === 'move' ? 'Move' : 'Copy'} <b>{employeeName}</b> (PIN {employeePin}) between devices.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Visual: from → to */}
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-md border bg-muted/30 p-3 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">From</p>
              <p className="mt-1 flex items-center gap-1.5 font-medium">
                <Cpu className="h-3.5 w-3.5" /> {fromDevice?.name ?? '—'}
              </p>
              {fromDevice && (
                <p className="font-mono text-[10px] text-muted-foreground">{fromDevice.serial_number}</p>
              )}
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 rounded-md border p-3 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">To</p>
              <select
                value={toDeviceId}
                onChange={(e) => setToDeviceId(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                required
              >
                <option value="">Select device…</option>
                {candidates.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Move vs Copy */}
          <div className="space-y-2">
            <Label className="text-xs">Mode</Label>
            <div className="flex gap-2">
              <ModeButton
                active={mode === 'move'}
                onClick={() => setMode('move')}
                label="Move"
                hint="Remove from source, push to destination"
              />
              <ModeButton
                active={mode === 'copy'}
                onClick={() => setMode('copy')}
                label="Copy"
                hint="Keep on source, also push to destination"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-xs">Reason (audit-logged)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. relocated to back entrance"
              required
              minLength={3}
            />
          </div>

          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-muted-foreground">
            Note: this only pushes the user PROFILE (PIN, name, card, password). Biometric
            templates that exist on the source device do NOT carry over via ADMS — the member
            must re-enroll on the destination, or have their template explicitly pushed first.
          </p>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!toDeviceId || !reason || transfer.isPending}>
              {transfer.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              {mode === 'move' ? 'Move member' : 'Copy member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md border p-3 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'hover:bg-muted/30',
      )}
    >
      <p className={cn('text-sm font-medium', active && 'text-primary')}>{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}
