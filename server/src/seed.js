import { getDb, exec, run, saveDb } from './database.js';
import { v4 as uuid } from 'uuid';
import { REGULAR_BINGO_PACKAGE_DEFINITIONS } from './services/sessionPackages.js';

// Venue table numbers (1-75)
const TABLE_NUMBERS = [];
for (let i = 1; i <= 75; i++) {
  TABLE_NUMBERS.push(i);
}
const CHAIRS_PER_TABLE = 6;

async function seed() {
  if ((process.env.DB_DRIVER || 'sqlite').toLowerCase() === 'postgres') {
    console.log('seed.js: DB_DRIVER=postgres detected. Skipping SQLite seed.');
    console.log('seed.js: Postgres schema/data is managed separately; seed.js uses SQLite-only bulk APIs.');
    process.exit(0);
  }

  const db = await getDb();

  // === IDEMPOTENCY GUARD ===
  //
  // This seed file is DESTRUCTIVE - the DROP TABLE statements below wipe all
  // bookings, sessions, seats, packages, and announcements. We must NEVER let
  // it run against a populated production database.
  //
  // This guard checks whether `packages` already has rows. If it does, the DB
  // has been seeded before - we exit immediately, preserving all data.
  //
  // To force a re-seed on a populated DB, manually drop the `packages` table
  // first, then run `node src/seed.js`.
  //
  // Note: this seed is NO LONGER called from render.yaml's buildCommand. It
  // only runs when someone (you, or a setup script) explicitly invokes it via
  // `node src/seed.js`. The guard is an additional safety layer.
  try {
    const result = db.exec('SELECT COUNT(*) as cnt FROM packages');
    const pkgCount = result[0]?.values?.[0]?.[0] || 0;
    if (pkgCount > 0) {
      console.log(`Seed skipped: ${pkgCount} packages already exist. Database is already populated.`);
      console.log('To force a re-seed, drop the packages table manually first.');
      process.exit(0);
    }
  } catch (e) {
    // `packages` table doesn't exist yet - fresh database - proceed with seed
  }

  console.log('Running migrations...');

  // Drop old tables to start fresh
  try { exec('DROP TABLE IF EXISTS booking_addons'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS booking_items'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS bookings'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS session_packages'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS seats'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS sessions'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS packages'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS tables_layout'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS announcements'); } catch(e) {}
  try { exec('DROP TABLE IF EXISTS audit_log'); } catch(e) {}

  exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT NOT NULL,
      cutoff_time TEXT NOT NULL DEFAULT '12:00', is_available INTEGER NOT NULL DEFAULT 1,
      is_special_event INTEGER DEFAULT 0,
      event_title TEXT,
      event_description TEXT,
      deleted_at TEXT,
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
      is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
      is_phd INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
      reference_number TEXT NOT NULL UNIQUE, total_amount INTEGER NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      email TEXT,
      customer_first_name TEXT,
      customer_last_name TEXT,
      email_verified_at TEXT,
      payment_provider TEXT DEFAULT 'authorize_net',
      transaction_id TEXT,
      auth_code TEXT,
      payment_attempted_at TEXT,
      payment_completed_at TEXT,
      payment_failure_reason TEXT,
      hosted_token TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE TABLE booking_items (
      id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, first_name TEXT NOT NULL,
      last_name TEXT NOT NULL, seat_id TEXT NOT NULL, package_id TEXT NOT NULL,
      price INTEGER NOT NULL, reference_number TEXT UNIQUE,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (seat_id) REFERENCES seats(id)
    );
    CREATE TABLE booking_addons (
      id TEXT PRIMARY KEY, booking_item_id TEXT NOT NULL, package_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1, price INTEGER NOT NULL,
      FOREIGN KEY (booking_item_id) REFERENCES booking_items(id) ON DELETE CASCADE
    );

    CREATE TABLE session_packages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      type TEXT NOT NULL,
      max_quantity INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      is_phd INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE announcements (
      id TEXT PRIMARY KEY,
      title TEXT,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_active INTEGER DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE email_verifications (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      customer_first_name TEXT,
      customer_last_name TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      first_name TEXT,
      last_name TEXT,
      email_verified_at TEXT,
      first_booking_at TEXT,
      last_booking_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE payment_events (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      raw_payload TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );

    CREATE INDEX idx_seats_session ON seats(session_id);
    CREATE INDEX idx_seats_table ON seats(session_id, table_number);
    CREATE INDEX idx_seats_status ON seats(session_id, status);
    CREATE INDEX idx_bookings_session ON bookings(session_id);
    CREATE INDEX idx_bookings_email ON bookings(email);
    CREATE INDEX idx_bookings_payment_status ON bookings(payment_status);
    CREATE INDEX idx_booking_items_booking ON booking_items(booking_id);
    CREATE INDEX idx_email_verifications_email ON email_verifications(email);
    CREATE INDEX idx_customers_email ON customers(email);
    CREATE INDEX idx_customers_last_booking ON customers(last_booking_at);
    CREATE INDEX idx_payment_events_booking ON payment_events(booking_id);
    CREATE INDEX idx_session_packages_session ON session_packages(session_id);
    CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX idx_audit_log_action ON audit_log(action);
    CREATE INDEX idx_audit_log_created ON audit_log(created_at);
  `);

  console.log('Seeding database...');

  // Use db.run() directly (no saveDb per call) for bulk inserts, wrapped in transaction
  db.run('BEGIN TRANSACTION');

  // --- Packages ---
  const requiredPkg = 'pkg-regular-required-9-up';
  const tooniePkg = 'pkg-regular-required-toonie-ball';
  const optional9UpPkg = 'pkg-regular-optional-9-up';
  const pkgs = REGULAR_BINGO_PACKAGE_DEFINITIONS.map(pkg => [
    pkg.id,
    pkg.name,
    pkg.price,
    pkg.type,
    pkg.max_quantity,
    1,
    pkg.sort_order,
    pkg.is_phd,
  ]);
  for (const p of pkgs) {
    db.run('INSERT INTO packages (id, name, price, type, max_quantity, is_active, sort_order, is_phd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', p);
  }

  // --- Sessions (next 10 upcoming regular bingo sessions) ---
  const sessionIds = [];
  const today = new Date();
  let dayOffset = 0;
  while (sessionIds.length < 10) {
    const d = new Date(today);
    d.setDate(today.getDate() + dayOffset);
    dayOffset++;
    if (d.getDay() === 1) continue; // No Monday regular night bingo
    const dateStr = d.toISOString().split('T')[0];
    const time = d.getDay() === 0 ? '18:00' : '18:30';
    const sid = uuid();
    sessionIds.push(sid);
    db.run('INSERT INTO sessions (id, date, time, cutoff_time, is_available) VALUES (?, ?, ?, ?, ?)',
      [sid, dateStr, time, '12:00', 1]);
  }

  // --- Chairs for each session (75 tables x 6 chairs = 450 per session) ---
  const seatLookup = {};
  let totalChairs = 0;
  for (const sid of sessionIds) {
    seatLookup[sid] = {};
    for (const tNum of TABLE_NUMBERS) {
      seatLookup[sid][tNum] = {};
      for (let ch = 1; ch <= CHAIRS_PER_TABLE; ch++) {
        const seatId = uuid();
        db.run('INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
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
    db.run(
      `INSERT INTO bookings
        (id, session_id, reference_number, total_amount, payment_status, created_at, email,
         customer_first_name, customer_last_name, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b1, fs, ref(), 9400, 'paid', new Date(Date.now() - 86400000).toISOString(), 'john.smith@example.com', 'John', 'Smith', new Date(Date.now() - 86400000).toISOString()]
    );
    db.run(
      `INSERT INTO customers
        (id, email, first_name, last_name, email_verified_at, first_booking_at, last_booking_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), 'john.smith@example.com', 'John', 'Smith', new Date(Date.now() - 86400000).toISOString(), new Date(Date.now() - 86400000).toISOString(), new Date(Date.now() - 86400000).toISOString(), new Date(Date.now() - 86400000).toISOString(), new Date(Date.now() - 86400000).toISOString()]
    );
    db.run('INSERT INTO booking_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [bi1, b1, 'John', 'Smith', s[1][1], requiredPkg, 3000, ref()]);
    db.run('INSERT INTO booking_addons VALUES (?, ?, ?, ?, ?)', [uuid(), bi1, tooniePkg, 1, 200]);
    db.run('INSERT INTO booking_addons VALUES (?, ?, ?, ?, ?)', [uuid(), bi1, optional9UpPkg, 1, 3000]);
    db.run("UPDATE seats SET status = 'sold' WHERE id = ?", [s[1][1]]);
    db.run('INSERT INTO booking_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [bi2, b1, 'Jane', 'Smith', s[1][2], requiredPkg, 3000, ref()]);
    db.run('INSERT INTO booking_addons VALUES (?, ?, ?, ?, ?)', [uuid(), bi2, tooniePkg, 1, 200]);
    db.run("UPDATE seats SET status = 'sold' WHERE id = ?", [s[1][2]]);

    // Booking 2: Party of 3 at Table 5 (chairs 1, 2, 3)
    const b2 = uuid();
    db.run(
      `INSERT INTO bookings
        (id, session_id, reference_number, total_amount, payment_status, created_at, email,
         customer_first_name, customer_last_name, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b2, fs, ref(), 9600, 'paid', new Date(Date.now() - 43200000).toISOString(), 'mike.johnson@example.com', 'Mike', 'Johnson', new Date(Date.now() - 43200000).toISOString()]
    );
    db.run(
      `INSERT INTO customers
        (id, email, first_name, last_name, email_verified_at, first_booking_at, last_booking_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), 'mike.johnson@example.com', 'Mike', 'Johnson', new Date(Date.now() - 43200000).toISOString(), new Date(Date.now() - 43200000).toISOString(), new Date(Date.now() - 43200000).toISOString(), new Date(Date.now() - 43200000).toISOString(), new Date(Date.now() - 43200000).toISOString()]
    );
    const names = [['Mike', 'Johnson'], ['Sarah', 'Johnson'], ['Tom', 'Johnson']];
    for (let i = 0; i < 3; i++) {
      const itemId = uuid();
      db.run('INSERT INTO booking_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [itemId, b2, names[i][0], names[i][1], s[5][i + 1], requiredPkg, 3000, ref()]);
      db.run('INSERT INTO booking_addons VALUES (?, ?, ?, ?, ?)', [uuid(), itemId, tooniePkg, 1, 200]);
      db.run("UPDATE seats SET status = 'sold' WHERE id = ?", [s[5][i + 1]]);
    }

    // Booking 3: Single at Table 42 (chair 1)
    const b3 = uuid(), bi6 = uuid();
    db.run(
      `INSERT INTO bookings
        (id, session_id, reference_number, total_amount, payment_status, created_at, email,
         customer_first_name, customer_last_name, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b3, fs, ref(), 6200, 'paid', new Date(Date.now() - 7200000).toISOString(), 'alice.williams@example.com', 'Alice', 'Williams', new Date(Date.now() - 7200000).toISOString()]
    );
    db.run(
      `INSERT INTO customers
        (id, email, first_name, last_name, email_verified_at, first_booking_at, last_booking_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), 'alice.williams@example.com', 'Alice', 'Williams', new Date(Date.now() - 7200000).toISOString(), new Date(Date.now() - 7200000).toISOString(), new Date(Date.now() - 7200000).toISOString(), new Date(Date.now() - 7200000).toISOString(), new Date(Date.now() - 7200000).toISOString()]
    );
    db.run('INSERT INTO booking_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [bi6, b3, 'Alice', 'Williams', s[42][1], requiredPkg, 3000, ref()]);
    db.run('INSERT INTO booking_addons VALUES (?, ?, ?, ?, ?)', [uuid(), bi6, tooniePkg, 1, 200]);
    db.run('INSERT INTO booking_addons VALUES (?, ?, ?, ?, ?)', [uuid(), bi6, optional9UpPkg, 1, 3000]);
    db.run("UPDATE seats SET status = 'sold' WHERE id = ?", [s[42][1]]);
  }

  db.run('COMMIT');
  saveDb();

  const chairsSold = 6; // 2 + 3 + 1
  console.log('Seed complete.');
  console.log(`  - ${pkgs.length} packages`);
  console.log(`  - ${sessionIds.length} sessions`);
  console.log(`  - ${TABLE_NUMBERS.length} tables x ${CHAIRS_PER_TABLE} chairs = ${TABLE_NUMBERS.length * CHAIRS_PER_TABLE} chairs per session (${totalChairs} total)`);
  console.log(`  - 3 sample bookings (${chairsSold} chairs sold)`);
  process.exit(0);
}

seed().catch(e => {
  const isRenderDiskUnavailable = String(e?.message || '').includes('Render persistent disk is not available');
  const databaseUrl = process.env.DATABASE_URL || '';

  // Render persistent disks are mounted only at runtime, not during build.
  // Some Render service settings still run seed.js in the build command. Seed
  // is destructive and should never run on deploy, so skip this build-time path
  // cleanly when the runtime disk is unavailable.
  if (isRenderDiskUnavailable && databaseUrl.startsWith('/var/data/')) {
    console.warn('Skipping direct seed.js run because Render persistent disk is unavailable during build.');
    console.warn('Seeds do not run on deploy; migrations and baseline-package recovery run during server startup.');
    process.exit(0);
  }

  console.error(e);
  process.exit(1);
});
