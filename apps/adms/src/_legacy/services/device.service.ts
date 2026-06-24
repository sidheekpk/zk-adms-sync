import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { devices } from '../db/schema.js';
import { logger } from '../utils/logger.js';

export interface DeviceRegistrationInfo {
  pushver?: string;
  deviceType?: string;
  ip?: string;
  language?: string;
  platform?: string;
}

export async function registerOrUpdateDevice(serialNumber: string, info: DeviceRegistrationInfo) {
  const now = new Date().toISOString();
  const existing = db.select().from(devices).where(eq(devices.serialNumber, serialNumber)).get();

  if (existing) {
    db.update(devices)
      .set({
        ipAddress: info.ip || existing.ipAddress,
        pushVersion: info.pushver || existing.pushVersion,
        deviceType: info.deviceType || existing.deviceType,
        platform: info.platform || existing.platform,
        lastOnline: now,
        isOnline: true,
        updatedAt: now,
      })
      .where(eq(devices.id, existing.id))
      .run();

    logger.info({ sn: serialNumber }, 'Device reconnected');
    return existing;
  }

  const result = db.insert(devices)
    .values({
      serialNumber,
      ipAddress: info.ip,
      pushVersion: info.pushver,
      deviceType: info.deviceType,
      platform: info.platform,
      lastOnline: now,
      isOnline: true,
    })
    .returning()
    .get();

  logger.info({ sn: serialNumber, id: result.id }, 'New device auto-registered');
  return result;
}

export function getDeviceBySN(serialNumber: string) {
  return db.select().from(devices).where(eq(devices.serialNumber, serialNumber)).get();
}

export function getDeviceById(id: number) {
  return db.select().from(devices).where(eq(devices.id, id)).get();
}

export function getAllDevices() {
  return db.select().from(devices).all();
}

export function updateDeviceOnline(serialNumber: string) {
  const now = new Date().toISOString();
  db.update(devices)
    .set({ lastOnline: now, isOnline: true, updatedAt: now })
    .where(eq(devices.serialNumber, serialNumber))
    .run();
}

export function updateDevice(id: number, data: Partial<{
  name: string;
  locationId: number | null;
  heartbeatInterval: number;
}>) {
  db.update(devices)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(devices.id, id))
    .run();
}

export function getDeviceStamps(serialNumber: string): { lastStamp: string; lastOpStamp: string } {
  const device = getDeviceBySN(serialNumber);
  return {
    lastStamp: device?.lastStamp || '9999',
    lastOpStamp: device?.lastOpStamp || '9999',
  };
}

export function updateDeviceStamp(serialNumber: string, stamp: string, type: 'att' | 'op') {
  const field = type === 'att' ? { lastStamp: stamp } : { lastOpStamp: stamp };
  db.update(devices)
    .set({ ...field, updatedAt: new Date().toISOString() })
    .where(eq(devices.serialNumber, serialNumber))
    .run();
}
