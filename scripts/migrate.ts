import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const connectionString = process.env.DATABASE_ADMIN_URL;
if (!connectionString) throw new Error('DATABASE_ADMIN_URL is required');

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('etsy_saas_schema_migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const directory = resolve('database/migrations');
  const migrations = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  for (const version of migrations) {
    const exists = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [
      version,
    ]);
    if (exists.rowCount) continue;
    const sql = await readFile(resolve(directory, version), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      console.info(`Applied ${version}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('etsy_saas_schema_migrations'))");
  await client.end();
}
