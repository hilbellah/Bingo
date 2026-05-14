import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dbPath = path.resolve(__dirname, '..', process.env.DATABASE_URL || './bingo.db');
const legacyDbPath = path.resolve(__dirname, '..', './bingo.db');
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

export function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  ensureDatabaseDirectory();
  fs.writeFileSync(dbPath, buffer);
}

// Debounced save - batches rapid writes into a single disk flush
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDb();
    saveTimer = null;
  }, SAVE_DELAY_MS);
}

// Helper to run a query and return all results as array of objects
export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper to get a single row
export function get(sql, params = []) {
  const results = all(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Helper to run a statement (INSERT, UPDATE, DELETE)
export function run(sql, params = []) {
  db.run(sql, params);
  scheduleSave();
  return { changes: db.getRowsModified() };
}

// Helper to execute raw SQL (for migrations)
export function exec(sql) {
  db.exec(sql);
  saveDb(); // migrations save immediately
}

// Helper to run a batch of statements without scheduling individual saves
// Call scheduleSaveAfterBatch() when done
export function batchRun(sql, params = []) {
  db.run(sql, params);
  return { changes: db.getRowsModified() };
}

// Schedule a save after batch operations
export function scheduleSaveAfterBatch() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDb();
    saveTimer = null;
  }, SAVE_DELAY_MS);
}

export default { getDb, saveDb, all, get, run, exec, batchRun, scheduleSaveAfterBatch };
