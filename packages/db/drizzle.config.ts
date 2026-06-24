import { defineConfig } from 'drizzle-kit';

// Platform-schema migrations. Apply once to the cluster.
// (Tenant migrations use drizzle.config.tenant.ts.)
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/platform.ts',
  out: './migrations/platform',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://zkc:zkc_dev@localhost:5432/zkc',
  },
  schemaFilter: ['platform'],
  verbose: true,
  strict: true,
});
