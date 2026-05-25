// server/src/migratePostgres.js
//
// Phase 1 Postgres migration runner. Applies every .sql file in
// server/migrations/postgres/ in lexical order, exactly once each, tracked
// in the schema_migrations table.
//
// Deliberately separate from server/src/migrate.js (the SQLite migrator).
// They share no state. The SQLite path is untouched by this script.
//
// Usage:
//   DATABASE_URL_POSTGRES=postgres://...  node server/src/migratePostgres.js
//   or:   npm run migrate:postgres
//
// Behaviour:
//   - Creates schema_migrations if missing.
//   - For each .sql file, checks schema_migrations.filename. If already
//     applied: skip. If not: apply the entire file inside a single
//     transaction, then INSERT a row into schema_migrations.
//   - If a migration fails the transaction rolls back and the script exits 1.
//
// File-hashing: each applied migration's SHA-256 is stored alongside its
// filename. On subsequent runs we compare the on-disk file hash against the
// stored hash and warn loudly if a previously-applied migration's content has
// changed (since that almost always means an in-place edit instead of a new
// migration file — a real footgun).

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { query, withTransaction, closePool } from './db/postgres.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations', 'postgres');

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename     TEXT PRIMARY KEY,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sha256       TEXT
    )
  `);
}

async function loadAppliedMigrations() {
  const { rows } = await query('SELECT filename, sha256 FROM schema_migrations');
  const map = new Map();
  for (const row of rows) {
    map.set(row.filename, row.sha256);
  }
  return map;
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexical order; the 001_/002_/... prefix gives us a strict total order
}

async function applyMigration(filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');
  const hash = sha256Hex(sql);

  console.log(`[migrate:pg] applying ${filename} ...`);
  await withTransaction(async (client) => {
    // Apply the migration SQL on this transaction's client. The .sql files
    // include their own BEGIN/COMMIT for clarity, but Postgres treats nested
    // BEGIN as a no-op warning rather than an error, so this is safe.
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (filename, sha256)
       VALUES ($1, $2)
       ON CONFLICT (filename) DO UPDATE SET sha256 = EXCLUDED.sha256, applied_at = NOW()`,
      [filename, hash]
    );
  });
  console.log(`[migrate:pg] ${filename} applied (sha256=${hash.slice(0, 12)}…).`);
}

export async function migratePostgres() {
  console.log(`[migrate:pg] migrations dir: ${MIGRATIONS_DIR}`);
  await ensureMigrationsTable();

  const files = listMigrationFiles();
  if (files.length === 0) {
    console.log('[migrate:pg] no .sql files found. Nothing to do.');
    return { applied: 0, total: 0 };
  }

  const applied = await loadAppliedMigrations();
  let newlyApplied = 0;
  let warnings = 0;

  for (const filename of files) {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filepath, 'utf8');
    const hash = sha256Hex(sql);

    if (applied.has(filename)) {
      const recordedHash = applied.get(filename);
      if (recordedHash && recordedHash !== hash) {
        warnings++;
        console.warn(
          `[migrate:pg] WARNING: ${filename} has been modified since it was first applied.\n` +
          `             Recorded sha256: ${recordedHash}\n` +
          `             On-disk  sha256: ${hash}\n` +
          `             Edit applied migrations only if you really know what you're doing — ` +
          `the database has NOT been re-run against the new content.`
        );
      } else {
        console.log(`[migrate:pg] skipping ${filename} (already applied)`);
      }
      continue;
    }

    await applyMigration(filename);
    newlyApplied++;
  }

  console.log(
    `[migrate:pg] done. ${newlyApplied} new migration(s) applied. ` +
    `${files.length} migration(s) total. ${warnings} hash warning(s).`
  );
  return { applied: newlyApplied, total: files.length, warnings };
}

// CLI entry point. We detect direct invocation by checking the script argv,
// matching the same pattern server/src/migrate.js uses.
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('migratePostgres.js') || process.argv[1].endsWith('migratePostgres')
);
if (isMainModule) {
  migratePostgres()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[migrate:pg] FAILED:', err);
      try { await closePool(); } catch (_) { /* ignore */ }
      process.exit(1);
    });
}
