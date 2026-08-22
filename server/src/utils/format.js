import crypto from 'crypto';

export function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Session dates are stored as venue-local (America/Moncton) calendar dates,
// but production runs in UTC — "today" must be computed at the venue, not the
// server, or evening sessions shift a day from ~8-9 PM Atlantic onward.
const VENUE_TIME_ZONE = process.env.VENUE_TIME_ZONE || 'America/Moncton';

const venueDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VENUE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatVenueDate(date = new Date()) {
  return venueDateFormatter.format(date);
}

// A Date at server-local NOON of the venue's current calendar date. Use this
// as the base for setDate() arithmetic and getDay() weekday reads that must
// agree with formatLocalDate() on the resulting dates.
export function venueDateAnchor(date = new Date()) {
  const [year, month, day] = formatVenueDate(date).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function generateRef() {
  return 'BNG-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

export function formatPrice(cents) {
  return (cents / 100).toFixed(2);
}

export function formatCurrency(cents) {
  return 'CA$' + formatPrice(cents);
}
