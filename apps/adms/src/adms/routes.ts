import { Hono } from 'hono';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  handleHandshake,
  handleDataUpload,
  handleHeartbeat,
  handleCommandResult,
} from './handler';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

const adms = new Hono();

if (config.RAW_DUMP_ENABLED) {
  await mkdir(path.dirname(config.RAW_DUMP_FILE), { recursive: true }).catch(() => {});
  adms.use('*', async (c, next) => {
    const ts = new Date().toISOString();
    const method = c.req.method;
    const url = c.req.url;
    const headers = Object.fromEntries(c.req.raw.headers.entries());
    let body = '';
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        body = await c.req.raw.clone().text();
      } catch {}
    }
    const entry =
      `\n===== ${ts} =====\n` +
      `${method} ${url}\n` +
      `HEADERS: ${JSON.stringify(headers)}\n` +
      (body ? `BODY:\n${body}\n` : `BODY: <empty>\n`);
    appendFile(config.RAW_DUMP_FILE, entry).catch((err) =>
      logger.error({ err }, 'raw dump write failed'),
    );
    await next();
  });
}

function clientIp(headerForwardFor: string | undefined, headerRealIp: string | undefined): string | null {
  return (
    headerForwardFor?.split(',')[0]?.trim() ??
    headerRealIp ??
    null
  );
}

adms.get('/cdata', async (c) => {
  const sn = c.req.query('SN');
  const options = c.req.query('options');
  if (!sn) return c.text('ERROR', 400);

  if (options === 'all') {
    const response = await handleHandshake(sn, {
      pushver: c.req.query('pushver'),
      deviceType: c.req.query('DeviceType'),
      language: c.req.query('language'),
      ip: clientIp(c.req.header('x-forwarded-for'), c.req.header('x-real-ip')),
    });
    return c.text(response, 200, { 'Content-Type': 'text/plain' });
  }
  return c.text('OK');
});

adms.post('/cdata', async (c) => {
  const sn = c.req.query('SN');
  const table = c.req.query('table') || undefined;
  const stamp = c.req.query('Stamp') || undefined;
  if (!sn) return c.text('ERROR', 400);

  const body = await c.req.text();
  const ip = clientIp(c.req.header('x-forwarded-for'), c.req.header('x-real-ip'));

  handleDataUpload(sn, table, stamp, body, ip).catch((err) =>
    logger.error({ err, sn, table }, 'Data upload failed'),
  );
  return c.text('OK');
});

adms.get('/getrequest', async (c) => {
  const sn = c.req.query('SN');
  const info = c.req.query('INFO') ?? null;
  if (!sn) return c.text('ERROR', 400);

  const response = await handleHeartbeat(sn, info);
  return c.text(response);
});

adms.post('/devicecmd', async (c) => {
  const sn = c.req.query('SN');
  if (!sn) return c.text('ERROR', 400);

  const body = await c.req.text();
  handleCommandResult(sn, body).catch((err) =>
    logger.error({ err, sn }, 'Command result processing failed'),
  );
  return c.text('OK');
});

adms.post('/fdata', async (c) => {
  const sn = c.req.query('SN');
  if (!sn) return c.text('ERROR', 400);
  const body = await c.req.text();
  const ip = clientIp(c.req.header('x-forwarded-for'), c.req.header('x-real-ip'));
  const { handleFData } = await import('./fdata-handler');
  handleFData(sn, body, ip).catch((err) =>
    logger.error({ err, sn }, '/fdata processing failed'),
  );
  return c.text('OK');
});

export { adms };
