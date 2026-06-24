import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { syncTargets, syncLog } from '../db/schema.js';

export function getAllSyncTargets() {
  return db.select().from(syncTargets).all();
}

export function getActiveSyncTargets() {
  return db.select().from(syncTargets).where(eq(syncTargets.isActive, true)).all();
}

export function getSyncTargetById(id: number) {
  return db.select().from(syncTargets).where(eq(syncTargets.id, id)).get();
}

export function createSyncTarget(data: {
  name: string;
  type?: string;
  url: string;
  method?: string;
  headers?: string;
  authType?: string;
  authValue?: string;
  payloadTemplate?: string;
  retryAttempts?: number;
  retryDelayMs?: number;
  batchSize?: number;
}) {
  return db.insert(syncTargets)
    .values(data)
    .returning()
    .get();
}

export function updateSyncTarget(id: number, data: Partial<{
  name: string;
  url: string;
  method: string;
  headers: string;
  authType: string;
  authValue: string;
  payloadTemplate: string;
  isActive: boolean;
  retryAttempts: number;
  retryDelayMs: number;
  batchSize: number;
}>) {
  db.update(syncTargets)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(syncTargets.id, id))
    .run();
}

export function deleteSyncTarget(id: number) {
  db.delete(syncTargets).where(eq(syncTargets.id, id)).run();
}

export function logSyncAttempt(data: {
  syncTargetId: number;
  recordCount: number;
  status: string;
  httpStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  durationMs?: number;
}) {
  return db.insert(syncLog).values(data).returning().get();
}

export function getSyncHistory(targetId?: number, limit: number = 50) {
  if (targetId) {
    return db.select()
      .from(syncLog)
      .where(eq(syncLog.syncTargetId, targetId))
      .orderBy(sql`${syncLog.createdAt} DESC`)
      .limit(limit)
      .all();
  }
  return db.select()
    .from(syncLog)
    .orderBy(sql`${syncLog.createdAt} DESC`)
    .limit(limit)
    .all();
}
