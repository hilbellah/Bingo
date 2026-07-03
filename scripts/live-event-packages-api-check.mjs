import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-live-event-packages-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.SESSION_HOLD_MINUTES = '20';
process.env.PAYMENT_FAILURE_HOLD_MINUTES = '5';
process.env.ANET_ENV = 'sandbox';
process.env.ADMIN_USERNAME = 'live-event-admin';
process.env.ADMIN_PASSWORD = 'live-event-password';

const databaseUrl = pathToFileURL(path.join(repoRoot, 'server/src/database.js'));
const migrateUrl = pathToFileURL(path.join(repoRoot, 'server/src/migrate.js'));
const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));

const { migrate } = await import(migrateUrl);
const { getDb, get, run, saveDb } = await import(databaseUrl);

await migrate();
await getDb();

const globalPhdPackage = await get("SELECT id FROM packages WHERE is_phd = 1 AND is_active = 1 LIMIT 1");
assert.ok(globalPhdPackage, 'test setup should include a global PHD package');

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const pastCutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const holdUntil = new Date(Date.now() + 20 * 60 * 1000).toISOString();

async function createEventSession({ sessionId, seatId, holderId, withPackage, salesCutoffAt = null }) {
  await run(
    `INSERT INTO sessions
      (id, date, time, cutoff_time, sales_cutoff_at, is_available, session_type, is_special_event, event_title)
     VALUES (?, ?, '19:00', '18:00', ?, 1, 'event', 1, ?)`,
    [sessionId, futureDate, salesCutoffAt, sessionId]
  );
  await run(
    `INSERT INTO seats
      (id, session_id, table_number, chair_number, status, held_by, held_until)
     VALUES (?, ?, 1, 1, 'held', ?, ?)`,
    [seatId, sessionId, holderId, holdUntil]
  );
  if (withPackage) {
    await run(
      `INSERT INTO session_packages
        (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description)
       VALUES (?, ?, 'General Admission', 2500, 'required', 1, 0, 0, 'Admission ticket')`,
      [`${sessionId}-ticket`, sessionId]
    );
    await run(
      `INSERT INTO session_packages
        (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description)
       VALUES (?, ?, 'VIP Admission', 4000, 'required', 1, 1, 0, 'VIP ticket')`,
      [`${sessionId}-vip-ticket`, sessionId]
    );
  }
}

async function createSpecialBingoSession({ sessionId, seatId, holderId, salesCutoffAt = null }) {
  await run(
    `INSERT INTO sessions
      (id, date, time, cutoff_time, sales_cutoff_at, is_available, session_type, is_special_event, event_title)
     VALUES (?, ?, '18:30', '12:00', ?, 1, 'special_bingo', 1, 'Special Bingo')`,
    [sessionId, futureDate, salesCutoffAt]
  );
  await run(
    `INSERT INTO seats
      (id, session_id, table_number, chair_number, status, held_by, held_until)
     VALUES (?, ?, 2, 1, 'held', ?, ?)`,
    [seatId, sessionId, holderId, holdUntil]
  );
  await run(
    `INSERT INTO session_packages
      (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description)
     VALUES (?, ?, 'Special Bingo Admission', 7500, 'required', 1, 0, 0, '')`,
    [`${sessionId}-admission`, sessionId]
  );
  await run(
    `INSERT INTO session_packages
      (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description)
     VALUES (?, ?, 'PHD Unit', 5000, 'optional', 1, 1, 1, 'Handheld device for special bingo.')`,
    [`${sessionId}-phd`, sessionId]
  );
}

await createEventSession({
  sessionId: 'event-with-ticket',
  seatId: 'event-with-ticket-seat',
  holderId: 'event-with-ticket-holder',
  withPackage: true,
});
await createEventSession({
  sessionId: 'event-without-ticket',
  seatId: 'event-without-ticket-seat',
  holderId: 'event-without-ticket-holder',
  withPackage: false,
});
await createEventSession({
  sessionId: 'event-cutoff-closed',
  seatId: 'event-cutoff-closed-seat',
  holderId: 'event-cutoff-closed-holder',
  withPackage: true,
  salesCutoffAt: `${pastCutoffDate}T12:00`,
});
await run(
  `INSERT INTO settings (key, value)
   VALUES ('special_bingo_config', ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  [JSON.stringify({
    admissionName: 'Special Bingo Admission',
    admissionPrice: 10000,
    additionalPhdName: 'Additional PHD Unit',
    additionalPhdPrice: 5000,
    additionalPhdMaxQuantity: 2,
  })]
);
await createSpecialBingoSession({
  sessionId: 'same-day-special-bingo',
  seatId: 'same-day-special-bingo-seat',
  holderId: 'same-day-special-bingo-holder',
});
await createSpecialBingoSession({
  sessionId: 'special-bingo-cutoff-closed',
  seatId: 'special-bingo-cutoff-closed-seat',
  holderId: 'special-bingo-cutoff-closed-holder',
  salesCutoffAt: `${pastCutoffDate}T12:00`,
});
await run(
  `INSERT INTO bookings
    (id, session_id, reference_number, total_amount, payment_status, created_at, email,
     customer_first_name, customer_last_name, ticket_access_token)
   VALUES (?, ?, ?, 2500, 'paid', ?, '', 'General', 'Admission', ?)`,
  ['event-general-admission-booking', 'event-with-ticket', 'BNG-EVENT-GA', new Date().toISOString(), 'event-access-token']
);
await run(
  `INSERT INTO booking_items
    (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
   VALUES (?, ?, 'General', 'Admission', ?, ?, 2500, ?)`,
  ['event-general-admission-item', 'event-general-admission-booking', 'event-with-ticket-seat', 'event-with-ticket-ticket', 'BNG-EVENT-TICKET']
);
await run(
  `INSERT INTO seats
    (id, session_id, table_number, chair_number, status, held_by, held_until)
   VALUES (?, 'event-with-ticket', 1, 2, 'held', 'event-vip-holder', ?)`,
  ['event-with-ticket-vip-seat', holdUntil]
);
await run(
  `UPDATE seats SET status = 'sold', held_by = NULL, held_until = NULL WHERE id = ?`,
  ['event-with-ticket-seat']
);
await saveDb();

const { app } = await import(appUrl);
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const data = await response.json();
  return { response, data };
}

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
  const configuredPackages = await getJson('/api/sessions/event-with-ticket/packages');
  assert.equal(configuredPackages.response.status, 200);
  assert.deepEqual(configuredPackages.data.map(pkg => pkg.name), ['General Admission', 'VIP Admission']);
  assert(configuredPackages.data.every(pkg => !pkg.is_phd), 'configured event packages should not include PHD');

  const unconfiguredPackages = await getJson('/api/sessions/event-without-ticket/packages');
  assert.equal(unconfiguredPackages.response.status, 200);
  assert.deepEqual(unconfiguredPackages.data, []);

  const initiateMissingTicket = await postJson('/api/bookings/initiate', {
    sessionId: 'event-without-ticket',
    holderId: 'event-without-ticket-holder',
    email: 'event.tester@example.com',
    customerFirstName: 'Event',
    customerLastName: 'Tester',
    attendees: [
      {
        firstName: 'Event',
        lastName: 'Tester',
        seatId: 'event-without-ticket-seat',
        addons: [],
      },
    ],
  });
  assert.equal(initiateMissingTicket.response.status, 409);
  assert.match(initiateMissingTicket.data.error, /Live event ticket package is not configured/i);

  const eventTickets = await getJson('/api/bookings/BNG-EVENT-GA/tickets?t=event-access-token');
  assert.equal(eventTickets.response.status, 200);
  assert.equal(eventTickets.data.sessionType, 'event');
  assert.equal(eventTickets.data.printLayout, 'event_6up');
  assert.equal(eventTickets.data.tickets.length, 1);
  assert.equal(eventTickets.data.tickets[0].packageName, 'General Admission');
  assert.equal(eventTickets.data.tickets[0].tableNumber, null);
  assert.equal(eventTickets.data.tickets[0].chairNumber, null);

  const vipInitiate = await postJson('/api/bookings/initiate', {
    sessionId: 'event-with-ticket',
    holderId: 'event-vip-holder',
    email: 'vip.event.tester@example.com',
    customerFirstName: 'VIP',
    customerLastName: 'Tester',
    attendees: [
      {
        firstName: 'VIP',
        lastName: 'Tester',
        seatId: 'event-with-ticket-vip-seat',
        ticketPackageId: 'event-with-ticket-vip-ticket',
        addons: [],
      },
    ],
  });
  assert.equal(vipInitiate.response.status, 200);
  assert.equal(vipInitiate.data.totalAmount, 4600);
  assert.equal(vipInitiate.data.salesTaxAmount, 600);
  assert.equal(vipInitiate.data.serviceFeeAmount, 0);

  const sessions = await getJson('/api/sessions');
  const sameDaySessions = sessions.data
    .filter(session => session.date === futureDate)
    .map(session => [session.id, session.session_type])
    .sort((left, right) => left[0].localeCompare(right[0]));
  assert.ok(
    sameDaySessions.some(([id, sessionType]) => id === 'same-day-special-bingo' && sessionType === 'special_bingo'),
    'same-day special bingo should remain visible when live events exist'
  );
  assert.ok(
    sameDaySessions.some(([id, sessionType]) => id === 'event-with-ticket' && sessionType === 'event'),
    'same-day live event should remain visible when special bingo exists'
  );

  const specialPackages = await getJson('/api/sessions/same-day-special-bingo/packages');
  assert.equal(specialPackages.response.status, 200);
  assert.deepEqual(specialPackages.data.map(pkg => pkg.name), ['Special Bingo Admission', 'PHD Unit']);
  assert.equal(Boolean(specialPackages.data[0].is_phd), false, 'special bingo admission should not include PHD');
  assert.equal(Boolean(specialPackages.data[1].is_phd), true, 'special bingo should expose a separate PHD add-on');
  assert.equal(specialPackages.data[1].max_quantity, 1, 'special bingo PHD add-on should be capped at one');

  const auth = Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString('base64');
  const sameHourSpecial = await postJson('/api/admin/sessions', {
    date: futureDate,
    time: '19:30',
    cutoff_time: '12:00',
    doors_open_time: '17:15',
    is_available: true,
    session_type: 'special_bingo',
    is_special_event: true,
    event_title: 'Admin Same-Hour Special Bingo',
  }, { Authorization: `Basic ${auth}` });
  assert.equal(
    sameHourSpecial.response.status,
    200,
    sameHourSpecial.data.error || 'admin should allow special bingo in same hour as a live event'
  );
  assert.equal(sameHourSpecial.data.session_type, 'special_bingo');
  assert.equal(sameHourSpecial.data.doors_open_time, '17:15');
  const updateDoorsResponse = await fetch(`${baseUrl}/api/admin/sessions/${sameHourSpecial.data.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ doors_open_time: '17:30' }),
  });
  const updateDoors = { response: updateDoorsResponse, data: await updateDoorsResponse.json() };
  assert.equal(updateDoors.response.status, 200);
  const updatedSpecial = (await getJson('/api/sessions')).data.find(session => session.id === sameHourSpecial.data.id);
  assert.equal(updatedSpecial.doors_open_time, '17:30');
  const sameHourSpecialPackages = await getJson(`/api/sessions/${sameHourSpecial.data.id}/packages`);
  assert.equal(sameHourSpecialPackages.response.status, 200);
  assert.deepEqual(
    sameHourSpecialPackages.data.map(pkg => [pkg.name, pkg.price, pkg.type, pkg.max_quantity, Boolean(pkg.is_phd)]),
    [
      ['Special Bingo Admission', 7500, 'required', 1, false],
      ['PHD Unit', 5000, 'optional', 1, true],
    ],
    'stale special bingo settings should normalize back to CA$75 admission and one CA$50 PHD add-on'
  );

  const sameHourRegular = await postJson('/api/admin/sessions', {
    date: futureDate,
    time: '19:45',
    cutoff_time: '12:00',
    is_available: true,
    session_type: 'regular_bingo',
    is_special_event: false,
  }, { Authorization: `Basic ${auth}` });
  assert.equal(sameHourRegular.response.status, 409);
  assert.match(sameHourRegular.data.error, /bingo session already exists/i);

  const cutoffClosedEvent = sessions.data.find(session => session.id === 'event-cutoff-closed');
  assert.ok(cutoffClosedEvent, 'expected cutoff test event in public sessions');
  assert.equal(cutoffClosedEvent.booking_closed_reason, 'cutoff');
  assert.match(cutoffClosedEvent.booking_closed_message, /sales cutoff/i);
  assert.ok(cutoffClosedEvent.starts_at, 'cutoff event should still have a future start time');

  const cutoffClosedSpecial = sessions.data.find(session => session.id === 'special-bingo-cutoff-closed');
  assert.ok(cutoffClosedSpecial, 'expected cutoff test special bingo in public sessions');
  assert.equal(cutoffClosedSpecial.booking_closed_reason, 'cutoff');
  assert.match(cutoffClosedSpecial.booking_closed_message, /sales cutoff/i);
  assert.ok(cutoffClosedSpecial.starts_at, 'cutoff special bingo should still have a future start time');

  console.log('Live event packages API check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
