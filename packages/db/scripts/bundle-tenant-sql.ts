/**
 * Bundles all SQL files under migrations/tenant/ into a single TS string
 * constant that can be imported and shipped to the bundler. Run after
 * `pnpm db:generate:tenant` to refresh.
 *
 *   pnpm --filter @zkc/db bundle:tenant-sql
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', 'migrations', 'tenant');
const outDir = path.resolve(here, '..', 'src', 'generated');
const outFile = path.join(outDir, 'tenant-ddl.ts');

async function run() {
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    throw new Error(`No SQL files in ${migrationsDir}`);
  }

  const parts: Array<{ filename: string; sql: string }> = [];
  for (const f of files) {
    const sql = await readFile(path.join(migrationsDir, f), 'utf8');
    parts.push({ filename: f, sql });
  }

  await mkdir(outDir, { recursive: true });

  const body = `// AUTO-GENERATED — do not edit by hand.
// Regenerate with:  pnpm --filter @zkc/db bundle:tenant-sql

export interface TenantMigration {
  filename: string;
  sql: string;
}

export const TENANT_MIGRATIONS: TenantMigration[] = ${JSON.stringify(parts, null, 2)};
`;

  await writeFile(outFile, body, 'utf8');
  console.log(`✓ wrote ${outFile} (${parts.length} migration${parts.length === 1 ? '' : 's'})`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
