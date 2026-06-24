import { Hono } from 'hono';
import { apiKeyAuth } from './auth.js';
import { devicesApi } from './devices.js';
import { attendanceApi } from './attendance.js';
import { commandsApi } from './commands.js';
import { syncTargetsApi } from './sync-targets.js';
import { dashboardApi } from './dashboard.js';

const api = new Hono();

// All API routes require API key (except SSE which uses session)
api.use('/*', apiKeyAuth);

api.route('/devices', devicesApi);
api.route('/attendance', attendanceApi);
api.route('/commands', commandsApi);
api.route('/sync-targets', syncTargetsApi);
api.route('/dashboard', dashboardApi);

export { api };
