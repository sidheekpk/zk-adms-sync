import { logger } from '../utils/logger.js';

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; delayMs: number; label: string }
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < opts.attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < opts.attempts - 1) {
        const delay = opts.delayMs * Math.pow(2, i); // Exponential backoff
        logger.warn({ attempt: i + 1, delay, label: opts.label }, 'Retry after failure');
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
