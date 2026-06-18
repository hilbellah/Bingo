import { normalizeSessionType } from './sessionPackages.js';

const VENUE_TIME_ZONE = process.env.VENUE_TIME_ZONE || 'America/Moncton';

function getTimeZoneParts(date, timeZone = VENUE_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone = VENUE_TIME_ZONE) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function sessionDateTimeToUtc(dateValue, timeValue, timeZone = VENUE_TIME_ZONE) {
  if (!dateValue || !timeValue) return null;
  const [year, month, day] = String(dateValue).split('-').map(Number);
  const [hour = 0, minute = 0] = String(timeValue).split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstPass = new Date(localAsUtc - getTimeZoneOffsetMs(new Date(localAsUtc), timeZone));
  const secondOffset = getTimeZoneOffsetMs(firstPass, timeZone);
  return new Date(localAsUtc - secondOffset);
}

function salesCutoffToUtc(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const localMatch = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (localMatch && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    return sessionDateTimeToUtc(localMatch[1], localMatch[2]);
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function getSessionBookingStatus(session, { soldOut = false, now = new Date() } = {}) {
  const sessionType = normalizeSessionType(session?.session_type, session?.is_special_event);
  const startsAt = sessionDateTimeToUtc(session?.date, session?.time);
  const cutoffTime = sessionType === 'regular_bingo' ? '12:00' : (session?.cutoff_time || session?.time);
  const usesExplicitSalesCutoff = sessionType === 'event' || sessionType === 'special_bingo';
  const explicitSalesCutoffAt = usesExplicitSalesCutoff ? salesCutoffToUtc(session?.sales_cutoff_at) : null;
  const cutoffAt = explicitSalesCutoffAt || sessionDateTimeToUtc(session?.date, cutoffTime);
  const base = {
    booking_closed: 0,
    booking_closed_reason: 'open',
    booking_closed_message: 'Booking open',
    starts_at: startsAt ? startsAt.toISOString() : null,
    cutoff_at: cutoffAt ? cutoffAt.toISOString() : null,
  };

  if (!session || session.deleted_at) {
    return {
      ...base,
      booking_closed: 1,
      booking_closed_reason: 'unavailable',
      booking_closed_message: 'Booking closed. This session is unavailable.',
    };
  }

  if (Number(session.is_available) === 0) {
    return {
      ...base,
      booking_closed: 1,
      booking_closed_reason: 'unavailable',
      booking_closed_message: 'Booking closed. This session is not available.',
    };
  }

  if (startsAt && now >= startsAt) {
    return {
      ...base,
      booking_closed: 1,
      booking_closed_reason: 'ongoing',
      booking_closed_message: 'Booking closed. Event is on-going.',
    };
  }

  if (soldOut) {
    return {
      ...base,
      booking_closed: 1,
      booking_closed_reason: 'sold_out',
      booking_closed_message: 'Booking closed. This event is sold out.',
    };
  }

  if (cutoffAt && now >= cutoffAt) {
    const isRegularBingo = sessionType === 'regular_bingo';
    return {
      ...base,
      booking_closed: 1,
      booking_closed_reason: 'cutoff',
      booking_closed_message: isRegularBingo
        ? 'Online booking for today\'s regular bingo closed at 12:00 PM. Staff are now printing orders, assembling packages, and placing them on the booked seats.'
        : 'Booking closed. Online sales cutoff has passed.',
    };
  }

  return base;
}

export function withSessionBookingStatus(session, options = {}) {
  return {
    ...session,
    ...getSessionBookingStatus(session, options),
  };
}
