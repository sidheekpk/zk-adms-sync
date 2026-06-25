'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Inbox,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

type KeyRow = {
  id: string;
  name: string;
  description: string | null;
  key_prefix: string;
  scopes: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  created_by_email: string | null;
  created_at: string;
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function InboundKeysCard({ tenantSlug }: { tenantSlug: string }) {
  const utils = trpc.useUtils();
  const keys = trpc.inboundKeys.list.useQuery({ tenantSlug });
  const create = trpc.inboundKeys.create.useMutation({
    onSuccess: (r) => {
      setNewKey({ secret: r.secret, prefix: r.prefix });
      setShowCreate(false);
      setName('');
      setDescription('');
      void utils.inboundKeys.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = trpc.inboundKeys.revoke.useMutation({
    onSuccess: () => {
      toast.success('Key revoked');
      void utils.inboundKeys.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newKey, setNewKey] = useState<{ secret: string; prefix: string } | null>(null);

  const rows = (keys.data ?? []) as KeyRow[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4 text-muted-foreground" /> Inbound API keys
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            External HR systems push new members and updates to ZK Connect using these
            tokens. Each key is shown <b>once</b> at creation — store it securely.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New key
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Endpoint help */}
        <div className="rounded-md border bg-muted/30 p-3 text-xs">
          <p className="font-medium">Inbound endpoint</p>
          <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">
{`POST /api/inbound/${tenantSlug}/members
Authorization: Bearer zkci_…
Content-Type: application/json

{
  "externalId": "EMP-001",
  "pin": "1",
  "name": "John Doe",
  "role": "staff",
  "devicePrivilege": 0,
  "cardNumber": null,
  "password": null
}`}
          </pre>
          <p className="mt-2 text-muted-foreground">
            Body can also be an array (up to 500 members per request).
            We upsert by <code>externalId</code> if provided, otherwise by <code>pin</code>.
            New + updated profiles are pushed to all online devices in this tenant.
          </p>
        </div>

        {keys.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <KeyRound className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No inbound keys yet</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Click <b>New key</b> to mint one.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((k) => {
              const revoked = !!k.revoked_at;
              return (
                <li
                  key={k.id}
                  className={`flex items-start justify-between gap-3 rounded-md border p-3 ${revoked ? 'opacity-60' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{k.name}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {k.key_prefix}…
                      </code>
                      {revoked && (
                        <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-700 dark:text-red-300">
                          revoked
                        </span>
                      )}
                    </div>
                    {k.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{k.description}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Created {timeAgo(k.created_at)} by {k.created_by_email ?? 'unknown'}
                      {' · '}
                      Last used {timeAgo(k.last_used_at)}
                      {k.last_used_ip && ` from ${k.last_used_ip}`}
                    </p>
                  </div>
                  {!revoked && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => {
                        if (confirm(`Revoke key "${k.name}"? External system using it will get 401.`)) {
                          revoke.mutate({ tenantSlug, id: k.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New inbound API key</DialogTitle>
            <DialogDescription>
              Mint a token for an external system (Radix HR, payroll, etc.) to push members
              into this tenant.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ tenantSlug, name: name.trim(), description: description.trim() || undefined });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="kname" className="text-xs">Name</Label>
              <Input
                id="kname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Radix HR — production"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="kdesc" className="text-xs">Description (optional)</Label>
              <Input
                id="kdesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Used by Radix HR to sync new hires"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reveal-once dialog */}
      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Key created — copy it now
            </DialogTitle>
            <DialogDescription>
              This is the only time we&apos;ll show you the full key. Store it in your external
              system&apos;s secret manager.
            </DialogDescription>
          </DialogHeader>
          {newKey && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Secret</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all font-mono text-sm">{newKey.secret}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(newKey.secret);
                      toast.success('Copied');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Won&apos;t be shown again
                </p>
                <p className="mt-1 text-muted-foreground">
                  Once you close this dialog the secret is gone — only the prefix
                  <code className="mx-1 font-mono">{newKey.prefix}…</code>
                  remains in our DB (hashed) for identification. If you lose it, revoke and mint a new one.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setNewKey(null)}>I&apos;ve saved it</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
