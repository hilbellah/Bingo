import { all, get } from '../database.js';
import { normalizeSessionType, sessionTypeSql } from '../services/sessionPackages.js';
import { formatPrice } from '../utils/format.js';

export function registerTicketRoutes(app) {
  app.get('/api/bookings/:ref/tickets', (req, res) => {
    const { ref } = req.params;
    const booking = get(`SELECT b.*, s.date as session_date, s.time as session_time, s.is_special_event, s.event_title,
      ${sessionTypeSql('s')} as session_type
      FROM bookings b JOIN sessions s ON b.session_id = s.id WHERE b.reference_number = ?`, [ref]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const currentSessionType = normalizeSessionType(booking.session_type, booking.is_special_event);

    const items = all(`
      SELECT bi.id as item_id, bi.first_name, bi.last_name, bi.price, bi.reference_number,
             seats.table_number, seats.chair_number,
             COALESCE(p.name, sp.name) as package_name, COALESCE(p.price, sp.price) as package_price
      FROM booking_items bi
      JOIN seats ON seats.id = bi.seat_id
      LEFT JOIN packages p ON p.id = bi.package_id
      LEFT JOIN session_packages sp ON sp.id = bi.package_id
      WHERE bi.booking_id = ?
      ORDER BY bi.id
    `, [booking.id]);

    const allAddons = all(`
      SELECT ba.booking_item_id, ba.quantity, ba.price,
             COALESCE(p.name, sp.name) as package_name
      FROM booking_addons ba
      LEFT JOIN packages p ON p.id = ba.package_id
      LEFT JOIN session_packages sp ON sp.id = ba.package_id
      JOIN booking_items bi ON bi.id = ba.booking_item_id
      WHERE bi.booking_id = ?
    `, [booking.id]);

    const addonsByItem = {};
    for (const addon of allAddons) {
      if (!addonsByItem[addon.booking_item_id]) addonsByItem[addon.booking_item_id] = [];
      addonsByItem[addon.booking_item_id].push({
        packageName: addon.package_name,
        quantity: addon.quantity,
        price: addon.price,
        priceFormatted: '$' + formatPrice(addon.price),
      });
    }

    res.json({
      referenceNumber: booking.reference_number,
      sessionDate: booking.session_date,
      sessionTime: booking.session_time,
      isSpecialEvent: !!(booking.is_special_event),
      sessionType: currentSessionType,
      eventTitle: booking.event_title || null,
      printMode: currentSessionType === 'regular_bingo' ? 'receipt' : 'template',
      printLayout: currentSessionType === 'event' ? 'event_6up' : currentSessionType === 'special_bingo' ? 'bingo_3up' : 'receipt',
      totalAmount: booking.total_amount,
      totalFormatted: '$' + formatPrice(booking.total_amount),
      paymentStatus: booking.payment_status,
      email: booking.email,
      customerFirstName: booking.customer_first_name,
      customerLastName: booking.customer_last_name,
      tickets: items.map(item => ({
        firstName: item.first_name,
        lastName: item.last_name,
        tableNumber: item.table_number,
        chairNumber: item.chair_number,
        referenceNumber: item.reference_number,
        packageName: item.package_name,
        packagePrice: item.package_price,
        packagePriceFormatted: '$' + formatPrice(item.package_price),
        addons: addonsByItem[item.item_id] || [],
      }))
    });
  });
}
