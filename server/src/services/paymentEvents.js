import { v4 as uuid } from 'uuid';
import { run } from '../database.js';

export function logPaymentEvent(bookingId, eventType, source, payload) {
  try {
    run('INSERT INTO payment_events (id, booking_id, event_type, source, raw_payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), bookingId, eventType, source, JSON.stringify(payload || {}), new Date().toISOString()]);
  } catch (err) {
    console.error('[payments] logPaymentEvent failed:', err?.message || err);
  }
}
