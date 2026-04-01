import { getDb, exec, run } from './database.js';
import { v4 as uuid } from 'uuid';

// Venue table numbers (1-75, no table 41)
const TABLE_NUMBERS = [];
for (let i = 1; i <= 75; i++) {
  if (i !== 41) TABLE_NUMBERS.push(i);
}
const CHAIRS_PER_TABLE = 6;

async function seed() {
  await getDb();

  console.log('Running migrations...');

  // Drop old tables to start fresh
  try { exec('DROP TABLE IF EXISTS booking_addons'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS booking_items'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS bookings'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS seats'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS sessions'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS packages'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS tables_layout'); } catch(e) {}

  exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT NOT NULL,
      cutoff_time TEXT NOT NULL DEFAULT '12:00', is_available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE seats (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      table_number INTEGER NOT NULL,
      chair_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'vacant',
      held_by TEXT,
      held_until TEXT,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, table_number, chair_number)
    );
    CREATE TABLE packages (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL,
      type TEXT NOT NULL, max_quantity INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
      reference_number TEXT NOT NULL UNIQUE, total_amount INTEGER NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE TABLE booking_items (
      id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, first_name TEXT NOT NULL,
      last_name TEXT NOT NULL, seat_id TEXT NOT NULL, package_id TEXT NOT NULL,
      price INTEGER NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (seat_id) REFERENCES seats(id),
      FOREIGN KEY (package_id) REFERENCES packages(id)
    );
    CREATE TABLE booking_addons (
      id TEXT PRIMARY KEY, booking_item_id TEXT NOT NULL, package_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1, price INTEGER NOT NULL,
      FOREIGN KEY (booking_item_id) REFERENCES booking_items(id) ON DELETE CASCADE,
      FOREIGN KEY (package_id) REFERENCES packages(id)
    );

    CREATE INDEX idx_seats_session ON seats(session_id);
    CREATE INDEX idx_seats_table ON seats(session_id, table_number);
    CREATE INDEX idx_seats_status ON seats(session_id, status);
    CREATE INDEX idx_bookings_session ON bookings(session_id);
    CREATE INDEX idx_booking_items_booking ON booking_items(booking_id);
  `);

  console.log('Seeding database...');

  // --- Packages ---
  const requiredPkg = uuid();
  const opt1 = uuid(), opt2 = uuid(), opt3 = uuid(), opt4 = uuid();
  const opt5 = uuid(), opt6 = uuid(), opt7 = uuid();

  const pkgs = [
    [requiredPkg, '12up / Toonie', 1800, 'required', 1, 1, 0],
    [opt1, '3 Special Books (1 Free)', 1400, 'optional', 4, 1, 1],
    [opt2, 'Single Special Book', 700, 'optional', 7, 1, 2],
    [opt3, '6-up Admission Book', 500, 'optional', 4, 1, 3],
    [opt4, '3-up Admission Book', 300, 'optional', 4, 1, 4],
    [opt5, 'Letter "W" Card', 200, 'optional', 4, 1, 5],
    [opt6, 'Mega Jackpot', 200, 'optional', 12, 1, 6],
    [opt7, 'Winner Take All', 100, 'optional', 12, 1, 7],
  ];
  for (const p of pkgs) {
    run('INSERT INTO packages (id, name, price, type, max_quantity, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', p);
  }

  // --- Sessions (next 10 days, skip Wednesdays) ---
  const sessionIds = [];
  const today = new Date();
  for (let i = 0; i < 10; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 3) continue; // Skip Wednesday
    const dateStr = d.toISOString().split('T')[0];
    const sid = uuid();
    sessionIds.push(sid);
    run('INSERT INTO sessions (id, date, time, cutoff_time, is_available) VALUES (?, ?, ?, ?, ?)',
      [sid, dateStr, '18:30', '12:00', 1]);
  }

  // --- Chairs for each session (74 tables x 6 chairs = 444 per session) ---
  // seatLookup[sessionId][tableNumber][chairNumber] = seatId
  const seatLookup = {};
  let totalChairs = 0;
  for (const sid of sessionIds) {
    seatLookup[sid] = {};
    for (const tNum of TABLE_NUMBERS) {
      seatLookup[sid][tNum] = {};
      for (let ch = 1; ch <= CHAIRS_PER_TABLE; ch++) {
        const seatId = uuid();
        run('INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
          [seatId, sid, tNum, ch, 'vacant']);
        seatLookup[sid][tNum][ch] = seatId;
        totalChairs++;
      }
    }
  }

  // --- Sample bookings for first session ---
  if (sessionIds.length > 0) {
    const fs = sessionIds[0];
    const s = seatLookup[fs];
    const ref = () => 'BNG-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    // Booking 1: Party of 2 at Table 1 (chairs 1 & 2)
    const b1 = uuid(), bi1 = uuid(), bi2 = uuid();
    run('INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?)', [b1, fs, ref(), 5000, 'paid', new Date(Date.now() - 86400000).toISOString()]);
    run('INSERT INTO booking_items VALUES (?, ?, ?, ?, ?, ?, ?)', [bi1, b1, 'John', 'Smith', s[1][1], requiredPkg, 1800]);
    run('INSERT INTO booking_addons VALUES (?, ?, ?, ?, ?)', [uuid(), bi1, opt1, 1, 1400]);
    run("UPDATE seats SET status = 'sold' WHERE id = ?", [s[1][1]]);
    run('INSERT INTO booking_items VALUES (?, ?, ?, ?, ?, ?, ?)', [bi2, b1, 'Jane', 'Smith', s[1][2], requiredPkg, 1800]);
    run("UPDATE seats SET status = 'sold' WHERE id = ?", [s[1][2]]);

    // Booking 2: Party of 3 at Table 5 (chairs 1, 2, 3)
    const b2 = uuid();
    run('INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?)', [b2, fs, ref(), 5400, 'paid', new Date(Date.now() - 43200000).toISOString()]);
    const names = [['Mike', 'Johnson'], ['Sarah', 'Johnson'], ['Tom', 'Johnson']];
    for (let i = 0; i < 3; i++) {
      run('INSERT INTO booking_items VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), b2, names[i][0], names[i][1], s[5][i + 1], requiredPkg, 1800]);
      run("UPDATE seats SET status = 'sold' WHERE id = ?", [s[5][i + 1]]);
    }

    // Booking 3: Single at Table 42 (chair 1)
    const b3 = uuid(), bi6 = uuid();
    run('INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?)', [b3, fs, ref(), 3200, 'paid', new Date(Date.now() - 7200000).toISOString()]);
    run('INSERT INTO booking_items VALUES (?, ?, ?, ?, ?, ?, ?)', [bi6, b3, 'Alice', 'Williams', s[42][1], requiredPkg, 1800]);
    run('INSERT INTO booking_addons VALUES (?, ?, ?, ?, ?)', [uuid(), bi6, opt1, 1, 1400]);
    run("UPDATE seats SET status = 'sold' WHERE id = ?", [s[42][1]]);
  }

  const chairsSold = 6; // 2 + 3 + 1
  console.log('Seed complete.');
  console.log(`  - ${pkgs.length} packages`);
  console.log(`  - ${sessionIds.length} sessions`);
  console.log(`  - ${TABLE_NUMBERS.length} tables x ${CHAIRS_PER_TABLE} chairs = ${TABLE_NUMBERS.length * CHAIRS_PER_TABLE} chairs per session (${totalChairs} total)`);
  console.log(`  - 3 sample bookings (${chairsSold} chairs sold)`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
