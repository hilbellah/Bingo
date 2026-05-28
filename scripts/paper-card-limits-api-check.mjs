import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-paper-card-limits-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.SESSION_HOLD_MINUTES = '20';
process.env.PAYMENT_FAILURE_HOLD_MINUTES = '5';
process.env.ANET_ENV = 'sandbox';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { migrate } = await import(migrateUrl);
const { getDb, all, get, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const paperLimitById = {
  'pkg-regular-optional-9-up': 2,
  'pkg-regular-optional-6-up': 3,
  'pkg-regular-optional-3-up': 3,
  'pkg-regular-optional-mp-early-bird': 6,
};
const paperPackages = await all(
  `SELECT id, name, price, max_quantity
   FROM packages
   WHERE id IN (?, ?, ?, ?)
   ORDER BY sort_order ASC`,
  Object.keys(paperLimitById)
);
assert.deepEqual(
  Object.fromEntries(paperPackages.map(pkg => [pkg.id, pkg.max_quantity])),
  paperLimitById,
  'regular paper card package limits should match client request'
);

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const holdUntil = new Date(Date.now() + 20 * 60 * 1000).toISOString();

async function createHeldSession({ sessionId, seatId, holderId }) {
  await run(
    `INSERT INTO sessions
      (id, date, time, cutoff_time, is_available, session_type, is_special_event)
     VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`,
    [sessionId, futureDate]
  );
  await run(
    `INSERT INTO seats
      (id, session_id, table_number, chair_number, status, held_by, held_until)
     VALUES (?, ?, 1, 1, 'held', ?, ?)`,
    [seatId, sessionId, holderId, holdUntil]
  );
}

await createHeldSession({
  sessionId: 'paper-card-limits-session-valid',
  seatId: 'paper-card-limits-seat-valid',
  holderId: 'paper-card-limits-holder-valid',
});
await createHeldSession({
  sessionId: 'paper-card-limits-session-invalid',
  seatId: 'paper-card-limits-seat-invalid',
  holderId: 'paper-card-limits-holder-invalid',
});
await saveDb();

const { app } = await import(appUrl);
const listener = app.listen(0);
const baseUrl = `http://127.0.0.1:${listener.address().port}`;

async function postJson(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

function bookingBody({ sessionId, seatId, holderId, addons }) {
  return {
    sessionId,
    holderId,
    email: '',
    customerFirstName: 'Paper',
    customerLastName: 'Tester',
    attendees: [
      {
        firstName: 'Paper',
        lastName: 'Tester',
        seatId,
        addons,
      },
    ],
  };
}

try {
  const validAddons = Object.entries(paperLimitById).map(([packageId, quantity]) => ({ packageId, quantity }));
  const validResult = await postJson('/api/bookings/initiate', bookingBody({
    sessionId: 'paper-card-limits-session-valid',
    seatId: 'paper-card-limits-seat-valid',
    holderId: 'paper-card-limits-holder-valid',
    addons: validAddons,
  }));

  assert.equal(validResult.response.status, 200);
  assert.ok(validResult.data.bookingId);
  assert.ok(validResult.data.token);

  const requiredTotal = await all("SELECT price FROM packages WHERE type = 'required' AND is_active = 1")
    .then(rows => rows.reduce((sum, pkg) => sum + pkg.price, 0));
  const addonTotal = paperPackages.reduce((sum, pkg) => sum + pkg.price * paperLimitById[pkg.id], 0);
  assert.equal(validResult.data.totalAmount, requiredTotal + addonTotal + 200);
  assert.equal(validResult.data.serviceFeeAmount, 200);

  const invalidResult = await postJson('/api/bookings/initiate', bookingBody({
    sessionId: 'paper-card-limits-session-invalid',
    seatId: 'paper-card-limits-seat-invalid',
    holderId: 'paper-card-limits-holder-invalid',
    addons: [{ packageId: 'pkg-regular-optional-9-up', quantity: 3 }],
  }));

  assert.equal(invalidResult.response.status, 400);
  assert.match(invalidResult.data.error, /9 up is limited to 2 per player/i);

  const savedAddons = await all(
    `SELECT ba.package_id, ba.quantity
     FROM booking_addons ba
     JOIN booking_items bi ON bi.id = ba.booking_item_id
     WHERE bi.booking_id = ?
       AND ba.package_id IN (?, ?, ?, ?)
     ORDER BY ba.package_id ASC`,
    [validResult.data.bookingId, ...Object.keys(paperLimitById)]
  );
  assert.deepEqual(
    Object.fromEntries(savedAddons.map(addon => [addon.package_id, addon.quantity])),
    paperLimitById
  );

  console.log('Paper card limits API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
