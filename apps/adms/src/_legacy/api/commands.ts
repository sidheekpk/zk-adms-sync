import { Hono } from 'hono';
import { queueCommand, getCommandHistory } from '../services/command.service.js';
import { getDeviceById } from '../services/device.service.js';
import * as cmdBuilder from '../adms/commands.js';

const commandsApi = new Hono();

commandsApi.get('/', (c) => {
  const deviceId = c.req.query('device_id') ? parseInt(c.req.query('device_id')!, 10) : undefined;
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
  const commands = getCommandHistory(limit, deviceId);
  return c.json({ commands });
});

commandsApi.post('/', async (c) => {
  const body = await c.req.json();
  const { deviceId, type, params } = body;

  const device = getDeviceById(deviceId);
  if (!device) return c.json({ error: 'Device not found' }, 404);

  let cmd: { id: number; command: string; type: string };

  switch (type) {
    case 'reboot':
      cmd = cmdBuilder.buildReboot();
      break;
    case 'sync_time':
      cmd = cmdBuilder.buildSyncTime(params?.unixSeconds);
      break;
    case 'clear_log':
      cmd = cmdBuilder.buildClearLog();
      break;
    case 'clear_data':
      cmd = cmdBuilder.buildClearData();
      break;
    case 'info':
      cmd = cmdBuilder.buildGetInfo();
      break;
    case 'get_options':
      cmd = cmdBuilder.buildGetOptions(params?.fields);
      break;
    case 'add_user':
      if (!params?.pin || !params?.name) {
        return c.json({ error: 'pin and name are required for add_user' }, 400);
      }
      cmd = cmdBuilder.buildAddUser(params);
      break;
    case 'delete_user':
      if (!params?.pin) return c.json({ error: 'pin is required for delete_user' }, 400);
      cmd = cmdBuilder.buildDeleteUser(params.pin);
      break;
    case 'query_users':
      cmd = cmdBuilder.buildQueryUsers();
      break;
    default:
      return c.json({ error: `Unknown command type: ${type}` }, 400);
  }

  const result = queueCommand(deviceId, cmd.type, cmd.command);
  return c.json({ command: result }, 201);
});

export { commandsApi };
