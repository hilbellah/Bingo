// server/src/verifyPostgres.js
//
// One-off verification script. Connects to the configured Postgres database
// and prints a checklist of every table, index, and shim function we expect
// from 001_initial_schema.sql. Exits 0 if everything is present, 1 otherwise.
//
// Run via: node server/src/verifyPostgres.js   (uses DATABASE_URL_POSTGRES from server/.env)

import { all, closePool } from './db/postgres.js';

const EXPECTED_TABLES = [
  'sessions', 'seats', 'packages', 'bookings', 'booking_items', 'booking_addons',
  'session_packages', 'announcements', 'audit_log', 'settings', 'recurring_schedules',
  'email_verifications', 'customers', 'admin_users', 'payment_events',
  'schema_migrations',
];

const EXPECTED_INDEXES = [
  'idx_seats_session', 'idx_seats_table', 'idx_seats_status',
  'idx_bookings_session', 'idx_bookings_email', 'idx_bookings_payment_status',
  'idx_bookings_reference', 'idx_bookings_transaction_id',
  'idx_bookings_ticket_access_token',
  'idx_booking_items_booking', 'idx_booking_items_seat',
  'idx_booking_items_refund_status', 'idx_booking_items_reference',
  'idx_session_packages_session',
  'idx_audit_log_entity', 'idx_audit_log_action', 'idx_audit_log_created',
  'idx_recurring_schedules_active_day',
  'idx_email_verifications_email', 'idx_email_verifications_expires',
  'idx_customers_email', 'idx_customers_last_booking',
  'idx_payment_events_booking', 'idx_payment_events_type',
];

const EXPECTED_FUNCTIONS = ['datetime', 'strftime'];

function pad(s, n) { return (s + ' '.repeat(n)).slice(0, n); }

async function main() {
  console.log('Verifying Postgres schema...\n');

  // === Tables ===
  const tableRows = await all(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  const presentTables = new Set(tableRows.map(r => r.tablename));
  const missingTables = EXPECTED_TABLES.filter(t => !presentTables.has(t));
  const extraTables = [...presentTables].filter(t => !EXPECTED_TABLES.includes(t));

  console.log(`Tables: ${presentTables.size} present, ${missingTables.length} missing, ${extraTables.length} extra`);
  for (const t of EXPECTED_TABLES) {
    const ok = presentTables.has(t);
    console.log(`  ${ok ? '✓' : '✗'} ${t}`);
  }
  if (extraTables.length > 0) {
    console.log('  Extra tables (not in expected list):');
    for (const t of extraTables) console.log(`    + ${t}`);
  }

  // === Indexes ===
  const indexRows = await all(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`
  );
  const presentIndexes = new Set(indexRows.map(r => r.indexname));
  const missingIndexes = EXPECTED_INDEXES.filter(i => !presentIndexes.has(i));
  console.log(`\nIndexes: ${presentIndexes.size} present in schema, ${missingIndexes.length} of expected missing`);
  if (missingIndexes.length > 0) {
    for (const i of missingIndexes) console.log(`  ✗ missing: ${i}`);
  } else {
    console.log('  ✓ all expected indexes present');
  }

  // === Shim functions ===
  const funcRows = await all(
    `SELECT proname FROM pg_proc WHERE proname IN ('datetime', 'strftime') ORDER BY proname`
  );
  const presentFuncs = new Set(funcRows.map(r => r.proname));
  console.log(`\nShim functions: ${presentFuncs.size}/${EXPECTED_FUNCTIONS.length} present`);
  for (const f of EXPECTED_FUNCTIONS) {
    const ok = presentFuncs.has(f);
    console.log(`  ${ok ? '✓' : '✗'} ${f}()`);
  }

  // === Functional smoke test: datetime('now') and strftime('%w', ...) ===
  console.log('\nFunctional smoke test:');
  const dtRow = await all(`SELECT datetime('now') AS now_text`);
  console.log(`  datetime('now') = ${dtRow[0].now_text}`);
  const stRow = await all(`SELECT strftime('%w', '2026-05-25') AS dow`);
  console.log(`  strftime('%w', '2026-05-25') = ${stRow[0].dow}   (expected: 1 — Monday)`);

  // === Migration tracking ===
  const migRows = await all(`SELECT filename, applied_at FROM schema_migrations ORDER BY filename`);
  console.log(`\nschema_migrations rows: ${migRows.length}`);
  for (const r of migRows) {
    console.log(`  ${r.filename} — applied ${r.applied_at.toISOString ? r.applied_at.toISOString() : r.applied_at}`);
  }

  const allOk =
    missingTables.length === 0 &&
    missingIndexes.length === 0 &&
    presentFuncs.size === EXPECTED_FUNCTIONS.length;
  console.log(`\nResult: ${allOk ? 'PASS — schema is complete.' : 'FAIL — see missing items above.'}`);

  await closePool();
  process.exit(allOk ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Verification failed:', err);
  try { await closePool(); } catch (_) {}
  process.exit(1);
});
