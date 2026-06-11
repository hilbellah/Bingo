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

const paidAt = '2026-06-07T12:00:00.000Z';
const laterPaidAt = '2026-06-08T12:00:00.000Z';

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

for (const [seatId, chairNumber] of [['customer-seat-1', 1], ['customer-seat-2', 2], ['customer-seat-3', 3]]) {
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
   VALUES (?, 'customer-report-session', ?, ?, 'paid', 'buyer@example.com',
     'Buyer', 'Person', ?, ?, ?)`,
  ['customer-booking-2', 'BNG-CUSTOMER-2', 3000, laterPaidAt, laterPaidAt, laterPaidAt]
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, 'customer-booking-2', ?, ?, ?, 'customer-required-package', 3000, ?)`,
  ['customer-item-charlie', 'Charlie', 'Guest', 'customer-seat-3', 'BNG-CUSTOMER-T3']
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
  assert.equal(customers.length, 1);
  assert.deepEqual(customers.map(customer => customer.fullName), ['Buyer Person']);
  assert.equal(customers.reduce((sum, customer) => sum + customer.totalSpent, 0), 10000);

  const buyer = customers[0];
  assert.equal(buyer.email, 'buyer@example.com');
  assert.equal(buyer.ticketCount, 3);
  assert.equal(buyer.paidBookingCount, 2);
  assert.equal(buyer.sessionCount, 1);
  assert.equal(buyer.totalSpent, 10000);
  assert.equal(buyer.latestTicketReferenceNumber, 'BNG-CUSTOMER-T3');
  assert.equal(buyer.latestBookingReferenceNumber, 'BNG-CUSTOMER-2');
  assert.equal(buyer.latestSessionDate, '2026-06-10');
  assert.equal(buyer.latestSessionTime, '18:30');
  assert.equal(buyer.latestTableNumber, 1);
  assert.equal(buyer.latestChairNumber, 3);
  assert.equal(buyer.latestPackageName, 'Customer Required');
  assert.equal(buyer.latestPurchaserFirstName, 'Buyer');
  assert.equal(buyer.latestPurchaserLastName, 'Person');
  assert.equal(Object.hasOwn(buyer, 'emailVerifiedAt'), false);

  const searchResponse = await fetch(`${baseUrl}/api/admin/customers?search=buyer`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const searchCustomers = await searchResponse.json();
  assert.equal(searchResponse.status, 200);
  assert.deepEqual(searchCustomers.map(customer => customer.fullName), ['Buyer Person']);

  console.log('Customer report API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
