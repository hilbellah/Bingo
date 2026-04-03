import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDb, all, get, run, exec, saveDb } from './database.js';
import { logger } from './logger.js';
import { v4 as uuid } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;
const HOLD_MINUTES = parseInt(process.env.SESSION_HOLD_MINUTES || '10');
const startTime = Date.now();

app.use(cors());
app.use(express.json());

// Serve static build in production
const clientBuild = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuild));

// ============ HEALTH CHECK ============
app.get('/health', async (req, res) => {
  try {
    const db = await getDb();
    db.prepare('SELECT 1').get();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      db: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      db: 'disconnected',
      error: error.message
    });
  }
});

// ============ HELPERS ============

function generateRef() {
  return 'BNG-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function formatPrice(cents) {
  return (cents / 100).toFixed(2);
}

function releaseExpiredHolds() {
  const now = new Date().toISOString();
  const result = run(
    `UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL
     WHERE status = 'held' AND held_until < ?`, [now]
  );
  if (result.changes > 0) {
    logger.info('Released expired seat holds', { seats_released: result.changes });
    io.emit('seats:refresh');
  }
}

// ============ API ROUTES ============

// --- Sessions ---
app.get('/api/sessions', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sessions = all(
    `SELECT s.*,
      COALESCE(SUM(CASE WHEN st.status = 'vacant' AND st.is_disabled = 0 THEN 1 ELSE 0 END), 0) as available_seats,
      COALESCE(SUM(CASE WHEN st.status = 'sold' THEN 1 ELSE 0 END), 0) as sold_seats,
      COALESCE(SUM(CASE WHEN st.status = 'held' THEN 1 ELSE 0 END), 0) as held_seats,
      COALESCE(SUM(CASE WHEN st.is_disabled = 0 THEN 1 ELSE 0 END), 0) as total_seats
    FROM sessions s
    LEFT JOIN seats st ON st.session_id = s.id
    WHERE s.date >= ? AND s.is_available = 1
    GROUP BY s.id
    ORDER BY s.date ASC, s.time ASC`, [today]
  );
  res.json(sessions);
});

// --- Session-specific packages (public) ---
app.get('/api/sessions/:sessionId/packages', (req, res) => {
  const sessionPkgs = all('SELECT * FROM session_packages WHERE session_id = ? ORDER BY sort_order ASC', [req.params.sessionId]);
  if (sessionPkgs.length > 0) {
    return res.json(sessionPkgs);
  }
  // Fall back to global packages
  res.json(all('SELECT * FROM packages WHERE is_active = 1 ORDER BY sort_order ASC'));
});

// --- Announcements (public) ---
app.get('/api/announcements', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const announcements = all(
    `SELECT * FROM announcements
     WHERE is_active = 1
       AND (start_date IS NULL OR start_date <= ?)
       AND (end_date IS NULL OR end_date >= ?)
     ORDER BY sort_order ASC, created_at DESC`, [today, today]
  );
  res.json(announcements);
});

app.get('/api/sessions/:id', (req, res) => {
  const session = get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// --- Seats ---
app.get('/api/sessions/:sessionId/seats', (req, res) => {
  const seats = all(`
    SELECT s.id, s.table_number, s.chair_number, s.status, s.is_disabled, s.held_by, s.held_until,
           bi.first_name as booked_name
    FROM seats s
    LEFT JOIN booking_items bi ON bi.seat_id = s.id
    LEFT JOIN bookings b ON b.id = bi.booking_id AND b.payment_status = 'paid'
    WHERE s.session_id = ?
    ORDER BY s.table_number ASC, s.chair_number ASC
  `, [req.params.sessionId]);
  res.json(seats);
});

// --- Packages ---
app.get('/api/packages', (req, res) => {
  res.json(all('SELECT * FROM packages WHERE is_active = 1 ORDER BY sort_order ASC'));
});

// --- Seat Lock ---
app.post('/api/seats/:seatId/lock', (req, res) => {
  const { seatId } = req.params;
  const { holderId } = req.body;

  if (!holderId) return res.status(400).json({ error: 'holderId required' });

  const seat = get('SELECT * FROM seats WHERE id = ?', [seatId]);
  if (!seat) return res.status(404).json({ error: 'Seat not found' });
  if (seat.is_disabled) return res.status(400).json({ error: 'Seat is disabled' });
  if (seat.status === 'sold') return res.status(409).json({ error: 'Seat already sold' });
  if (seat.status === 'held' && seat.held_by !== holderId) {
    if (new Date(seat.held_until) > new Date()) {
      return res.status(409).json({ error: 'Seat held by another user' });
    }
  }

  const holdUntil = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  run(`UPDATE seats SET status = 'held', held_by = ?, held_until = ? WHERE id = ?`,
    [holderId, holdUntil, seatId]);

  io.to(`session:${seat.session_id}`).emit('seat:locked', {
    seatId, holderId, holdUntil, sessionId: seat.session_id
  });

  res.json({ success: true, holdUntil });
});

// --- Seat Unlock ---
app.post('/api/seats/:seatId/unlock', (req, res) => {
  const { seatId } = req.params;
  const { holderId } = req.body;

  const seat = get('SELECT * FROM seats WHERE id = ?', [seatId]);
  if (!seat) return res.status(404).json({ error: 'Seat not found' });
  if (seat.status !== 'held' || seat.held_by !== holderId) {
    return res.status(403).json({ error: 'Cannot unlock seat you do not hold' });
  }

  run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [seatId]);

  io.to(`session:${seat.session_id}`).emit('seat:unlocked', { seatId, sessionId: seat.session_id });

  res.json({ success: true });
});

// --- Create Booking ---
app.post('/api/bookings', (req, res) => {
  const { sessionId, holderId, attendees } = req.body;

  if (!sessionId || !holderId || !attendees?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const session = get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Check for session-specific packages first, then fall back to global
  const sessionPkgs = all('SELECT * FROM session_packages WHERE session_id = ? ORDER BY sort_order ASC', [sessionId]);
  const useSessionPkgs = sessionPkgs.length > 0;
  const requiredPkg = useSessionPkgs
    ? sessionPkgs.find(p => p.type === 'required')
    : get("SELECT * FROM packages WHERE type = 'required' AND is_active = 1 LIMIT 1");
  if (!requiredPkg) return res.status(500).json({ error: 'No required package configured' });

  // Validate all seats
  for (const att of attendees) {
    const seat = get('SELECT * FROM seats WHERE id = ?', [att.seatId]);
    if (!seat || seat.status !== 'held' || seat.held_by !== holderId) {
      return res.status(409).json({ error: `Seat not held by you` });
    }
  }

  try {
    let totalAmount = 0;
    const bookingId = uuid();
    const refNumber = generateRef();

    for (const att of attendees) {
      const itemId = uuid();
      totalAmount += requiredPkg.price;

      run('INSERT INTO booking_items (id, booking_id, first_name, last_name, seat_id, package_id, price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [itemId, bookingId, att.firstName, att.lastName, att.seatId, requiredPkg.id, requiredPkg.price]);

      run(`UPDATE seats SET status = 'sold', held_by = NULL, held_until = NULL WHERE id = ?`, [att.seatId]);

      if (att.addons) {
        for (const addon of att.addons) {
          const pkg = useSessionPkgs
            ? sessionPkgs.find(p => p.id === addon.packageId)
            : get('SELECT * FROM packages WHERE id = ? AND is_active = 1', [addon.packageId]);
          if (pkg) {
            const addonPrice = pkg.price * addon.quantity;
            totalAmount += addonPrice;
            run('INSERT INTO booking_addons (id, booking_item_id, package_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
              [uuid(), itemId, addon.packageId, addon.quantity, addonPrice]);
          }
        }
      }
    }

    run('INSERT INTO bookings (id, session_id, reference_number, total_amount, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [bookingId, sessionId, refNumber, totalAmount, 'paid', new Date().toISOString()]);

    for (const att of attendees) {
      io.to(`session:${sessionId}`).emit('seat:sold', { seatId: att.seatId, sessionId });
    }

    res.json({
      bookingId,
      referenceNumber: refNumber,
      totalAmount,
      totalFormatted: '$' + formatPrice(totalAmount)
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Booking failed' });
  }
});

// ============ ADMIN ============

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const [user, pass] = decoded.split(':');
  if (user === process.env.ADMIN_USERNAME && pass === process.env.ADMIN_PASSWORD) {
    return next();
  }
  res.status(401).json({ error: 'Invalid credentials' });
}

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/admin/dashboard', adminAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const todayBookings = get(
    `SELECT COUNT(*) as count FROM bookings b JOIN sessions s ON b.session_id = s.id WHERE s.date = ? AND b.payment_status = 'paid'`, [today]
  );
  const todayRevenue = get(
    `SELECT COALESCE(SUM(b.total_amount), 0) as total FROM bookings b JOIN sessions s ON b.session_id = s.id WHERE s.date = ? AND b.payment_status = 'paid'`, [today]
  );
  const upcomingSessions = all(
    `SELECT s.*,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'vacant' AND is_disabled = 0) as available,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'sold') as sold,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'held') as held,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND is_disabled = 0) as total
    FROM sessions s WHERE s.date >= ? ORDER BY s.date ASC LIMIT 7`, [today]
  );

  res.json({
    todayBookings: todayBookings?.count || 0,
    todayRevenue: todayRevenue?.total || 0,
    todayRevenueFormatted: '$' + formatPrice(todayRevenue?.total || 0),
    upcomingSessions
  });
});

app.get('/api/admin/sessions', adminAuth, (req, res) => {
  res.json(all('SELECT * FROM sessions ORDER BY date DESC, time ASC'));
});

app.post('/api/admin/sessions', adminAuth, (req, res) => {
  const { date, time, cutoff_time, is_available, is_special_event, event_title, event_description, packages: pkgs } = req.body;
  const id = uuid();
  run('INSERT INTO sessions (id, date, time, cutoff_time, is_available, is_special_event, event_title, event_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, date, time, cutoff_time || '12:00', is_available !== false ? 1 : 0, is_special_event ? 1 : 0, event_title || null, event_description || null]);

  // Create 74 tables x 6 chairs = 444 chairs per session
  let chairCount = 0;
  for (let tNum = 1; tNum <= 75; tNum++) {
    if (tNum === 41) continue;
    for (let ch = 1; ch <= 6; ch++) {
      run('INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
        [uuid(), id, tNum, ch, 'vacant']);
      chairCount++;
    }
  }

  // Create session-specific packages if provided
  if (Array.isArray(pkgs) && pkgs.length > 0) {
    for (const pkg of pkgs) {
      run('INSERT INTO session_packages (id, session_id, name, price, type, max_quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), id, pkg.name, pkg.price, pkg.type, pkg.max_quantity || 1, pkg.sort_order || 0]);
    }
  }

  // Flush to disk immediately — critical write should not rely on debounced save
  saveDb();

  res.json({ id, date, time, cutoff_time, is_available, is_special_event, event_title, totalChairs: chairCount });
});

app.patch('/api/admin/sessions/:id', adminAuth, (req, res) => {
  const { date, time, cutoff_time, is_available, is_special_event, event_title, event_description } = req.body;
  const updates = [];
  const values = [];
  if (date !== undefined) { updates.push('date = ?'); values.push(date); }
  if (time !== undefined) { updates.push('time = ?'); values.push(time); }
  if (cutoff_time !== undefined) { updates.push('cutoff_time = ?'); values.push(cutoff_time); }
  if (is_available !== undefined) { updates.push('is_available = ?'); values.push(is_available ? 1 : 0); }
  if (is_special_event !== undefined) { updates.push('is_special_event = ?'); values.push(is_special_event ? 1 : 0); }
  if (event_title !== undefined) { updates.push('event_title = ?'); values.push(event_title || null); }
  if (event_description !== undefined) { updates.push('event_description = ?'); values.push(event_description || null); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields' });
  values.push(req.params.id);
  run(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ success: true });
});

app.delete('/api/admin/sessions/:id', adminAuth, (req, res) => {
  run('DELETE FROM seats WHERE session_id = ?', [req.params.id]);
  run('DELETE FROM sessions WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/admin/packages', adminAuth, (req, res) => {
  res.json(all('SELECT * FROM packages ORDER BY sort_order ASC'));
});

app.post('/api/admin/packages', adminAuth, (req, res) => {
  const { name, price, type, max_quantity, sort_order } = req.body;
  const id = uuid();
  run('INSERT INTO packages (id, name, price, type, max_quantity, is_active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [id, name, price, type, max_quantity || 1, sort_order || 0]);
  res.json({ id, name, price, type });
});

app.patch('/api/admin/packages/:id', adminAuth, (req, res) => {
  const { name, price, type, max_quantity, is_active, sort_order } = req.body;
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (price !== undefined) { updates.push('price = ?'); values.push(price); }
  if (type !== undefined) { updates.push('type = ?'); values.push(type); }
  if (max_quantity !== undefined) { updates.push('max_quantity = ?'); values.push(max_quantity); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields' });
  values.push(req.params.id);
  run(`UPDATE packages SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ success: true });
});

app.patch('/api/admin/seats/:id', adminAuth, (req, res) => {
  const { is_disabled } = req.body;
  if (is_disabled !== undefined) {
    run('UPDATE seats SET is_disabled = ? WHERE id = ?', [is_disabled ? 1 : 0, req.params.id]);
  }
  res.json({ success: true });
});

app.get('/api/admin/bookings', adminAuth, (req, res) => {
  const { sessionId } = req.query;
  let whereClause = '';
  const params = [];
  if (sessionId) { whereClause = 'WHERE b.session_id = ?'; params.push(sessionId); }

  const rows = all(`
    SELECT b.id, b.reference_number, b.total_amount, b.payment_status, b.created_at,
           s.date as session_date, s.time as session_time,
           bi.id as item_id, bi.first_name, bi.last_name, bi.price as item_price,
           seats.table_number, seats.chair_number,
           p.name as package_name, p.price as package_price
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN booking_items bi ON bi.booking_id = b.id
    JOIN seats ON seats.id = bi.seat_id
    JOIN packages p ON p.id = bi.package_id
    ${whereClause}
    ORDER BY b.created_at DESC, b.id, bi.id
  `, params);

  const bookings = {};
  for (const row of rows) {
    if (!bookings[row.id]) {
      bookings[row.id] = {
        id: row.id,
        referenceNumber: row.reference_number,
        totalAmount: row.total_amount,
        totalFormatted: '$' + formatPrice(row.total_amount),
        paymentStatus: row.payment_status,
        createdAt: row.created_at,
        sessionDate: row.session_date,
        sessionTime: row.session_time,
        items: []
      };
    }

    const addons = all(`
      SELECT ba.*, p.name as package_name FROM booking_addons ba
      JOIN packages p ON p.id = ba.package_id WHERE ba.booking_item_id = ?
    `, [row.item_id]).map(a => ({
      packageName: a.package_name,
      quantity: a.quantity,
      price: a.price,
      priceFormatted: '$' + formatPrice(a.price)
    }));

    bookings[row.id].items.push({
      firstName: row.first_name,
      lastName: row.last_name,
      tableNumber: row.table_number,
      chairNumber: row.chair_number,
      packageName: row.package_name,
      packagePrice: row.package_price,
      packagePriceFormatted: '$' + formatPrice(row.package_price),
      addons
    });
  }
  res.json(Object.values(bookings));
});

app.get('/api/admin/bookings/export', adminAuth, (req, res) => {
  const { sessionId } = req.query;
  let whereClause = '';
  const params = [];
  if (sessionId) { whereClause = 'WHERE b.session_id = ?'; params.push(sessionId); }

  const rows = all(`
    SELECT b.reference_number, b.total_amount, b.payment_status, b.created_at,
           s.date as session_date, s.time as session_time,
           bi.first_name, bi.last_name,
           seats.table_number, seats.chair_number,
           p.name as package_name, p.price as package_price
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN booking_items bi ON bi.booking_id = b.id
    JOIN seats ON seats.id = bi.seat_id
    JOIN packages p ON p.id = bi.package_id
    ${whereClause}
    ORDER BY b.created_at DESC
  `, params);

  let csv = 'Reference,Session Date,Session Time,First Name,Last Name,Table,Chair,Package,Package Price,Total Amount,Payment Status,Booked At\n';
  for (const row of rows) {
    csv += `${row.reference_number},${row.session_date},${row.session_time},${row.first_name},${row.last_name},${row.table_number},${row.chair_number},${row.package_name},$${formatPrice(row.package_price)},$${formatPrice(row.total_amount)},${row.payment_status},${row.created_at}\n`;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=bookings-report.csv`);
  res.send(csv);
});

app.post('/api/admin/bookings/:id/cancel', adminAuth, (req, res) => {
  const booking = get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const items = all('SELECT * FROM booking_items WHERE booking_id = ?', [req.params.id]);
  for (const item of items) {
    run(`UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?`, [item.seat_id]);
  }
  run(`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ?`, [req.params.id]);

  io.to(`session:${booking.session_id}`).emit('seats:refresh');
  res.json({ success: true });
});

// ============ ADMIN: ANNOUNCEMENTS ============

app.get('/api/admin/announcements', adminAuth, (req, res) => {
  res.json(all('SELECT * FROM announcements ORDER BY sort_order ASC, created_at DESC'));
});

app.post('/api/admin/announcements', adminAuth, (req, res) => {
  const { title, message, type, is_active, start_date, end_date, sort_order } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  const id = uuid();
  const now = new Date().toISOString();
  run('INSERT INTO announcements (id, title, message, type, is_active, start_date, end_date, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, title || null, message, type || 'info', is_active !== false ? 1 : 0, start_date || null, end_date || null, sort_order || 0, now, now]);
  io.emit('announcements:refresh');
  res.json({ id, title, message, type: type || 'info' });
});

app.patch('/api/admin/announcements/:id', adminAuth, (req, res) => {
  const { title, message, type, is_active, start_date, end_date, sort_order } = req.body;
  const updates = [];
  const values = [];
  if (title !== undefined) { updates.push('title = ?'); values.push(title); }
  if (message !== undefined) { updates.push('message = ?'); values.push(message); }
  if (type !== undefined) { updates.push('type = ?'); values.push(type); }
  if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (start_date !== undefined) { updates.push('start_date = ?'); values.push(start_date || null); }
  if (end_date !== undefined) { updates.push('end_date = ?'); values.push(end_date || null); }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields' });
  updates.push("updated_at = ?"); values.push(new Date().toISOString());
  values.push(req.params.id);
  run(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`, values);
  io.emit('announcements:refresh');
  res.json({ success: true });
});

app.delete('/api/admin/announcements/:id', adminAuth, (req, res) => {
  run('DELETE FROM announcements WHERE id = ?', [req.params.id]);
  io.emit('announcements:refresh');
  res.json({ success: true });
});

// ============ ADMIN: SESSION PACKAGES (Special Events) ============

app.get('/api/admin/sessions/:id/packages', adminAuth, (req, res) => {
  res.json(all('SELECT * FROM session_packages WHERE session_id = ? ORDER BY sort_order ASC', [req.params.id]));
});

app.post('/api/admin/sessions/:id/packages', adminAuth, (req, res) => {
  const { packages: pkgs } = req.body;
  if (!Array.isArray(pkgs)) return res.status(400).json({ error: 'packages array required' });
  // Replace all session packages
  run('DELETE FROM session_packages WHERE session_id = ?', [req.params.id]);
  for (const pkg of pkgs) {
    const id = uuid();
    run('INSERT INTO session_packages (id, session_id, name, price, type, max_quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, req.params.id, pkg.name, pkg.price, pkg.type, pkg.max_quantity || 1, pkg.sort_order || 0]);
  }
  res.json({ success: true, count: pkgs.length });
});

// ============ ADMIN: BULK TICKETS (Print all tickets for date range) ============

app.get('/api/admin/bookings/bulk-tickets', adminAuth, (req, res) => {
  const { dateFrom, dateTo } = req.query;
  if (!dateFrom) return res.status(400).json({ error: 'dateFrom query parameter required' });

  const endDate = dateTo || dateFrom;

  // Check if special event columns exist
  let hasSpecialEvent = false;
  try {
    all('SELECT is_special_event FROM sessions LIMIT 1');
    hasSpecialEvent = true;
  } catch (e) { /* column doesn't exist */ }

  const specialCols = hasSpecialEvent ? ', s.is_special_event, s.event_title' : '';

  // Get all paid bookings for sessions within the date range
  const rows = all(`
    SELECT b.id as booking_id, b.reference_number, b.total_amount, b.payment_status,
           s.id as session_id, s.date as session_date, s.time as session_time
           ${specialCols},
           bi.first_name, bi.last_name, bi.price as item_price,
           seats.table_number, seats.chair_number,
           p.name as package_name, p.price as package_price
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN booking_items bi ON bi.booking_id = b.id
    JOIN seats ON seats.id = bi.seat_id
    JOIN packages p ON p.id = bi.package_id
    WHERE s.date >= ? AND s.date <= ? AND b.payment_status = 'paid'
    ORDER BY s.date ASC, s.time ASC, b.reference_number, seats.table_number, seats.chair_number
  `, [dateFrom, endDate]);

  // Group by session, then by booking
  const sessions = {};
  for (const row of rows) {
    if (!sessions[row.session_id]) {
      sessions[row.session_id] = {
        sessionId: row.session_id,
        sessionDate: row.session_date,
        sessionTime: row.session_time,
        isSpecialEvent: !!(row.is_special_event),
        eventTitle: row.event_title || null,
        bookings: {}
      };
    }
    const sess = sessions[row.session_id];
    if (!sess.bookings[row.booking_id]) {
      sess.bookings[row.booking_id] = {
        referenceNumber: row.reference_number,
        totalAmount: row.total_amount,
        totalFormatted: '$' + formatPrice(row.total_amount),
        tickets: []
      };
    }
    sess.bookings[row.booking_id].tickets.push({
      firstName: row.first_name,
      lastName: row.last_name,
      tableNumber: row.table_number,
      chairNumber: row.chair_number,
      packageName: row.package_name,
      packagePrice: row.package_price,
      packagePriceFormatted: '$' + formatPrice(row.package_price)
    });
  }

  // Flatten to array format
  const result = Object.values(sessions).map(s => ({
    ...s,
    bookings: Object.values(s.bookings)
  }));

  const totalTickets = result.reduce((sum, s) => sum + s.bookings.reduce((bs, b) => bs + b.tickets.length, 0), 0);

  res.json({ dateFrom, dateTo: endDate, sessions: result, totalTickets });
});

// ============ SOCKET.IO ============

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join:session', (sessionId) => {
    socket.join(`session:${sessionId}`);
  });

  socket.on('leave:session', (sessionId) => {
    socket.leave(`session:${sessionId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// --- Ticket data for printing (public, by reference number) ---
app.get('/api/bookings/:ref/tickets', (req, res) => {
  const { ref } = req.params;
  const booking = get('SELECT b.*, s.date as session_date, s.time as session_time FROM bookings b JOIN sessions s ON b.session_id = s.id WHERE b.reference_number = ?', [ref]);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const items = all(`
    SELECT bi.first_name, bi.last_name, bi.price,
           seats.table_number, seats.chair_number,
           p.name as package_name, p.price as package_price
    FROM booking_items bi
    JOIN seats ON seats.id = bi.seat_id
    JOIN packages p ON p.id = bi.package_id
    WHERE bi.booking_id = ?
    ORDER BY bi.id
  `, [booking.id]);

  res.json({
    referenceNumber: booking.reference_number,
    sessionDate: booking.session_date,
    sessionTime: booking.session_time,
    totalAmount: booking.total_amount,
    totalFormatted: '$' + formatPrice(booking.total_amount),
    paymentStatus: booking.payment_status,
    tickets: items.map(item => ({
      firstName: item.first_name,
      lastName: item.last_name,
      tableNumber: item.table_number,
      chairNumber: item.chair_number,
      packageName: item.package_name,
      packagePrice: item.package_price,
      packagePriceFormatted: '$' + formatPrice(item.package_price),
    }))
  });
});

// ============ SPA FALLBACK ============
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

// ============ AUTO-SESSION GENERATION ============

const SESSION_HORIZON_DAYS = 90; // Keep sessions available 3 months ahead

function ensureFutureSessions() {
  const today = new Date();
  for (let i = 0; i < SESSION_HORIZON_DAYS; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 3) continue; // Skip Wednesday (no bingo)
    const dateStr = d.toISOString().split('T')[0];

    const existing = get('SELECT id FROM sessions WHERE date = ?', [dateStr]);
    if (existing) continue;

    const id = uuid();
    run('INSERT INTO sessions (id, date, time, cutoff_time, is_available) VALUES (?, ?, ?, ?, ?)',
      [id, dateStr, '18:30', '12:00', 1]);

    // Create 74 tables x 6 chairs
    for (let tNum = 1; tNum <= 75; tNum++) {
      if (tNum === 41) continue;
      for (let ch = 1; ch <= 6; ch++) {
        run('INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
          [uuid(), id, tNum, ch, 'vacant']);
      }
    }
    logger.info('Auto-created session', { date: dateStr, seats: 444 });
  }
}

// ============ START ============
async function start() {
  await getDb();
  logger.info('Database connected');

  // Ensure sessions exist for the next 90 days
  ensureFutureSessions();
  // Re-check daily (every 24 hours)
  setInterval(ensureFutureSessions, 24 * 60 * 60 * 1000);

  // Release expired holds every 30 seconds
  setInterval(releaseExpiredHolds, 30000);
  releaseExpiredHolds();

  server.listen(PORT, () => {
    logger.info('Server started', { port: PORT, url: `http://localhost:${PORT}` });
  });

  // Graceful shutdown: flush pending database writes
  const gracefulShutdown = async (signal) => {
    logger.info('Received shutdown signal', { signal });
    server.close(async () => {
      logger.info('Server closed, flushing database');
      saveDb(); // Flush any pending writes
      logger.info('Database flushed, exiting');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

start().catch(err => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
