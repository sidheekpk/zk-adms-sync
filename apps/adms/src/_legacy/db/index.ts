import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const sqlite: DatabaseType = new Database(config.DATABASE_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');

logger.info({ path: config.DATABASE_PATH }, 'Database connected');

export const db = drizzle(sqlite, { schema });
export { sqlite };
