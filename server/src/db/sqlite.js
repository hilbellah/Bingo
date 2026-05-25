// server/src/db/sqlite.js
//
// SQLite (sql.js) adapter. This is the original implementation that used to
// live in server/src/database.js, refactored into its own module so the
// driver-selector facade (server/src/database.js) can route to either this
// adapter or ./postgres.js based on DB_DRIVER.
//
// Function signatures are now async even though sql.js is synchronous under
// the hood. The sync sql.js calls happen on the same microtask tick; we just
// adopt the async interface so callers can write `await all(...)` regardless
// of which driver is configured. This is the key compatibility layer that
// makes the rest of the codebase driver-agnostic.

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load server/.env (this file lives at server/src/db/sqlite.js — go up two)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const dbPath = path.resolve(__dirname, '..', '..', process.env.DATABASE_URL || './bingo.db');
const legacyDbPath = path.resolve(__dirname, '..', '..', './bingo.db');
const renderDiskMountPath = '/var/data';

let db = null;
let saveTimer = null;
const SAVE_DELAY_MS = 500; // batch writes within 500ms window

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function usesRenderPersistentDisk() {
  if (process.env.SKIP_RENDER_DISK_CHECK) return false;
  const rawDatabaseUrl = (process.env.DATABASE_URL || '').replace(/\\/g, '/');
  if (rawDatabaseUrl === renderDiskMountPath || rawDatabaseUrl.startsWith(`${renderDiskMountPath}/`)) {
    return true;
  }
  const normalized = dbPath.replace(/\\/g, '/');
  return normalized === renderDiskMountPath || normalized.startsWith(`${renderDiskMountPath}/`);
}

function assertWritableDirectory(dirPath) {
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`${dirPath} exists but is not a directory`);
  }

  const probePath = path.join(dirPath, `.write-test-${process.pid}-${Date.now()}`);
  fs.writeFileSync(probePath, 'ok');
  fs.unlinkSync(probePath);
}

async function waitForRenderDisk() {
  if (!usesRenderPersistentDisk()) return;

  const attempts = Number(process.env.RENDER_DISK_WAIT_ATTEMPTS || 30);
  const delayMs = Number(process.env.RENDER_DISK_WAIT_MS || 1000);
  let lastError = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      assertWritableDirectory(renderDiskMountPath);
      console.log(`Verified Render persistent disk at ${renderDiskMountPath}`);
      return;
    } catch (err) {
      lastError = err;
      console.warn(`Waiting for Render persistent disk at ${renderDiskMountPath} (${i}/${attempts}): ${err.message}`);
      await sleep(delayMs);
    }
  }

  throw new Error(
    `Render persistent disk is not available at ${renderDiskMountPath}. ` +
    `DATABASE_URL=${dbPath}. Check the Render disk mount path and redeploy. ` +
    `Last error: ${lastError?.message || 'unknown'}`
  );
}

function ensureDatabaseDirectory() {
  const dirPath = path.dirname(dbPath);
  if (usesRenderPersistentDisk()) {
    assertWritableDirectory(renderDiskMountPath);
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

export async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();
  await waitForRenderDisk();

  if (!process.env.SKIP_LEGACY_DB_COPY && !fs.existsSync(dbPath) && dbPath !== legacyDbPath && fs.existsSync(legacyDbPath)) {
    ensureDatabaseDirectory();
    fs.copyFileSync(legacyDbPath, dbPath);
    console.log(`Copied existing database from ${legacyDbPath} to ${dbPath}`);
  }

  // Load existing database file if it exists
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys and WAL mode for better read performance
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = WAL');

  return db;
}

export async function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  ensureDatabaseDirectory();
  fs.writeFileSync(dbPath, buffer);
}

// Debounced save - batches rapid writes into a single disk flush.
// Internal helper kept sync because it just schedules a timer.
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Best-effort fire-and-forget save; errors are logged but not thrown.
    saveDb().catch(err => console.error('[sqlite] debounced save failed:', err));
    saveTimer = null;
  }, SAVE_DELAY_MS);
}

// Helper to run a query and return all results as an array of objects.
// Async signature so callers can `await all(...)` regardless of driver.
export async function all(sql, params = []) {
  if (!db) throw new Error('sqlite adapter: call getDb() before all()');
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper to get a single row (or null)
export async function get(sql, params = []) {
  const results = await all(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Helper to run a statement (INSERT, UPDATE, DELETE)
export async function run(sql, params = []) {
  if (!db) throw new Error('sqlite adapter: call getDb() before run()');
  db.run(sql, params);
  scheduleSave();
  return { changes: db.getRowsModified() };
}

// Helper to execute raw SQL (for migrations). Saves immediately because
// migrations are infrequent and we want the on-disk state up to date.
export async function exec(sql) {
  if (!db) throw new Error('sqlite adapter: call getDb() before exec()');
  db.exec(sql);
  await saveDb();
}

// Run a batch of statements without scheduling individual saves. Call
// scheduleSaveAfterBatch() when done.
export async function batchRun(sql, params = []) {
  if (!db) throw new Error('sqlite adapter: call getDb() before batchRun()');
  db.run(sql, params);
  return { changes: db.getRowsModified() };
}

// Schedule a save after batch operations. Kept sync because it just sets a
// timer; the actual save happens later via scheduleSave's debounce.
export function scheduleSaveAfterBatch() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDb().catch(err => console.error('[sqlite] batch save failed:', err));
    saveTimer = null;
  }, SAVE_DELAY_MS);
}

export default { getDb, saveDb, all, get, run, exec, batchRun, scheduleSaveAfterBatch };
