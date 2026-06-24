import { Hono } from 'hono';
import { getAllDevices, getDeviceById, updateDevice } from '../services/device.service.js';
import { db } from '../db/index.js';
import { locations } from '../db/schema.js';

const devicesApi = new Hono();

devicesApi.get('/', (c) => {
  const allDevices = getAllDevices();
  return c.json({ devices: allDevices });
});

devicesApi.get('/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const device = getDeviceById(id);
  if (!device) return c.json({ error: 'Device not found' }, 404);
  return c.json({ device });
});

devicesApi.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const device = getDeviceById(id);
  if (!device) return c.json({ error: 'Device not found' }, 404);

  const body = await c.req.json();
  const updates: Parameters<typeof updateDevice>[1] = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.locationId !== undefined) updates.locationId = body.locationId;
  if (body.heartbeatInterval !== undefined) updates.heartbeatInterval = body.heartbeatInterval;

  updateDevice(id, updates);
  return c.json({ device: getDeviceById(id) });
});

// Locations
devicesApi.get('/locations/all', (c) => {
  const all = db.select().from(locations).all();
  return c.json({ locations: all });
});

devicesApi.post('/locations', async (c) => {
  const body = await c.req.json();
  const result = db.insert(locations).values({
    name: body.name,
    address: body.address,
    timezone: body.timezone,
  }).returning().get();
  return c.json({ location: result }, 201);
});

export { devicesApi };
