import { getDb, exec, all, run, saveDb } from './database.js';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { REGULAR_BINGO_PACKAGE_DEFINITIONS } from './services/sessionPackages.js';

const BASELINE_PACKAGES = REGULAR_BINGO_PACKAGE_DEFINITIONS.map(pkg => [
  pkg.id,
  pkg.name,
  pkg.price,
  pkg.type,
  pkg.max_quantity,
  1,
  pkg.sort_order,
  pkg.is_phd,
  pkg.description || '',
]);

const REGULAR_BINGO_SCHEDULE = [
  { dayOfWeek: 0, time: '18:00' }, // Sunday
  { dayOfWeek: 2, time: '18:30' }, // Tuesday
  { dayOfWeek: 3, time: '18:30' }, // Wednesday
  { dayOfWeek: 4, time: '18:30' }, // Thursday
  { dayOfWeek: 5, time: '18:30' }, // Friday
  { dayOfWeek: 6, time: '18:30' }, // Saturday
];

async function ensureRegularBingoSchedule() {
  console.log('Ensuring regular bingo schedule (Tue-Sat 6:30 PM, Sun 6:00 PM; no Monday).');

  await run(`
    UPDATE recurring_schedules
       SET is_active = 0, updated_at = datetime('now')
     WHERE session_type = 'regular_bingo'
       AND day_of_week = 1
  `);

  for (const schedule of REGULAR_BINGO_SCHEDULE) {
    const rows = await all(
      `SELECT id
         FROM recurring_schedules
        WHERE session_type = 'regular_bingo'
          AND day_of_week = ?
        ORDER BY is_active DESC, created_at ASC
        LIMIT 1`,
      [schedule.dayOfWeek]
    );
    const existing = rows[0];

    if (existing) {
      await run(
        `UPDATE recurring_schedules
            SET time = ?,
                cutoff_time = '12:00',
                session_type = 'regular_bingo',
                is_active = 1,
                updated_at = datetime('now')
          WHERE id = ?`,
        [schedule.time, existing.id]
      );
      await run(
        `UPDATE recurring_schedules
            SET is_active = 0,
                updated_at = datetime('now')
          WHERE session_type = 'regular_bingo'
            AND day_of_week = ?
            AND id != ?`,
        [schedule.dayOfWeek, existing.id]
      );
    } else {
      await run(
        `INSERT INTO recurring_schedules
           (id, day_of_week, time, cutoff_time, session_type, is_active)
         VALUES (?, ?, ?, '12:00', 'regular_bingo', 1)`,
        [uuid(), schedule.dayOfWeek, schedule.time]
      );
    }
  }
}

async function correctFutureRegularSessionsForSchedule() {
  const today = new Date().toISOString().slice(0, 10);

  await run(
    `UPDATE sessions
        SET time = '18:00'
      WHERE date >= ?
        AND deleted_at IS NULL
        AND COALESCE(is_special_event, 0) = 0
        AND COALESCE(NULLIF(session_type, ''), 'regular_bingo') = 'regular_bingo'
        AND strftime('%w', date) = '0'
        AND time != '18:00'`,
    [today]
  );

  await run(
    `UPDATE sessions
        SET is_available = 0,
            deleted_at = COALESCE(deleted_at, datetime('now'))
      WHERE date >= ?
        AND deleted_at IS NULL
        AND COALESCE(is_special_event, 0) = 0
        AND COALESCE(NULLIF(session_type, ''), 'regular_bingo') = 'regular_bingo'
        AND strftime('%w', date) = '1'
        AND NOT EXISTS (SELECT 1 FROM bookings WHERE bookings.session_id = sessions.id)`,
    [today]
  );
}

function generateTicketAccessToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function ensureBaselinePackages() {
  const countRows = await all('SELECT COUNT(*) as count FROM packages');
  const countRow = countRows[0];
  const isEmpty = (countRow?.count || 0) === 0;
  if (isEmpty) {
    console.log('No packages found; inserting baseline ticket packages including PHD.');
  } else {
    console.log('Ensuring regular bingo package defaults.');
  }

  for (const pkg of BASELINE_PACKAGES) {
    await run(
      `INSERT INTO packages (id, name, price, type, max_quantity, is_active, sort_order, is_phd, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         price = excluded.price,
         type = excluded.type,
         max_quantity = CASE
           WHEN packages.max_quantity = 1 AND excluded.max_quantity > 1 THEN excluded.max_quantity
           ELSE packages.max_quantity
         END,
         is_active = excluded.is_active,
         sort_order = excluded.sort_order,
         is_phd = excluded.is_phd,
         description = COALESCE(NULLIF(packages.description, ''), excluded.description)`,
      pkg
    );
  }

  await run(
    `UPDATE packages
     SET max_quantity = CASE id
       WHEN 'pkg-regular-optional-9-up' THEN 2
       WHEN 'pkg-regular-optional-6-up' THEN 3
       WHEN 'pkg-regular-optional-3-up' THEN 3
       WHEN 'pkg-regular-optional-mp-early-bird' THEN 6
       ELSE max_quantity
     END
     WHERE id IN (
       'pkg-regular-optional-9-up',
       'pkg-regular-optional-6-up',
       'pkg-regular-optional-3-up',
       'pkg-regular-optional-mp-early-bird'
     )`
  );

  const defaultIds = BASELINE_PACKAGES.map(pkg => pkg[0]);
  const placeholders = defaultIds.map(() => '?').join(',');
  await run(
    `DELETE FROM packages
     WHERE id NOT IN (${placeholders})
       AND id NOT IN (SELECT package_id FROM booking_items WHERE package_id IS NOT NULL)
       AND id NOT IN (SELECT package_id FROM booking_addons WHERE package_id IS NOT NULL)`,
    defaultIds
  );
  await run(
    `UPDATE packages
     SET is_active = 0
     WHERE id NOT IN (${placeholders})`,
    defaultIds
  );

  await run(
    `DELETE FROM packages
     WHERE id = '76e5594d-759e-445b-85bf-f2a250b7b5ae'
       AND name = 'PHD Credits'
       AND price = 100
       AND id NOT IN (SELECT package_id FROM booking_items WHERE package_id IS NOT NULL)
       AND id NOT IN (SELECT package_id FROM booking_addons WHERE package_id IS NOT NULL)`
  );
  await run(
    `UPDATE packages
     SET is_active = 0
     WHERE id = '76e5594d-759e-445b-85bf-f2a250b7b5ae'
       AND name = 'PHD Credits'
       AND price = 100`
  );
}

async function removeRegularSessionPackageOverrides() {
  await run(
    `DELETE FROM session_packages
     WHERE session_id IN (
       SELECT id
       FROM sessions
       WHERE COALESCE(NULLIF(session_type, ''), CASE WHEN is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END) = 'regular_bingo'
     )
       AND id NOT IN (SELECT package_id FROM booking_items WHERE package_id IS NOT NULL)
       AND id NOT IN (SELECT package_id FROM booking_addons WHERE package_id IS NOT NULL)`
  );
}

async function mirrorSessionPackagesForPackageForeignKeys() {
  try {
    await run(`
      INSERT OR IGNORE INTO packages
        (id, name, price, type, max_quantity, is_active, sort_order, description, is_phd)
      SELECT
        id,
        name,
        price,
        type,
        COALESCE(max_quantity, 1),
        0,
        COALESCE(sort_order, 0),
        COALESCE(description, ''),
        COALESCE(is_phd, 0)
      FROM session_packages
    `);
  } catch (e) {}
}

async function migrateVenueTo75Tables(db) {
  const sessions = await all(`
    SELECT session_id, COUNT(DISTINCT table_number) as table_count, MAX(table_number) as max_table
    FROM seats
    GROUP BY session_id
    HAVING table_count = 73 AND max_table = 73
  `);

  if (sessions.length === 0) {
    return;
  }

  console.log(`Migrating ${sessions.length} session(s) from 73 tables to 75 tables...`);
  db.run('BEGIN TRANSACTION');
  try {
    for (const session of sessions) {
      const sessionId = session.session_id;

      // Insert new table 41 and new table 47 by shifting the existing ranges:
      // old 41-45 -> 42-46, old 46-73 -> 48-75.
      db.run('UPDATE seats SET table_number = table_number + 1000 WHERE session_id = ? AND table_number >= 46', [sessionId]);
      db.run('UPDATE seats SET table_number = table_number + 100 WHERE session_id = ? AND table_number BETWEEN 41 AND 45', [sessionId]);
      db.run('UPDATE seats SET table_number = table_number - 998 WHERE session_id = ? AND table_number >= 1046', [sessionId]);
      db.run('UPDATE seats SET table_number = table_number - 99 WHERE session_id = ? AND table_number BETWEEN 141 AND 145', [sessionId]);

      for (const tableNumber of [41, 47]) {
        for (let chairNumber = 1; chairNumber <= 6; chairNumber++) {
          db.run(
            'INSERT OR IGNORE INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
            [uuid(), sessionId, tableNumber, chairNumber, 'vacant']
          );
        }
      }
    }
    db.run('COMMIT');
    await saveDb();
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}

async function migrate() {
  // This SQLite migration runner is a no-op when running against Postgres.
  // Postgres schema is owned by server/migrations/postgres/*.sql, applied via
  // `npm run migrate:postgres`. We early-return here so the existing startup
  // call in server/src/index.js (`await migrate()`) doesn't need any
  // driver-awareness.
  if ((process.env.DB_DRIVER || 'sqlite').toLowerCase() === 'postgres') {
    console.log('migrate.js: DB_DRIVER=postgres detected. Skipping SQLite-style migrations.');
    console.log('migrate.js: Postgres schema must be applied separately via `npm run migrate:postgres`.');
    return;
  }

  const db = await getDb();
  console.log('Running migrations...');

  await exec(`
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
      sort_order INTEGER NOT NULL DEFAULT 0,
      description TEXT DEFAULT ''
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
      FOREIGN KEY (seat_id) REFERENCES seats(id)
    );

    CREATE TABLE IF NOT EXISTS booking_addons (
      id TEXT PRIMARY KEY,
      booking_item_id TEXT NOT NULL,
      package_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price INTEGER NOT NULL,
      FOREIGN KEY (booking_item_id) REFERENCES booking_items(id) ON DELETE CASCADE
    );
  `);

  try { await exec('CREATE INDEX idx_seats_session ON seats(session_id)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_seats_table ON seats(session_id, table_number)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_seats_status ON seats(session_id, status)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_bookings_session ON bookings(session_id)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_booking_items_booking ON booking_items(booking_id)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_booking_items_seat ON booking_items(seat_id)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_bookings_reference ON bookings(reference_number)'); } catch(e) {}

  // --- Venue table-count migration ---
  // Adds the two new stage-front tables requested by the venue. Existing 73-table
  // sessions are renumbered so the new tables occupy 41 and 47, giving 75 total.
  await migrateVenueTo75Tables(db);

  // --- Special Events & Announcements migration ---
  console.log('Running special events & announcements migration...');

  // Add special event columns to sessions (safe: IF NOT EXISTS not available for columns, use try/catch)
  try { await exec('ALTER TABLE sessions ADD COLUMN is_special_event INTEGER DEFAULT 0'); } catch(e) {}
  try { await exec('ALTER TABLE sessions ADD COLUMN event_title TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE sessions ADD COLUMN event_description TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE sessions ADD COLUMN session_type TEXT DEFAULT "regular_bingo"'); } catch(e) {}
  try { await run("UPDATE sessions SET session_type = CASE WHEN is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END WHERE session_type IS NULL OR session_type = ''"); } catch(e) {}

  // Session-specific package overrides
  await exec(`
    CREATE TABLE IF NOT EXISTS session_packages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      type TEXT NOT NULL,
      max_quantity INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  try { await exec('CREATE INDEX idx_session_packages_session ON session_packages(session_id)'); } catch(e) {}

  // Announcements table
  await exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      is_active INTEGER DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      sort_order INTEGER DEFAULT 0,
      image_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // --- Soft-delete & Audit Log migration ---
  console.log('Running audit log migration...');

  // Add deleted_at column to sessions for soft-delete
  try { await exec('ALTER TABLE sessions ADD COLUMN deleted_at TEXT'); } catch(e) {}

  // Audit log table
  await exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  try { await exec('CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_audit_log_action ON audit_log(action)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_audit_log_created ON audit_log(created_at)'); } catch(e) {}

  // Settings table (key-value store)
  await exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Add image_url column to announcements (safe: already in CREATE TABLE for new dbs, ALTER for old ones)
  try { await exec('ALTER TABLE announcements ADD COLUMN image_url TEXT'); } catch(e) { console.log('image_url column already exists or could not be added:', e.message); }

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
  try { await run("INSERT INTO settings (key, value) VALUES ('theme_config', ?)", [defaultTheme]); } catch(e) {}

  // Default general settings
  const defaultGeneral = JSON.stringify({
    businessName: 'SMEC BINGO',
    businessSubtitle: "Saint Mary's Entertainment Centre",
    locationText: '',
    contactPhone: '',
    contactEmail: ''
  });
  try { await run("INSERT INTO settings (key, value) VALUES ('general_config', ?)", [defaultGeneral]); } catch(e) {}

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
    paperWidth: '80mm',
    partialCutBetweenReceipts: false,
    receiptCutPercent: 0
  });
  try { await run("INSERT INTO settings (key, value) VALUES ('receipt_config', ?)", [defaultReceipt]); } catch(e) {}

  // --- PHD Inventory migration ---
  console.log('Running PHD inventory migration...');

  // Add is_phd flag to packages and session_packages to identify handheld devices
  try { await exec('ALTER TABLE packages ADD COLUMN is_phd INTEGER DEFAULT 0'); } catch(e) {}
  try { await exec('ALTER TABLE session_packages ADD COLUMN is_phd INTEGER DEFAULT 0'); } catch(e) {}
  try { await exec("ALTER TABLE packages ADD COLUMN description TEXT DEFAULT ''"); } catch(e) {}
  try { await exec("ALTER TABLE session_packages ADD COLUMN description TEXT DEFAULT ''"); } catch(e) {}

  // Default PHD inventory settings (total_stock=200, per_player_limit=2)
  const defaultPhdInventory = JSON.stringify({
    totalStock: 200,
    perPlayerLimit: 2
  });
  try { await run("INSERT INTO settings (key, value) VALUES ('phd_inventory', ?)", [defaultPhdInventory]); } catch(e) {}

  // --- Recurring Schedule (auto-generated regular bingo sessions) ---
  console.log('Running recurring-schedule migration...');
  await exec(`
    CREATE TABLE IF NOT EXISTS recurring_schedules (
      id TEXT PRIMARY KEY,
      day_of_week INTEGER NOT NULL,
      time TEXT NOT NULL,
      cutoff_time TEXT NOT NULL DEFAULT '12:00',
      session_type TEXT NOT NULL DEFAULT 'regular_bingo',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  try { await exec('CREATE INDEX idx_recurring_schedules_active_day ON recurring_schedules(is_active, day_of_week)'); } catch(e) {}

  const existingScheduleRows = await all('SELECT COUNT(*) as count FROM recurring_schedules');
  const existingScheduleCount = existingScheduleRows[0]?.count || 0;
  if (existingScheduleCount === 0) {
    console.log('Seeding default recurring schedule (Tue-Sat 6:30 PM, Sun 6:00 PM)');
    for (const schedule of REGULAR_BINGO_SCHEDULE) {
      await run(
        `INSERT INTO recurring_schedules
           (id, day_of_week, time, cutoff_time, session_type, is_active)
         VALUES (?, ?, ?, '12:00', 'regular_bingo', 1)`,
        [uuid(), schedule.dayOfWeek, schedule.time]
      );
    }
  }
  await ensureRegularBingoSchedule();
  await correctFutureRegularSessionsForSchedule();

  const defaultAutoGenConfig = JSON.stringify({
    lookAheadDays: 7,
    enabled: true,
    lastRunAt: null
  });
  try { await run("INSERT INTO settings (key, value) VALUES ('auto_generate_config', ?)", [defaultAutoGenConfig]); } catch(e) {}

  const defaultSpecialBingoConfig = JSON.stringify({
    admissionName: 'Special Bingo Admission (includes 1 PHD)',
    admissionPrice: 7500,
    additionalPhdName: 'Additional PHD Unit',
    additionalPhdPrice: 5000,
    additionalPhdMaxQuantity: 1
  });
  try { await run("INSERT INTO settings (key, value) VALUES ('special_bingo_config', ?)", [defaultSpecialBingoConfig]); } catch(e) {}

  const defaultBookingConfig = JSON.stringify({
    maxOptionalPackagesPerPlayer: 3
  });
  try { await run("INSERT INTO settings (key, value) VALUES ('booking_config', ?)", [defaultBookingConfig]); } catch(e) {}

  await ensureBaselinePackages();
  await removeRegularSessionPackageOverrides();

  // --- Per-attendee ticket reference migration ---
  console.log('Running per-attendee ticket reference migration...');
  try { await exec('ALTER TABLE booking_items ADD COLUMN reference_number TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE booking_items ADD COLUMN printed_at TEXT'); } catch(e) {}
  try { await exec("ALTER TABLE booking_items ADD COLUMN refund_status TEXT DEFAULT 'active'"); } catch(e) {}
  try { await exec('ALTER TABLE booking_items ADD COLUMN refunded_at TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE booking_items ADD COLUMN refund_transaction_id TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE booking_items ADD COLUMN refund_amount INTEGER DEFAULT 0'); } catch(e) {}
  try { await exec('ALTER TABLE booking_items ADD COLUMN refund_action TEXT'); } catch(e) {}
  try { await run("UPDATE booking_items SET refund_status = 'active' WHERE refund_status IS NULL OR refund_status = ''"); } catch(e) {}
  await mirrorSessionPackagesForPackageForeignKeys();
  try { await exec('CREATE INDEX idx_booking_items_booking ON booking_items(booking_id)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_booking_items_seat ON booking_items(seat_id)'); } catch(e) {}
  try { await exec('CREATE UNIQUE INDEX idx_booking_items_reference ON booking_items(reference_number)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_booking_items_refund_status ON booking_items(refund_status)'); } catch(e) {}

  // --- Customer email on bookings (for confirmation emails) ---
  console.log('Running booking email migration...');
  try { await exec('ALTER TABLE bookings ADD COLUMN email TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE bookings ADD COLUMN customer_first_name TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE bookings ADD COLUMN customer_last_name TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE bookings ADD COLUMN email_verified_at TEXT'); } catch(e) {}
  try { await exec('CREATE INDEX idx_bookings_email ON bookings(email)'); } catch(e) {}

  // Email verification codes for first-time customer emails. Codes are stored
  // as bcrypt hashes only; the plaintext code is never persisted.
  await exec(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      customer_first_name TEXT,
      customer_last_name TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  try { await exec('CREATE INDEX idx_email_verifications_email ON email_verifications(email)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_email_verifications_expires ON email_verifications(expires_at)'); } catch(e) {}

  await exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      first_name TEXT,
      last_name TEXT,
      email_verified_at TEXT,
      first_booking_at TEXT,
      last_booking_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  try { await exec('CREATE INDEX idx_customers_email ON customers(email)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_customers_last_booking ON customers(last_booking_at)'); } catch(e) {}

  const customerRows = await all(`
    SELECT
      LOWER(TRIM(b.email)) as email,
      COALESCE(NULLIF(TRIM(b.customer_first_name), ''), NULLIF(TRIM(bi.first_name), '')) as first_name,
      COALESCE(NULLIF(TRIM(b.customer_last_name), ''), NULLIF(TRIM(bi.last_name), '')) as last_name,
      MIN(COALESCE(b.email_verified_at, b.created_at)) as email_verified_at,
      MIN(b.created_at) as first_booking_at,
      MAX(b.created_at) as last_booking_at
    FROM bookings b
    LEFT JOIN booking_items bi ON bi.booking_id = b.id
    WHERE b.email IS NOT NULL
      AND TRIM(b.email) <> ''
      AND b.payment_status IN ('paid', 'refunded', 'voided')
    GROUP BY LOWER(TRIM(b.email))
  `);
  for (const customer of customerRows) {
    try {
      await run(
        `INSERT INTO customers
          (id, email, first_name, last_name, email_verified_at, first_booking_at, last_booking_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           first_name = COALESCE(excluded.first_name, customers.first_name),
           last_name = COALESCE(excluded.last_name, customers.last_name),
           email_verified_at = COALESCE(customers.email_verified_at, excluded.email_verified_at),
           first_booking_at = COALESCE(customers.first_booking_at, excluded.first_booking_at),
           last_booking_at = COALESCE(excluded.last_booking_at, customers.last_booking_at),
           updated_at = excluded.updated_at`,
        [
          uuid(),
          customer.email,
          customer.first_name || null,
          customer.last_name || null,
          customer.email_verified_at || null,
          customer.first_booking_at || null,
          customer.last_booking_at || null,
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
    } catch(e) {}
  }

  // --- Admin Users migration ---
  console.log('Running admin users migration...');
  await exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_super_user INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  try { await exec('ALTER TABLE admin_users ADD COLUMN is_super_user INTEGER NOT NULL DEFAULT 0'); } catch(e) {}

  // Backfill existing booking_items that have no reference_number
  const itemsWithoutRef = await all("SELECT bi.id, b.reference_number as booking_ref FROM booking_items bi JOIN bookings b ON b.id = bi.booking_id WHERE bi.reference_number IS NULL");
  if (itemsWithoutRef.length > 0) {
    console.log(`Backfilling ${itemsWithoutRef.length} booking items with unique reference numbers...`);
    for (let i = 0; i < itemsWithoutRef.length; i++) {
      const ref = 'BNG-' + crypto.randomBytes(5).toString('hex').toUpperCase();
      await run("UPDATE booking_items SET reference_number = ? WHERE id = ?", [ref, itemsWithoutRef[i].id]);
    }
  }

  // --- Authorize.Net Payment Integration migration ---
  console.log('Running Authorize.Net payment integration migration...');

  try { await exec("ALTER TABLE bookings ADD COLUMN payment_provider TEXT DEFAULT 'authorize_net'"); } catch(e) {}
  try { await exec('ALTER TABLE bookings ADD COLUMN transaction_id TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE bookings ADD COLUMN auth_code TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE bookings ADD COLUMN payment_attempted_at TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE bookings ADD COLUMN payment_completed_at TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE bookings ADD COLUMN payment_failure_reason TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE bookings ADD COLUMN hosted_token TEXT'); } catch(e) {}
  try { await exec('ALTER TABLE bookings ADD COLUMN ticket_access_token TEXT'); } catch(e) {}
  try {
    const bookingsWithoutTicketToken = await all("SELECT id FROM bookings WHERE ticket_access_token IS NULL OR ticket_access_token = ''");
    for (const booking of bookingsWithoutTicketToken) {
      await run('UPDATE bookings SET ticket_access_token = ? WHERE id = ?', [generateTicketAccessToken(), booking.id]);
    }
  } catch(e) {}

  // Audit log for payment events - full lifecycle traceability
  await exec(`
    CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      raw_payload TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);

  try { await exec('CREATE INDEX idx_bookings_transaction_id ON bookings(transaction_id)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_bookings_payment_status ON bookings(payment_status)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_bookings_ticket_access_token ON bookings(ticket_access_token)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_payment_events_booking ON payment_events(booking_id)'); } catch(e) {}
  try { await exec('CREATE INDEX idx_payment_events_type ON payment_events(event_type)'); } catch(e) {}

  console.log('Migrations complete.');
}

export { migrate };

// When run directly (not imported), execute and exit
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('migrate.js') || process.argv[1].endsWith('migrate')
);
if (isMainModule) {
  migrate().then(() => process.exit(0)).catch(e => {
    const isRenderDiskUnavailable = String(e?.message || '').includes('Render persistent disk is not available');
    const databaseUrl = process.env.DATABASE_URL || '';

    if (isRenderDiskUnavailable && databaseUrl.startsWith('/var/data/')) {
      console.warn('Skipping direct migrate.js run because Render persistent disk is unavailable during build.');
      console.warn('Migrations will run during server startup after the runtime disk mounts.');
      process.exit(0);
    }

    console.error(e);
    process.exit(1);
  });
}
