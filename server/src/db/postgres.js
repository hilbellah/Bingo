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

// === SQL translation: SQLite-style → Postgres-style ===
//
// The runtime codebase was written against sql.js, which uses SQLite-flavoured
// SQL. To avoid rewriting every call site, we translate at query time:
//   - `?` positional placeholders          →  `$1`, `$2`, ... (Postgres style)
//   - `INSERT OR IGNORE INTO ...`          →  `INSERT INTO ... ON CONFLICT DO NOTHING`
//
// Notes on safety:
//   - The `?` substitution is positional. It would WRONGLY replace a literal
//     `?` inside a quoted string (e.g. `SELECT '%?%'`). The current codebase
//     contains no such queries — verified by inspection — but if one is added
//     in future, this translator will silently corrupt it. Worth a TODO if
//     that becomes a concern.
//   - `datetime('now')` and `strftime(fmt, dt)` are NOT translated here. They
//     run as-is against Postgres because we installed PL/pgSQL shim functions
//     of the same names in 001_initial_schema.sql.
export function translateSqlitePlaceholders(text) {
  let translated = String(text);

  // INSERT OR IGNORE → INSERT … ON CONFLICT DO NOTHING.
  // Only transform when present, to keep the common path zero-cost.
  if (/\bINSERT\s+OR\s+IGNORE\b/i.test(translated)) {
    translated = translated.replace(/\bINSERT\s+OR\s+IGNORE\b/i, 'INSERT');
    // Append ON CONFLICT DO NOTHING before any trailing semicolon.
    translated = translated.replace(/;?\s*$/, '');
    translated += ' ON CONFLICT DO NOTHING';
  }

  // ? → $1, $2, ...
  if (translated.includes('?')) {
    let n = 0;
    translated = translated.replace(/\?/g, () => `$${++n}`);
  }

  return translated;
}

// Run an arbitrary parameterised query. Returns the raw pg result object
// ({ rows, rowCount, command, ... }).
export async function query(text, params = []) {
  const start = Date.now();
  const translated = translateSqlitePlaceholders(text);
  const result = await getPool().query(translated, params);
  if (process.env.PG_LOG_QUERIES === '1') {
    const ms = Date.now() - start;
    const preview = translated.replace(/\s+/g, ' ').trim().slice(0, 80);
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

// === getDb compatibility shim ===
// The sql.js adapter's getDb() returns the actual sql.js database handle
// (which has methods like prepare/run/exec). The Postgres equivalent is the
// connection pool, which doesn't have those same methods — but most callers
// only use getDb() as an "initialize the DB" signal and then use the
// all/get/run/exec wrappers. Returning the pool gives a non-undefined value
// that satisfies the init pattern. Callers that try `db.prepare(...)` (only
// in /health and in migrate.js's transaction code) need a typeof check —
// those paths are SQLite-only anyway.
export async function getDb() {
  // Initialise the pool by getting and immediately releasing a connection.
  // This validates the DATABASE_URL_POSTGRES connection string at startup,
  // so misconfigurations fail fast instead of on first request.
  const client = await getPool().connect();
  client.release();
  return getPool();
}

// === SQLite-API compatibility no-ops ===
// The sql.js adapter exposes saveDb()/batchRun()/scheduleSaveAfterBatch() for
// its file-backed persistence model. Postgres persists writes automatically,
// so these are no-ops here — but we expose them under the same names so the
// driver-selector facade in database.js can re-export a uniform interface
// regardless of which driver is active. Callers should never need to know
// which driver they're talking to.

export async function saveDb() {
  // no-op for Postgres — writes are committed transactionally already
}

export async function batchRun(text, params = []) {
  // For Postgres there's no difference between run() and batchRun() — both
  // hit the same transaction-aware pool. Returned shape matches run().
  return run(text, params);
}

export function scheduleSaveAfterBatch() {
  // no-op for Postgres
}

export default {
  getDb,
  getPool, query, all, get, run, exec, withTransaction, closePool,
  translateSqlitePlaceholders,
  saveDb, batchRun, scheduleSaveAfterBatch,
};
