'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Info } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const TIMEZONES = [
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Qatar',
  'Asia/Muscat',
  'Asia/Kuwait',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Hong_Kong',
  'Asia/Manila',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'UTC',
];

export function TimezoneCard({
  tenantSlug,
  deviceId,
  currentTimezone,
}: {
  tenantSlug: string;
  deviceId: string;
  currentTimezone: string;
}) {
  const utils = trpc.useUtils();
  const [tz, setTz] = useState(currentTimezone);
  const update = trpc.devices.updateTimezone.useMutation({
    onSuccess: (data) => {
      toast.success(`Timezone label set to ${data.timezone}`);
      void utils.devices.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const dirty = tz !== currentTimezone;
  const options = TIMEZONES.includes(currentTimezone) ? TIMEZONES : [currentTimezone, ...TIMEZONES];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Timezone label</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="tz" className="text-xs">
            IANA timezone
          </Label>
          <select
            id="tz"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {options.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
            <span>
              This label is used by our ingestion to interpret the device&apos;s
              reported punch times as <b>{tz}</b> local. It does <b>not</b>{' '}
              change the device&apos;s on-screen clock — that&apos;s owned by
              the device menu (System → Date Time → Timezone). Until the
              LAN-side agent ships (Sprint 2), set the on-device timezone
              physically on the unit.
            </span>
          </p>
        </div>

        <Button size="sm" onClick={() => update.mutate({ tenantSlug, deviceId, timezone: tz })} disabled={!dirty || update.isPending}>
          {update.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" /> Save label
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
