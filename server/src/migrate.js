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

  // --- Special Events & Announcements migration ---
  console.log('Running special events & announcements migration...');

  // Add special event columns to sessions (safe: IF NOT EXISTS not available for columns, use try/catch)
  try { exec('ALTER TABLE sessions ADD COLUMN is_special_event INTEGER DEFAULT 0'); } catch(e) {}
  try { exec('ALTER TABLE sessions ADD COLUMN event_title TEXT'); } catch(e) {}
  try { exec('ALTER TABLE sessions ADD COLUMN event_description TEXT'); } catch(e) {}

  // Session-specific package overrides
  exec(`
    CREATE TABLE IF NOT EXISTS session_packages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      type TEXT NOT NULL,
      max_quantity INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  try { exec('CREATE INDEX idx_session_packages_session ON session_packages(session_id)'); } catch(e) {}

  // Announcements table
  exec(`
    CREATE TABLE IF NOT EXISTS announcements (
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
    )
  `);

  // --- Soft-delete & Audit Log migration ---
  console.log('Running audit log migration...');

  // Add deleted_at column to sessions for soft-delete
  try { exec('ALTER TABLE sessions ADD COLUMN deleted_at TEXT'); } catch(e) {}

  // Audit log table
  exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  try { exec('CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id)'); } catch(e) {}
  try { exec('CREATE INDEX idx_audit_log_action ON audit_log(action)'); } catch(e) {}
  try { exec('CREATE INDEX idx_audit_log_created ON audit_log(created_at)'); } catch(e) {}

  // Settings table (key-value store)
  exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add image_url column to announcements
  try { exec('ALTER TABLE announcements ADD COLUMN image_url TEXT'); } catch(e) {}

  // Default theme settings
  const defaultTheme = JSON.stringify({
    primaryColor: '#1a3a5c',
    accentColor: '#c5a55a',
    headerBg: '#0a1628',
    buttonColor: '#c5a55a',
    seatVacant: '#43a047',
    seatHeld: '#f9a825',
    seatSold: '#757575',
    seatSelected: '#1565c0'
  });
  try { run("INSERT INTO settings (key, value) VALUES ('theme_config', ?)", [defaultTheme]); } catch(e) {}

  // Default general settings
  const defaultGeneral = JSON.stringify({
    businessName: 'SMEC BINGO',
    businessSubtitle: "Saint Mary's Entertainment Centre",
    locationText: '',
    contactPhone: '',
    contactEmail: ''
  });
  try { run("INSERT INTO settings (key, value) VALUES ('general_config', ?)", [defaultGeneral]); } catch(e) {}

  // Default receipt settings
  const defaultReceipt = JSON.stringify({
    businessName: 'SMEC BINGO',
    businessSubtitle: "Saint Mary's Entertainment Centre",
    receiptTitle: 'BOOKING RECEIPT',
    footerText: 'Thank you for your purchase!',
    showRefNumber: true,
    showTableChair: true,
    showPackagePrice: true,
    showAddons: true,
    showTimestamp: true,
    autoPrintEnabled: false,
    paperWidth: '80mm'
  });
  try { run("INSERT INTO settings (key, value) VALUES ('receipt_config', ?)", [defaultReceipt]); } catch(e) {}

  // --- PHD Inventory migration ---
  console.log('Running PHD inventory migration...');

  // Add is_phd flag to packages and session_packages to identify handheld devices
  try { exec('ALTER TABLE packages ADD COLUMN is_phd INTEGER DEFAULT 0'); } catch(e) {}
  try { exec('ALTER TABLE session_packages ADD COLUMN is_phd INTEGER DEFAULT 0'); } catch(e) {}

  // Default PHD inventory settings (total_stock=200, per_player_limit=2)
  const defaultPhdInventory = JSON.stringify({
    totalStock: 200,
    perPlayerLimit: 2
  });
  try { run("INSERT INTO settings (key, value) VALUES ('phd_inventory', ?)", [defaultPhdInventory]); } catch(e) {}

  console.log('Migrations complete.');
}

migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
