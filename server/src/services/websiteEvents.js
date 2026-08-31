// server/src/services/websiteEvents.js
//
// "Publish to website" — the bridge between a booking session and the
// marketing site at wolastoqcasino.ca.
//
// Publishing is strictly opt-in. A session is invisible to the website until
// an admin ticks the box AND supplies a flyer plus the marketing copy the
// site's templates render. Nothing here ever publishes a session implicitly:
// regular auto-generated bingo sessions, live events and special bingos all
// stay off the website unless someone deliberately turns them on.
//
// The field names deliberately mirror the keys already used by the
// hand-maintained PHP registry (wp-content/themes/wola/inc/wola-events.php)
// so the WordPress side merges the two sources without translating anything.

import { formatVenueDate } from '../utils/format.js';

const VENUE_TIME_ZONE = process.env.VENUE_TIME_ZONE || 'America/Moncton';
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Copy that must be present before an event is allowed onto the website.
// The flyer and all the important stuff are required — a half-filled listing
// must never reach the live site.
const REQUIRED_TEXT_FIELDS = [
  ['website_flyer_url', 'Flyer image'],
  ['website_flyer_alt', 'Flyer alt text'],
  ['website_name', 'Website event name'],
  ['website_badge', 'Badge'],
  ['website_datefmt', 'Long date'],
  ['website_kicker', 'Kicker'],
  ['website_lead', 'Lead paragraph'],
  ['website_blurb', 'Short blurb'],
];

export const WEBSITE_LISTING_COLUMNS = [
  'website_published',
  'website_slug',
  'website_name',
  'website_name_hl',
  'website_flyer_url',
  'website_flyer_alt',
  'website_badge',
  'website_datefmt',
  'website_kicker',
  'website_lead',
  'website_blurb',
  'website_detail_rows',
  'website_prize',
  'website_end_date',
  'website_updated_at',
];

export function slugifyEventName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** "Sunday, August 23, 2026" for the flyer heading. */
export function formatLongVenueDate(isoDate) {
  if (!DATE_REGEX.test(String(isoDate || ''))) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VENUE_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

/** "Sunday - August 23" (with a middot) for the pill badge. */
export function formatBadgeVenueDate(isoDate) {
  if (!DATE_REGEX.test(String(isoDate || ''))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VENUE_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).formatToParts(new Date(`${isoDate}T12:00:00Z`));
  const pick = (type) => parts.find(p => p.type === type)?.value || '';
  return `${pick('weekday')} · ${pick('month')} ${pick('day')}`;
}

/** "Aug 23" for the compact chip. */
export function formatChipVenueDate(isoDate) {
  if (!DATE_REGEX.test(String(isoDate || ''))) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VENUE_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

/**
 * Wrap the last word of the name in <span> so the site's two-tone heading
 * style ("Bigger Bank <span>Bingo</span>") works without extra typing.
 */
export function autoHighlightName(name) {
  const text = String(name || '').trim();
  if (!text) return '';
  const words = text.split(/\s+/);
  if (words.length < 2) return `<span>${text}</span>`;
  const last = words.pop();
  return `${words.join(' ')} <span>${last}</span>`;
}

function trimOrNull(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

/**
 * Detail rows render as the <ul class="we-detail"> table on /events/.
 * Stored as JSON: [["Ticket", "$150 - 9 UP Book"], ["Doors", "12:00 PM"]].
 */
function normalizeDetailRows(value) {
  if (value === undefined) return undefined;
  let rows = value;
  if (typeof rows === 'string') {
    const text = rows.trim();
    if (!text) return { value: null, rows: [] };
    try {
      rows = JSON.parse(text);
    } catch (_) {
      return { error: 'Website detail rows must be valid JSON' };
    }
  }
  if (rows === null) return { value: null, rows: [] };
  if (!Array.isArray(rows)) return { error: 'Website detail rows must be a list' };

  const cleaned = [];
  for (const row of rows) {
    const label = Array.isArray(row) ? row[0] : row?.label;
    const detail = Array.isArray(row) ? row[1] : row?.value;
    const labelText = String(label ?? '').trim();
    const detailText = String(detail ?? '').trim();
    if (!labelText && !detailText) continue; // blank row left in the admin form
    if (!labelText || !detailText) {
      return { error: 'Every website detail row needs both a label and a value' };
    }
    if (labelText.length > 60) return { error: 'Website detail row labels must be 60 characters or fewer' };
    if (detailText.length > 300) return { error: 'Website detail row values must be 300 characters or fewer' };
    cleaned.push([labelText, detailText]);
  }
  if (cleaned.length > 12) return { error: 'A website listing can have at most 12 detail rows' };
  return { value: cleaned.length ? JSON.stringify(cleaned) : null, rows: cleaned };
}

function normalizePrize(value) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return { value: null };
  const digits = String(value).replace(/[$,\s]/g, '');
  if (!/^\d+$/.test(digits)) return { error: 'Top prize must be a whole dollar amount' };
  const amount = Number(digits);
  if (amount > 10000000) return { error: 'Top prize looks too large' };
  return { value: amount };
}

function isSafeFlyerUrl(value) {
  const text = String(value || '').trim();
  // Relative /uploads/... paths come from the admin's own flyer upload.
  if (text.startsWith('/')) return !text.startsWith('//');
  return /^https:\/\//i.test(text);
}

/**
 * When a session is rescheduled, move the auto-derived parts of its website
 * listing to the new date. A field is only refreshed if it still holds exactly
 * what we generated for the old date; a hand-written badge, long date or
 * show-until is never overwritten.
 */
function migrateListingDate(body, current) {
  const oldDate = current.date;
  const newDate = body.date;
  if (!newDate || !oldDate || newDate === oldDate) return {};
  // Nothing to carry if this session has no listing at all.
  if (!current.website_slug && !Number(current.website_published || 0)) return {};

  const moved = {};
  if (current.website_badge && current.website_badge === formatBadgeVenueDate(oldDate)) {
    moved.website_badge = formatBadgeVenueDate(newDate);
  }
  if (current.website_datefmt && current.website_datefmt === formatLongVenueDate(oldDate)) {
    moved.website_datefmt = formatLongVenueDate(newDate);
  }
  if (current.website_end_date && current.website_end_date === oldDate) {
    moved.website_end_date = newDate;
  }
  if (Object.keys(moved).length > 0) moved.website_updated_at = new Date().toISOString();
  return moved;
}

/**
 * Build the column updates for a session's website listing.
 *
 * `body`        the admin request body (only the keys present are touched)
 * `current`     the existing session row, so partial PATCHes validate against
 *               what is already stored
 * `sessionType` resolved session type; only special bingo and live events may
 *               be published (a regular auto-generated session has no flyer)
 *
 * Returns { error } or { updates: { column: value }, published: bool }.
 */
export function normalizeWebsiteListing(body, current = {}, sessionType = 'regular_bingo') {
  const touched = WEBSITE_LISTING_COLUMNS.some(col => body[col] !== undefined);

  // Moving a session's date must carry its listing along, or the flyer keeps
  // advertising the old day and customers turn up on the wrong date. Only
  // values still equal to what we auto-derived get refreshed — anything the
  // admin typed by hand is left exactly as they wrote it.
  const dateMigration = migrateListingDate(body, current);

  if (!touched) {
    return {
      updates: dateMigration,
      published: !!Number(current.website_published || 0),
    };
  }

  const updates = { ...dateMigration };
  const merged = { ...current, ...dateMigration };

  const publishRequested = body.website_published !== undefined
    ? (body.website_published === true || body.website_published === 1 || body.website_published === '1')
    : !!Number(current.website_published || 0);

  if (publishRequested && sessionType !== 'special_bingo' && sessionType !== 'event') {
    return { error: 'Only special bingo events and live events can be published to the website' };
  }

  for (const field of [
    'website_name', 'website_name_hl', 'website_flyer_url', 'website_flyer_alt',
    'website_badge', 'website_datefmt', 'website_kicker', 'website_lead', 'website_blurb',
  ]) {
    if (body[field] !== undefined) {
      updates[field] = trimOrNull(body[field]);
      merged[field] = updates[field];
    }
  }

  if (body.website_slug !== undefined) {
    const slug = slugifyEventName(body.website_slug);
    updates.website_slug = slug || null;
    merged.website_slug = updates.website_slug;
  }

  const rows = normalizeDetailRows(body.website_detail_rows);
  if (rows !== undefined) {
    if (rows.error) return { error: rows.error };
    updates.website_detail_rows = rows.value;
    merged.website_detail_rows = rows.value;
  }

  const prize = normalizePrize(body.website_prize);
  if (prize !== undefined) {
    if (prize.error) return { error: prize.error };
    updates.website_prize = prize.value;
    merged.website_prize = prize.value;
  }

  if (body.website_end_date !== undefined) {
    const endDate = trimOrNull(body.website_end_date);
    if (endDate && !DATE_REGEX.test(endDate)) {
      return { error: 'Website end date must be YYYY-MM-DD' };
    }
    updates.website_end_date = endDate;
    merged.website_end_date = endDate;
  }

  if (body.website_published !== undefined) {
    updates.website_published = publishRequested ? 1 : 0;
  }

  if (publishRequested) {
    const sessionDate = body.date || current.date || '';

    // Fill blanks the admin left empty rather than rejecting the save, but
    // only for fields derivable honestly from the session itself.
    if (!merged.website_name) {
      const fallbackName = trimOrNull(body.event_title ?? current.event_title);
      if (fallbackName) { updates.website_name = fallbackName; merged.website_name = fallbackName; }
    }
    if (!merged.website_name_hl && merged.website_name) {
      updates.website_name_hl = autoHighlightName(merged.website_name);
      merged.website_name_hl = updates.website_name_hl;
    }
    if (!merged.website_badge && sessionDate) {
      updates.website_badge = formatBadgeVenueDate(sessionDate);
      merged.website_badge = updates.website_badge;
    }
    if (!merged.website_datefmt && sessionDate) {
      updates.website_datefmt = formatLongVenueDate(sessionDate);
      merged.website_datefmt = updates.website_datefmt;
    }
    if (!merged.website_slug) {
      const slug = slugifyEventName(merged.website_name) || slugifyEventName(sessionDate);
      updates.website_slug = slug || null;
      merged.website_slug = updates.website_slug;
    }
    if (!merged.website_end_date && sessionDate) {
      updates.website_end_date = sessionDate;
      merged.website_end_date = sessionDate;
    }

    const missing = REQUIRED_TEXT_FIELDS
      .filter(([col]) => !trimOrNull(merged[col]))
      .map(([, label]) => label);
    if (missing.length) {
      return { error: `Cannot publish to the website - still missing: ${missing.join(', ')}.` };
    }

    if (!isSafeFlyerUrl(merged.website_flyer_url)) {
      return { error: 'Flyer image must be an uploaded file or an https:// URL' };
    }

    let storedRows = [];
    try {
      storedRows = JSON.parse(merged.website_detail_rows || '[]');
    } catch (_) {
      storedRows = [];
    }
    if (!Array.isArray(storedRows) || storedRows.length === 0) {
      return { error: 'Cannot publish to the website - add at least one detail row (e.g. Ticket, Doors Open).' };
    }

    if (!merged.website_slug) {
      return { error: 'Cannot publish to the website - the event needs a name to build its page anchor.' };
    }
  }

  updates.website_updated_at = new Date().toISOString();
  return { updates, published: publishRequested };
}

/**
 * Shape one session row the way the WordPress registry expects.
 * Keys match wola_events_all() entries exactly.
 */
export function toWebsiteFeedEntry(session, { bookingBaseUrl }) {
  let rows = [];
  try {
    const parsed = JSON.parse(session.website_detail_rows || '[]');
    if (Array.isArray(parsed)) rows = parsed;
  } catch (_) {
    rows = [];
  }

  const name = session.website_name || session.event_title || 'Bingo Event';
  const bookingTitle = session.event_title || name;
  const bookUrl = new URL(bookingBaseUrl);
  bookUrl.searchParams.set('sessionDate', session.date);
  bookUrl.searchParams.set('eventTitle', bookingTitle);

  const flyer = String(session.website_flyer_url || '');
  const flyerUrl = flyer.startsWith('/')
    ? new URL(flyer, bookingBaseUrl).toString()
    : flyer;

  return {
    slug: session.website_slug,
    type: 'bingo',
    source: 'booking',
    session_id: session.id,
    name,
    name_hl: session.website_name_hl || autoHighlightName(name),
    start: session.date,
    end: session.website_end_date || session.date,
    badge: session.website_badge || formatBadgeVenueDate(session.date),
    chip_b: formatChipVenueDate(session.date),
    chip_s: name,
    datefmt: session.website_datefmt || formatLongVenueDate(session.date),
    img: flyerUrl,
    alt: session.website_flyer_alt || name,
    blurb: session.website_blurb || '',
    kicker: session.website_kicker || '',
    lead: session.website_lead || '',
    rows,
    link: `/events/#we-ev-${session.website_slug}`,
    book: bookUrl.toString(),
    prize: Number(session.website_prize || 0),
    updated_at: session.website_updated_at || null,
  };
}

/** Published, not-yet-expired listings, oldest end date first. */
export const PUBLISHED_WEBSITE_SESSIONS_SQL = `
  SELECT * FROM sessions
  WHERE website_published = 1
    AND deleted_at IS NULL
    AND is_available = 1
    AND COALESCE(website_end_date, date) >= ?
  ORDER BY COALESCE(website_end_date, date) ASC, time ASC`;

export function websiteFeedToday() {
  return formatVenueDate(new Date());
}
