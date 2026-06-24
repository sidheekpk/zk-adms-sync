import { Hono } from 'hono';
import { queryAttendanceLogs, getAttendanceStats } from '../services/attendance.service.js';

const attendanceApi = new Hono();

attendanceApi.get('/', (c) => {
  const query = {
    from: c.req.query('from') || undefined,
    to: c.req.query('to') || undefined,
    deviceId: c.req.query('device_id') ? parseInt(c.req.query('device_id')!, 10) : undefined,
    deviceSN: c.req.query('device_sn') || undefined,
    pin: c.req.query('pin') || undefined,
    status: c.req.query('status') !== undefined ? parseInt(c.req.query('status')!, 10) : undefined,
    syncStatus: c.req.query('sync_status') || undefined,
    limit: c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 100,
    offset: c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : 0,
  };

  const logs = queryAttendanceLogs(query);
  return c.json({ attendance: logs, count: logs.length });
});

attendanceApi.get('/stats', (c) => {
  const stats = getAttendanceStats();
  return c.json({ stats });
});

export { attendanceApi };
