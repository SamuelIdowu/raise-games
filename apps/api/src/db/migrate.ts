/**
 * Release-step migrator (audit B6): `node dist/db/migrate.js`.
 *
 * Production images do not carry drizzle-kit (a dev dependency), so deploys apply the
 * committed SQL in `apps/api/drizzle` with drizzle-orm's migrator. It uses the same journal
 * table as `drizzle-kit migrate` (`drizzle.__drizzle_migrations`), so local, CI and deployed
 * databases share one history.
 *
 * Run it once per deploy, before new instances take traffic. Migrations are expand-then-
 * contract, so the old version keeps working against the migrated schema while it drains.
 * An advisory lock makes a second, accidental run wait instead of racing.
 *
 * Reads only DATABASE_URL, so the release step does not need the app's other secrets.
 */
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const MIGRATION_LOCK = 724_001; // arbitrary, unique to this job

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  // dist/db/migrate.js and src/db/migrate.ts both sit two levels below apps/api.
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const started = Date.now();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await migrate(drizzle(client), { migrationsFolder });
    console.log(`migrations applied from ${migrationsFolder} in ${Date.now() - started} ms`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('migration failed:', error);
  process.exit(1);
});
