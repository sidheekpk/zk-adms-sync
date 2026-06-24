import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { deviceCommands, devices } from '../db/schema.js';
import { logger } from '../utils/logger.js';

let globalCommandId = 0;

function initCommandCounter() {
  const max = db.select({ max: sql<number>`COALESCE(MAX(command_id), 0)` })
    .from(deviceCommands)
    .get();
  globalCommandId = max?.max || 0;
}

export function getNextCommandId(): number {
  if (globalCommandId === 0) initCommandCounter();
  return ++globalCommandId;
}

export function queueCommand(deviceId: number, commandType: string, commandStr: string) {
  const cmdId = getNextCommandId();
  const command = commandStr.replace(/C:\d+:/, `C:${cmdId}:`);

  const result = db.insert(deviceCommands)
    .values({
      deviceId,
      commandId: cmdId,
      command,
      commandType,
      status: 'pending',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    })
    .returning()
    .get();

  logger.info({ deviceId, cmdId, type: commandType }, 'Command queued');
  return result;
}

export function getPendingCommandsForDevice(serialNumber: string) {
  const device = db.select().from(devices).where(eq(devices.serialNumber, serialNumber)).get();
  if (!device) return [];

  return db.select()
    .from(deviceCommands)
    .where(and(
      eq(deviceCommands.deviceId, device.id),
      eq(deviceCommands.status, 'pending'),
    ))
    .all();
}

export function markCommandsSent(ids: number[]) {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  for (const id of ids) {
    db.update(deviceCommands)
      .set({ status: 'sent', sentAt: now })
      .where(eq(deviceCommands.id, id))
      .run();
  }
}

export function processCommandResult(serialNumber: string, commandId: number, returnCode: number, cmd: string) {
  const device = db.select().from(devices).where(eq(devices.serialNumber, serialNumber)).get();
  if (!device) return;

  const status = returnCode === 0 ? 'success' : 'failed';
  const now = new Date().toISOString();

  db.update(deviceCommands)
    .set({
      status,
      returnCode,
      completedAt: now,
      responseData: cmd,
    })
    .where(and(
      eq(deviceCommands.deviceId, device.id),
      eq(deviceCommands.commandId, commandId),
    ))
    .run();

  logger.info({ sn: serialNumber, commandId, returnCode, status }, 'Command result processed');
}

export function getCommandHistory(limit: number = 50, deviceId?: number) {
  if (deviceId) {
    return db.select()
      .from(deviceCommands)
      .where(eq(deviceCommands.deviceId, deviceId))
      .orderBy(sql`${deviceCommands.createdAt} DESC`)
      .limit(limit)
      .all();
  }

  return db.select()
    .from(deviceCommands)
    .orderBy(sql`${deviceCommands.createdAt} DESC`)
    .limit(limit)
    .all();
}
