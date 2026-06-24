import type { Context, Next } from 'hono';
import { config } from '../utils/config.js';

export async function apiKeyAuth(c: Context, next: Next) {
  const apiKey = c.req.header('X-API-Key');

  if (!apiKey || apiKey !== config.API_KEY) {
    return c.json({ error: 'Unauthorized', message: 'Invalid or missing API key' }, 401);
  }

  await next();
}
