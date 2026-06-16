import { all, get, run, saveDb } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { refundTransaction, verifyTransaction, voidTransaction } from '../services/payments.js';
import { formatCurrency } from '../utils/format.js';

function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function loadAdminBookings(whereClause = '', params = []) {
  const rows = await all(`
    SELECT b.id, b.reference_number, b.total_amount, b.payment_status, b.created_at, b.email,
           b.customer_first_name, b.customer_last_name,
           s.date as session_date, s.time as session_time,
           bi.id as item_id, bi.first_name, bi.last_name, bi.price as item_price,
           bi.reference_number as item_reference_number, bi.refund_status,
           bi.refunded_at, bi.refund_transaction_id, bi.refund_amount, bi.refund_action,
           seats.table_number, seats.chair_number,
           COALESCE(p.name, sp.name) as package_name, COALESCE(p.price, sp.price) as package_price
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN booking_items bi ON bi.booking_id = b.id
    JOIN seats ON seats.id = bi.seat_id
    LEFT JOIN packages p ON p.id = bi.package_id
    LEFT JOIN session_packages sp ON sp.id = bi.package_id
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
      packageName: row.package_name,
      packagePrice: row.package_price,
      packagePriceFormatted: formatCurrency(row.package_price),
      refundStatus: row.refund_status || 'active',
      refundedAt: row.refunded_at,
      refundTransactionId: row.refund_transaction_id,
      refundAmount: row.refund_amount || 0,
      refundAmountFormatted: formatCurrency(row.refund_amount || 0),
      refundAction: row.refund_action,
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
