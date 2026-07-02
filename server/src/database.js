// server/src/database.js
//
// Driver-selector facade. Re-exports a uniform async data-access API by
// dispatching to either ./db/sqlite.js (default) or ./db/postgres.js based
// on the DB_DRIVER environment variable.
//
//   DB_DRIVER=sqlite    (default)  use sql.js, file at DATABASE_URL
//   DB_DRIVER=postgres             use pg, connecting to DATABASE_URL_POSTGRES
//
// The same names are exported regardless of driver:
//   getDb, saveDb, all, get, run, exec, batchRun, scheduleSaveAfterBatch
//
// IMPORTANT: every export is async (returns a Promise) under BOTH drivers.
// Existing call sites that did `const rows = all(...);` must be updated to
// `const rows = await all(...);`. The sqlite adapter wraps the synchronous
// sql.js calls in an async signature so the interface is uniform.
//
// PRODUCTION runs DB_DRIVER=postgres (set in render.yaml and the Render
// dashboard) since the 2026-05-25 cutover. The sqlite default only applies
// to local dev environments that haven't set DB_DRIVER; the SQLite file on
// Render's persistent disk is a frozen rollback copy, not live data.

import sqliteAdapter from './db/sqlite.js';
import postgresAdapter from './db/postgres.js';

const RAW_DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase().trim();
const VALID_DRIVERS = new Set(['sqlite', 'postgres']);

if (!VALID_DRIVERS.has(RAW_DRIVER)) {
  throw new Error(
    `Unknown DB_DRIVER "${process.env.DB_DRIVER}". ` +
    `Valid values: ${[...VALID_DRIVERS].join(', ')}.`
  );
}

const adapter = RAW_DRIVER === 'postgres' ? postgresAdapter : sqliteAdapter;

// Tag log lines so it's obvious at startup which driver is active.
console.log(`[database] driver = ${RAW_DRIVER}`);

export const getDb                   = adapter.getDb;
export const saveDb                  = adapter.saveDb;
export const all                     = adapter.all;
export const get                     = adapter.get;
export const run                     = adapter.run;
export const exec                    = adapter.exec;
export const batchRun                = adapter.batchRun;
export const scheduleSaveAfterBatch  = adapter.scheduleSaveAfterBatch;

export default {
  getDb, saveDb, all, get, run, exec, batchRun, scheduleSaveAfterBatch,
};
