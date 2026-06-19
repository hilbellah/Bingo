// server/src/copyDataSqliteToPostgres.js
//
// Phase 2 data-copy script. Reads every row out of the live SQLite database
// via sql.js and inserts each row into the Postgres database in foreign-key-
// safe order.
//
// Idempotency: this script is destructive on the Postgres side — it TRUNCATEs
// each table first inside a single transaction. If you re-run, you get a
// fresh copy. The SQLite database is NEVER modified.
//
// Usage:
//   # First set DATABASE_URL_POSTGRES in server/.env
//   node server/src/copyDataSqliteToPostgres.js
//
//   # Or via npm:
//   npm run copy:sqlite-to-postgres
//
// Safety:
//   - Wraps the entire copy in a Postgres transaction. If anything fails
//     midway, the Postgres DB is left untouched.
//   - Verifies row counts match between SQLite and Postgres after each table.
//   - Prints a summary table at the end (rows copied, mismatches if any).
//
// Order matters because of foreign keys. We copy parents before children:
//
//   sessions
//   packages
//   bookings           (FK → sessions)
//   seats              (FK → sessions)
//   session_packages   (FK → sessions)
//   booking_items      (FK → bookings, seats, packages)
//   booking_addons     (FK → booking_items, packages)
//   payment_events     (FK → bookings)
//   announcements
//   audit_log
//   settings
//   recurring_schedules
//   email_verifications
//   customers
//   admin_users

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sqliteAdapter from './db/sqlite.js';
import { getPool, withTransaction, closePool } from './db/postgres.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// FK-safe order. Postgres TRUNCATEs in REVERSE order to clear children first.
const TABLES = [
  { name: 'sessions',             cols: ['id', 'date', 'time', 'cutoff_time', 'sales_cutoff_at', 'is_available', 'created_at', 'is_special_event', 'event_title', 'event_description', 'event_image_url', 'session_type', 'deleted_at'] },
  { name: 'packages',             cols: ['id', 'name', 'price', 'type', 'max_quantity', 'is_active', 'sort_order', 'is_phd', 'description'] },
  { name: 'bookings',             cols: ['id', 'session_id', 'reference_number', 'total_amount', 'payment_status', 'created_at', 'email', 'customer_first_name', 'customer_last_name', 'email_verified_at', 'payment_provider', 'transaction_id', 'auth_code', 'payment_attempted_at', 'payment_completed_at', 'payment_failure_reason', 'hosted_token', 'ticket_access_token'] },
  { name: 'seats',                cols: ['id', 'session_id', 'table_number', 'chair_number', 'status', 'held_by', 'held_until', 'is_disabled'] },
  { name: 'session_packages',     cols: ['id', 'session_id', 'name', 'price', 'type', 'max_quantity', 'sort_order', 'is_phd', 'description', 'created_at'] },
  { name: 'booking_items',        cols: ['id', 'booking_id', 'first_name', 'last_name', 'seat_id', 'package_id', 'price', 'reference_number', 'printed_at', 'refund_status', 'refunded_at', 'refund_transaction_id', 'refund_amount', 'refund_action'] },
  { name: 'booking_addons',       cols: ['id', 'booking_item_id', 'package_id', 'quantity', 'price'] },
  { name: 'payment_events',       cols: ['id', 'booking_id', 'event_type', 'source', 'raw_payload', 'created_at'] },
  { name: 'announcements',        cols: ['id', 'title', 'message', 'type', 'is_active', 'start_date', 'end_date', 'sort_order', 'image_url', 'created_at', 'updated_at'] },
  { name: 'audit_log',            cols: ['id', 'action', 'entity_type', 'entity_id', 'details', 'created_at'] },
  { name: 'settings',             cols: ['key', 'value', 'updated_at'] },
  { name: 'recurring_schedules',  cols: ['id', 'day_of_week', 'time', 'cutoff_time', 'session_type', 'is_active', 'created_at', 'updated_at'] },
  { name: 'email_verifications',  cols: ['id', 'email', 'code_hash', 'customer_first_name', 'customer_last_name', 'attempts', 'expires_at', 'verified_at', 'created_at'] },
  { name: 'customers',            cols: ['id', 'email', 'first_name', 'last_name', 'email_verified_at', 'first_booking_at', 'last_booking_at', 'created_at', 'updated_at'] },
  { name: 'admin_users',          cols: ['id', 'email', 'password_hash', 'display_name', 'is_active', 'is_super_user', 'created_at', 'updated_at'] },
];

const BATCH_SIZE = 500;

function buildPlaceholders(rowCount, colCount) {
  const lines = [];
  let n = 1;
  for (let r = 0; r < rowCount; r++) {
    const row = [];
    for (let c = 0; c < colCount; c++) {
      row.push(`$${n++}`);
    }
    lines.push(`(${row.join(', ')})`);
  }
  return lines.join(', ');
}

function quoteIdent(name) {
  // Use double-quotes; column/table names are simple snake_case so no real
  // injection risk, but this keeps us safe against any reserved-word names.
  return `"${name.replace(/"/g, '""')}"`;
}

async function copyTable(pgClient, table, sqliteAll) {
  const { name, cols } = table;

  const rows = await sqliteAll(`SELECT ${cols.map(quoteIdent).join(', ')} FROM ${quoteIdent(name)}`);
  const total = rows.length;

  if (total === 0) {
    return { table: name, sqliteCount: 0, pgCount: 0, copied: 0, ok: true };
  }

  // Insert in batches to keep parameter count under Postgres' 65535 limit
  // (each row consumes cols.length parameters).
  const maxRowsPerBatch = Math.max(1, Math.min(BATCH_SIZE, Math.floor(65000 / cols.length)));

  const colList = cols.map(quoteIdent).join(', ');
  let copied = 0;

  for (let offset = 0; offset < total; offset += maxRowsPerBatch) {
    const batch = rows.slice(offset, offset + maxRowsPerBatch);
    const placeholders = buildPlaceholders(batch.length, cols.length);
    const params = [];
    for (const row of batch) {
      for (const col of cols) {
        const v = row[col];
        // sql.js returns undefined for NULL; pg wants explicit null.
        params.push(v === undefined ? null : v);
      }
    }
    const sql = `INSERT INTO ${quoteIdent(name)} (${colList}) VALUES ${placeholders}`;
    await pgClient.query(sql, params);
    copied += batch.length;
  }

  // Verify
  const { rows: pgRows } = await pgClient.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(name)}`);
  const pgCount = pgRows[0].count;

  return { table: name, sqliteCount: total, pgCount, copied, ok: pgCount === total };
}

async function main() {
  console.log('=== SQLite → Postgres data copy ===');
  console.log('');

  // 1. Make sure the connection string is configured.
  if (!process.env.DATABASE_URL_POSTGRES) {
    throw new Error('DATABASE_URL_POSTGRES is not set in server/.env. Aborting.');
  }

  // 2. Open SQLite (read-only intent; we don't write).
  console.log('Opening SQLite database...');
  await sqliteAdapter.getDb();
  console.log('SQLite opened.');

  // 3. Open Postgres pool.
  console.log('Connecting to Postgres...');
  getPool(); // initializes pool

  // 4. Pre-flight: confirm Postgres has the expected schema (or fail loudly).
  // pool.query() handles connection acquisition + release automatically.
  const { rows: schemaRows } = await getPool().query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
  );
  const presentTables = new Set(schemaRows.map(r => r.tablename));
  const missing = TABLES.filter(t => !presentTables.has(t.name)).map(t => t.name);
  if (missing.length > 0) {
    throw new Error(
      `Postgres is missing tables: ${missing.join(', ')}. ` +
      `Run \`npm run migrate:postgres\` first.`
    );
  }
  console.log(`All ${TABLES.length} target tables present in Postgres.`);
  console.log('');

  // 5. Copy inside one big transaction.
  const summary = [];
  await withTransaction(async (client) => {
    // 5a. Clear out destination tables in REVERSE FK order so children go first.
    console.log('Truncating destination tables (in reverse FK order)...');
    for (const table of [...TABLES].reverse()) {
      await client.query(`TRUNCATE TABLE ${quoteIdent(table.name)} CASCADE`);
    }
    console.log('Truncate complete.');
    console.log('');

    // 5b. Copy in forward FK order.
    console.log('Copying tables (in FK-safe order)...');
    for (const table of TABLES) {
      process.stdout.write(`  ${table.name.padEnd(22)} `);
      const result = await copyTable(client, table, sqliteAdapter.all);
      summary.push(result);
      const status = result.ok ? 'OK  ' : 'FAIL';
      console.log(`${status}  sqlite=${String(result.sqliteCount).padStart(7)}  pg=${String(result.pgCount).padStart(7)}`);
    }
  });

  console.log('');
  console.log('=== Summary ===');
  const totalRows = summary.reduce((acc, s) => acc + s.copied, 0);
  const failures = summary.filter(s => !s.ok);
  console.log(`Total rows copied: ${totalRows}`);
  console.log(`Tables successful: ${summary.length - failures.length}/${summary.length}`);
  if (failures.length > 0) {
    console.error('FAILURES:');
    for (const f of failures) {
      console.error(`  ${f.table}: sqlite=${f.sqliteCount} pg=${f.pgCount}`);
    }
  } else {
    console.log('All table counts match.');
  }

  await closePool();
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('');
  console.error('=== COPY FAILED ===');
  console.error(err);
  try { await closePool(); } catch (_) { /* ignore */ }
  process.exit(1);
});
