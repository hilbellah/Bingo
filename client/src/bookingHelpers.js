// Pure helpers for the customer booking app: payment-return URL detection,
// the per-browser hold id, session classification and the client-side
// "is booking open" decision. No React, no network.
//
// Moved verbatim out of client/src/App.jsx on 2026-09-05 (Phase 3, step 5a).
export const CHECKOUT_SERVICE_FEE_CENTS = 200;
export const EVENT_HST_RATE = 0.15;

// Detect payment-related URLs at app mount. Returns null for the normal
// booking flow, or { bookingId } when the customer has just returned from
// Authorize.Net's hosted page via the server's /payment/return or
// /payment/cancel redirect.
export function detectPaymentRoute() {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  // /booking/<id>/processing  — happy-path return from Authorize.Net
  // /booking/<id>/cancelled   — customer clicked Cancel on hosted page
  // Both render the BookingProcessing component, which polls /api/bookings/:id/status
  // and renders the right UI based on the actual booking state.
  const m = path.match(/^\/booking\/([^/]+)\/(processing|cancelled)\/?$/);
  if (m) return { bookingId: decodeURIComponent(m[1]) };
  return null;
}

export function generateHolderId() {
  const stored = sessionStorage.getItem('bingo_holder_id');
  if (stored) return stored;
  const id = 'holder_' + Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem('bingo_holder_id', id);
  return id;
}

export const emptyAttendee = () => ({ firstName: '', lastName: '', ticketPackageId: '', addons: [] });

export function getSessionType(session) {
  return session?.session_type || (session?.is_special_event ? 'special_bingo' : 'regular_bingo');
}

export function normalizeEventTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function getRequestedSession(sessions, search = '') {
  const params = new URLSearchParams(search);
  const requestedId = String(params.get('sessionId') || '').trim();
  const requestedDate = String(params.get('sessionDate') || '').trim();
  const requestedTitle = normalizeEventTitle(params.get('eventTitle'));
  const isRequested = !!(requestedId || requestedDate || requestedTitle);

  if (!isRequested) return { isRequested: false, session: null };

  const session = sessions.find(item => {
    if (requestedId) return String(item.id) === requestedId;
    if (requestedDate && String(item.date) !== requestedDate) return false;
    if (requestedTitle && normalizeEventTitle(item.event_title) !== requestedTitle) return false;
    return true;
  }) || null;

  return { isRequested: true, session };
}

export function getCutoffClosedMessage(session) {
  if (getSessionType(session) === 'regular_bingo') {
    return "Online booking for today's regular bingo closed at 12:00 PM. Staff are now printing orders, assembling packages, and placing them on the booked seats.";
  }
  return 'Booking closed. Online sales cutoff has passed.';
}

export function getClientBookingStatus(session, { soldOut = false, nowMs = Date.now() } = {}) {
  if (!session) return { isClosed: false, reason: 'open', message: '' };

  const startsAtMs = session.starts_at ? Date.parse(session.starts_at) : NaN;
  const cutoffAtMs = session.cutoff_at ? Date.parse(session.cutoff_at) : NaN;

  if (Number.isFinite(startsAtMs) && nowMs >= startsAtMs) {
    return { isClosed: true, reason: 'ongoing', message: 'Booking closed. Event is on-going.' };
  }

  if (soldOut) {
    return { isClosed: true, reason: 'sold_out', message: 'Booking closed. This event is sold out.' };
  }

  if (Number.isFinite(cutoffAtMs) && nowMs >= cutoffAtMs) {
    return { isClosed: true, reason: 'cutoff', message: getCutoffClosedMessage(session) };
  }

  if (session.booking_closed) {
    return {
      isClosed: true,
      reason: session.booking_closed_reason || 'closed',
      message: session.booking_closed_message || 'Booking closed.',
    };
  }

  return { isClosed: false, reason: 'open', message: '' };
}
