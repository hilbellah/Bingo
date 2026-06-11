import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-customer-report-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'password123';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { migrate } = await import(migrateUrl);
const { getDb, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const cutoffAt = '2026-06-07T00:00:00.000Z';
const paidAt = '2026-06-07T12:00:00.000Z';
const oldPaidAt = '2026-06-01T12:00:00.000Z';

await run(
  `INSERT INTO settings (key, value)
   VALUES ('sales_report_cutoff_at', ?)`,
  [cutoffAt]
);

await run(
  `INSERT INTO packages
    (id, name, price, type, max_quantity, is_active, sort_order, description, is_phd)
   VALUES (?, ?, ?, 'required', 1, 1, 1, '', 0)`,
  ['customer-required-package', 'Customer Required', 3000]
);
await run(
  `INSERT INTO packages
    (id, name, price, type, max_quantity, is_active, sort_order, description, is_phd)
   VALUES (?, ?, ?, 'optional', 1, 1, 2, '', 0)`,
  ['customer-addon-package', 'Customer Addon', 500]
);
await run(
  `INSERT INTO sessions
    (id, date, time, cutoff_time, is_available, session_type, is_special_event)
   VALUES ('customer-report-session', '2026-06-10', '18:30', '12:00', 1, 'regular_bingo', 0)`
);

for (const [seatId, chairNumber] of [
  ['customer-seat-1', 1],
  ['customer-seat-2', 2],
  ['customer-seat-3', 3],
  ['customer-seat-old', 4],
]) {
  await run(
    `INSERT INTO seats
      (id, session_id, table_number, chair_number, status)
     VALUES (?, 'customer-report-session', 1, ?, 'sold')`,
    [seatId, chairNumber]
  );
}

await run(
  `INSERT INTO bookings
    (id, session_id, reference_number, total_amount, payment_status, email,
     customer_first_name, customer_last_name, email_verified_at, payment_completed_at, created_at)
   VALUES (?, 'customer-report-session', ?, ?, 'paid', 'buyer@example.com',
     'Buyer', 'Person', ?, ?, ?)`,
  ['customer-booking-1', 'BNG-CUSTOMER-1', 7000, paidAt, paidAt, paidAt]
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, 'customer-booking-1', ?, ?, ?, 'customer-required-package', 3000, ?)`,
  ['customer-item-alice', 'Alice', 'Player', 'customer-seat-1', 'BNG-CUSTOMER-T1']
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, 'customer-booking-1', ?, ?, ?, 'customer-required-package', 3000, ?)`,
  ['customer-item-bob', 'Bob', 'Player', 'customer-seat-2', 'BNG-CUSTOMER-T2']
);
await run(
  `INSERT INTO booking_addons
    (id, booking_item_id, package_id, quantity, price)
   VALUES ('customer-addon-bob', 'customer-item-bob', 'customer-addon-package', 1, 500)`
);

await run(
  `INSERT INTO bookings
    (id, session_id, reference_number, total_amount, payment_status, email,
     customer_first_name, customer_last_name, email_verified_at, payment_completed_at, created_at)
   VALUES (?, 'customer-report-session', ?, ?, 'paid', NULL,
     'Buyer', 'Person', NULL, ?, ?)`,
  ['customer-booking-2', 'BNG-CUSTOMER-2', 3000, paidAt, paidAt]
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, 'customer-booking-2', ?, ?, ?, 'customer-required-package', 3000, ?)`,
  ['customer-item-charlie', 'Charlie', 'Guest', 'customer-seat-3', 'BNG-CUSTOMER-T3']
);

await run(
  `INSERT INTO bookings
    (id, session_id, reference_number, total_amount, payment_status, email,
     customer_first_name, customer_last_name, email_verified_at, payment_completed_at, created_at)
   VALUES (?, 'customer-report-session', ?, ?, 'paid', 'hilbert@example.com',
     'Hilbert', 'Tester', ?, ?, ?)`,
  ['customer-booking-old', 'BNG-CUSTOMER-OLD', 3000, oldPaidAt, oldPaidAt, oldPaidAt]
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, 'customer-booking-old', ?, ?, ?, 'customer-required-package', 3000, ?)`,
  ['customer-item-old', 'Hilbert', 'Account', 'customer-seat-old', 'BNG-CUSTOMER-OLD-T1']
);

await saveDb();

const { app } = await import(appUrl);
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;
const auth = Buffer.from('admin@example.com:password123').toString('base64');

try {
  const response = await fetch(`${baseUrl}/api/admin/customers`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const customers = await response.json();

  assert.equal(response.status, 200);
  assert.equal(customers.length, 3);
  assert.deepEqual(customers.map(customer => customer.fullName).sort(), ['Alice Player', 'Bob Player', 'Charlie Guest']);
  assert.equal(customers.reduce((sum, customer) => sum + customer.totalSpent, 0), 10000);
  assert.equal(customers.some(customer => customer.fullName === 'Hilbert Account'), false);

  const bob = customers.find(customer => customer.fullName === 'Bob Player');
  assert.equal(bob.email, 'buyer@example.com');
  assert.equal(bob.ticketCount, 1);
  assert.equal(bob.paidBookingCount, 1);
  assert.equal(bob.sessionCount, 1);
  assert.equal(bob.totalSpent, 3750);
  assert.equal(bob.latestTicketReferenceNumber, 'BNG-CUSTOMER-T2');
  assert.equal(bob.latestBookingReferenceNumber, 'BNG-CUSTOMER-1');
  assert.equal(bob.latestSessionDate, '2026-06-10');
  assert.equal(bob.latestSessionTime, '18:30');
  assert.equal(bob.latestTableNumber, 1);
  assert.equal(bob.latestChairNumber, 2);
  assert.equal(bob.latestPackageName, 'Customer Required');
  assert.equal(bob.latestPurchaserFirstName, 'Buyer');
  assert.equal(bob.latestPurchaserLastName, 'Person');
  assert.equal(Object.hasOwn(bob, 'emailVerifiedAt'), false);

  const charlie = customers.find(customer => customer.fullName === 'Charlie Guest');
  assert.equal(charlie.email, '');
  assert.equal(charlie.ticketCount, 1);
  assert.equal(charlie.paidBookingCount, 1);
  assert.equal(charlie.totalSpent, 3000);
  assert.equal(charlie.latestTicketReferenceNumber, 'BNG-CUSTOMER-T3');

  const searchResponse = await fetch(`${baseUrl}/api/admin/customers?search=bob`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const searchCustomers = await searchResponse.json();
  assert.equal(searchResponse.status, 200);
  assert.deepEqual(searchCustomers.map(customer => customer.fullName), ['Bob Player']);

  const noEmailSearchResponse = await fetch(`${baseUrl}/api/admin/customers?search=charlie`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const noEmailSearchCustomers = await noEmailSearchResponse.json();
  assert.equal(noEmailSearchResponse.status, 200);
  assert.deepEqual(noEmailSearchCustomers.map(customer => customer.fullName), ['Charlie Guest']);

  console.log('Customer report API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
