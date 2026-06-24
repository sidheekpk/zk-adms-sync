import { logger } from '../utils/logger.js';
import { transformToDefaultPayload, applyTemplate, type RawAttendanceRow } from './transformer.js';

export interface SyncTarget {
  id: number;
  name: string;
  url: string;
  method: string | null;
  headers: string | null;
  authType: string | null;
  authValue: string | null;
  payloadTemplate: string | null;
  batchSize: number | null;
}

export interface SyncResult {
  success: boolean;
  status: number;
  body: string;
  durationMs: number;
}

export async function syncToTarget(target: SyncTarget, records: RawAttendanceRow[]): Promise<SyncResult> {
  const startTime = Date.now();

  const payload = target.payloadTemplate
    ? applyTemplate(target.payloadTemplate, records)
    : transformToDefaultPayload(records);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...safeParseHeaders(target.headers),
  };

  if (target.authType === 'bearer' && target.authValue) {
    headers['Authorization'] = `Bearer ${target.authValue}`;
  } else if (target.authType === 'api_key' && target.authValue) {
    headers['X-API-Key'] = target.authValue;
  } else if (target.authType === 'basic' && target.authValue) {
    headers['Authorization'] = `Basic ${target.authValue}`;
  }

  try {
    const response = await fetch(target.url, {
      method: target.method || 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    const body = await response.text();
    const durationMs = Date.now() - startTime;

    logger.info({
      target: target.name,
      status: response.status,
      records: records.length,
      durationMs,
    }, 'Sync request completed');

    return {
      success: response.ok,
      status: response.status,
      body,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Unknown error';

    logger.error({ err, target: target.name }, 'Sync request failed');

    return {
      success: false,
      status: 0,
      body: message,
      durationMs,
    };
  }
}

function safeParseHeaders(headers: string | null): Record<string, string> {
  if (!headers) return {};
  try {
    return JSON.parse(headers);
  } catch {
    return {};
  }
}
