import { all } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { formatPrice } from '../utils/format.js';

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(value) {
  return String(value || '').trim();
}

function isAfter(left, right) {
  if (!right) return true;
  if (!left) return false;
  return new Date(left).getTime() > new Date(right).getTime();
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function getCustomerRows(search = '') {
  const normalizedSearch = String(search || '').trim().toLowerCase();
  const params = [];
  let whereClause = '';
  if (normalizedSearch) {
    whereClause = `
      AND (
        LOWER(TRIM(b.email)) LIKE ?
        OR LOWER(COALESCE(b.reference_number, '')) LIKE ?
        OR LOWER(COALESCE(b.customer_first_name, '')) LIKE ?
        OR LOWER(COALESCE(b.customer_last_name, '')) LIKE ?
      )
    `;
    const like = `%${normalizedSearch}%`;
    params.push(like, like, like, like);
  }

  const rows = await all(`
    SELECT
      b.id as booking_id,
      b.reference_number as booking_reference_number,
      LOWER(TRIM(b.email)) as email,
      COALESCE(NULLIF(TRIM(b.customer_first_name), ''), NULLIF(TRIM(bi.first_name), ''), '') as first_name,
      COALESCE(NULLIF(TRIM(b.customer_last_name), ''), NULLIF(TRIM(bi.last_name), ''), '') as last_name,
      b.customer_first_name,
      b.customer_last_name,
      b.created_at,
      COALESCE(b.payment_completed_at, b.created_at) as booking_at,
      COALESCE(b.total_amount, 0) as booking_total,
      COALESCE(bi.price, 0) as item_price,
      COALESCE(addons.addon_total, 0) as addon_total,
      COUNT(bi.id) OVER (PARTITION BY b.id) as booking_item_count,
      SUM(COALESCE(bi.price, 0) + COALESCE(addons.addon_total, 0)) OVER (PARTITION BY b.id) as booking_item_subtotal,
      s.date as session_date,
      s.time as session_time,
      seats.table_number,
      seats.chair_number,
      COALESCE(p.name, sp.name) as package_name,
      COALESCE(bi.reference_number, b.reference_number) as ticket_reference_number
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    JOIN booking_items bi ON bi.booking_id = b.id
    LEFT JOIN seats ON seats.id = bi.seat_id
    LEFT JOIN packages p ON p.id = bi.package_id
    LEFT JOIN session_packages sp ON sp.id = bi.package_id
    LEFT JOIN (
      SELECT booking_item_id, SUM(COALESCE(price, 0)) as addon_total
      FROM booking_addons
      GROUP BY booking_item_id
    ) addons ON addons.booking_item_id = bi.id
    WHERE b.payment_status IN ('paid', 'partially_refunded')
      AND b.email IS NOT NULL
      AND TRIM(b.email) <> ''
      AND COALESCE(bi.refund_status, 'active') != 'refunded'
      ${whereClause}
    ORDER BY booking_at DESC, b.created_at DESC, last_name ASC, first_name ASC
  `, params);

  const customersByKey = new Map();

  for (const row of rows) {
    const email = cleanText(row.email).toLowerCase();
    const firstName = cleanText(row.first_name);
    const lastName = cleanText(row.last_name);
    const key = `${email}|${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
    const itemBaseTotal = toNumber(row.item_price) + toNumber(row.addon_total);
    const bookingSubtotal = toNumber(row.booking_item_subtotal);
    const bookingItemCount = toNumber(row.booking_item_count);
    const bookingTotal = toNumber(row.booking_total);
    const bookingAllocation = bookingTotal > bookingSubtotal && bookingItemCount > 0
      ? Math.round((bookingTotal - bookingSubtotal) / bookingItemCount)
      : 0;
    const itemTotal = itemBaseTotal + bookingAllocation;

    if (!customersByKey.has(key)) {
      customersByKey.set(key, {
        id: key,
        email,
        first_name: firstName,
        last_name: lastName,
        first_booking_at: row.created_at,
        last_booking_at: row.booking_at,
        created_at: row.created_at,
        updated_at: row.booking_at,
        booking_ids: new Set(),
        session_keys: new Set(),
        booking_count: 0,
        paid_booking_count: 0,
        ticket_count: 0,
        total_spent: 0,
        latest_ticket_reference_number: '',
        latest_booking_reference_number: '',
        latest_session_date: '',
        latest_session_time: '',
        latest_table_number: null,
        latest_chair_number: null,
        latest_package_name: '',
        latest_purchaser_first_name: '',
        latest_purchaser_last_name: '',
      });
    }

    const customer = customersByKey.get(key);
    customer.booking_ids.add(row.booking_id);
    customer.session_keys.add(`${row.session_date || ''}|${row.session_time || ''}`);
    customer.ticket_count += 1;
    customer.total_spent += itemTotal;

    if (isAfter(customer.first_booking_at, row.created_at)) {
      customer.first_booking_at = row.created_at;
      customer.created_at = row.created_at;
    }

    if (!customer.latest_ticket_reference_number || isAfter(row.booking_at, customer.last_booking_at)) {
      customer.last_booking_at = row.booking_at;
      customer.updated_at = row.booking_at;
      customer.latest_ticket_reference_number = row.ticket_reference_number || '';
      customer.latest_booking_reference_number = row.booking_reference_number || '';
      customer.latest_session_date = row.session_date || '';
      customer.latest_session_time = row.session_time || '';
      customer.latest_table_number = row.table_number;
      customer.latest_chair_number = row.chair_number;
      customer.latest_package_name = row.package_name || '';
      customer.latest_purchaser_first_name = cleanText(row.customer_first_name);
      customer.latest_purchaser_last_name = cleanText(row.customer_last_name);
    }
  }

  return [...customersByKey.values()]
    .map(customer => ({
      ...customer,
      booking_count: customer.booking_ids.size,
      paid_booking_count: customer.booking_ids.size,
      session_count: customer.session_keys.size,
      booking_ids: undefined,
      session_keys: undefined,
    }))
    .sort((a, b) => {
      const dateDelta = new Date(b.last_booking_at || 0).getTime() - new Date(a.last_booking_at || 0).getTime();
      if (dateDelta) return dateDelta;
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
    });
}

export function registerAdminCustomerRoutes(app) {
  app.get('/api/admin/customers', adminAuth, async (req, res) => {
    try {
    const rows = await getCustomerRows(req.query.search);
    res.json(rows.map(row => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: [row.first_name, row.last_name].filter(Boolean).join(' ') || '(no name)',
      firstBookingAt: row.first_booking_at,
      lastBookingAt: row.last_booking_at,
      bookingCount: row.booking_count || 0,
      paidBookingCount: row.paid_booking_count || 0,
      ticketCount: row.ticket_count || 0,
      sessionCount: row.session_count || 0,
      totalSpent: Math.round(Number(row.total_spent || 0)),
      totalSpentFormatted: '$' + formatPrice(Math.round(Number(row.total_spent || 0))),
      latestTicketReferenceNumber: row.latest_ticket_reference_number,
      latestBookingReferenceNumber: row.latest_booking_reference_number,
      latestSessionDate: row.latest_session_date,
      latestSessionTime: row.latest_session_time,
      latestTableNumber: row.latest_table_number,
      latestChairNumber: row.latest_chair_number,
      latestPackageName: row.latest_package_name,
      latestPurchaserFirstName: row.latest_purchaser_first_name,
      latestPurchaserLastName: row.latest_purchaser_last_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
    } catch (err) {
      console.error('GET /api/admin/customers failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/admin/customers/export', adminAuth, async (req, res) => {
    try {
    const rows = await getCustomerRows(req.query.search);
    const header = [
      'First Name',
      'Last Name',
      'Email',
      'Paid Bookings',
      'Tickets',
      'Sessions',
      'Total Spent',
      'First Booking',
      'Last Booking',
      'Latest Ticket Reference',
      'Latest Booking Reference',
      'Latest Session Date',
      'Latest Session Time',
      'Latest Table',
      'Latest Chair',
      'Latest Package',
      'Latest Purchaser First Name',
      'Latest Purchaser Last Name',
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const row of rows) {
      lines.push([
        row.first_name || '',
        row.last_name || '',
        row.email || '',
        row.paid_booking_count || 0,
        row.ticket_count || 0,
        row.session_count || 0,
        '$' + formatPrice(Math.round(Number(row.total_spent || 0))),
        row.first_booking_at || '',
        row.last_booking_at || '',
        row.latest_ticket_reference_number || '',
        row.latest_booking_reference_number || '',
        row.latest_session_date || '',
        row.latest_session_time || '',
        row.latest_table_number || '',
        row.latest_chair_number || '',
        row.latest_package_name || '',
        row.latest_purchaser_first_name || '',
        row.latest_purchaser_last_name || '',
      ].map(csvCell).join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=customers-report.csv');
    res.send(lines.join('\n'));
    } catch (err) {
      console.error('GET /api/admin/customers/export failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
