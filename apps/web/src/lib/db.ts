import { platformDb } from '@zkc/db/client';
import * as platform from '@zkc/db/platform';

// Re-export the platform Drizzle handle and the schema namespace so
// Better Auth's drizzle adapter and our tRPC routers can reach them
// through a single import path.
export const db = platformDb;
export { platform };
