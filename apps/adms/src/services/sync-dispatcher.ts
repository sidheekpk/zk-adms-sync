import { logger } from '../utils/logger';

export interface SyncTarget {
  id: string;
  name: string;
  kind: string;
  endpoint: string;
  workspaceId: string | null;
  apiToken: string; // already decrypted
  retryPolicy: { maxAttempts?: number; baseDelayMs?: number };
}

export interface SyncResult {
  ok: boolean;
  httpStatus: number;
  body: string;
  durationMs: number;
  attempts: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;

export async function postSyncBatch(
  target: SyncTarget,
  payload: unknown,
): Promise<SyncResult> {
  const start = Date.now();
  const maxAttempts = target.retryPolicy.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelay = target.retryPolicy.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastBody = '';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.apiToken}`,
      };
      if (target.workspaceId) headers['X-Workspace-Id'] = target.workspaceId;

      const res = await fetch(target.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      lastStatus = res.status;
      lastBody = await res.text();

      if (res.ok) {
        return {
          ok: true,
          httpStatus: res.status,
          body: lastBody,
          durationMs: Date.now() - start,
          attempts: attempt,
        };
      }

      // 4xx is a permanent client error — don't retry
      if (res.status >= 400 && res.status < 500) {
        logger.warn(
          { target: target.name, status: res.status, body: lastBody.slice(0, 200) },
          'Sync target returned 4xx — not retrying',
        );
        break;
      }

      logger.warn(
        { target: target.name, attempt, status: res.status },
        'Sync target returned non-OK; will retry',
      );
    } catch (err) {
      lastBody = err instanceof Error ? err.message : String(err);
      logger.warn(
        { target: target.name, attempt, err },
        'Sync target threw; will retry',
      );
    }

    if (attempt < maxAttempts) {
      await sleep(baseDelay * Math.pow(2, attempt - 1));
    }
  }

  return {
    ok: false,
    httpStatus: lastStatus,
    body: lastBody,
    durationMs: Date.now() - start,
    attempts: maxAttempts,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
