import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDb, all, get, run, exec } from './database.js';
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

app.use(cors());
app.use(express.json());

// Serve static build in production
const clientBuild = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuild));

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
    console.log(`Released ${result.changes} expired seat holds`);
    io.emit('seats:refresh');
  }
}

// ============ API ROUTES ============

// --- Sessions ---
app.get('/api/sessions', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const sessions = all(
    `SELECT s.*,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'vacant' AND is_disabled = 0) as available_seats,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'sold') as sold_seats,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND status = 'held') as held_seats,
      (SELECT COUNT(*) FROM seats WHERE session_id = s.id AND is_disabled = 0) as total_seats
    FROM sessions s
    WHERE s.date >= ? AND s.is_available = 1
    ORDER BY s.date ASC, s.time ASC`, [today]
  );
  res.json(sessions);
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

  const requiredPkg = get("SELECT * FROM packages WHERE type = 'required' AND is_active = 1 LIMIT 1");
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
          const pkg = get('SELECT * FROM packages WHERE id = ? AND is_active = 1', [addon.packageId]);
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
  const { date, time, cutoff_time, is_available } = req.body;
  const id = uuid();
  run('INSERT INTO sessions (id, date, time, cutoff_time, is_available) VALUES (?, ?, ?, ?, ?)',
    [id, date, time, cutoff_time || '12:00', is_available !== false ? 1 : 0]);

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

  res.json({ id, date, time, cutoff_time, is_available, totalChairs: chairCount });
});

app.patch('/api/admin/sessions/:id', adminAuth, (req, res) => {
  const { date, time, cutoff_time, is_available } = req.body;
  const updates = [];
  const values = [];
  if (date !== undefined) { updates.push('date = ?'); values.push(date); }
  if (time !== undefined) { updates.push('time = ?'); values.push(time); }
  if (cutoff_time !== undefined) { updates.push('cutoff_time = ?'); values.push(cutoff_time); }
  if (is_available !== undefined) { updates.push('is_available = ?'); values.push(is_available ? 1 : 0); }
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
    console.log(`Auto-created session for ${dateStr}`);
  }
}

// ============ START ============
async function start() {
  await getDb();
  console.log('Database connected.');

  // Ensure sessions exist for the next 90 days
  ensureFutureSessions();
  // Re-check daily (every 24 hours)
  setInterval(ensureFutureSessions, 24 * 60 * 60 * 1000);

  // Release expired holds every 30 seconds
  setInterval(releaseExpiredHolds, 30000);
  releaseExpiredHolds();

  server.listen(PORT, () => {
    console.log(`Wolastoq Bingo server running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
