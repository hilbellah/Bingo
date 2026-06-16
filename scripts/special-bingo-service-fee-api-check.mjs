import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-special-service-fee-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.SESSION_HOLD_MINUTES = '20';
process.env.PAYMENT_FAILURE_HOLD_MINUTES = '5';
process.env.ANET_ENV = 'sandbox';
process.env.ADMIN_USERNAME = 'service-fee-admin';
process.env.ADMIN_PASSWORD = 'service-fee-password';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { migrate } = await import(migrateUrl);
const { getDb, get, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const holdUntil = new Date(Date.now() + 20 * 60 * 1000).toISOString();
const sessionId = 'special-no-service-fee-session';
const seatId = 'special-no-service-fee-seat';
const holderId = 'special-no-service-fee-holder';
const admissionPackageId = 'special-no-service-fee-admission';
const admissionPrice = 7500;

await run(
  `INSERT INTO sessions
    (id, date, time, cutoff_time, is_available, session_type, is_special_event, event_title)
   VALUES (?, ?, '18:30', '12:00', 1, 'special_bingo', 1, 'Special Bingo')`,
  [sessionId, futureDate]
);
await run(
  `INSERT INTO seats
    (id, session_id, table_number, chair_number, status, held_by, held_until)
   VALUES (?, ?, 1, 1, 'held', ?, ?)`,
  [seatId, sessionId, holderId, holdUntil]
);
await run(
  `INSERT INTO session_packages
    (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description)
   VALUES (?, ?, 'Special Bingo Admission (includes 1 PHD)', ?, 'required', 1, 0, 1, 'Admission with required handheld device')`,
  [admissionPackageId, sessionId, admissionPrice]
);
await saveDb();

const { app } = await import(appUrl);
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;

async function postJson(pathname, body, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

try {
  const auth = Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString('base64');
  const result = await postJson('/api/bookings', {
    sessionId,
    holderId,
    email: '',
    customerFirstName: 'Special',
    customerLastName: 'Tester',
    attendees: [
      {
        firstName: 'Special',
        lastName: 'Tester',
        seatId,
        addons: [],
      },
    ],
  }, { Authorization: `Basic ${auth}` });

  assert.equal(result.response.status, 200);
  assert.ok(result.data.bookingId);
  assert.equal(result.data.totalAmount, admissionPrice);
  assert.equal(result.data.totalFormatted, 'CA$75.00');

  const savedBooking = await get('SELECT total_amount, payment_status FROM bookings WHERE id = ?', [result.data.bookingId]);
  assert.equal(savedBooking.total_amount, admissionPrice);
  assert.equal(savedBooking.payment_status, 'paid');

  console.log('Special bingo service fee API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
