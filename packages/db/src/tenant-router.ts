import postgres from 'postgres';
import { platformDb, getTenantSql, getTenantDb } from './client';
import { tenants } from './schema/platform';
import { eq } from 'drizzle-orm';
import { TENANT_MIGRATIONS } from './generated/tenant-ddl';

const SCHEMA_NAME_RE = /^t_[a-z0-9_]{1,60}$/;

export function tenantSchemaName(slug: string): string {
  const clean = slug.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
  const name = `t_${clean}`;
  if (!SCHEMA_NAME_RE.test(name)) {
    throw new Error(`Invalid tenant schema name derived from slug "${slug}"`);
  }
  return name;
}

/**
 * Rewrites the drizzle-generated DDL to drop the hardcoded "public"
 * schema qualifier on every CREATE TYPE / REFERENCES / etc., so the
 * statements resolve against whatever search_path the provisioner sets.
 */
function rewriteForSchema(sql: string, _schemaName: string): string {
  return sql.replace(/"public"\./g, '');
}

/**
 * Creates a fresh Postgres schema for a new tenant and applies the
 * generated tenant migration SQL inside it. Idempotent.
 */
export async function provisionTenantSchema(schemaName: string) {
  if (!SCHEMA_NAME_RE.test(schemaName)) {
    throw new Error(`Invalid tenant schema name: ${schemaName}`);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 1 });

  try {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"._migrations (
        id serial PRIMARY KEY,
        filename text NOT NULL UNIQUE,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const { filename, sql: rawDdl } of TENANT_MIGRATIONS) {
      const existing = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM ${sql(schemaName)}._migrations
        WHERE filename = ${filename}
      `;
      if (Number(existing[0]?.count ?? 0) > 0) continue;

      const ddl = rewriteForSchema(rawDdl, schemaName);
      await sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`);
        await tx.unsafe(ddl);
        await tx.unsafe(
          `INSERT INTO "${schemaName}"._migrations (filename) VALUES ('${filename.replace(/'/g, "''")}')`,
        );
      });
    }
  } finally {
    await sql.end();
  }
}

/** Drop the tenant schema entirely. Used by tenant.delete + tests. */
export async function dropTenantSchema(schemaName: string) {
  if (!SCHEMA_NAME_RE.test(schemaName)) {
    throw new Error(`Invalid tenant schema name: ${schemaName}`);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 1 });
  try {
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await sql.end();
  }
}

/** Look up a tenant by slug and return both the row and a Drizzle handle. */
export async function getTenant(slug: string) {
  const [tenant] = await platformDb
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!tenant) return null;
  return {
    tenant,
    db: getTenantDb(tenant.schemaName),
    sql: getTenantSql(tenant.schemaName),
  };
}
