'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  Volume2,
  Languages,
  Monitor,
  Mic,
  LockKeyhole,
  Fingerprint,
  ScanFace,
  Hand,
  Shield,
  Trash2,
  AlertTriangle,
  Loader2,
  Send,
  Power,
  Sun,
  Activity,
  CalendarDays,
  ShieldAlert,
  Network,
  Radio,
  CheckCircle2,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OperatorPasswordModal } from '@/components/operator-password-modal';
import { TimeDriftCard } from '@/components/time-drift-card';
import { TimezoneCard } from '@/components/timezone-card';
import { ManualTimeCard } from '@/components/manual-time-card';
import { CapabilitiesCard } from '@/components/capabilities-card';
import { cn } from '@/lib/utils';
import type { DeviceCapabilities } from '@zkc/shared/capabilities';

type CommandRow = {
  id: string;
  command_id: number;
  command_type: string;
  status: string;
  return_code: number | null;
  reason: string | null;
  created_at: string;
  completed_at: string | null;
};

type DeviceRow = {
  id: string;
  serial_number: string;
  name: string;
  model: string | null;
  firmware_version: string | null;
  firmware_family: string;
  status: string;
  ip_address: string | null;
  timezone: string;
  timezone_synced_at: string | null;
  user_count: number | null;
  att_log_count: number | null;
  finger_count: number | null;
  face_count: number | null;
  palm_count: number | null;
  has_thermal: boolean;
  enabled: boolean;
  modelLabel: string;
  capabilities: DeviceCapabilities;
  modalities: Record<'fingerprint' | 'face' | 'palm' | 'card', boolean>;
  protocol: {
    setDateTime: boolean;
    executeShell: boolean;
    testVoiceRemote: boolean;
    setOptionsRoundTrip: boolean;
    setOptionsNetwork: boolean;
    bulkEnrollPush: boolean;
    queryNetwork: boolean;
  };
  clock: {
    timezone: string;
    serverNowMs: number;
    deviceLocalMs: number;
    deviceUnix: number;
    driftSec: number;
    driftMeasuredAt: string | null;
  };
  settings?: {
    deviceOptions?: Record<string, number | boolean | string>;
    clockDrift?: { sec: number; measuredAt: string; method?: string };
  };
};

const LANGUAGES = [
  { id: 69, label: 'English' },
  { id: 70, label: 'Arabic' },
  { id: 1, label: 'Chinese (Simplified)' },
  { id: 3, label: 'Spanish' },
  { id: 4, label: 'French' },
  { id: 5, label: 'German' },
  { id: 8, label: 'Russian' },
  { id: 14, label: 'Portuguese' },
  { id: 21, label: 'Indonesian' },
  { id: 38, label: 'Hindi' },
];

const ANTIPASSBACK_MODES = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'In only' },
  { value: 2, label: 'Out only' },
  { value: 3, label: 'In + Out' },
];

const VERIFY_MODES = [
  { value: 0, label: 'Any (default)' },
  { value: 1, label: 'Fingerprint only' },
  { value: 4, label: 'Card only' },
  { value: 15, label: 'Face only' },
  { value: 25, label: 'Palm only' },
  { value: 132, label: 'PIN + Face' },
  { value: 200, label: 'PIN + Fingerprint' },
];

const DATE_FORMATS = [
  { value: 'YYYY-MM-DD', label: '2026-06-22' },
  { value: 'DD/MM/YYYY', label: '22/06/2026' },
  { value: 'MM/DD/YYYY', label: '06/22/2026' },
  { value: 'YYYY/MM/DD', label: '2026/06/22' },
];

type MaintenanceKind =
  | 'clear_att_log'
  | 'clear_all_data'
  | 'clear_fingerprints'
  | 'clear_faces'
  | 'clear_palms'
  | 'clear_photos'
  | 'clear_admins'
  | 'factory_reset';

export default function DeviceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  const utils = trpc.useUtils();
  const device = trpc.devices.get.useQuery(
    { tenantSlug: slug, id },
    { refetchInterval: 5000 },
  );
  const commands = trpc.devices.listCommands.useQuery(
    { tenantSlug: slug, deviceId: id, limit: 10 },
    { refetchInterval: 3000 },
  );
  const [settingsRebootHint, setSettingsRebootHint] = useState(false);
  const updateOptions = trpc.devices.updateDeviceOptions.useMutation({
    onSuccess: () => {
      toast.success('Settings stored on device — reboot to make them visible');
      setSettingsRebootHint(true);
      void utils.devices.get.invalidate();
      void utils.devices.listCommands.invalidate();
      setForm({});
    },
    onError: (e) => toast.error(e.message),
  });
  const runMaintenance = trpc.devices.runMaintenance.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(`Maintenance: ${vars.kind} queued`);
      void utils.devices.listCommands.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const queue = trpc.devices.queueCommand.useMutation({
    onError: (e) => toast.error(e.message),
    onSuccess: () => void utils.devices.listCommands.invalidate(),
  });
  const setEnabled = trpc.devices.setEnabled.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(vars.enabled ? 'Device enabled' : 'Device disabled');
      void utils.devices.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const refreshConn = trpc.devices.refreshStatus.useMutation({
    onSuccess: (r) => {
      if (r.currentStatus === 'online') toast.success(r.hint);
      else toast.warning(r.hint);
      void utils.devices.get.invalidate();
      void utils.devices.notifications.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const d = device.data as DeviceRow | null | undefined;
  const settings = d?.settings?.deviceOptions ?? {};

  const [form, setForm] = useState<Record<string, unknown>>({});
  function set<K extends string>(key: K, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function eff<T>(key: string, fallback: T): T {
    if (form[key] !== undefined) return form[key] as T;
    if (settings && key in settings) return settings[key] as T;
    return fallback;
  }
  const isDirty = Object.values(form).some((v) => v !== undefined);

  const [maintenanceTarget, setMaintenanceTarget] = useState<{
    kind: MaintenanceKind;
    title: string;
    description: string;
    label: string;
  } | null>(null);
  const [rebootOpen, setRebootOpen] = useState(false);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Tenant', href: `/t/${slug}/dashboard` },
          { label: 'Devices', href: `/t/${slug}/devices` },
          { label: d?.name ?? 'Device', href: `/t/${slug}/devices/${id}` },
          { label: 'Settings' },
        ]}
        title="Device settings"
        description={d ? `${d.modelLabel} · ${d.firmware_version ?? 'firmware unknown'} · ${d.serial_number}` : ''}
        actions={
          <div className="flex gap-2">
            {d && (
              <>
                <Button
                  variant="outline"
                  onClick={() => refreshConn.mutate({ tenantSlug: slug, deviceId: id })}
                  disabled={refreshConn.isPending}
                  title="Re-check the latest heartbeat — flips the device back to online if it's been polling silently"
                >
                  <RefreshCw className={cn('mr-2 h-4 w-4', refreshConn.isPending && 'animate-spin')} />
                  Refresh
                </Button>
                <Button
                  variant={d.enabled ? 'outline' : 'default'}
                  onClick={() => setEnabled.mutate({ tenantSlug: slug, deviceId: id, enabled: !d.enabled })}
                >
                  <Power className="mr-2 h-4 w-4" />
                  {d.enabled ? 'Pause device' : 'Resume device'}
                </Button>
              </>
            )}
            <Button variant="outline" asChild>
              <Link href={`/t/${slug}/devices/${id}`}>← Device</Link>
            </Button>
          </div>
        }
      />
      <main className="flex-1 px-6 py-6">
        {!d ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div>
            {d.status !== 'online' && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <WifiOff className="mt-0.5 h-5 w-5 text-amber-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">Device is {d.status} — settings can&apos;t be pushed.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last heartbeat received{' '}
                      {d.clock.serverNowMs && d.clock.deviceLocalMs
                        ? // we don't have last_online directly here, use sidebar one
                          'a while ago'
                        : 'never'}
                      . Save buttons are disabled. The device will flip back to online automatically the moment its next heartbeat reaches us.
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      <li>Power-cycle the device, or check that its Wi-Fi / Ethernet link is up.</li>
                      <li>
                        Confirm on the device: <b>Menu → COMM → Cloud Server Setting</b> still points to{' '}
                        <code className="font-mono">192.168.68.104:8080</code> (or whatever your ADMS host is).
                      </li>
                      <li>
                        Click <b>Refresh</b> in the header — that re-checks the latest heartbeat and corrects the status if the device just came back.
                      </li>
                    </ul>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => refreshConn.mutate({ tenantSlug: slug, deviceId: id })}
                    disabled={refreshConn.isPending}
                  >
                    <RefreshCw className={cn('mr-2 h-4 w-4', refreshConn.isPending && 'animate-spin')} />
                    Re-check now
                  </Button>
                </div>
              </div>
            )}
            {settingsRebootHint && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <Power className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                  <div className="flex-1">
                    <p className="font-medium">
                      Settings stored — reboot to make them take effect on the device.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      SpeedFace V5L firmware writes the new values to its
                      config (verified by GET round-trip), but the live audio
                      / display / verify subsystems only read the config at
                      startup. A reboot is required for the change to be
                      visible on the device.
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSettingsRebootHint(false)}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setRebootOpen(true)}
                    >
                      <Power className="mr-1.5 h-3.5 w-3.5" /> Reboot now
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <Tabs defaultValue="time" className="space-y-4">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/30 p-1">
                <TabsTrigger value="time"><Clock className="mr-1.5 h-3.5 w-3.5" /> Time</TabsTrigger>
                <TabsTrigger value="display"><Monitor className="mr-1.5 h-3.5 w-3.5" /> Display</TabsTrigger>
                <TabsTrigger value="format"><CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Format</TabsTrigger>
                <TabsTrigger value="access"><LockKeyhole className="mr-1.5 h-3.5 w-3.5" /> Access</TabsTrigger>
                <TabsTrigger value="verify"><Shield className="mr-1.5 h-3.5 w-3.5" /> Verify</TabsTrigger>
                <TabsTrigger value="capabilities"><Fingerprint className="mr-1.5 h-3.5 w-3.5" /> Biometrics</TabsTrigger>
                <TabsTrigger value="push"><Radio className="mr-1.5 h-3.5 w-3.5" /> Push</TabsTrigger>
                <TabsTrigger value="maintenance"><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Maintenance</TabsTrigger>
              </TabsList>

              {/* ---- TIME ---- */}
              <TabsContent value="time" className="space-y-4">
                <TimeDriftCard timezone={d.timezone} drift={d.settings?.clockDrift ?? null} />
                <ManualTimeCard
                  tenantSlug={slug}
                  deviceId={id}
                  deviceLocalMs={d.clock.deviceLocalMs}
                  driftMeasuredAt={d.clock.driftMeasuredAt}
                  remoteSetSupported={d.protocol.setDateTime}
                />
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                  <p><b>Important:</b> we never auto-push time. Only the <b>Save &amp; push</b>
                  button on the card above sends time to the device, and only with the literal
                  value you typed. On SpeedFace V5L (ZAM170-NF firmware) the most reliable path
                  is still <b>setting the time directly on the device menu</b> (Menu → System →
                  Date Time → Manual Date and Time).</p>
                </div>
              </TabsContent>

              {/* ---- DISPLAY ---- */}
              <TabsContent value="display">
                <SectionCard icon={Monitor} title="Display & audio">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SliderField icon={Volume2} label="Volume" value={eff('volume', 70)} onChange={(v) => set('volume', v)} min={0} max={100} suffix="%" />
                    <SliderField icon={Sun} label="Brightness" value={eff('brightness', 80)} onChange={(v) => set('brightness', v)} min={1} max={100} suffix="%" />
                    <SelectField icon={Languages} label="UI Language" value={String(eff('languageId', 69))} onChange={(v) => set('languageId', Number(v))} options={LANGUAGES.map((l) => ({ value: String(l.id), label: l.label }))} />
                    <ToggleField icon={Mic} label="Voice prompts" value={eff('voicePromptOn', true)} onChange={(v) => set('voicePromptOn', v)} />
                    <SliderField label="Idle screensaver" value={eff('idleDurationSec', 60)} onChange={(v) => set('idleDurationSec', v)} min={0} max={600} suffix="s" />
                    <SliderField label="Screen on duration" value={eff('lcdOnDurationSec', 120)} onChange={(v) => set('lcdOnDurationSec', v)} min={0} max={3600} suffix="s" />
                  </div>
                </SectionCard>
                <SaveBar
                  isDirty={isDirty}
                  pending={updateOptions.isPending}
                  onSave={() => updateOptions.mutate({ tenantSlug: slug, deviceId: id, ...form })}
                  onDiscard={() => setForm({})}
                  disabled={d.status !== 'online'}
                  disabledReason={d.status !== 'online' ? `Device is ${d.status}` : undefined}
                />
              </TabsContent>

              {/* ---- FORMAT (date/time format) ---- */}
              <TabsContent value="format">
                <SectionCard icon={CalendarDays} title="Date & time format">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField label="Date format" value={eff('dateFormat', 'YYYY-MM-DD')} onChange={(v) => set('dateFormat', v)} options={DATE_FORMATS.map((d) => ({ value: d.value, label: d.label }))} />
                    <SelectField label="Time format" value={String(eff('timeFormat', 24))} onChange={(v) => set('timeFormat', Number(v))} options={[{ value: '24', label: '24-hour (13:45)' }, { value: '12', label: '12-hour (1:45 PM)' }]} />
                    <ToggleField label="Daylight Saving (DST)" value={eff('dstOn', false)} onChange={(v) => set('dstOn', v)} />
                  </div>
                </SectionCard>
                <SaveBar
                  isDirty={isDirty}
                  pending={updateOptions.isPending}
                  onSave={() => updateOptions.mutate({ tenantSlug: slug, deviceId: id, ...form })}
                  onDiscard={() => setForm({})}
                  disabled={d.status !== 'online'}
                  disabledReason={d.status !== 'online' ? `Device is ${d.status}` : undefined}
                />
              </TabsContent>

              {/* ---- ACCESS CONTROL ---- */}
              <TabsContent value="access">
                <SectionCard icon={LockKeyhole} title="Access control">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SliderField label="Lock open duration" value={eff('lockOpenDurationSec', 3)} onChange={(v) => set('lockOpenDurationSec', v)} min={1} max={10} suffix="s" />
                    <SliderField label="Door sensor delay" value={eff('doorSensorDelaySec', 10)} onChange={(v) => set('doorSensorDelaySec', v)} min={0} max={60} suffix="s" />
                    <SelectField label="Lock type" value={eff('lockType', 'NO')} onChange={(v) => set('lockType', v)} options={[{ value: 'NO', label: 'Normally Open (locked when energised)' }, { value: 'NC', label: 'Normally Closed' }]} />
                    <SelectField label="Anti-passback" value={String(eff('antiPassbackMode', 0))} onChange={(v) => set('antiPassbackMode', Number(v))} options={ANTIPASSBACK_MODES.map((m) => ({ value: String(m.value), label: m.label }))} />
                    <SliderField label="Duress key (0=off)" value={eff('duressKey', 0)} onChange={(v) => set('duressKey', v)} min={0} max={9} />
                    <ToggleField icon={ShieldAlert} label="Tamper alarm" value={eff('tamperAlarmOn', true)} onChange={(v) => set('tamperAlarmOn', v)} />
                  </div>
                </SectionCard>
                <SaveBar
                  isDirty={isDirty}
                  pending={updateOptions.isPending}
                  onSave={() => updateOptions.mutate({ tenantSlug: slug, deviceId: id, ...form })}
                  onDiscard={() => setForm({})}
                  disabled={d.status !== 'online'}
                  disabledReason={d.status !== 'online' ? `Device is ${d.status}` : undefined}
                />
              </TabsContent>

              {/* ---- VERIFY ---- */}
              <TabsContent value="verify">
                <SectionCard icon={Shield} title="Verification & matching">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField label="Verify mode" value={String(eff('verifyMode', 0))} onChange={(v) => set('verifyMode', Number(v))} options={VERIFY_MODES.map((m) => ({ value: String(m.value), label: m.label }))} />
                    <ToggleField label="Liveness detection (anti-spoofing)" value={eff('livenessOn', true)} onChange={(v) => set('livenessOn', v)} />
                    <SliderField icon={Fingerprint} label="Fingerprint 1:N threshold" value={eff('fpThreshold', 35)} onChange={(v) => set('fpThreshold', v)} min={0} max={100} />
                    <SliderField icon={Fingerprint} label="Fingerprint 1:1 threshold" value={eff('fp1to1Threshold', 15)} onChange={(v) => set('fp1to1Threshold', v)} min={0} max={100} />
                    <SliderField icon={ScanFace} label="Face 1:N threshold" value={eff('faceThreshold', 75)} onChange={(v) => set('faceThreshold', v)} min={0} max={100} />
                    <SliderField icon={ScanFace} label="Face 1:1 threshold" value={eff('face1to1Threshold', 65)} onChange={(v) => set('face1to1Threshold', v)} min={0} max={100} />
                    <SliderField icon={Hand} label="Palm threshold" value={eff('palmThreshold', 50)} onChange={(v) => set('palmThreshold', v)} min={0} max={100} />
                    <ToggleField label="Photo on verify" value={eff('photoOnVerify', false)} onChange={(v) => set('photoOnVerify', v)} />
                    <ToggleField label="Work-code prompt" value={eff('workCodeOn', false)} onChange={(v) => set('workCodeOn', v)} />
                  </div>
                </SectionCard>
                <SaveBar
                  isDirty={isDirty}
                  pending={updateOptions.isPending}
                  onSave={() => updateOptions.mutate({ tenantSlug: slug, deviceId: id, ...form })}
                  onDiscard={() => setForm({})}
                  disabled={d.status !== 'online'}
                  disabledReason={d.status !== 'online' ? `Device is ${d.status}` : undefined}
                />
              </TabsContent>

              {/* ---- CAPABILITIES ---- */}
              <TabsContent value="capabilities">
                <CapabilitiesCard tenantSlug={slug} deviceId={id} modelLabel={d.modelLabel} capabilities={d.capabilities} modalities={d.modalities} />
                <Card className="mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Pulled biometric data on device</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Stat label="Members" value={d.user_count ?? 0} />
                      <Stat label="Fingerprints" value={d.finger_count ?? 0} />
                      <Stat label="Faces" value={d.face_count ?? 0} />
                      <Stat label="Palms" value={d.palm_count ?? 0} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => queue.mutate({ tenantSlug: slug, deviceId: id, kind: 'query_users' })} disabled={queue.isPending}><Activity className="mr-2 h-4 w-4" />Query users</Button>
                      <Button size="sm" variant="outline" onClick={() => queue.mutate({ tenantSlug: slug, deviceId: id, kind: 'get_info' })} disabled={queue.isPending}><Activity className="mr-2 h-4 w-4" />Get info</Button>
                      <Button size="sm" variant="outline" onClick={() => queue.mutate({ tenantSlug: slug, deviceId: id, kind: 'get_options' })} disabled={queue.isPending}><Activity className="mr-2 h-4 w-4" />Get options</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ---- PUSH SETTINGS ---- */}
              <TabsContent value="push">
                <SectionCard icon={Radio} title="ADMS push behaviour">
                  <p className="mb-3 text-xs text-muted-foreground">
                    These control how the device talks to ZK Connect. Default values work for most installs — adjust only if you need different sync semantics.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SliderField label="Heartbeat interval" value={eff('heartbeatIntervalSec', 10)} onChange={(v) => set('heartbeatIntervalSec', v)} min={5} max={300} suffix="s" />
                    <ToggleField label="Real-time mode (push immediately, no batching)" value={eff('realtimeOn', true)} onChange={(v) => set('realtimeOn', v)} />
                    <FieldText
                      label="Trans flag (10-char binary)"
                      hint="Each bit controls what auto-uploads. 1111000000 = attendance + oplog + user + fp."
                      value={String(eff('transFlag', '1111000000'))}
                      onChange={(v) => set('transFlag', v)}
                      pattern="^[01]{10}$"
                    />
                    <FieldText
                      label="Bulk upload windows"
                      hint="Two daily windows when device performs bulk upload. Format HH:MM;HH:MM"
                      value={String(eff('transTimes', '00:00;14:05'))}
                      onChange={(v) => set('transTimes', v)}
                      pattern="^\d{2}:\d{2};\d{2}:\d{2}$"
                    />
                    <SliderField label="Bulk upload interval" value={eff('transIntervalMin', 1)} onChange={(v) => set('transIntervalMin', v)} min={1} max={60} suffix=" min" />
                  </div>
                </SectionCard>
                <SaveBar
                  isDirty={isDirty}
                  pending={updateOptions.isPending}
                  onSave={() => updateOptions.mutate({ tenantSlug: slug, deviceId: id, ...form })}
                  onDiscard={() => setForm({})}
                  disabled={d.status !== 'online'}
                  disabledReason={d.status !== 'online' ? `Device is ${d.status}` : undefined}
                />
              </TabsContent>

              {/* ---- MAINTENANCE ---- */}
              <TabsContent value="maintenance">
                <SectionCard icon={Trash2} title="Maintenance" tone="danger">
                  <p className="mb-4 text-sm text-muted-foreground">
                    Destructive actions. Each requires the tenant operator password + a written reason. Audit-logged.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <DangerBtn label="Clear attendance log" description="Wipes the device's local punch log only." onClick={() => setMaintenanceTarget({ kind: 'clear_att_log', title: 'Clear attendance log?', description: 'On-device log is wiped. Already-synced punches stay in ZK Connect.', label: 'Clear log' })} />
                    <DangerBtn label="Clear fingerprints" description="All fingerprint templates wiped." onClick={() => setMaintenanceTarget({ kind: 'clear_fingerprints', title: 'Clear all fingerprints?', description: 'All members must re-enroll fingerprints on the device. ZK Connect copies remain.', label: 'Clear fingerprints' })} />
                    <DangerBtn label="Clear face templates" description="All face templates wiped." onClick={() => setMaintenanceTarget({ kind: 'clear_faces', title: 'Clear all faces?', description: 'All members must re-enroll faces on the device.', label: 'Clear faces' })} />
                    <DangerBtn label="Clear palm templates" description="All palm templates wiped." onClick={() => setMaintenanceTarget({ kind: 'clear_palms', title: 'Clear all palms?', description: 'All members must re-enroll palms on the device.', label: 'Clear palms' })} />
                    <DangerBtn label="Clear photos" description="Attendance photos on the device." onClick={() => setMaintenanceTarget({ kind: 'clear_photos', title: 'Clear photos?', description: 'Attendance photos stored on the device are deleted.', label: 'Clear photos' })} />
                    <DangerBtn label="Clear admin users" description="Resets all admin privileges on the device." onClick={() => setMaintenanceTarget({ kind: 'clear_admins', title: 'Clear admins?', description: 'All admin privileges removed. Users become normal users.', label: 'Clear admins' })} />
                    <DangerBtn extreme label="Wipe ALL data" description="Everything — users, templates, log, photos." onClick={() => setMaintenanceTarget({ kind: 'clear_all_data', title: 'Wipe ALL data on device?', description: 'Erases users, templates, logs, photos. Cannot be undone. ZK Connect copies remain.', label: 'Wipe all' })} />
                    <DangerBtn extreme label="Factory reset" description="Resets including ADMS server pointer. Needs re-pairing." onClick={() => setMaintenanceTarget({ kind: 'factory_reset', title: 'Factory reset?', description: 'Resets the device including ADMS server pointer. You will need to physically re-pair.', label: 'Factory reset' })} />
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setRebootOpen(true)}>
                      <Power className="mr-2 h-4 w-4" /> Reboot device
                    </Button>
                  </div>
                </SectionCard>
              </TabsContent>
            </Tabs>
            </div>

            {/* Sidebar */}
            <aside className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Device</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <Row label="Name" value={d.name} />
                  <Row label="SN" value={<code className="font-mono text-xs">{d.serial_number}</code>} />
                  <Row label="Model" value={d.model ?? '—'} />
                  <Row label="Firmware family" value={d.firmware_family} />
                  <Row label="Status" value={<StatusPill status={d.status} />} />
                  <Row label="Active" value={d.enabled ? 'Yes' : <span className="text-amber-600">Paused</span>} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Recent commands</CardTitle>
                </CardHeader>
                <CardContent>
                  {!commands.data ? (
                    <p className="text-xs text-muted-foreground">Loading…</p>
                  ) : (commands.data as CommandRow[]).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No commands yet</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {(commands.data as CommandRow[]).map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span className="font-mono truncate">{c.command_type}</span>
                          <span
                            className={cn(
                              c.status === 'success' ? 'text-emerald-600' :
                              c.status === 'failed' ? 'text-red-600' :
                              c.status === 'pending' ? 'text-amber-600' :
                              'text-muted-foreground',
                            )}
                          >
                            {c.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </main>

      <OperatorPasswordModal
        open={!!maintenanceTarget}
        onOpenChange={(o) => !o && setMaintenanceTarget(null)}
        title={maintenanceTarget?.title ?? ''}
        description={maintenanceTarget?.description}
        destructiveLabel={maintenanceTarget?.label ?? 'Confirm'}
        pending={runMaintenance.isPending}
        onConfirm={async ({ operatorPassword, reason }) => {
          if (!maintenanceTarget) return;
          try {
            await runMaintenance.mutateAsync({
              tenantSlug: slug,
              deviceId: id,
              kind: maintenanceTarget.kind,
              operatorPassword,
              reason,
            });
            setMaintenanceTarget(null);
          } catch {}
        }}
      />

      <OperatorPasswordModal
        open={rebootOpen}
        onOpenChange={setRebootOpen}
        title="Reboot device?"
        description="The device will be offline for ~60 seconds, then come back with all pending config applied. Audit-logged."
        destructiveLabel="Reboot now"
        pending={queue.isPending}
        onConfirm={async ({ operatorPassword, reason }) => {
          try {
            await queue.mutateAsync({
              tenantSlug: slug,
              deviceId: id,
              kind: 'reboot',
              operatorPassword,
              reason,
            });
            toast.success('Reboot queued — device offline in ~5s, back in ~60s');
            setRebootOpen(false);
            setSettingsRebootHint(false);
          } catch {}
        }}
      />
    </>
  );
}

// ---- Small UI helpers ---------------------------------------------------
function SectionCard({ icon: Icon, title, children, tone }: { icon: React.ElementType; title: string; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <Card className={tone === 'danger' ? 'border-red-500/20' : ''}>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Icon className={'h-4 w-4 ' + (tone === 'danger' ? 'text-red-600' : 'text-muted-foreground')} />{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium text-right">{value}</dd></div>;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    online: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    offline: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
    disabled: 'bg-muted text-muted-foreground border-border',
    never_seen: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  };
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', map[status] ?? map.never_seen)}>{status}</span>;
}

function SliderField({ icon: Icon, label, value, onChange, min, max, suffix }: { icon?: React.ElementType; label: string; value: number; onChange: (v: number) => void; min: number; max: number; suffix?: string }) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-xs">{Icon && <Icon className="h-3.5 w-3.5" />}{label}: <span className="text-foreground font-mono">{value}{suffix}</span></Label>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </div>
  );
}

function SelectField({ icon: Icon, label, value, onChange, options }: { icon?: React.ElementType; label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-xs">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ToggleField({ icon: Icon, label, value, onChange }: { icon?: React.ElementType; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="flex items-center gap-2 text-xs">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</Label>
      <Button type="button" size="sm" variant={value ? 'default' : 'outline'} onClick={() => onChange(!value)}>{value ? 'On' : 'Off'}</Button>
    </div>
  );
}

function FieldText({ label, hint, value, onChange, pattern }: { label: string; hint?: string; value: string; onChange: (v: string) => void; pattern?: string }) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} pattern={pattern} className="font-mono text-sm" />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DangerBtn({ label, description, onClick, extreme }: { label: string; description: string; onClick: () => void; extreme?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={'flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors ' + (extreme ? 'border-red-500/30 hover:bg-red-500/10' : 'hover:bg-muted/30')}>
      <span className={'flex items-center gap-2 text-sm font-medium ' + (extreme ? 'text-red-600' : '')}>
        {extreme && <AlertTriangle className="h-3.5 w-3.5" />}{label}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function SaveBar({
  isDirty,
  pending,
  onSave,
  onDiscard,
  disabled,
  disabledReason,
}: {
  isDirty: boolean;
  pending: boolean;
  onSave: () => void;
  onDiscard: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  if (!isDirty) return null;
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
      <p className="text-sm flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-amber-500" /> Unsaved changes ready to push
        {disabled && disabledReason && (
          <span className="text-xs text-amber-700 dark:text-amber-400">· {disabledReason}</span>
        )}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onDiscard}>Discard</Button>
        <Button size="sm" onClick={onSave} disabled={pending || disabled} title={disabled ? disabledReason : undefined}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-4 w-4" />Push to device</>}
        </Button>
      </div>
    </div>
  );
}
