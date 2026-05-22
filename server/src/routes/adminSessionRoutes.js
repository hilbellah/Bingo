import { v4 as uuid } from 'uuid';
import { all, get, run, saveDb } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { archivePastSessions } from '../services/sessionArchive.js';
import { releaseExpiredHolds } from '../services/holds.js';
import {
  getDefaultSpecialBingoPackages,
  normalizeSessionType,
  validateSessionPackagesForType,
} from '../services/sessionPackages.js';
import { sendSessionRescheduleNotification } from '../services/email.js';
import { formatPrice } from '../utils/format.js';

export function registerAdminSessionRoutes(app, { io, logAudit }) {
  app.get('/api/admin/sessions', adminAuth, (req, res) => {
    releaseExpiredHolds(io);
    archivePastSessions();
    const includeDeleted = req.query.includeDeleted === 'true';
    const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    res.json(all(`SELECT * FROM sessions ${where} ORDER BY date ASC, time ASC`));
  });

  app.post('/api/admin/sessions', adminAuth, (req, res) => {
    const { date, time, cutoff_time, is_available, is_special_event, event_title, event_description, packages: pkgs } = req.body;
    const sessionType = normalizeSessionType(req.body.session_type, is_special_event);
    const isSpecialType = sessionType === 'special_bingo' || sessionType === 'event';
    const packageDrafts = sessionType === 'special_bingo' && (!Array.isArray(pkgs) || pkgs.length === 0)
      ? getDefaultSpecialBingoPackages()
      : pkgs;
    const packageValidation = validateSessionPackagesForType(sessionType, packageDrafts);
    if (!packageValidation.ok) return res.status(400).json({ error: packageValidation.error });

    const requestHour = time ? time.split(':')[0] : '18';
    const conflict = get(
      `SELECT id, date, time FROM sessions WHERE date = ? AND SUBSTR(time, 1, 2) = ? AND deleted_at IS NULL`,
      [date, requestHour]
    );
    if (conflict) {
      return res.status(409).json({ error: `A bingo session already exists on ${date} at ${conflict.time}. Cannot create another session in the same hour.` });
    }

    const id = uuid();
    run('INSERT INTO sessions (id, date, time, cutoff_time, is_available, is_special_event, event_title, event_description, session_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, date, time, cutoff_time || '12:00', is_available !== false ? 1 : 0, isSpecialType ? 1 : 0, event_title || null, event_description || null, sessionType]);

    let chairCount = 0;
    for (let tableNumber = 1; tableNumber <= 75; tableNumber++) {
      for (let chairNumber = 1; chairNumber <= 6; chairNumber++) {
        run('INSERT INTO seats (id, session_id, table_number, chair_number, status) VALUES (?, ?, ?, ?, ?)',
          [uuid(), id, tableNumber, chairNumber, 'vacant']);
        chairCount++;
      }
    }

    if (packageValidation.packages.length > 0) {
      for (const pkg of packageValidation.packages) {
        run('INSERT INTO session_packages (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [uuid(), id, pkg.name, pkg.price, pkg.type, pkg.max_quantity || 1, pkg.sort_order || 0, pkg.is_phd ? 1 : 0, pkg.description || '']);
      }
    }

    logAudit('session_created', 'session', id, { date, time, cutoff_time, session_type: sessionType, is_special_event: isSpecialType, event_title });
    saveDb();

    res.json({ id, date, time, cutoff_time, is_available, session_type: sessionType, is_special_event: isSpecialType, event_title, totalChairs: chairCount });
  });

  app.patch('/api/admin/sessions/:id', adminAuth, (req, res) => {
    const { date, time, cutoff_time, is_available, is_special_event, event_title, event_description, session_type } = req.body;
    const updates = [];
    const values = [];
    const currentSession = get('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!currentSession) return res.status(404).json({ error: 'Session not found' });
    const nextSessionType = session_type !== undefined ? normalizeSessionType(session_type, is_special_event) : null;
    if (date !== undefined) { updates.push('date = ?'); values.push(date); }
    if (time !== undefined) { updates.push('time = ?'); values.push(time); }
    if (cutoff_time !== undefined) { updates.push('cutoff_time = ?'); values.push(cutoff_time); }
    if (is_available !== undefined) { updates.push('is_available = ?'); values.push(is_available ? 1 : 0); }
    if (nextSessionType !== null) {
      updates.push('session_type = ?');
      values.push(nextSessionType);
      updates.push('is_special_event = ?');
      values.push(nextSessionType === 'special_bingo' || nextSessionType === 'event' ? 1 : 0);
    } else if (is_special_event !== undefined) {
      const legacyType = normalizeSessionType(undefined, is_special_event);
      updates.push('session_type = ?');
      values.push(legacyType);
      updates.push('is_special_event = ?');
      values.push(legacyType === 'special_bingo' ? 1 : 0);
    }
    if (event_title !== undefined) { updates.push('event_title = ?'); values.push(event_title || null); }
    if (event_description !== undefined) { updates.push('event_description = ?'); values.push(event_description || null); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields' });

    if (date !== undefined || time !== undefined) {
      const checkDate = date !== undefined ? date : currentSession.date;
      const checkTime = time !== undefined ? time : currentSession.time;
      const checkHour = checkTime.split(':')[0];
      const conflict = get(
        `SELECT id, date, time FROM sessions WHERE date = ? AND SUBSTR(time, 1, 2) = ? AND id != ? AND deleted_at IS NULL`,
        [checkDate, checkHour, req.params.id]
      );
      if (conflict) {
        return res.status(409).json({ error: `A bingo session already exists on ${checkDate} at ${conflict.time}. Cannot have another session in the same hour.` });
      }
    }

    const nextDate = date !== undefined ? date : currentSession.date;
    const nextTime = time !== undefined ? time : currentSession.time;
    const wasRescheduled = nextDate !== currentSession.date || nextTime !== currentSession.time;
    const shouldNotifyReschedule = !!req.body.notify_reschedule && wasRescheduled;

    values.push(req.params.id);
    run(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`, values);

    let notifiedBookings = 0;
    if (shouldNotifyReschedule) {
      const updatedSession = get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
      const paidBookings = all(`
        SELECT id, reference_number, email, customer_first_name, customer_last_name, ticket_access_token
        FROM bookings
        WHERE session_id = ?
          AND payment_status IN ('paid', 'partially_refunded')
          AND email IS NOT NULL
          AND TRIM(email) <> ''
        ORDER BY created_at ASC
      `, [req.params.id]);
      notifiedBookings = paidBookings.length;

      setImmediate(async () => {
        for (const booking of paidBookings) {
          const result = await sendSessionRescheduleNotification({
            to: booking.email,
            booking,
            session: updatedSession,
            previousSession: currentSession,
          });
          if (!result.ok) {
            console.error('[email] reschedule notification failed:', booking.reference_number, result.error || result.status);
          }
        }
      });

      logAudit('session_rescheduled', 'session', req.params.id, {
        previousDate: currentSession.date,
        previousTime: currentSession.time,
        newDate: updatedSession.date,
        newTime: updatedSession.time,
        notifiedBookings,
      });
    }

    res.json({ success: true, rescheduled: wasRescheduled, notifiedBookings });
  });

  app.delete('/api/admin/sessions/:id', adminAuth, (req, res) => {
    const session = get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const bookings = all(`
      SELECT b.id, b.reference_number, b.total_amount, b.payment_status,
             bi.first_name, bi.last_name, seats.table_number, seats.chair_number
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN seats ON seats.id = bi.seat_id
      WHERE b.session_id = ?
    `, [req.params.id]);

    const now = new Date().toISOString();
    run('UPDATE sessions SET deleted_at = ? WHERE id = ?', [now, req.params.id]);

    logAudit('session_deleted', 'session', req.params.id, {
      date: session.date,
      time: session.time,
      bookings: bookings.map(booking => ({
        ref: booking.reference_number,
        amount: booking.total_amount,
        status: booking.payment_status,
        attendee: `${booking.first_name} ${booking.last_name}`,
        table: booking.table_number,
        chair: booking.chair_number
      }))
    });

    saveDb();
    res.json({ success: true });
  });

  app.get('/api/admin/packages', adminAuth, (req, res) => {
    res.json(all('SELECT * FROM packages ORDER BY sort_order ASC'));
  });

  app.post('/api/admin/packages', adminAuth, (req, res) => {
    const { name, price, type, max_quantity, sort_order, is_phd, description } = req.body;
    const id = uuid();
    run('INSERT INTO packages (id, name, price, type, max_quantity, is_active, sort_order, is_phd, description) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
      [id, name, price, type, max_quantity || 1, sort_order || 0, is_phd ? 1 : 0, description || '']);
    res.json({ id, name, price, type, is_phd: is_phd ? 1 : 0, description: description || '' });
  });

  app.patch('/api/admin/packages/:id', adminAuth, (req, res) => {
    const { name, price, type, max_quantity, is_active, sort_order, description } = req.body;
    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (price !== undefined) { updates.push('price = ?'); values.push(price); }
    if (type !== undefined) { updates.push('type = ?'); values.push(type); }
    if (max_quantity !== undefined) { updates.push('max_quantity = ?'); values.push(max_quantity); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
    if (req.body.is_phd !== undefined) { updates.push('is_phd = ?'); values.push(req.body.is_phd ? 1 : 0); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description || ''); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields' });
    values.push(req.params.id);
    run(`UPDATE packages SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  });

  app.delete('/api/admin/packages/:id', adminAuth, (req, res) => {
    const id = req.params.id;
    const pkg = get('SELECT id, name FROM packages WHERE id = ?', [id]);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const itemRow = get('SELECT COUNT(*) AS c FROM booking_items WHERE package_id = ?', [id]);
    const addonRow = get('SELECT COUNT(*) AS c FROM booking_addons WHERE package_id = ?', [id]);
    const totalRefs = (itemRow ? itemRow.c : 0) + (addonRow ? addonRow.c : 0);

    if (totalRefs > 0) {
      return res.status(409).json({
        error: 'package_in_use',
        message: `Cannot delete "${pkg.name}" - it is referenced by ${totalRefs} booking record${totalRefs === 1 ? '' : 's'}. Disable it instead so it stops appearing on new bookings while preserving sales history.`,
        references: totalRefs,
      });
    }

    run('DELETE FROM packages WHERE id = ?', [id]);
    res.json({ success: true, deleted: pkg.name });
  });

  app.patch('/api/admin/seats/:id', adminAuth, (req, res) => {
    const { is_disabled } = req.body;
    if (is_disabled !== undefined) {
      const seat = get('SELECT * FROM seats WHERE id = ?', [req.params.id]);
      if (!seat) return res.status(404).json({ error: 'Seat not found' });
      run('UPDATE seats SET is_disabled = ? WHERE id = ?', [is_disabled ? 1 : 0, req.params.id]);
      io.to(`session:${seat.session_id}`).emit('seats:refresh');
    }
    res.json({ success: true });
  });

  app.patch('/api/admin/sessions/:id/tables/:tableNumber/seats', adminAuth, (req, res) => {
    const { is_disabled } = req.body;
    if (typeof is_disabled !== 'boolean') {
      return res.status(400).json({ error: 'is_disabled must be true or false' });
    }

    const tableNumber = Number.parseInt(req.params.tableNumber, 10);
    if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 75) {
      return res.status(400).json({ error: 'Invalid table number' });
    }

    const session = get('SELECT id, date, time, event_title FROM sessions WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const seats = all(
      'SELECT id, chair_number, status, is_disabled FROM seats WHERE session_id = ? AND table_number = ? ORDER BY chair_number ASC',
      [session.id, tableNumber]
    );
    if (seats.length === 0) return res.status(404).json({ error: 'Table seats not found' });

    const editableSeats = seats.filter(seat => seat.status !== 'sold');
    if (editableSeats.length === 0) {
      return res.status(409).json({ error: 'All seats at this table are sold and cannot be changed.' });
    }

    const targetValue = is_disabled ? 1 : 0;
    for (const seat of editableSeats) {
      run('UPDATE seats SET is_disabled = ? WHERE id = ?', [targetValue, seat.id]);
    }

    logAudit(is_disabled ? 'table_disabled' : 'table_enabled', 'session', session.id, {
      table_number: tableNumber,
      changed_seats: editableSeats.length,
      skipped_sold_seats: seats.length - editableSeats.length,
      date: session.date,
      time: session.time,
      event_title: session.event_title,
      admin: req.adminUser?.email,
    });

    io.to(`session:${session.id}`).emit('seats:refresh');
    res.json({
      success: true,
      sessionId: session.id,
      tableNumber,
      is_disabled,
      changedSeats: editableSeats.length,
      skippedSoldSeats: seats.length - editableSeats.length,
      seats: seats.map(seat => ({
        ...seat,
        is_disabled: seat.status === 'sold' ? seat.is_disabled : targetValue,
      })),
    });
  });

  app.patch('/api/admin/sessions/:id/seats/bulk', adminAuth, (req, res) => {
    const { seatIds, is_disabled } = req.body;
    if (typeof is_disabled !== 'boolean') {
      return res.status(400).json({ error: 'is_disabled must be true or false' });
    }
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one seat' });
    }

    const uniqueSeatIds = [...new Set(seatIds.map(id => String(id || '').trim()).filter(Boolean))];
    if (uniqueSeatIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one valid seat' });
    }
    if (uniqueSeatIds.length > 450) {
      return res.status(400).json({ error: 'Too many seats selected' });
    }

    const session = get('SELECT id, date, time, event_title FROM sessions WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const placeholders = uniqueSeatIds.map(() => '?').join(',');
    const seats = all(
      `SELECT id, table_number, chair_number, status, is_disabled
       FROM seats
       WHERE session_id = ? AND id IN (${placeholders})
       ORDER BY table_number ASC, chair_number ASC`,
      [session.id, ...uniqueSeatIds]
    );
    if (seats.length === 0) return res.status(404).json({ error: 'Selected seats were not found for this session' });

    const editableSeats = seats.filter(seat => seat.status !== 'sold');
    if (editableSeats.length === 0) {
      return res.status(409).json({ error: 'All selected seats are sold and cannot be changed.' });
    }

    const targetValue = is_disabled ? 1 : 0;
    for (const seat of editableSeats) {
      run('UPDATE seats SET is_disabled = ? WHERE id = ?', [targetValue, seat.id]);
    }

    logAudit(is_disabled ? 'bulk_seats_disabled' : 'bulk_seats_enabled', 'session', session.id, {
      changed_seats: editableSeats.length,
      skipped_sold_seats: seats.length - editableSeats.length,
      selected_seats: uniqueSeatIds.length,
      tables: [...new Set(editableSeats.map(seat => seat.table_number))],
      date: session.date,
      time: session.time,
      event_title: session.event_title,
      admin: req.adminUser?.email,
    });

    io.to(`session:${session.id}`).emit('seats:refresh');
    res.json({
      success: true,
      sessionId: session.id,
      is_disabled,
      changedSeats: editableSeats.length,
      skippedSoldSeats: seats.length - editableSeats.length,
      seats: seats.map(seat => ({
        ...seat,
        is_disabled: seat.status === 'sold' ? seat.is_disabled : targetValue,
      })),
    });
  });

  app.get('/api/admin/sessions/:id/seats', adminAuth, (req, res) => {
    releaseExpiredHolds(io);
    const seats = all(`
      SELECT s.id, s.table_number, s.chair_number, s.status, s.is_disabled,
             bi.first_name as booked_name
      FROM seats s
      LEFT JOIN (
        SELECT bi.seat_id, bi.first_name
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE b.payment_status = 'paid'
      ) bi ON bi.seat_id = s.id
      WHERE s.session_id = ?
      ORDER BY s.table_number ASC, s.chair_number ASC
    `, [req.params.id]);
    res.json(seats);
  });

  app.get('/api/admin/sessions/deleted', adminAuth, (req, res) => {
    archivePastSessions();
    const sessions = all(`
      SELECT s.*,
        (SELECT COUNT(*) FROM bookings WHERE session_id = s.id AND payment_status = 'paid') as paid_bookings,
        (SELECT COALESCE(SUM(total_amount), 0) FROM bookings WHERE session_id = s.id AND payment_status = 'paid') as total_revenue
      FROM sessions s
      WHERE s.deleted_at IS NOT NULL
      ORDER BY s.deleted_at DESC
    `);
    res.json(sessions);
  });

  app.get('/api/admin/sessions/:id/bookings', adminAuth, (req, res) => {
    const rows = all(`
      SELECT b.id, b.reference_number, b.total_amount, b.payment_status, b.created_at,
             b.email, b.customer_first_name, b.customer_last_name,
             bi.id as booking_item_id, bi.first_name, bi.last_name, bi.price as item_price,
             bi.reference_number as item_reference_number,
             bi.printed_at as item_printed_at,
             seats.table_number, seats.chair_number,
             COALESCE(p.name, sp.name) as package_name
      FROM bookings b
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN seats ON seats.id = bi.seat_id
      LEFT JOIN packages p ON p.id = bi.package_id
      LEFT JOIN session_packages sp ON sp.id = bi.package_id
      WHERE b.session_id = ?
      ORDER BY b.created_at DESC, b.id, bi.id
    `, [req.params.id]);

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
          email: row.email,
          customerFirstName: row.customer_first_name,
          customerLastName: row.customer_last_name,
          attendees: []
        };
      }
      bookings[row.id].attendees.push({
        firstName: row.first_name,
        lastName: row.last_name,
        tableNumber: row.table_number,
        chairNumber: row.chair_number,
        referenceNumber: row.item_reference_number,
        packageName: row.package_name,
        itemPrice: row.item_price,
        itemPriceFormatted: '$' + formatPrice(row.item_price)
      });
    }
    res.json(Object.values(bookings));
  });

  app.post('/api/admin/sessions/:id/restore', adminAuth, (req, res) => {
    const session = get('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NOT NULL', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Deleted session not found' });

    run('UPDATE sessions SET deleted_at = NULL WHERE id = ?', [req.params.id]);
    logAudit('session_restored', 'session', req.params.id, { date: session.date, time: session.time });
    saveDb();
    res.json({ success: true });
  });

  app.get('/api/admin/audit-log', adminAuth, (req, res) => {
    const { action, entity_type, entity_id, limit: lim } = req.query;
    const where = [];
    const params = [];
    if (action) { where.push('action = ?'); params.push(action); }
    if (entity_type) { where.push('entity_type = ?'); params.push(entity_type); }
    if (entity_id) { where.push('entity_id = ?'); params.push(entity_id); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const limitVal = Math.min(parseInt(lim) || 100, 500);
    const logs = all(`SELECT * FROM audit_log ${whereClause} ORDER BY created_at DESC LIMIT ?`, [...params, limitVal]);
    res.json(logs.map(log => ({ ...log, details: log.details ? JSON.parse(log.details) : null })));
  });

  app.get('/api/admin/sessions/:id/packages', adminAuth, (req, res) => {
    const session = get('SELECT is_special_event, session_type FROM sessions WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const sessionType = normalizeSessionType(session.session_type, session.is_special_event);
    if (sessionType === 'regular_bingo') return res.json([]);
    res.json(all('SELECT * FROM session_packages WHERE session_id = ? ORDER BY sort_order ASC', [req.params.id]));
  });

  app.post('/api/admin/sessions/:id/packages', adminAuth, (req, res) => {
    const { packages: pkgs } = req.body;
    if (!Array.isArray(pkgs)) return res.status(400).json({ error: 'packages array required' });
    const session = get('SELECT is_special_event, session_type FROM sessions WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const sessionType = normalizeSessionType(session.session_type, session.is_special_event);
    if (sessionType === 'regular_bingo') {
      run('DELETE FROM session_packages WHERE session_id = ?', [req.params.id]);
      saveDb();
      return res.json({ success: true, count: 0 });
    }
    const packageDrafts = sessionType === 'special_bingo' && pkgs.length === 0
      ? getDefaultSpecialBingoPackages()
      : pkgs;
    const packageValidation = validateSessionPackagesForType(sessionType, packageDrafts);
    if (!packageValidation.ok) return res.status(400).json({ error: packageValidation.error });

    run('DELETE FROM session_packages WHERE session_id = ?', [req.params.id]);
    for (const pkg of packageValidation.packages) {
      run('INSERT INTO session_packages (id, session_id, name, price, type, max_quantity, sort_order, is_phd, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), req.params.id, pkg.name, pkg.price, pkg.type, pkg.max_quantity || 1, pkg.sort_order || 0, pkg.is_phd ? 1 : 0, pkg.description || '']);
    }
    res.json({ success: true, count: packageValidation.packages.length });
  });
}
