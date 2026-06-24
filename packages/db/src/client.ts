import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as platform from './schema/platform';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://zkc:zkc_dev@localhost:5432/zkc';

// Platform connection — uses default search_path (sees `platform` schema)
const platformSql = postgres(DATABASE_URL, { max: 10 });
export const platformDb = drizzle(platformSql, { schema: platform });

export function getPlatformSql() {
  return platformSql;
}

// Per-tenant connection cache. Each tenant gets a tiny pool with its
// search_path scoped to that tenant's schema, so all Drizzle queries
// resolve against the tenant's tables transparently.
const tenantPools = new Map<string, ReturnType<typeof postgres>>();

export function getTenantSql(schemaName: string) {
  let sql = tenantPools.get(schemaName);
  if (!sql) {
    sql = postgres(DATABASE_URL, {
      max: 5,
      connection: { search_path: `${schemaName}, public` },
    });
    tenantPools.set(schemaName, sql);
  }
  return sql;
}

export function getTenantDb(schemaName: string) {
  return drizzle(getTenantSql(schemaName));
}

export async function closeAll() {
  await platformSql.end();
  await Promise.all([...tenantPools.values()].map((s) => s.end()));
  tenantPools.clear();
}
