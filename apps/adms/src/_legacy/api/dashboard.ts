import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { devices, attendanceLogs } from '../db/schema.js';
import { getAttendanceStats } from '../services/attendance.service.js';
import { sseManager } from '../sse/manager.js';

const dashboardApi = new Hono();

dashboardApi.get('/stats', (c) => {
  const devicesOnline = db.select({ count: sql<number>`count(*)` })
    .from(devices).where(sql`is_online = 1`).get();
  const devicesTotal = db.select({ count: sql<number>`count(*)` })
    .from(devices).get();

  const attStats = getAttendanceStats();

  return c.json({
    devices: {
      online: devicesOnline?.count || 0,
      total: devicesTotal?.count || 0,
    },
    attendance: attStats,
    sseClients: sseManager.clientCount,
  });
});

// SSE endpoint for real-time events
dashboardApi.get('/sse', (c) => {
  const clientId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      sseManager.addClient(clientId, controller);

      // Send initial keepalive
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(': connected\n\n'));
    },
    cancel() {
      sseManager.removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

export { dashboardApi };
