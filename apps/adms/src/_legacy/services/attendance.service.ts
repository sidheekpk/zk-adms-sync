import { eq, and, gte, lte, desc, asc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { attendanceLogs } from '../db/schema.js';
import { logger } from '../utils/logger.js';
import type { AttendanceRecord } from '../adms/parser.js';

export async function storeAttendanceRecords(
  deviceId: number,
  deviceSN: string,
  records: AttendanceRecord[],
  sourceIp: string
): Promise<number> {
  let stored = 0;

  for (const record of records) {
    try {
      db.insert(attendanceLogs)
        .values({
          deviceId,
          deviceSN,
          pin: record.pin,
          timestamp: record.timestamp,
          status: record.status,
          verifyMode: record.verifyMode,
          workCode: record.workCode,
          rawData: record.rawLine,
          sourceIp,
        })
        .onConflictDoNothing()
        .run();
      stored++;
    } catch (err) {
      logger.warn({ err, record: record.rawLine }, 'Failed to store attendance record');
    }
  }

  return stored;
}

export interface AttendanceQuery {
  from?: string;
  to?: string;
  deviceId?: number;
  deviceSN?: string;
  pin?: string;
  status?: number;
  syncStatus?: string;
  limit?: number;
  offset?: number;
}

export function queryAttendanceLogs(query: AttendanceQuery) {
  const conditions = [];

  if (query.from) conditions.push(gte(attendanceLogs.timestamp, query.from));
  if (query.to) conditions.push(lte(attendanceLogs.timestamp, query.to));
  if (query.deviceId) conditions.push(eq(attendanceLogs.deviceId, query.deviceId));
  if (query.deviceSN) conditions.push(eq(attendanceLogs.deviceSN, query.deviceSN));
  if (query.pin) conditions.push(eq(attendanceLogs.pin, query.pin));
  if (query.status !== undefined) conditions.push(eq(attendanceLogs.status, query.status));
  if (query.syncStatus) conditions.push(eq(attendanceLogs.syncStatus, query.syncStatus));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db.select()
    .from(attendanceLogs)
    .where(where)
    .orderBy(desc(attendanceLogs.timestamp))
    .limit(query.limit || 100)
    .offset(query.offset || 0)
    .all();

  return rows;
}

export function getPendingAttendanceLogs(limit: number = 50) {
  return db.select()
    .from(attendanceLogs)
    .where(eq(attendanceLogs.syncStatus, 'pending'))
    .orderBy(asc(attendanceLogs.timestamp))
    .limit(limit)
    .all();
}

export function markLogsSynced(ids: number[]) {
  if (ids.length === 0) return;
  db.update(attendanceLogs)
    .set({ syncStatus: 'synced', syncedAt: new Date().toISOString() })
    .where(inArray(attendanceLogs.id, ids))
    .run();
}

export function markLogsFailed(ids: number[], error: string) {
  if (ids.length === 0) return;
  db.update(attendanceLogs)
    .set({
      syncStatus: sql`CASE WHEN ${attendanceLogs.syncAttempts} >= 3 THEN 'failed' ELSE 'pending' END`,
      syncAttempts: sql`${attendanceLogs.syncAttempts} + 1`,
      lastSyncError: error,
    })
    .where(inArray(attendanceLogs.id, ids))
    .run();
}

export function getAttendanceStats() {
  const today = new Date().toISOString().split('T')[0];

  const todayCount = db.select({ count: sql<number>`count(*)` })
    .from(attendanceLogs)
    .where(gte(attendanceLogs.timestamp, today))
    .get();

  const pending = db.select({ count: sql<number>`count(*)` })
    .from(attendanceLogs)
    .where(eq(attendanceLogs.syncStatus, 'pending'))
    .get();

  const synced = db.select({ count: sql<number>`count(*)` })
    .from(attendanceLogs)
    .where(eq(attendanceLogs.syncStatus, 'synced'))
    .get();

  const failed = db.select({ count: sql<number>`count(*)` })
    .from(attendanceLogs)
    .where(eq(attendanceLogs.syncStatus, 'failed'))
    .get();

  const total = db.select({ count: sql<number>`count(*)` })
    .from(attendanceLogs)
    .get();

  return {
    todayCount: todayCount?.count || 0,
    pendingCount: pending?.count || 0,
    syncedCount: synced?.count || 0,
    failedCount: failed?.count || 0,
    totalCount: total?.count || 0,
  };
}

export function getRecentAttendance(limit: number = 10) {
  return db.select()
    .from(attendanceLogs)
    .orderBy(desc(attendanceLogs.createdAt))
    .limit(limit)
    .all();
}
