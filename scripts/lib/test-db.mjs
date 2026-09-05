// Test database bootstrap shared by every scripts/*-check.mjs.
//
// Default: a throwaway SQLite file (whatever the script put in DATABASE_URL),
// migrated with the SQLite migrator - exactly what the checks always did.
//
// TEST_DB_DRIVER=postgres: run the same checks against a DISPOSABLE Postgres
// database so dialect-only bugs surface before deploy. Production is Postgres
// and the 2026-09-04 event-ticket outage (an alias lower-cased by Postgres)
// was invisible to SQLite-only tests. The schema is dropped and recreated
// from server/migrations/postgres/*.sql for every script, then seeded with
// the same baseline rows the SQLite migrator seeds.
//
// Safety: this module refuses to touch anything that is not obviously a
// local/CI database. It will never run against a *.render.com host.
//
// IMPORTANT: import this module BEFORE server/src/database.js (the check
// scripts do), because database.js picks its driver from DB_DRIVER at load.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverFile = relative => pathToFileURL(path.join(repoRoot, 'server', 'src', relative));

export const driver = process.env.TEST_DB_DRIVER === 'postgres' ? 'postgres' : 'sqlite';
process.env.DB_DRIVER = driver;

if (driver === 'postgres') {
  const connectionString = process.env.DATABASE_URL_POSTGRES || '';
  let host = '';
  try { host = new URL(connectionString).hostname; } catch { host = ''; }
  const disposableHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);
  const explicitlyAllowed = process.env.TEST_DB_ALLOW_REMOTE_DROP === '1';
  if (!connectionString || /render\.com/i.test(connectionString) || (!disposableHosts.has(host) && !explicitlyAllowed)) {
    throw new Error(
      'test-db: refusing to run Postgres checks against a non-disposable database. ' +
      'Set DATABASE_URL_POSTGRES to a local/CI Postgres (host localhost/127.0.0.1/postgres). ' +
      `Got host "${host || '(unset)'}". The test harness DROPS the public schema.`
    );
  }
  if (!process.env.PGSSL) process.env.PGSSL = 'disable';
}

export async function prepareTestDatabase() {
  if (driver === 'sqlite') {
    const { migrate } = await import(serverFile('migrate.js'));
    await migrate();
    return { driver };
  }

  const pg = await import(serverFile('db/postgres.js'));
  // Fresh schema per script: the shim functions (datetime/strftime) and every
  // table come back from 001_initial_schema.sql onward.
  await pg.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pg.query('CREATE SCHEMA public');
  const { migratePostgres } = await import(serverFile('migratePostgres.js'));
  await migratePostgres();
  // Same baseline rows the SQLite migrator seeds (packages, weekly schedule),
  // via the very functions production used before the Postgres cutover.
  const { ensureRegularBingoSchedule, ensureBaselinePackages } = await import(serverFile('migrate.js'));
  await ensureRegularBingoSchedule();
  await ensureBaselinePackages();
  return { driver };
}
