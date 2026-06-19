import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-phd-credit-'));
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

const creditPkg = await get("SELECT * FROM packages WHERE id = 'pkg-regular-optional-phd-credit'");
assert.equal(creditPkg.name, '$1 Credit');
assert.equal(creditPkg.price, 100);
assert.equal(creditPkg.max_quantity, 50);
assert.equal(creditPkg.is_phd, 0);

const phdPkg = await get("SELECT * FROM packages WHERE is_phd = 1 AND type = 'optional' AND is_active = 1 ORDER BY sort_order ASC LIMIT 1");
assert.ok(phdPkg, 'expected an active optional PHD package');

const requiredPkgs = await all("SELECT * FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order ASC");
const requiredTotal = requiredPkgs.reduce((sum, pkg) => sum + pkg.price, 0);

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const holdUntil = new Date(Date.now() + 20 * 60 * 1000).toISOString();

async function createHeldSession({ sessionId, seatId, holderId, tableNumber }) {
  await run(
    `INSERT INTO sessions
      (id, date, time, cutoff_time, is_available, session_type, is_special_event)
     VALUES (?, ?, '18:30', '12:00', 1, 'regular_bingo', 0)`,
    [sessionId, futureDate]
  );
  await run(
    `INSERT INTO seats
      (id, session_id, table_number, chair_number, status, held_by, held_until)
     VALUES (?, ?, ?, 1, 'held', ?, ?)`,
    [seatId, sessionId, tableNumber, holderId, holdUntil]
  );
}

await createHeldSession({
  sessionId: 'phd-credit-valid-session',
  seatId: 'phd-credit-valid-seat',
  holderId: 'phd-credit-valid-holder',
  tableNumber: 1,
});
await createHeldSession({
  sessionId: 'phd-credit-no-phd-session',
  seatId: 'phd-credit-no-phd-seat',
  holderId: 'phd-credit-no-phd-holder',
  tableNumber: 2,
});
await createHeldSession({
  sessionId: 'phd-credit-over-limit-session',
  seatId: 'phd-credit-over-limit-seat',
  holderId: 'phd-credit-over-limit-holder',
  tableNumber: 3,
});
await saveDb();

const { app } = await import(appUrl);
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
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
    email: 'credit.tester@example.com',
    customerFirstName: 'Credit',
    customerLastName: 'Tester',
    attendees: [
      {
        firstName: 'Credit',
        lastName: 'Tester',
        seatId,
        addons,
      },
    ],
  };
}

try {
  const validResult = await postJson('/api/bookings/initiate', bookingBody({
    sessionId: 'phd-credit-valid-session',
    seatId: 'phd-credit-valid-seat',
    holderId: 'phd-credit-valid-holder',
    addons: [
      { packageId: phdPkg.id, quantity: 1 },
      { packageId: creditPkg.id, quantity: 50 },
    ],
  }));

  assert.equal(validResult.response.status, 200);
  assert.ok(validResult.data.bookingId);
  assert.equal(validResult.data.totalAmount, requiredTotal + phdPkg.price + creditPkg.price * 50 + 200);

  const savedCredits = await get(
    `SELECT ba.quantity, ba.price
     FROM booking_addons ba
     JOIN booking_items bi ON bi.id = ba.booking_item_id
     WHERE bi.booking_id = ? AND ba.package_id = ?`,
    [validResult.data.bookingId, creditPkg.id]
  );
  assert.equal(savedCredits.quantity, 50);
  assert.equal(savedCredits.price, 5000);

  const noPhdResult = await postJson('/api/bookings/initiate', bookingBody({
    sessionId: 'phd-credit-no-phd-session',
    seatId: 'phd-credit-no-phd-seat',
    holderId: 'phd-credit-no-phd-holder',
    addons: [{ packageId: creditPkg.id, quantity: 1 }],
  }));

  assert.equal(noPhdResult.response.status, 400);
  assert.match(noPhdResult.data.error, /PHD credits are only available/i);

  const overLimitResult = await postJson('/api/bookings/initiate', bookingBody({
    sessionId: 'phd-credit-over-limit-session',
    seatId: 'phd-credit-over-limit-seat',
    holderId: 'phd-credit-over-limit-holder',
    addons: [
      { packageId: phdPkg.id, quantity: 1 },
      { packageId: creditPkg.id, quantity: 51 },
    ],
  }));

  assert.equal(overLimitResult.response.status, 400);
  assert.match(overLimitResult.data.error, /\$1 Credit is limited to 50 per player/i);

  console.log('PHD credit API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
