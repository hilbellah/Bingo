import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-stale-pending-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = path.join(tmpDir, 'bingo.db');
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.STALE_PENDING_HOURS = '48';

const importLocal = relativePath => import(pathToFileURL(path.join(repoRoot, relativePath)));
const { migrate } = await importLocal('server/src/migrate.js');
const { get, run, saveDb } = await importLocal('server/src/database.js');
await migrate();

const now = new Date('2099-08-15T12:00:00.000Z');
const old = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
const recent = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
const sessionId = 'stale-cleanup-session';
const packageRow = await get("SELECT id, price FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order LIMIT 1");
await run("INSERT INTO sessions (id, date, time, cutoff_time, is_available) VALUES (?, '2099-08-20', '18:30', '12:00', 1)", [sessionId]);

async function addBooking(id, { createdAt = old, transactionId = null, paymentStatus = 'pending' } = {}) {
  await run(`INSERT INTO bookings
    (id, session_id, reference_number, total_amount, payment_status, created_at, transaction_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, sessionId, `BNG-${id}`, packageRow.price, paymentStatus, createdAt, transactionId]);
}

await addBooking('eligible');
await addBooking('recent', { createdAt: recent });
await addBooking('has-transaction', { transactionId: 'anet-transaction' });
await addBooking('has-event');
await run("INSERT INTO payment_events (id, booking_id, event_type, source) VALUES ('event-1', 'has-event', 'payment_observed', 'test')");
await addBooking('has-refund-request');
await run(`INSERT INTO refund_requests
  (id, booking_id, amount_cents, reason, status, requested_by)
  VALUES ('refund-1', 'has-refund-request', 100, 'Review first', 'pending', 'admin@example.com')`);
await addBooking('active-hold');
await run("INSERT INTO seats (id, session_id, table_number, chair_number, status, held_by, held_until) VALUES ('held-seat', ?, 1, 1, 'held', 'holder', ?)", [sessionId, new Date(now.getTime() + 60 * 60 * 1000).toISOString()]);
await run(`INSERT INTO booking_items
  (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
  VALUES ('held-item', 'active-hold', 'Held', 'Customer', 'held-seat', ?, ?, 'BNG-HELD-ITEM')`, [packageRow.id, packageRow.price]);
await addBooking('already-paid', { paymentStatus: 'paid', transactionId: 'paid-transaction' });
await run("INSERT INTO audit_log (id, action, entity_type, entity_id, created_at) VALUES ('old-audit', 'historical', 'booking', 'old', '2000-01-01T00:00:00.000Z')");
await saveDb();

const { expireStalePendingBookings } = await importLocal('server/src/services/scheduler.js');

try {
  const preview = await expireStalePendingBookings({ dryRun: true, now });
  assert.deepEqual(preview.candidates.map(row => row.id), ['eligible']);
  assert.equal((await get("SELECT payment_status FROM bookings WHERE id = 'eligible'")).payment_status, 'pending');
  assert.equal((await get("SELECT COUNT(*) AS count FROM audit_log WHERE action LIKE 'stale_pending_cleanup_%'")).count, 0);

  const result = await expireStalePendingBookings({ now });
  assert.equal(result.expired, 1);
  assert.equal((await get("SELECT payment_status FROM bookings WHERE id = 'eligible'")).payment_status, 'cancelled');
  assert.equal((await get("SELECT payment_failure_reason FROM bookings WHERE id = 'eligible'")).payment_failure_reason, 'expired_unpaid_cleanup');
  for (const id of ['recent', 'has-transaction', 'has-event', 'has-refund-request', 'active-hold']) {
    assert.equal((await get('SELECT payment_status FROM bookings WHERE id = ?', [id])).payment_status, 'pending', `${id} must not be expired`);
  }
  assert.equal((await get("SELECT payment_status FROM bookings WHERE id = 'already-paid'")).payment_status, 'paid');
  assert.equal((await get("SELECT COUNT(*) AS count FROM audit_log WHERE action LIKE 'stale_pending_cleanup_%'")).count, 2);
  assert.equal((await get("SELECT COUNT(*) AS count FROM audit_log WHERE id = 'old-audit'")).count, 1);
  console.log('Stale pending cleanup safety check passed.');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
