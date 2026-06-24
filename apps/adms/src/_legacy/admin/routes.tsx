import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from '../utils/config.js';
import { generateSessionId } from '../utils/crypto.js';
import { getAllDevices, getDeviceById } from '../services/device.service.js';
import { queryAttendanceLogs, getAttendanceStats, getRecentAttendance } from '../services/attendance.service.js';
import { queueCommand, getCommandHistory } from '../services/command.service.js';
import { getAllSyncTargets, createSyncTarget, updateSyncTarget, deleteSyncTarget, getSyncHistory, getSyncTargetById } from '../services/sync.service.js';
import { syncToTarget } from '../sync/dispatcher.js';
import { runSyncCycle } from '../sync/worker.js';
import * as cmdBuilder from '../adms/commands.js';
import { db } from '../db/index.js';
import { devices as devicesTable } from '../db/schema.js';
import { sql } from 'drizzle-orm';

import { LoginPage } from './pages/login.js';
import { DashboardPage } from './pages/dashboard.js';
import { DevicesPage, DeviceDetailPage } from './pages/devices.js';
import { AttendancePage } from './pages/attendance.js';
import { LiveFeedPage } from './pages/live.js';
import { SyncPage } from './pages/sync.js';
import { CommandsPage } from './pages/commands.js';

const admin = new Hono();

// Simple session store (in-memory, resets on restart)
const sessions = new Set<string>();

// Auth check helper
function isAuthenticated(c: any): boolean {
  const session = getCookie(c, 'zk_session');
  return !!session && sessions.has(session);
}

// Auth middleware - applied to all routes, skips login paths
admin.use('*', async (c: any, next: any) => {
  const path = c.req.path;
  // Skip auth for login/logout pages
  if (path === '/admin/login' || path === '/admin/logout') {
    return next();
  }
  if (!isAuthenticated(c)) {
    return c.redirect('/admin/login');
  }
  await next();
});

// Login
admin.get('/login', (c) => {
  return c.html(<LoginPage />);
});

admin.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const { username, password } = body;

  if (username === config.ADMIN_USERNAME && password === config.ADMIN_PASSWORD) {
    const sessionId = generateSessionId();
    sessions.add(sessionId);
    setCookie(c, 'zk_session', sessionId, {
      httpOnly: true,
      path: '/',
      maxAge: 86400, // 24 hours
      sameSite: 'Lax',
    });
    return c.redirect('/admin/dashboard');
  }

  return c.html(<LoginPage error="Invalid username or password" />);
});

admin.get('/logout', (c) => {
  const session = getCookie(c, 'zk_session');
  if (session) sessions.delete(session);
  deleteCookie(c, 'zk_session');
  return c.redirect('/admin/login');
});

// Dashboard
admin.get('/', (c) => c.redirect('/admin/dashboard'));
admin.get('/dashboard', (c) => {
  const devicesOnline = db.select({ count: sql<number>`count(*)` })
    .from(devicesTable).where(sql`is_online = 1`).get();
  const devicesTotal = db.select({ count: sql<number>`count(*)` })
    .from(devicesTable).get();
  const attStats = getAttendanceStats();
  const recentLogs = getRecentAttendance(10);

  return c.html(
    <DashboardPage
      stats={{
        devicesOnline: devicesOnline?.count || 0,
        devicesTotal: devicesTotal?.count || 0,
        ...attStats,
      }}
      recentLogs={recentLogs}
    />
  );
});

// Devices
admin.get('/devices', (c) => {
  const allDevices = getAllDevices();
  return c.html(<DevicesPage devices={allDevices} />);
});

admin.get('/devices/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const device = getDeviceById(id);
  if (!device) return c.redirect('/admin/devices');

  const attendance = queryAttendanceLogs({ deviceId: id, limit: 20 });
  const commands = getCommandHistory(20, id);

  return c.html(<DeviceDetailPage device={device} attendance={attendance} commands={commands} />);
});

admin.post('/devices/:id/command', async (c) => {
  const deviceId = parseInt(c.req.param('id'), 10);
  const body = await c.req.parseBody();
  const type = body.type as string;

  let cmd: { id: number; command: string; type: string };
  switch (type) {
    case 'reboot': cmd = cmdBuilder.buildReboot(); break;
    case 'sync_time': cmd = cmdBuilder.buildSyncTime(); break;
    case 'info': cmd = cmdBuilder.buildGetInfo(); break;
    case 'get_options': cmd = cmdBuilder.buildGetOptions(); break;
    default: return c.redirect(`/admin/devices/${deviceId}`);
  }

  queueCommand(deviceId, cmd.type, cmd.command);
  return c.redirect(`/admin/devices/${deviceId}`);
});

// Attendance
admin.get('/attendance', (c) => {
  const filters = {
    from: c.req.query('from') || undefined,
    to: c.req.query('to') || undefined,
    pin: c.req.query('pin') || undefined,
    device_sn: c.req.query('device_sn') || undefined,
    sync_status: c.req.query('sync_status') || undefined,
  };

  const logs = queryAttendanceLogs({
    from: filters.from ? filters.from + 'T00:00:00' : undefined,
    to: filters.to ? filters.to + 'T23:59:59' : undefined,
    pin: filters.pin,
    deviceSN: filters.device_sn,
    syncStatus: filters.sync_status,
    limit: 200,
  });

  const allDevices = getAllDevices();

  return c.html(<AttendancePage logs={logs} filters={filters} devices={allDevices} />);
});

// Live Feed
admin.get('/live', (c) => {
  return c.html(<LiveFeedPage />);
});

// Sync
admin.get('/sync', (c) => {
  const targets = getAllSyncTargets();
  const history = getSyncHistory(undefined, 50);
  return c.html(<SyncPage targets={targets} history={history} />);
});

admin.post('/sync', async (c) => {
  const body = await c.req.parseBody();
  createSyncTarget({
    name: body.name as string,
    url: body.url as string,
    authType: (body.authType as string) || 'none',
    authValue: (body.authValue as string) || undefined,
    batchSize: body.batchSize ? parseInt(body.batchSize as string, 10) : 50,
  });
  return c.redirect('/admin/sync');
});

admin.post('/sync/:id/toggle', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const target = getSyncTargetById(id);
  if (target) updateSyncTarget(id, { isActive: !target.isActive });
  return c.redirect('/admin/sync');
});

admin.post('/sync/:id/delete', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  deleteSyncTarget(id);
  return c.redirect('/admin/sync');
});

admin.post('/sync/:id/test', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const target = getSyncTargetById(id);
  if (target) {
    await syncToTarget(target, [{
      id: 0, deviceSN: 'TEST001', pin: '1001',
      timestamp: new Date().toISOString(), status: 0, verifyMode: 1, workCode: '0',
    }]);
  }
  return c.redirect('/admin/sync');
});

admin.post('/sync/trigger', async (c) => {
  await runSyncCycle();
  return c.redirect('/admin/sync');
});

// Commands
admin.get('/commands', (c) => {
  const commands = getCommandHistory(100);
  const allDevices = getAllDevices();
  return c.html(<CommandsPage commands={commands} devices={allDevices} />);
});

admin.post('/commands', async (c) => {
  const body = await c.req.parseBody();
  const deviceId = parseInt(body.deviceId as string, 10);
  const type = body.type as string;

  let params: Record<string, unknown> = {};
  try {
    if (body.params) params = JSON.parse(body.params as string);
  } catch { /* ignore */ }

  let cmd: { id: number; command: string; type: string };
  switch (type) {
    case 'reboot': cmd = cmdBuilder.buildReboot(); break;
    case 'sync_time': cmd = cmdBuilder.buildSyncTime(); break;
    case 'info': cmd = cmdBuilder.buildGetInfo(); break;
    case 'get_options': cmd = cmdBuilder.buildGetOptions(); break;
    case 'clear_log': cmd = cmdBuilder.buildClearLog(); break;
    case 'query_users': cmd = cmdBuilder.buildQueryUsers(); break;
    default: return c.redirect('/admin/commands');
  }

  queueCommand(deviceId, cmd.type, cmd.command);
  return c.redirect('/admin/commands');
});

export { admin };
