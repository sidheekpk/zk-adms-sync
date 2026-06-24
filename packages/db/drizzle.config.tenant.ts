import { defineConfig } from 'drizzle-kit';

// Tenant-schema migrations. Generated once, then re-applied inside
// every tenant schema at provisioning time (search_path-scoped).
//
// Generate with:  npx drizzle-kit generate --config=drizzle.config.tenant.ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/tenant.ts',
  out: './migrations/tenant',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://zkc:zkc_dev@localhost:5432/zkc',
  },
  // Intentionally no schemaFilter — tenant tables are schema-less in
  // the schema file; their CREATE TABLE statements will be applied
  // inside whatever search_path the provisioner sets.
  verbose: true,
  strict: true,
});
