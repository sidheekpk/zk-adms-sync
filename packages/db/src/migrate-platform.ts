import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const sql = postgres(url, { max: 1 });

async function run() {
  const dir = path.resolve(import.meta.dirname, '..', 'migrations', 'platform');

  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS platform`);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS platform._migrations (
      id serial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const existing = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM platform._migrations
      WHERE filename = ${file}
    `;
    if (Number(existing[0]?.count ?? 0) > 0) {
      console.log(`  ✓ already applied: ${file}`);
      continue;
    }
    let ddl = await readFile(path.join(dir, file), 'utf8');
    // Drizzle emits `CREATE SCHEMA "platform";` — make it idempotent.
    ddl = ddl.replace(/CREATE SCHEMA "platform";/g, 'CREATE SCHEMA IF NOT EXISTS "platform";');
    console.log(`→ applying ${file} (${ddl.length} bytes)`);
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`INSERT INTO platform._migrations (filename) VALUES (${file})`;
    });
    console.log(`  ✓ applied: ${file}`);
  }

  console.log('\nDone.');
  await sql.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
