// Copy live Postgres data into the local SQLite database for local debugging.
//
// This is intentionally one-way:
//   Postgres is read-only.
//   Local SQLite tables are cleared and refilled.
//   The existing local SQLite file is backed up before changes are written.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getPool, closePool } from './db/postgres.js';
import sqliteAdapter from './db/sqlite.js';
import { migrate } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverDir, '..');
dotenv.config({ path: path.join(serverDir, '.env') });

const TABLES = [
  { name: 'sessions',             cols: ['id', 'date', 'time', 'cutoff_time', 'sales_cutoff_at', 'doors_open_time', 'is_available', 'created_at', 'is_special_event', 'event_title', 'event_description', 'event_image_url', 'session_type', 'deleted_at'] },
  { name: 'packages',             cols: ['id', 'name', 'price', 'type', 'max_quantity', 'is_active', 'sort_order', 'is_phd', 'description'] },
  { name: 'bookings',             cols: ['id', 'session_id', 'reference_number', 'total_amount', 'payment_status', 'created_at', 'email', 'customer_first_name', 'customer_last_name', 'email_verified_at', 'payment_provider', 'transaction_id', 'auth_code', 'payment_attempted_at', 'payment_completed_at', 'payment_failure_reason', 'hosted_token', 'ticket_access_token', 'booking_source', 'admin_note'] },
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
  { name: 'admin_users',          cols: ['id', 'email', 'password_hash', 'display_name', 'is_active', 'is_super_user', 'role', 'created_at', 'updated_at'] },
  { name: 'customer_credits',     cols: ['id', 'booking_id', 'booking_item_id', 'code', 'amount', 'status', 'reason', 'note', 'created_by', 'created_at', 'redeemed_at'] },
];

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function localDbPath() {
  return path.resolve(serverDir, process.env.DATABASE_URL || './bingo.db');
}

function backupLocalDb() {
  const dbPath = localDbPath();
  if (!fs.existsSync(dbPath)) return null;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(repoRoot, 'backups', 'local-db');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `bingo-before-live-copy-${stamp}.db`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) return JSON.stringify(value);
  return value ?? null;
}

async function assertPostgresTables() {
  const { rows } = await getPool().query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'"
  );
  const present = new Set(rows.map(row => row.tablename));
  const missing = TABLES.filter(table => !present.has(table.name)).map(table => table.name);
  if (missing.length > 0) {
    throw new Error(`Live Postgres is missing expected tables: ${missing.join(', ')}`);
  }
}

async function copyTable(pgClient, table) {
  const colList = table.cols.map(quoteIdent).join(', ');
  const { rows } = await pgClient.query(
    `SELECT ${colList} FROM ${quoteIdent(table.name)}`
  );

  if (rows.length === 0) return 0;

  const placeholders = table.cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${quoteIdent(table.name)} (${colList}) VALUES (${placeholders})`;

  for (const row of rows) {
    await sqliteAdapter.batchRun(sql, table.cols.map(col => normalizeValue(row[col])));
  }

  return rows.length;
}

async function main() {
  if (!process.env.DATABASE_URL_POSTGRES) {
    throw new Error('DATABASE_URL_POSTGRES is not set in server/.env');
  }

  console.log('=== Postgres -> local SQLite data copy ===');
  const backupPath = backupLocalDb();
  if (backupPath) console.log(`Backed up local SQLite DB: ${backupPath}`);

  await migrate();
  await sqliteAdapter.getDb();
  await assertPostgresTables();

  const pgClient = await getPool().connect();
  const summary = [];
  try {
    await sqliteAdapter.batchRun('PRAGMA foreign_keys = OFF');

    for (const table of [...TABLES].reverse()) {
      await sqliteAdapter.batchRun(`DELETE FROM ${quoteIdent(table.name)}`);
    }

    for (const table of TABLES) {
      process.stdout.write(`  ${table.name.padEnd(22)} `);
      const copied = await copyTable(pgClient, table);
      summary.push({ table: table.name, copied });
      console.log(String(copied).padStart(7));
    }

    await sqliteAdapter.batchRun('PRAGMA foreign_keys = ON');
    await sqliteAdapter.saveDb();
  } catch (err) {
    throw err;
  } finally {
    pgClient.release();
    await closePool();
  }

  const total = summary.reduce((sum, row) => sum + row.copied, 0);
  console.log(`Total rows copied into local SQLite: ${total}`);
}

main().catch(async (err) => {
  console.error('COPY FAILED:', err?.message || err);
  try { await closePool(); } catch (_) {}
  process.exit(1);
});
