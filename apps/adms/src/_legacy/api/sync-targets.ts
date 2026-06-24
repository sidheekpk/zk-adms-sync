import { Hono } from 'hono';
import {
  getAllSyncTargets,
  getSyncTargetById,
  createSyncTarget,
  updateSyncTarget,
  deleteSyncTarget,
  getSyncHistory,
} from '../services/sync.service.js';
import { runSyncCycle } from '../sync/worker.js';

const syncTargetsApi = new Hono();

syncTargetsApi.get('/', (c) => {
  const targets = getAllSyncTargets();
  return c.json({ syncTargets: targets });
});

syncTargetsApi.get('/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const target = getSyncTargetById(id);
  if (!target) return c.json({ error: 'Sync target not found' }, 404);
  return c.json({ syncTarget: target });
});

syncTargetsApi.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.name || !body.url) {
    return c.json({ error: 'name and url are required' }, 400);
  }
  const target = createSyncTarget(body);
  return c.json({ syncTarget: target }, 201);
});

syncTargetsApi.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const existing = getSyncTargetById(id);
  if (!existing) return c.json({ error: 'Sync target not found' }, 404);

  const body = await c.req.json();
  updateSyncTarget(id, body);
  return c.json({ syncTarget: getSyncTargetById(id) });
});

syncTargetsApi.delete('/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const existing = getSyncTargetById(id);
  if (!existing) return c.json({ error: 'Sync target not found' }, 404);
  deleteSyncTarget(id);
  return c.json({ message: 'Deleted' });
});

// Test a sync target with sample data
syncTargetsApi.post('/:id/test', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const target = getSyncTargetById(id);
  if (!target) return c.json({ error: 'Sync target not found' }, 404);

  const { syncToTarget } = await import('../sync/dispatcher.js');
  const sampleRecords = [{
    id: 0,
    deviceSN: 'TEST001',
    pin: '1001',
    timestamp: new Date().toISOString(),
    status: 0,
    verifyMode: 1,
    workCode: '0',
  }];

  const result = await syncToTarget(target, sampleRecords);
  return c.json({ result });
});

// Sync history
syncTargetsApi.get('/:id/history', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
  const history = getSyncHistory(id, limit);
  return c.json({ history });
});

// Manual sync trigger
syncTargetsApi.post('/trigger/now', async (c) => {
  await runSyncCycle();
  return c.json({ message: 'Sync cycle triggered' });
});

export { syncTargetsApi };
