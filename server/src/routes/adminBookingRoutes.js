import { v4 as uuid } from 'uuid';
import { all, get, run, saveDb } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { refundTransaction, verifyTransaction, voidTransaction } from '../services/payments.js';
import { formatCurrency, generateRef } from '../utils/format.js';
import { getLiveEventCapacity, withSessionCapacityLock } from '../services/liveEventCapacity.js';

function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function loadAdminBookings(whereClause = '', params = []) {
  const rows = await all(`
    SELECT b.id, b.reference_number, b.total_amount, b.payment_status, b.created_at, b.email,
           b.customer_first_name, b.customer_last_name, b.booking_source, b.admin_note,
           s.id as session_id, s.date as session_date, s.time as session_time,
           bi.id as item_id, bi.first_name, bi.last_name, bi.price as item_price,
           bi.reference_number as item_reference_number, bi.refund_status,
           bi.refunded_at, bi.refund_transaction_id, bi.refund_amount, bi.refund_action,
           cc.id as credit_id, cc.code as credit_code, cc.amount as credit_amount,
           cc.status as credit_status, cc.note as credit_note, cc.created_at as credit_created_at,
           seats.id as seat_id, seats.table_number, seats.chair_number,
           COALESCE(p.name, sp.name) as package_name, bi.price as package_price
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN booking_items bi ON bi.booking_id = b.id
    JOIN seats ON seats.id = bi.seat_id
    LEFT JOIN packages p ON p.id = bi.package_id
    LEFT JOIN session_packages sp ON sp.id = bi.package_id
    LEFT JOIN customer_credits cc ON cc.booking_item_id = bi.id
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
        totalFormatted: formatCurrency(row.total_amount),
        paymentStatus: row.payment_status,
        createdAt: row.created_at,
        email: row.email,
        customerFirstName: row.customer_first_name,
        customerLastName: row.customer_last_name,
        bookingSource: row.booking_source || 'online',
        adminNote: row.admin_note || '',
        sessionId: row.session_id,
        sessionDate: row.session_date,
        sessionTime: row.session_time,
        items: []
      };
    }

    const addonRows = await all(`
      SELECT ba.*, COALESCE(p.name, sp.name) as package_name FROM booking_addons ba
      LEFT JOIN packages p ON p.id = ba.package_id
      LEFT JOIN session_packages sp ON sp.id = ba.package_id WHERE ba.booking_item_id = ?
    `, [row.item_id]);
    const addons = addonRows.map(addon => ({
      packageName: addon.package_name,
      quantity: addon.quantity,
      price: addon.price,
      priceFormatted: formatCurrency(addon.price)
    }));

    bookings[row.id].items.push({
      id: row.item_id,
      firstName: row.first_name,
      lastName: row.last_name,
      tableNumber: row.table_number,
      chairNumber: row.chair_number,
      referenceNumber: row.item_reference_number,
      seatId: row.seat_id,
      packageName: row.package_name,
      packagePrice: row.package_price,
      packagePriceFormatted: formatCurrency(row.package_price),
      refundStatus: row.refund_status || 'active',
      refundedAt: row.refunded_at,
      refundTransactionId: row.refund_transaction_id,
      refundAmount: row.refund_amount || 0,
      refundAmountFormatted: formatCurrency(row.refund_amount || 0),
      refundAction: row.refund_action,
      credit: row.credit_id ? {
        id: row.credit_id,
        code: row.credit_code,
        amount: row.credit_amount || 0,
        amountFormatted: formatCurrency(row.credit_amount || 0),
        status: row.credit_status,
        note: row.credit_note || '',
        createdAt: row.credit_created_at,
      } : null,
      addons
    });
  }

  return Object.values(bookings);
}

export function registerAdminBookingRoutes(app, {
  io,
  logAudit,
  getBookingItemRefundAmount,
  markBookingItemRefunded,
  markBookingRefunded,
  markBookingVoided,
  sendBookingConfirmationEmail,
}) {
  app.get('/api/admin/bookings', adminAuth, async (req, res) => {
    try {
      const { sessionId } = req.query;
      let whereClause = '';
      const params = [];
      if (sessionId) { whereClause = 'WHERE b.session_id = ?'; params.push(sessionId); }
      res.json(await loadAdminBookings(whereClause, params));
    } catch (err) {
      console.error('GET /api/admin/bookings failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/bookings/:id/receipt', adminAuth, async (req, res) => {
    try {
      const bookings = await loadAdminBookings('WHERE b.id = ? OR b.reference_number = ?', [req.params.id, req.params.id]);
      if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found' });
      res.json(bookings[0]);
    } catch (err) {
      console.error('GET /api/admin/bookings/:id/receipt failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/sessions/:sessionId/resend-confirmations', adminAuth, async (req, res) => {
    try {
      if (typeof sendBookingConfirmationEmail !== 'function') {
        return res.status(500).json({ error: 'Confirmation resend is not configured.' });
      }

      const session = await get('SELECT * FROM sessions WHERE id = ?', [req.params.sessionId]);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const rows = await all(`
        SELECT id, reference_number, email, customer_first_name, customer_last_name, payment_status, created_at
        FROM bookings
        WHERE session_id = ?
          AND payment_status = 'paid'
        ORDER BY created_at ASC, id ASC
      `, [req.params.sessionId]);

      const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
      const eligible = rows
        .map(row => ({ ...row, email: String(row.email || '').trim() }))
        .filter(row => validEmail(row.email));
      const skipped = rows.length - eligible.length;

      const sampleEmail = String(req.body?.sampleEmail || '').trim();
      if (sampleEmail) {
        if (!validEmail(sampleEmail)) return res.status(400).json({ error: 'Invalid sample email address' });
        if (eligible.length === 0) {
          return res.status(400).json({ error: 'No paid bookings with valid customer emails found for this session.' });
        }
        const sampleBooking = eligible.find(row => row.id === req.body?.bookingId || row.reference_number === req.body?.bookingId) || eligible[0];
        const result = await sendBookingConfirmationEmail(sampleBooking.id, { toOverride: sampleEmail });
        await logAudit('booking_confirmation_sample_sent', 'session', session.id, {
          sessionDate: session.date,
          sessionTime: session.time,
          eventTitle: session.event_title || null,
          sampleEmail,
          sourceBookingId: sampleBooking.id,
          sourceReference: sampleBooking.reference_number,
          ok: Boolean(result?.ok),
        });
        return res.json({
          success: Boolean(result?.ok),
          mode: 'sample',
          sentTo: sampleEmail,
          sourceReference: sampleBooking.reference_number,
          providerStatus: result?.status || 0,
          error: result?.error || null,
          eligibleBookings: eligible.length,
          skippedBookings: skipped,
        });
      }

      if (req.body?.dryRun !== false) {
        return res.json({
          success: true,
          mode: 'dryRun',
          session: {
            id: session.id,
            date: session.date,
            time: session.time,
            title: session.event_title || null,
            sessionType: session.session_type,
          },
          paidBookings: rows.length,
          eligibleBookings: eligible.length,
          skippedBookings: skipped,
          references: eligible.map(row => row.reference_number),
        });
      }

      if (req.body?.confirm !== 'RESEND CORRECTED CONFIRMATIONS') {
        return res.status(400).json({
          error: 'confirmation_required',
          message: 'Set confirm to RESEND CORRECTED CONFIRMATIONS to email customers.',
        });
      }

      const sent = [];
      const failed = [];
      for (const booking of eligible) {
        const result = await sendBookingConfirmationEmail(booking.id);
        if (result?.ok) {
          sent.push({ id: booking.id, referenceNumber: booking.reference_number, email: booking.email });
        } else {
          failed.push({
            id: booking.id,
            referenceNumber: booking.reference_number,
            email: booking.email,
            status: result?.status || 0,
            error: result?.error || 'send_failed',
          });
        }
      }

      await logAudit('booking_confirmations_resent', 'session', session.id, {
        sessionDate: session.date,
        sessionTime: session.time,
        eventTitle: session.event_title || null,
        sent: sent.length,
        failed: failed.length,
        skipped,
      });

      res.json({
        success: failed.length === 0,
        mode: 'sent',
        sent: sent.length,
        failed: failed.length,
        skippedBookings: skipped,
        failedReferences: failed.map(row => row.referenceNumber),
      });
    } catch (err) {
      console.error('POST /api/admin/sessions/:sessionId/resend-confirmations failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/bookings/export', adminAuth, async (req, res) => {
    try {
    const { sessionId } = req.query;
    let whereClause = '';
    const params = [];
    if (sessionId) { whereClause = 'WHERE b.session_id = ?'; params.push(sessionId); }

    const rows = await all(`
      SELECT COALESCE(bi.reference_number, b.reference_number) as ticket_reference, b.total_amount, b.payment_status, b.created_at,
             b.email, b.customer_first_name, b.customer_last_name,
             s.date as session_date, s.time as session_time,
             bi.first_name, bi.last_name,
             seats.table_number, seats.chair_number,
             COALESCE(p.name, sp.name) as package_name, COALESCE(p.price, sp.price) as package_price
      FROM bookings b
      JOIN sessions s ON b.session_id = s.id
      JOIN booking_items bi ON bi.booking_id = b.id
      JOIN seats ON seats.id = bi.seat_id
      LEFT JOIN packages p ON p.id = bi.package_id
      LEFT JOIN session_packages sp ON sp.id = bi.package_id
      ${whereClause}
      ORDER BY b.created_at DESC
    `, params);

    const header = ['Reference', 'Session Date', 'Session Time', 'Customer First Name', 'Customer Last Name', 'Email', 'First Name', 'Last Name', 'Table', 'Chair', 'Package', 'Package Price', 'Total Amount', 'Payment Status', 'Booked At'];
    const lines = [header.map(csvCell).join(',')];
    for (const row of rows) {
      lines.push([
        row.ticket_reference,
        row.session_date,
        row.session_time,
        row.customer_first_name || '',
        row.customer_last_name || '',
        row.email || '',
        row.first_name,
        row.last_name,
        row.table_number,
        row.chair_number,
        row.package_name,
        formatCurrency(row.package_price),
        formatCurrency(row.total_amount),
        row.payment_status,
        row.created_at,
      ].map(csvCell).join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings-report.csv');
    res.send(lines.join('\n'));
    } catch (err) {
      console.error('GET /api/admin/bookings/export failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/bookings/:id/cancel', adminAuth, async (req, res) => {
    try {
    const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const items = await all('SELECT bi.*, seats.table_number, seats.chair_number FROM booking_items bi JOIN seats ON seats.id = bi.seat_id WHERE bi.booking_id = ?', [req.params.id]);
    for (const item of items) {
      await run("UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?", [item.seat_id]);
    }
    await run("UPDATE bookings SET payment_status = 'cancelled' WHERE id = ?", [req.params.id]);

    await logAudit('booking_cancelled', 'booking', req.params.id, {
      referenceNumber: booking.reference_number,
      sessionId: booking.session_id,
      totalAmount: booking.total_amount,
      attendees: items.map(item => ({
        name: `${item.first_name} ${item.last_name}`,
        table: item.table_number,
        chair: item.chair_number
      }))
    });

    io.to(`session:${booking.session_id}`).emit('seats:refresh');
    await saveDb();
    res.json({ success: true });
    } catch (err) {
      console.error('POST /api/admin/bookings/:id/cancel failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/bookings/go-live-cleanup', adminAuth, async (req, res) => {
    try {
    if (req.body?.confirm !== 'CLEAR TEST DATA') {
      return res.status(400).json({
        error: 'confirmation_required',
        message: 'Type CLEAR TEST DATA to run go-live cleanup.',
      });
    }

    const deletableStatuses = ['pending', 'failed', 'cancelled'];
    const placeholders = deletableStatuses.map(() => '?').join(',');
    const bookings = await all(
      `SELECT id, reference_number, session_id, payment_status, total_amount
       FROM bookings
       WHERE payment_status IN (${placeholders})`,
      deletableStatuses
    );
    const bookingIds = bookings.map(booking => booking.id);
    const bookingPlaceholders = bookingIds.map(() => '?').join(',');
    const items = bookingIds.length > 0
      ? await all(`SELECT seat_id FROM booking_items WHERE booking_id IN (${bookingPlaceholders})`, bookingIds)
      : [];
    const paidCount = (await get(`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE payment_status NOT IN (${placeholders})
    `, deletableStatuses))?.count || 0;

    for (const item of items) {
      await run("UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?", [item.seat_id]);
    }

    const heldClearedResult = await run(
      "UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE status = 'held'"
    );
    const heldCleared = heldClearedResult.changes || 0;

    if (bookingIds.length > 0) {
      const itemRows = await all(
        `SELECT id FROM booking_items WHERE booking_id IN (${bookingPlaceholders})`,
        bookingIds
      );
      const itemIds = itemRows.map(item => item.id);
      if (itemIds.length > 0) {
        const itemPlaceholders = itemIds.map(() => '?').join(',');
        await run(`DELETE FROM booking_addons WHERE booking_item_id IN (${itemPlaceholders})`, itemIds);
      }
      await run(`DELETE FROM booking_items WHERE booking_id IN (${bookingPlaceholders})`, bookingIds);
      await run(`DELETE FROM payment_events WHERE booking_id IN (${bookingPlaceholders})`, bookingIds);
      await run(`DELETE FROM bookings WHERE id IN (${bookingPlaceholders})`, bookingIds);
    }

    await run('DELETE FROM email_verifications');

    const sessionIds = [...new Set(bookings.map(booking => booking.session_id).filter(Boolean))];
    for (const sessionId of sessionIds) {
      io.to(`session:${sessionId}`).emit('seats:refresh');
    }
    io.to('admin:receipts').emit('bookings:cleared');

    await logAudit('go_live_test_data_cleaned', 'booking', 'go_live_cleanup', {
      deletedBookings: bookings.length,
      releasedBookingSeats: items.length,
      clearedHeldSeats: heldCleared,
      paidBookingsKept: paidCount,
      statusesDeleted: deletableStatuses,
      clearedBy: req.adminUser?.email || null,
    });

    await saveDb();
    res.json({
      ok: true,
      deletedBookings: bookings.length,
      releasedSeats: items.length + heldCleared,
      heldSeatsCleared: heldCleared,
      paidBookingsKept: paidCount,
      message: paidCount > 0
        ? `Cleared ${bookings.length} pending/failed/cancelled test booking(s) and ${heldCleared} held seat(s). Kept ${paidCount} paid/refunded/voided booking(s).`
        : `Cleared ${bookings.length} test booking(s) and ${heldCleared} held seat(s).`,
    });
    } catch (err) {
      console.error('POST /api/admin/bookings/go-live-cleanup failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/admin/bookings/:id', adminAuth, async (req, res) => {
    try {
    const identifier = req.params.id;
    const booking = await get(
      'SELECT * FROM bookings WHERE id = ? OR reference_number = ?',
      [identifier, identifier]
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const deletableStatuses = new Set(['pending', 'failed', 'cancelled']);
    if (!deletableStatuses.has(booking.payment_status)) {
      return res.status(409).json({
        error: 'booking_not_deletable',
        message: `Only pending, failed, or cancelled test bookings can be deleted. Booking ${booking.reference_number} is '${booking.payment_status}'. Use refund/void for paid transactions.`,
      });
    }

    const items = await all('SELECT id, seat_id, first_name, last_name FROM booking_items WHERE booking_id = ?', [booking.id]);
    for (const item of items) {
      await run("UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?", [item.seat_id]);
    }

    await logAudit('booking_deleted', 'booking', booking.id, {
      referenceNumber: booking.reference_number,
      sessionId: booking.session_id,
      paymentStatus: booking.payment_status,
      totalAmount: booking.total_amount,
      attendees: items.map(item => ({ firstName: item.first_name, lastName: item.last_name })),
    });

    await run('DELETE FROM payment_events WHERE booking_id = ?', [booking.id]);
    await run('DELETE FROM booking_addons WHERE booking_item_id IN (SELECT id FROM booking_items WHERE booking_id = ?)', [booking.id]);
    await run('DELETE FROM booking_items WHERE booking_id = ?', [booking.id]);
    await run('DELETE FROM bookings WHERE id = ?', [booking.id]);

    io.to(`session:${booking.session_id}`).emit('seats:refresh');
    await saveDb();

    res.json({
      ok: true,
      deleted: booking.reference_number,
      releasedSeats: items.length,
    });
    } catch (err) {
      console.error('DELETE /api/admin/bookings/:id failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/booking-items/:id/refund', adminAuth, async (req, res) => {
    try {
    const item = await get(`
      SELECT bi.*, b.id as booking_id, b.reference_number as booking_reference,
             b.payment_status, b.transaction_id, b.total_amount
      FROM booking_items bi
      JOIN bookings b ON b.id = bi.booking_id
      WHERE bi.id = ?
    `, [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Ticket not found' });

    if (item.refund_status === 'refunded') {
      return res.status(400).json({ error: 'This ticket has already been refunded.' });
    }
    if (!['paid', 'partially_refunded'].includes(item.payment_status)) {
      return res.status(400).json({ error: `Cannot refund a ticket from booking status '${item.payment_status}'.` });
    }
    if (!item.transaction_id) {
      return res.status(400).json({
        error: 'This booking has no transaction_id (likely created before payment integration). Use Cancel for legacy bookings.'
      });
    }

    const amountCents = await getBookingItemRefundAmount(item.id);
    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ error: 'Could not determine the ticket refund amount.' });
    }

    const activeItems = (await get(`
      SELECT COUNT(*) as count
      FROM booking_items
      WHERE booking_id = ? AND COALESCE(refund_status, 'active') != 'refunded'
    `, [item.booking_id]))?.count || 0;

    const verify = await verifyTransaction(item.transaction_id);
    if (!verify.ok) {
      return res.status(502).json({ error: `Could not verify transaction state: ${verify.error}` });
    }

    const txStatus = String(verify.status || '');
    let action;
    let result;

    if (txStatus === 'capturedPendingSettlement' || txStatus === 'authorizedPendingCapture') {
      if (activeItems > 1) {
        return res.status(400).json({
          error: 'This payment has not settled yet, so Authorize.Net can only void the full booking. Partial ticket refunds are available after settlement.'
        });
      }
      action = 'void';
      result = await voidTransaction(item.transaction_id);
    } else if (txStatus === 'settledSuccessfully' || txStatus === 'settlementError') {
      action = 'refund';
      if (!verify.last4) {
        return res.status(502).json({ error: 'Could not determine card last 4 for refund - Authorize.Net API did not return card details.' });
      }
      result = await refundTransaction({
        transId: item.transaction_id,
        amountCents,
        last4: verify.last4,
      });
    } else {
      return res.status(400).json({
        error: `Cannot refund: transaction is in status '${txStatus}'. It may already be refunded or voided.`
      });
    }

    if (!result.ok) {
      return res.status(502).json({ error: `${action} failed: ${result.error}` });
    }

    const markResult = await markBookingItemRefunded({
      bookingId: item.booking_id,
      bookingItemId: item.id,
      transactionId: item.transaction_id,
      refundTransactionId: result.refundTransId || result.voidTransId,
      amountCents,
      action,
      source: 'admin',
    });
    if (!markResult.ok) {
      return res.status(500).json({ error: markResult.error || 'Refund was processed but ticket status could not be updated.' });
    }

    res.json({
      ok: true,
      action,
      refundTransId: result.refundTransId || result.voidTransId,
      amountCents,
      amountFormatted: formatCurrency(amountCents),
      seatsReleased: markResult.releasedSeats || 0,
      bookingStatus: markResult.bookingStatus,
    });
    } catch (err) {
      console.error('POST /api/admin/booking-items/:id/refund failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/booking-items/:id/no-show-credit', adminAuth, async (req, res) => {
    try {
      const item = await get(`
        SELECT bi.*, b.id as booking_id, b.reference_number as booking_reference,
               b.payment_status, b.email, b.customer_first_name, b.customer_last_name
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE bi.id = ?
      `, [req.params.id]);
      if (!item) return res.status(404).json({ error: 'Ticket not found' });
      if (item.refund_status === 'refunded') return res.status(400).json({ error: 'Cannot credit a refunded ticket.' });
      if (!['paid', 'partially_refunded'].includes(item.payment_status)) {
        return res.status(400).json({ error: `Cannot credit a ticket from booking status '${item.payment_status}'.` });
      }

      const existing = await get('SELECT code, status FROM customer_credits WHERE booking_item_id = ?', [item.id]);
      if (existing) {
        return res.status(409).json({ error: `This ticket already has credit ${existing.code} (${existing.status}).` });
      }

      const requestedAmount = Number(req.body?.amountCents);
      const defaultAmount = await getBookingItemRefundAmount(item.id);
      const amountCents = Number.isFinite(requestedAmount) && requestedAmount >= 0
        ? Math.round(requestedAmount)
        : defaultAmount;
      if (!Number.isFinite(amountCents) || amountCents < 0) {
        return res.status(400).json({ error: 'Credit amount must be zero or greater.' });
      }

      const id = uuid();
      const code = `CR-${generateRef().replace(/^BNG-/, '')}`;
      const note = String(req.body?.note || '').trim();
      await run(
        `INSERT INTO customer_credits
          (id, booking_id, booking_item_id, code, amount, status, reason, note, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', 'no_show', ?, ?, ?)`,
        [id, item.booking_id, item.id, code, amountCents, note || null, req.adminUser?.email || null, new Date().toISOString()]
      );

      await logAudit('no_show_credit_issued', 'booking_item', item.id, {
        bookingId: item.booking_id,
        bookingReference: item.booking_reference,
        creditId: id,
        code,
        amountCents,
        attendee: `${item.first_name} ${item.last_name}`,
        note: note || null,
        issuedBy: req.adminUser?.email || null,
      });
      await saveDb();

      res.json({
        ok: true,
        credit: {
          id,
          code,
          amount: amountCents,
          amountFormatted: formatCurrency(amountCents),
          status: 'active',
          note,
        },
      });
    } catch (err) {
      console.error('POST /api/admin/booking-items/:id/no-show-credit failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/assigned-tickets', adminAuth, async (req, res) => {
    try {
      const sessionId = String(req.body?.sessionId || '').trim();
      const tableNumber = Number(req.body?.tableNumber);
      const chairNumber = Number(req.body?.chairNumber);
      const firstName = String(req.body?.firstName || '').trim();
      const lastName = String(req.body?.lastName || '').trim();
      const type = ['promo', 'donation'].includes(String(req.body?.type || '').toLowerCase())
        ? String(req.body.type).toLowerCase()
        : 'promo';
      const note = String(req.body?.note || '').trim();

      if (!sessionId) return res.status(400).json({ error: 'Session is required.' });
      if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required.' });
      if (!Number.isInteger(tableNumber) || !Number.isInteger(chairNumber) || tableNumber <= 0 || chairNumber <= 0) {
        return res.status(400).json({ error: 'A valid table and chair are required.' });
      }

      const session = await get('SELECT id, date, time, event_title, session_type, is_special_event, ticket_limit FROM sessions WHERE id = ? AND deleted_at IS NULL', [sessionId]);
      if (!session) return res.status(404).json({ error: 'Session not found.' });

      const capacity = await withSessionCapacityLock(sessionId, () => getLiveEventCapacity(session));
      if (capacity && capacity.remaining < 1) {
        return res.status(409).json({ error: 'This live event has reached its ticket limit.' });
      }

      const seat = await get(
        'SELECT * FROM seats WHERE session_id = ? AND table_number = ? AND chair_number = ?',
        [sessionId, tableNumber, chairNumber]
      );
      if (!seat) return res.status(404).json({ error: `Seat T${tableNumber}-C${chairNumber} was not found.` });
      if (seat.is_disabled) return res.status(409).json({ error: `Seat T${tableNumber}-C${chairNumber} is disabled.` });
      if (seat.status !== 'vacant') return res.status(409).json({ error: `Seat T${tableNumber}-C${chairNumber} is currently ${seat.status}.` });

      const pkg = await get(`
        SELECT id, name FROM session_packages WHERE session_id = ? AND type = 'required' ORDER BY sort_order ASC LIMIT 1
      `, [sessionId]) || await get(`
        SELECT id, name FROM packages WHERE type = 'required' AND is_active = 1 ORDER BY sort_order ASC LIMIT 1
      `);
      if (!pkg) return res.status(409).json({ error: 'No required ticket package is available for this session.' });

      const bookingId = uuid();
      const itemId = uuid();
      const bookingRef = generateRef();
      const itemRef = generateRef();
      const now = new Date().toISOString();
      const label = type === 'donation' ? 'Donation assigned seat' : 'Promo assigned seat';

      await run(
        `INSERT INTO bookings
          (id, session_id, reference_number, total_amount, payment_status, created_at,
           email, customer_first_name, customer_last_name, payment_provider, booking_source, admin_note)
         VALUES (?, ?, ?, 0, 'paid', ?, NULL, ?, ?, 'admin_assigned', ?, ?)`,
        [bookingId, sessionId, bookingRef, now, firstName, lastName, type, note || label]
      );
      await run(
        `INSERT INTO booking_items
          (id, booking_id, first_name, last_name, seat_id, package_id, price, reference_number)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [itemId, bookingId, firstName, lastName, seat.id, pkg.id, itemRef]
      );
      await run("UPDATE seats SET status = 'sold', held_by = NULL, held_until = NULL WHERE id = ?", [seat.id]);

      await logAudit('assigned_ticket_created', 'booking', bookingId, {
        bookingReference: bookingRef,
        ticketReference: itemRef,
        sessionId,
        type,
        attendee: `${firstName} ${lastName}`,
        tableNumber,
        chairNumber,
        packageId: pkg.id,
        packageName: pkg.name,
        note: note || null,
        createdBy: req.adminUser?.email || null,
      });

      io.to(`session:${sessionId}`).emit('seats:refresh', { sessionId });
      io.to('admin:receipts').emit('booking:new', {
        id: bookingId,
        referenceNumber: bookingRef,
        totalAmount: 0,
        totalFormatted: formatCurrency(0),
        paymentStatus: 'paid',
        createdAt: now,
        sessionDate: session.date,
        sessionTime: session.time,
        sessionTitle: session.event_title || label,
        items: [{
          id: itemId,
          firstName,
          lastName,
          tableNumber,
          chairNumber,
          referenceNumber: itemRef,
          packageName: label,
          packagePrice: 0,
          packagePriceFormatted: formatCurrency(0),
          addons: [],
        }],
      });
      await saveDb();

      res.status(201).json({
        ok: true,
        bookingId,
        bookingReference: bookingRef,
        bookingItemId: itemId,
        ticketReference: itemRef,
        type,
        seat: { id: seat.id, tableNumber, chairNumber },
      });
    } catch (err) {
      console.error('POST /api/admin/assigned-tickets failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/booking-items/:id/remove-assigned', adminAuth, async (req, res) => {
    try {
      const item = await get(`
        SELECT bi.id, bi.booking_id, bi.seat_id, bi.reference_number,
               bi.first_name, bi.last_name, bi.price, bi.refund_status,
               b.reference_number as booking_reference, b.session_id,
               b.booking_source, b.payment_provider, b.payment_status,
               b.total_amount, b.transaction_id,
               seats.table_number, seats.chair_number
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        JOIN seats ON seats.id = bi.seat_id
        WHERE bi.id = ?
      `, [req.params.id]);

      if (!item) return res.status(404).json({ error: 'Assigned ticket not found.' });
      if (!['promo', 'donation'].includes(String(item.booking_source || '').toLowerCase())) {
        return res.status(400).json({ error: 'Only promo or donation assigned seats can be removed with this action.' });
      }
      if (item.payment_provider !== 'admin_assigned' || item.transaction_id || Number(item.total_amount) !== 0 || Number(item.price) !== 0) {
        return res.status(409).json({ error: 'This ticket is linked to a payment or is not a $0 admin-assigned seat. Use the normal refund workflow.' });
      }
      if (item.refund_status === 'refunded') {
        return res.status(409).json({ error: 'This assigned seat has already been removed.' });
      }
      if (!['paid', 'partially_refunded'].includes(item.payment_status)) {
        return res.status(409).json({ error: `Cannot remove an assigned seat from booking status '${item.payment_status}'.` });
      }

      const now = new Date().toISOString();
      await run(
        `UPDATE booking_items
         SET refund_status = 'refunded', refunded_at = ?, refund_amount = 0,
             refund_transaction_id = NULL, refund_action = 'assigned_seat_removed'
         WHERE id = ?`,
        [now, item.id]
      );
      await run(
        "UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?",
        [item.seat_id]
      );
      const creditResult = await run(
        "UPDATE customer_credits SET status = 'cancelled' WHERE booking_item_id = ? AND status = 'active'",
        [item.id]
      );
      const creditsCancelled = Number(creditResult?.changes || 0);

      const activeItems = await get(`
        SELECT COUNT(*) as count
        FROM booking_items
        WHERE booking_id = ? AND COALESCE(refund_status, 'active') != 'refunded'
      `, [item.booking_id]);
      const bookingCancelled = Number(activeItems?.count || 0) === 0;
      if (bookingCancelled) {
        await run("UPDATE bookings SET payment_status = 'cancelled' WHERE id = ?", [item.booking_id]);
      }

      await logAudit('assigned_ticket_removed', 'booking_item', item.id, {
        bookingId: item.booking_id,
        bookingReference: item.booking_reference,
        ticketReference: item.reference_number,
        sessionId: item.session_id,
        type: item.booking_source,
        attendee: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
        tableNumber: item.table_number,
        chairNumber: item.chair_number,
        bookingCancelled,
        creditsCancelled,
        removedBy: req.adminUser?.email || null,
      });

      io.to(`session:${item.session_id}`).emit('seats:refresh', { sessionId: item.session_id });
      await saveDb();

      res.json({
        ok: true,
        action: 'remove_assigned_seat',
        type: item.booking_source,
        seatsReleased: 1,
        bookingCancelled,
        creditsCancelled,
        bookingId: item.booking_id,
        bookingReference: item.booking_reference,
        ticketReference: item.reference_number,
        seat: { tableNumber: item.table_number, chairNumber: item.chair_number },
      });
    } catch (err) {
      console.error('POST /api/admin/booking-items/:id/remove-assigned failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/booking-items/:id/move-seat', adminAuth, async (req, res) => {
    try {
      const tableNumber = Number(req.body?.tableNumber);
      const chairNumber = Number(req.body?.chairNumber);
      if (!Number.isInteger(tableNumber) || !Number.isInteger(chairNumber) || tableNumber <= 0 || chairNumber <= 0) {
        return res.status(400).json({ error: 'A valid target table and chair are required.' });
      }

      const item = await get(`
        SELECT bi.*, b.id as booking_id, b.reference_number as booking_reference,
               b.session_id, b.payment_status, old_seat.table_number as old_table_number,
               old_seat.chair_number as old_chair_number
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        JOIN seats old_seat ON old_seat.id = bi.seat_id
        WHERE bi.id = ?
      `, [req.params.id]);
      if (!item) return res.status(404).json({ error: 'Ticket not found' });
      if (item.refund_status === 'refunded') {
        return res.status(400).json({ error: 'Cannot move a refunded ticket.' });
      }
      if (!['paid', 'partially_refunded'].includes(item.payment_status)) {
        return res.status(400).json({ error: `Cannot move a ticket from booking status '${item.payment_status}'.` });
      }

      const targetSeat = await get(
        `SELECT *
         FROM seats
         WHERE session_id = ? AND table_number = ? AND chair_number = ?`,
        [item.session_id, tableNumber, chairNumber]
      );
      if (!targetSeat) {
        return res.status(404).json({ error: `Seat T${tableNumber}-C${chairNumber} was not found for this session.` });
      }
      if (targetSeat.id === item.seat_id) {
        return res.status(400).json({ error: 'This ticket is already assigned to that seat.' });
      }
      if (targetSeat.is_disabled) {
        return res.status(409).json({ error: `Seat T${tableNumber}-C${chairNumber} is disabled.` });
      }
      if (targetSeat.status !== 'vacant') {
        return res.status(409).json({ error: `Seat T${tableNumber}-C${chairNumber} is currently ${targetSeat.status}.` });
      }

      await run('UPDATE booking_items SET seat_id = ? WHERE id = ?', [targetSeat.id, item.id]);
      await run("UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL WHERE id = ?", [item.seat_id]);
      await run("UPDATE seats SET status = 'sold', held_by = NULL, held_until = NULL WHERE id = ?", [targetSeat.id]);

      await logAudit('booking_item_seat_moved', 'booking_item', item.id, {
        bookingId: item.booking_id,
        referenceNumber: item.booking_reference,
        sessionId: item.session_id,
        fromSeatId: item.seat_id,
        fromTable: item.old_table_number,
        fromChair: item.old_chair_number,
        toSeatId: targetSeat.id,
        toTable: targetSeat.table_number,
        toChair: targetSeat.chair_number,
        movedBy: req.adminUser?.email || null,
      });

      io.to(`session:${item.session_id}`).emit('seats:refresh', { sessionId: item.session_id });
      io.to('admin:receipts').emit('booking:seat_moved', {
        bookingId: item.booking_id,
        bookingItemId: item.id,
        sessionId: item.session_id,
        fromSeatId: item.seat_id,
        toSeatId: targetSeat.id,
      });
      await saveDb();

      res.json({
        ok: true,
        bookingId: item.booking_id,
        bookingItemId: item.id,
        fromSeat: {
          id: item.seat_id,
          tableNumber: item.old_table_number,
          chairNumber: item.old_chair_number,
        },
        toSeat: {
          id: targetSeat.id,
          tableNumber: targetSeat.table_number,
          chairNumber: targetSeat.chair_number,
        },
      });
    } catch (err) {
      console.error('POST /api/admin/booking-items/:id/move-seat failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/bookings/:id/refund', adminAuth, async (req, res) => {
    try {
    const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.payment_status !== 'paid') {
      return res.status(400).json({ error: `Cannot refund a booking with status '${booking.payment_status}'. Only 'paid' bookings can be refunded.` });
    }
    if (!booking.transaction_id) {
      return res.status(400).json({
        error: 'This booking has no transaction_id (likely created via the legacy /api/bookings endpoint before payment integration). Use Cancel instead.'
      });
    }

    const verify = await verifyTransaction(booking.transaction_id);
    if (!verify.ok) {
      return res.status(502).json({ error: `Could not verify transaction state: ${verify.error}` });
    }

    const txStatus = String(verify.status || '');
    let action;
    let result;
    let markResult;

    if (txStatus === 'capturedPendingSettlement' || txStatus === 'authorizedPendingCapture') {
      action = 'void';
      result = await voidTransaction(booking.transaction_id);
      if (result.ok) {
        markResult = await markBookingVoided({
          bookingId: booking.id,
          transactionId: booking.transaction_id,
          voidTransactionId: result.voidTransId,
          source: 'admin',
        });
      }
    } else if (txStatus === 'settledSuccessfully' || txStatus === 'settlementError') {
      action = 'refund';
      if (!verify.last4) {
        return res.status(502).json({ error: 'Could not determine card last 4 for refund - Authorize.Net API did not return card details.' });
      }
      result = await refundTransaction({
        transId: booking.transaction_id,
        amountCents: booking.total_amount,
        last4: verify.last4,
      });
      if (result.ok) {
        markResult = await markBookingRefunded({
          bookingId: booking.id,
          transactionId: booking.transaction_id,
          refundTransactionId: result.refundTransId,
          source: 'admin',
        });
      }
    } else {
      return res.status(400).json({
        error: `Cannot refund: transaction is in status '${txStatus}'. It may already be refunded or voided.`
      });
    }

    if (!result.ok) {
      return res.status(502).json({ error: `${action} failed: ${result.error}` });
    }

    res.json({
      ok: true,
      action,
      refundTransId: result.refundTransId || result.voidTransId,
      seatsReleased: markResult?.releasedSeats || 0,
    });
    } catch (err) {
      console.error('POST /api/admin/bookings/:id/refund failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
