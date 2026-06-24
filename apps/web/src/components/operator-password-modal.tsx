'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
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

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  destructiveLabel?: string;
  pending?: boolean;
  /**
   * Called with the operator password + reason once the user confirms.
   * The caller is responsible for actually doing the destructive thing;
   * a server-side error (e.g. wrong password) should be surfaced via
   * a thrown error so we can keep the modal open with a hint.
   */
  onConfirm: (input: { operatorPassword: string; reason: string }) => Promise<void> | void;
  requireReason?: boolean;
}

export function OperatorPasswordModal({
  open,
  onOpenChange,
  title,
  description,
  destructiveLabel = 'Confirm',
  pending,
  onConfirm,
  requireReason = true,
}: ConfirmProps) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const canSubmit = password.length > 0 && (!requireReason || reason.length > 0);

  function reset() {
    setPassword('');
    setReason('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            void onConfirm({ operatorPassword: password, reason });
          }}
        >
          {requireReason && (
            <div className="space-y-2">
              <Label htmlFor="opreason">Reason (audited)</Label>
              <Input
                id="opreason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. End of week reset"
                autoFocus
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="oppwd">Operator password</Label>
            <Input
              id="oppwd"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus={!requireReason}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending || !canSubmit}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : destructiveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
