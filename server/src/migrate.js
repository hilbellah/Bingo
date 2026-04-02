import { getDb, exec } from './database.js';

async function migrate() {
  await getDb();
  console.log('Running migrations...');

  exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      cutoff_time TEXT NOT NULL DEFAULT '12:00',
      is_available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seats (
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

    CREATE TABLE IF NOT EXISTS packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      type TEXT NOT NULL,
      max_quantity INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      reference_number TEXT NOT NULL UNIQUE,
      total_amount INTEGER NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS booking_items (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      seat_id TEXT NOT NULL,
      package_id TEXT NOT NULL,
      price INTEGER NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (seat_id) REFERENCES seats(id),
      FOREIGN KEY (package_id) REFERENCES packages(id)
    );

    CREATE TABLE IF NOT EXISTS booking_addons (
      id TEXT PRIMARY KEY,
      booking_item_id TEXT NOT NULL,
      package_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price INTEGER NOT NULL,
      FOREIGN KEY (booking_item_id) REFERENCES booking_items(id) ON DELETE CASCADE,
      FOREIGN KEY (package_id) REFERENCES packages(id)
    );
  `);

  try { exec('CREATE INDEX idx_seats_session ON seats(session_id)'); } catch(e) {}
  try { exec('CREATE INDEX idx_seats_table ON seats(session_id, table_number)'); } catch(e) {}
  try { exec('CREATE INDEX idx_seats_status ON seats(session_id, status)'); } catch(e) {}
  try { exec('CREATE INDEX idx_bookings_session ON bookings(session_id)'); } catch(e) {}
  try { exec('CREATE INDEX idx_booking_items_booking ON booking_items(booking_id)'); } catch(e) {}
  try { exec('CREATE INDEX idx_booking_items_seat ON booking_items(seat_id)'); } catch(e) {}
  try { exec('CREATE INDEX idx_bookings_reference ON bookings(reference_number)'); } catch(e) {}

  console.log('Migrations complete.');
}

migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
