// server/src/db/postgres.js
//
// Phase 1 of the SQLite → Postgres migration.
//
// This module is the async-native Postgres connection layer. It is NOT yet
// wired into the runtime — the runtime still uses server/src/database.js
// (sql.js) by default, controlled by DB_DRIVER (currently always "sqlite").
//
// Today, the only consumer of this module is the Postgres migration runner
// at server/src/migratePostgres.js. In Phase 2 the runtime data layer will
// be async-ified and routed through this module when DB_DRIVER=postgres.
//
// Env vars consumed:
//   DATABASE_URL_POSTGRES   Required. Standard libpq URL.
//                           e.g. postgres://user:pass@host:5432/db?sslmode=require
//   PGSSL                   Optional. Set to "disable" to turn off SSL (local dev only).
//                           Default: ssl on with rejectUnauthorized=false (Render-friendly).
//   PGPOOL_MAX              Optional. Max pool connections. Default 10.
//   PG_LOG_QUERIES          Optional. "1" to log query text + timing.

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load server/.env (this file lives at server/src/db/postgres.js, so go up two levels).
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = pg;

let pool = null;

function getConnectionString() {
  const url = process.env.DATABASE_URL_POSTGRES;
  if (!url) {
    throw new Error(
      'DATABASE_URL_POSTGRES is not set. Add it to server/.env. ' +
      'Expected format: postgres://user:pass@host:5432/dbname?sslmode=require'
    );
  }
  return url;
}

export function getPool() {
  if (pool) return pool;

  const connectionString = getConnectionString();
  // Render-hosted Postgres requires SSL for external connections. Internal
  // (intra-Render) connections tolerate it harmlessly. Local Postgres without
  // SSL: set PGSSL=disable in server/.env.
  const ssl = process.env.PGSSL === 'disable'
    ? false
    : { rejectUnauthorized: false };

  pool = new Pool({
    connectionString,
    ssl,
    max: Number(process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => {
    // Pool-level errors are background-thread issues (idle client died, etc.).
    // Log but do not crash — callers will see errors on their next query.
    console.error('[postgres] idle client error:', err);
  });

  return pool;
}

// Run an arbitrary parameterised query. Returns the raw pg result object
// ({ rows, rowCount, command, ... }).
export async function query(text, params = []) {
  const start = Date.now();
  const result = await getPool().query(text, params);
  if (process.env.PG_LOG_QUERIES === '1') {
    const ms = Date.now() - start;
    const preview = String(text).replace(/\s+/g, ' ').trim().slice(0, 80);
    console.log(`[pg] ${ms}ms ${preview} (${result.rowCount} rows)`);
  }
  return result;
}

// Convenience: return all rows as an array of plain objects.
export async function all(text, params = []) {
  const { rows } = await query(text, params);
  return rows;
}

// Convenience: return the first row (or null).
export async function get(text, params = []) {
  const { rows } = await query(text, params);
  return rows[0] || null;
}

// Convenience: run a write statement; returns the same shape as the SQLite
// adapter's `run()` so call sites can be ported with minimal churn in Phase 2.
export async function run(text, params = []) {
  const result = await query(text, params);
  return { changes: result.rowCount ?? 0 };
}

// Execute a multi-statement SQL script. pg's simple-query protocol allows
// semicolon-separated statements ONLY when no parameter placeholders are used,
// which is exactly how .sql migration files are written.
export async function exec(text) {
  await query(text);
}

// Run a function inside a transaction. The callback receives a dedicated
// client so all statements run on the same connection. Commits if the callback
// resolves; rolls back if it throws.
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[postgres] rollback failed:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export default { getPool, query, all, get, run, exec, withTransaction, closePool };
