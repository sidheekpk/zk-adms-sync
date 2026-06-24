import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index.js';
import { logger } from '../utils/logger.js';

logger.info('Running database migrations...');

migrate(db, { migrationsFolder: './drizzle' });

logger.info('Migrations complete');
process.exit(0);
