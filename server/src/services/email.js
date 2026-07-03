// Booking-confirmation email service.
//
// Three providers are supported, chosen automatically by which env vars are
// set. Postmark is the PRIMARY for production; Gmail and Resend remain as
// fallbacks so legacy deployments keep working.
//
//   1. Postmark (primary, production) — REST-based transactional email.
//      Requires a verified Sender Signature or DKIM-verified domain. Best
//      deliverability, native Message Streams, structured webhooks.
//   2. Gmail SMTP (legacy) — works for any recipient with no DNS setup.
//      Uses nodemailer + a Gmail App Password. Kept for demos and as an
//      emergency fallback if Postmark is unavailable.
//   3. Resend (fallback) — REST-based transactional email service. Requires
//      domain verification before it'll deliver to non-account emails.
//
// Selection logic: if POSTMARK_SERVER_TOKEN is set, Postmark is used.
// Otherwise, if BOTH GMAIL_USER and GMAIL_APP_PASSWORD are set, Gmail is used.
// Otherwise, if RESEND_API_KEY is set, Resend is used. Otherwise the module
// logs a warning and no-ops so the booking flow still completes.
//
// Env vars (all optional unless noted):
//
//   --- Postmark path (production) ---
//   POSTMARK_SERVER_TOKEN     Server API Token from the "Wolastoq Bingo"
//                             Postmark server. Looks like a UUID, e.g.
//                             "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".
//                             NEVER put the real token in this file — env only.
//                             Works as both the API token AND as SMTP
//                             username/password if the relay path is used.
//   POSTMARK_MESSAGE_STREAM   Message Stream to send through. Default is
//                             "outbound" (the default transactional stream).
//                             Override if you create a dedicated stream.
//
//   --- Gmail SMTP path (legacy) ---
//   GMAIL_USER            The Gmail address to authenticate as, e.g.
//                         "demo@gmail.com". This is also used as the From
//                         envelope address regardless of EMAIL_FROM display.
//   GMAIL_APP_PASSWORD    The 16-character app password generated at
//                         https://myaccount.google.com/apppasswords. NOT
//                         the normal Gmail login password — that won't work.
//                         Account must have 2FA enabled to generate one.
//
//   --- Resend path ---
//   RESEND_API_KEY        Resend account API key (re_*).
//   PUBLIC_SITE_URL       Base URL used in the "View tickets online" link.
//                         Default: "https://booking.wolastoqcasino.ca".
//
//   --- Shared (used by all providers) ---
//   EMAIL_FROM            Display name + address shown to the customer.
//                         For Postmark: must match a verified Sender Signature
//                         or be on a DKIM-verified domain. Recommended:
//                         "Wolastoq Bingo <noreply@wolastoqcasino.ca>".
//                         For Gmail: the address part SHOULD match GMAIL_USER
//                         (Gmail rewrites mismatched From addresses anyway).
//   EMAIL_BCC             Comma-separated addresses to BCC on every booking
//                         confirmation/refund email.
//                         Customer doesn't see these. Admin notification.
//
// All export functions are async and return { ok, status, error? }. They
// never throw — the booking flow shouldn't roll back if email is broken.

import nodemailer from 'nodemailer';
import { normalizeSessionType } from './sessionPackages.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const POSTMARK_ENDPOINT = 'https://api.postmarkapp.com/email';

// Reused across calls. Re-created if env vars change at runtime (rare).
let _gmailTransporter = null;
let _gmailTransporterKey = '';
function getGmailTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  const key = `${user}:${pass.length}`;
  if (_gmailTransporter && _gmailTransporterKey === key) return _gmailTransporter;
  // App passwords are 16 chars but Google copies them with spaces every 4. Strip.
  const cleanedPass = pass.replace(/\s+/g, '');
  _gmailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass: cleanedPass },
  });
  _gmailTransporterKey = key;
  return _gmailTransporter;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPriceDollars(cents) {
  return 'CA$' + ((cents || 0) / 100).toFixed(2);
}

function getBookingChargeBreakdown(booking, session, attendees, pkgById) {
  const subtotal = (attendees || []).reduce((sum, attendee) => {
    const packagePrice = Number.isFinite(Number(attendee.packagePrice))
      ? Number(attendee.packagePrice)
      : Number(pkgById.get(attendee.packageId)?.price || 0);
    const addonTotal = (attendee.addons || []).reduce((addonSum, addon) => {
      const pkg = pkgById.get(addon.packageId);
      return addonSum + (Number(pkg?.price || 0) * Number(addon.quantity || 0));
    }, 0);
    return sum + packagePrice + addonTotal;
  }, 0);
  const totalAmount = Number(booking?.totalAmount) || 0;
  const serviceCharge = Math.max(0, totalAmount - subtotal);
  const sessionType = normalizeSessionType(session?.session_type, session?.is_special_event);
  return {
    subtotal,
    serviceCharge,
    serviceChargeLabel: sessionType === 'event' ? 'HST (15%)' : 'Service charge',
    totalAmount: totalAmount || subtotal + serviceCharge,
  };
}

function formatDateLong(dateStr) {
  if (!dateStr) return '';
  // dateStr is "YYYY-MM-DD" — render as e.g. "Friday, May 8, 2026"
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTime12h(timeStr) {
  if (!timeStr) return '';
  // "HH:MM" → "h:MM AM/PM"
  const [hh, mm] = timeStr.split(':').map(Number);
  if (Number.isNaN(hh)) return timeStr;
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

function normalizeTimePhrase(value) {
  const match = String(value || '').match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i);
  if (!match) return String(value || '').trim();
  const hour = Number(match[1]);
  const minute = match[2] || '00';
  const period = match[3].toUpperCase() === 'A' ? 'AM' : 'PM';
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return String(value || '').trim();
  return `${hour}:${minute.padStart(2, '0')} ${period}`;
}

function getDoorsOpenTime(session) {
  const explicitTime = formatTime12h(session?.doors_open_time);
  if (explicitTime) return explicitTime;
  const description = String(session?.event_description || '');
  const match = description.match(/doors?\s+open(?:s)?\s*(?:at)?\s*([0-9]{1,2}(?::[0-9]{2})?\s*(?:a\.?m\.?|p\.?m\.?))/i);
  return match ? normalizeTimePhrase(match[1]) : '';
}

export function getBookingReminderText(session) {
  const sessionType = normalizeSessionType(session?.session_type, session?.is_special_event);
  if (sessionType === 'regular_bingo') {
    return 'Please arrive by 4:30 PM. Doors open one hour before the session starts. Bring this booking reference with you.';
  }

  const startTime = formatTime12h(session?.time);
  const doorsOpenTime = getDoorsOpenTime(session);
  const noun = sessionType === 'event' ? 'event' : 'session';
  const parts = [];
  if (startTime) parts.push(`This ${noun} begins at ${startTime}.`);
  if (doorsOpenTime) {
    parts.push(`Doors open at ${doorsOpenTime}.`);
  } else if (sessionType === 'event') {
    parts.push('Doors open one hour before the event starts.');
  }
  parts.push(sessionType === 'event' ? 'Bring this event ticket reference with you.' : 'Bring this booking reference with you.');
  return parts.join(' ');
}

function buildTicketUrl(siteUrl, referenceNumber, accessToken) {
  const url = `${siteUrl}/tickets/${encodeURIComponent(referenceNumber)}`;
  return accessToken ? `${url}?t=${encodeURIComponent(accessToken)}` : url;
}

function getBookingPresentation(session) {
  const sessionType = normalizeSessionType(session?.session_type, session?.is_special_event);
  if (sessionType === 'event') {
    return {
      sessionType,
      isSpecial: true,
      brandLabel: 'Live Event / Venue',
      pageTitle: 'Your Live Event Tickets',
      readyLine: "You're All Set!",
      confirmationLine: 'Your live event tickets are confirmed',
      referenceLabel: 'Event Ticket Reference',
      sectionLabel: 'Your Event Tickets',
      attendeeReferenceLabel: 'Live Event Ticket',
      ctaLabel: 'View Event Tickets Online',
      subjectPrefix: 'Your Live Event Tickets',
      sessionLabel: 'Event Date',
      proofText: 'Save this email or bring your event ticket reference as proof.',
      referenceBg: '#eff6ff',
      referenceBorder: '#2563eb',
      accentColor: '#2563eb',
      headerAccent: '#93c5fd',
    };
  }
  if (sessionType === 'special_bingo') {
    return {
      sessionType,
      isSpecial: true,
      brandLabel: 'Wolastoq Bingo',
      pageTitle: 'Your Special Bingo Tickets',
      readyLine: "You're All Set!",
      confirmationLine: 'Your special bingo seats are confirmed',
      referenceLabel: 'Booking Reference',
      sectionLabel: 'Your Tickets',
      attendeeReferenceLabel: 'Ticket',
      ctaLabel: 'View Tickets Online',
      subjectPrefix: 'Your Special Bingo Tickets',
      sessionLabel: 'Session',
      proofText: "Or save this email - it's all the proof you need.",
      referenceBg: '#fff7e6',
      referenceBorder: '#c5a55a',
      accentColor: '#c5a55a',
      headerAccent: '#c5a55a',
    };
  }
  return {
    sessionType,
    isSpecial: false,
    brandLabel: 'Wolastoq Bingo',
    pageTitle: 'Your Bingo Booking',
    readyLine: "You're All Set!",
    confirmationLine: 'Your bingo seats are confirmed',
    referenceLabel: 'Booking Reference',
    sectionLabel: 'Regular Bingo Order',
    attendeeReferenceLabel: 'Ticket',
    ctaLabel: 'View Booking Receipt',
    subjectPrefix: 'Your Bingo Booking',
    sessionLabel: 'Session',
    proofText: 'Regular bingo orders are printed on receipt paper. Save this email or bring your booking reference as proof.',
    referenceBg: '#fff7e6',
    referenceBorder: '#c5a55a',
    accentColor: '#c5a55a',
    headerAccent: '#c5a55a',
  };
}

/**
 * Build the HTML body for a booking-confirmation email.
 * Inline-styled so every webmail client (Gmail / Outlook / Yahoo) renders it.
 */
function renderBookingHtml({ booking, session, attendees, seats, packages, siteUrl }) {
  const seatById = new Map(seats.map(s => [s.id, s]));
  const pkgById = new Map(packages.map(p => [p.id, p]));
  const thankYouMessage = 'Thank you for booking with us. We look forward to seeing you there!';
  const presentation = getBookingPresentation(session);
  const charges = getBookingChargeBreakdown(booking, session, attendees, pkgById);
  const reminderText = getBookingReminderText(session);

  const attendeeBlocks = attendees.map((att, idx) => {
    const seat = seatById.get(att.seatId) || {};
    const ticketRef = booking.itemReferences?.[idx] || '';
    const addonLines = (att.addons || [])
      .filter(a => a.quantity > 0)
      .map(a => {
        const pkg = pkgById.get(a.packageId);
        if (!pkg) return '';
        return `<div style="font-size:13px;color:#6b7280;">${escapeHtml(pkg.name)} &times;${a.quantity}</div>`;
      })
      .join('');
    const seatLine = presentation.sessionType === 'event'
      ? '<div style="margin-top:4px;font-size:13px;color:#374151;">General admission</div>'
      : `<div style="margin-top:4px;font-size:13px;color:#374151;">
            Table <strong>${escapeHtml(seat.table_number ?? '?')}</strong>,
            Chair <strong>${escapeHtml(seat.chair_number ?? '?')}</strong>
          </div>`;
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
          <div style="font-weight:600;color:#1a3a5c;font-size:15px;">
            ${escapeHtml(att.firstName)} ${escapeHtml(att.lastName)}
          </div>
          ${seatLine}
          ${ticketRef ? `<div style="margin-top:4px;font-family:monospace;font-size:12px;color:#1a3a5c;background:${presentation.referenceBg};display:inline-block;padding:2px 8px;border-radius:4px;"><span style="font-family:Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-right:6px;">${escapeHtml(presentation.attendeeReferenceLabel)}</span>${escapeHtml(ticketRef)}</div>` : ''}
          ${addonLines ? `<div style="margin-top:6px;">${addonLines}</div>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  const ticketUrl = buildTicketUrl(siteUrl, booking.referenceNumber, booking.ticketAccessToken);
  const eventTitleRow = session?.event_title ? `
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">${presentation.sessionType === 'event' ? 'Event' : 'Title'}</td>
              <td style="padding:6px 0;font-size:14px;color:#1a3a5c;font-weight:700;text-align:right;">${escapeHtml(session.event_title)}</td>
            </tr>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(presentation.pageTitle)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0a1628 0%,#1a3a5c 100%);padding:28px 32px;color:#ffffff;text-align:center;">
          <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:${presentation.headerAccent};font-weight:700;">${escapeHtml(presentation.brandLabel)}</div>
          <div style="margin-top:6px;font-size:22px;font-weight:700;">${escapeHtml(presentation.readyLine)}</div>
          <div style="margin-top:4px;font-size:14px;color:#cbd5e1;">${escapeHtml(presentation.confirmationLine)}</div>
        </td></tr>

        <!-- Reference -->
        <tr><td style="padding:24px 32px 8px;">
          <div style="background:${presentation.referenceBg};border:2px solid ${presentation.referenceBorder};border-radius:12px;padding:16px;text-align:center;">
            <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;">${escapeHtml(presentation.referenceLabel)}</div>
            <div style="margin-top:6px;font-family:monospace;font-size:22px;font-weight:700;color:#1a3a5c;letter-spacing:.08em;">
              ${escapeHtml(booking.referenceNumber)}
            </div>
          </div>
        </td></tr>

        <!-- Session info -->
        <tr><td style="padding:8px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
            ${eventTitleRow}
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">${escapeHtml(presentation.sessionLabel)}</td>
              <td style="padding:6px 0;font-size:14px;color:#1a3a5c;font-weight:600;text-align:right;">${escapeHtml(formatDateLong(session?.date))}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">Time</td>
              <td style="padding:6px 0;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(formatTime12h(session?.time))}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">Subtotal</td>
              <td style="padding:6px 0;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(formatPriceDollars(charges.subtotal))}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">${escapeHtml(charges.serviceChargeLabel)}</td>
              <td style="padding:6px 0;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(formatPriceDollars(charges.serviceCharge))}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">Total Paid</td>
              <td style="padding:6px 0;font-size:18px;font-weight:700;color:${presentation.accentColor};text-align:right;">${escapeHtml(formatPriceDollars(charges.totalAmount))}</td>
            </tr>
          </table>
        </td></tr>

        <!-- Thank you message -->
        <tr><td style="padding:8px 32px;">
          <div style="background:#f0f7fb;border:1px solid #d7e8f1;border-radius:10px;padding:13px 14px;text-align:center;font-size:14px;font-weight:700;color:#1a3a5c;line-height:1.45;">
            ${escapeHtml(thankYouMessage)}
          </div>
        </td></tr>

        <!-- Tickets -->
        <tr><td style="padding:16px 32px 8px;">
          <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:8px;">${escapeHtml(presentation.sectionLabel)}</div>
          <table width="100%" cellpadding="0" cellspacing="0">${attendeeBlocks}</table>
        </td></tr>

        <!-- Reminder -->
        <tr><td style="padding:8px 32px 16px;">
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;font-size:13px;color:#1e40af;line-height:1.5;">
            ${escapeHtml(reminderText)}
          </div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:8px 32px 24px;text-align:center;">
          <a href="${escapeHtml(ticketUrl)}"
             style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">
            ${escapeHtml(presentation.ctaLabel)}
          </a>
          <div style="margin-top:10px;font-size:12px;color:#6b7280;">
            If this email was in spam or junk, mark it as not spam so future booking emails are easier to find.
          </div>
          <div style="margin-top:10px;font-size:12px;color:#9ca3af;">
            ${escapeHtml(presentation.proofText)}
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#f9fafb;text-align:center;font-size:11px;color:#9ca3af;line-height:1.5;">
          This email was sent because you booked seats at Wolastoq Bingo.<br>
          If this wasn't you, please reply to this email and we'll sort it out.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Plain-text fallback so spam filters and text-only clients are happy.
 */
function renderBookingText({ booking, session, attendees, seats, packages, siteUrl }) {
  const seatById = new Map(seats.map(s => [s.id, s]));
  const pkgById = new Map(packages.map(p => [p.id, p]));
  const presentation = getBookingPresentation(session);
  const charges = getBookingChargeBreakdown(booking, session, attendees, pkgById);
  const lines = [];

  lines.push(`${presentation.readyLine} ${presentation.confirmationLine}.`);
  lines.push('');
  lines.push(`${presentation.referenceLabel}: ${booking.referenceNumber}`);
  if (session?.event_title) lines.push(`${presentation.sessionType === 'event' ? 'Event' : 'Title'}: ${session.event_title}`);
  lines.push(`${presentation.sessionLabel}: ${formatDateLong(session?.date)} at ${formatTime12h(session?.time)}`);
  lines.push(`Subtotal: ${formatPriceDollars(charges.subtotal)}`);
  lines.push(`${charges.serviceChargeLabel}: ${formatPriceDollars(charges.serviceCharge)}`);
  lines.push(`Total paid: ${formatPriceDollars(charges.totalAmount)}`);
  lines.push('');
  lines.push('Thank you for booking with us. We look forward to seeing you there!');
  lines.push('');
  lines.push(`${presentation.sectionLabel}:`);
  attendees.forEach((att, idx) => {
    const seat = seatById.get(att.seatId) || {};
    const ticketRef = booking.itemReferences?.[idx] || '';
    const seatText = presentation.sessionType === 'event'
      ? 'General admission'
      : `Table ${seat.table_number ?? '?'}, Chair ${seat.chair_number ?? '?'}`;
    lines.push(`  ${idx + 1}. ${att.firstName} ${att.lastName} — ${seatText}${ticketRef ? ` (${ticketRef})` : ''}`);
    for (const a of (att.addons || [])) {
      if (!a.quantity) continue;
      const pkg = pkgById.get(a.packageId);
      if (pkg) lines.push(`     + ${pkg.name} x${a.quantity}`);
    }
  });
  lines.push('');
  lines.push(getBookingReminderText(session));
  lines.push(`${presentation.ctaLabel}: ${buildTicketUrl(siteUrl, booking.referenceNumber, booking.ticketAccessToken)}`);
  lines.push(presentation.proofText);
  lines.push('If you found this email in spam or junk, mark it as not spam so future booking emails are easier to find.');
  lines.push('');
  lines.push('Wolastoq Bingo');
  return lines.join('\n');
}

/**
 * Send a booking-confirmation email. Returns a result object — never throws.
 * Caller (POST /api/bookings) should fire-and-forget so a Resend outage
 * doesn't block the booking response.
 */
export async function sendBookingConfirmation({ to, booking, session, attendees, seats, packages }) {
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://booking.wolastoqcasino.ca';

  // Optional admin BCC list. Comma-separated, whitespace tolerant. Filtered to
  // valid-looking addresses so a typo'd env var doesn't blow up the send.
  const bccRaw = process.env.EMAIL_BCC || '';
  const bcc = bccRaw
    .split(',')
    .map(s => s.trim())
    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.warn('[email] booking has no valid email address; skipping. ref=' + booking?.referenceNumber);
    return { ok: false, status: 0, error: 'no_recipient' };
  }

  const html = renderBookingHtml({ booking, session, attendees, seats, packages, siteUrl });
  const text = renderBookingText({ booking, session, attendees, seats, packages, siteUrl });
  const subjectDate = formatDateLong(session?.date);
  const presentation = getBookingPresentation(session);
  const subject = [presentation.subjectPrefix, session?.event_title, subjectDate, booking.referenceNumber]
    .filter(Boolean)
    .join(' - ');

  // Decide provider: Postmark (primary) → Gmail SMTP → Resend → no-op.
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  if (postmarkToken) {
    return sendViaPostmark({ token: postmarkToken, to, bcc, subject, html, text, booking });
  }

  const transporter = getGmailTransporter();
  if (transporter) {
    return sendViaGmail({ transporter, to, bcc, subject, html, text, booking });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return sendViaResend({ apiKey, to, bcc, subject, html, text, booking });
  }

  console.warn('[email] No email provider configured. Set POSTMARK_SERVER_TOKEN (preferred), GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY on Render. Booking continues without email.');
  return { ok: false, status: 0, error: 'no_provider_configured' };
}

function getRefundTicketName(item) {
  if (!item) return '';
  return [item.first_name, item.last_name].filter(Boolean).join(' ').trim();
}

function renderRefundHtml({ booking, session, actionLabel, refundTransactionId, item = null }) {
  const isTicketRefund = Boolean(item);
  const ticketName = getRefundTicketName(item);
  const amountCents = isTicketRefund ? (item.refund_amount || item.price || 0) : booking.total_amount;
  const title = isTicketRefund ? `Ticket ${actionLabel}` : `Booking ${actionLabel}`;
  const subtitle = isTicketRefund ? 'One ticket has been released' : 'Your seats have been released';
  const notice = isTicketRefund
    ? `Ticket ${escapeHtml(item.reference_number)} has been ${escapeHtml(actionLabel.toLowerCase())}. That seat has been released. The rest of your booking remains active.`
    : `Your booking has been ${escapeHtml(actionLabel.toLowerCase())}. Your seats have been released and may become available for other customers.`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Your Bingo ${isTicketRefund ? 'Ticket' : 'Booking'} Refund</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#0a1628 0%,#1a3a5c 100%);padding:28px 32px;color:#ffffff;text-align:center;">
          <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#c5a55a;font-weight:700;">Wolastoq Bingo</div>
          <div style="margin-top:6px;font-size:22px;font-weight:700;">${escapeHtml(title)}</div>
          <div style="margin-top:4px;font-size:14px;color:#cbd5e1;">${escapeHtml(subtitle)}</div>
        </td></tr>

        <tr><td style="padding:24px 32px 8px;">
          <div style="background:#fff7e6;border:2px solid #c5a55a;border-radius:12px;padding:16px;text-align:center;">
            <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;">Booking Reference</div>
            <div style="margin-top:6px;font-family:monospace;font-size:22px;font-weight:700;color:#1a3a5c;letter-spacing:.08em;">
              ${escapeHtml(booking.reference_number)}
            </div>
          </div>
        </td></tr>

        <tr><td style="padding:8px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">Session</td>
              <td style="padding:6px 0;font-size:14px;color:#1a3a5c;font-weight:600;text-align:right;">${escapeHtml(formatDateLong(session?.date))}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">Time</td>
              <td style="padding:6px 0;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(formatTime12h(session?.time))}</td>
            </tr>
            ${isTicketRefund ? `<tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">Ticket</td>
              <td style="padding:6px 0;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(item.reference_number)}</td>
            </tr>` : ''}
            ${ticketName ? `<tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">Attendee</td>
              <td style="padding:6px 0;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(ticketName)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">Amount</td>
              <td style="padding:6px 0;font-size:18px;font-weight:700;color:#c5a55a;text-align:right;">${escapeHtml(formatPriceDollars(amountCents))}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:12px 32px 24px;">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:13px 14px;font-size:14px;color:#991b1b;line-height:1.5;">
            ${notice}
            ${refundTransactionId ? `<br><span style="font-size:12px;color:#7f1d1d;">Transaction reference: ${escapeHtml(refundTransactionId)}</span>` : ''}
          </div>
        </td></tr>

        <tr><td style="padding:0 32px 24px;">
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:13px 14px;font-size:13px;color:#1e40af;line-height:1.5;">
            The payment reversal has been submitted through Authorize.Net. Refund timing depends on Authorize.Net processing and your card issuer or bank; it may take several business days before the credit appears on your statement.
          </div>
        </td></tr>

        <tr><td style="padding:16px 32px;background:#f9fafb;text-align:center;font-size:11px;color:#9ca3af;line-height:1.5;">
          This email was sent because a Wolastoq Bingo booking payment was reversed.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderRefundText({ booking, session, actionLabel, refundTransactionId, item = null }) {
  const isTicketRefund = Boolean(item);
  const ticketName = getRefundTicketName(item);
  const amountCents = isTicketRefund ? (item.refund_amount || item.price || 0) : booking.total_amount;

  return [
    isTicketRefund
      ? `Your Wolastoq Bingo ticket has been ${actionLabel.toLowerCase()}.`
      : `Your Wolastoq Bingo booking has been ${actionLabel.toLowerCase()}.`,
    '',
    `Booking reference: ${booking.reference_number}`,
    isTicketRefund ? `Ticket reference: ${item.reference_number}` : '',
    ticketName ? `Attendee: ${ticketName}` : '',
    `Session: ${formatDateLong(session?.date)} at ${formatTime12h(session?.time)}`,
    `Amount: ${formatPriceDollars(amountCents)}`,
    refundTransactionId ? `Transaction reference: ${refundTransactionId}` : '',
    '',
    isTicketRefund
      ? 'That seat has been released. The rest of your booking remains active.'
      : 'Your seats have been released and may become available for other customers.',
    'The payment reversal has been submitted through Authorize.Net. Refund timing depends on Authorize.Net processing and your card issuer or bank; it may take several business days before the credit appears on your statement.',
    '',
    'Wolastoq Bingo',
  ].filter(Boolean).join('\n');
}

export async function sendBookingRefundNotification({ to, booking, session, item = null, action = 'refund', refundTransactionId = '' }) {
  const bccRaw = process.env.EMAIL_BCC || '';
  const bcc = bccRaw
    .split(',')
    .map(s => s.trim())
    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.warn('[email] refund notification has no valid recipient; skipping. ref=' + booking?.reference_number);
    return { ok: false, status: 0, error: 'no_recipient' };
  }

  const actionLabel = action === 'void' ? 'Voided' : 'Refunded';
  const html = renderRefundHtml({ booking, session, actionLabel, refundTransactionId, item });
  const text = renderRefundText({ booking, session, actionLabel, refundTransactionId, item });
  const subject = item
    ? `Your Bingo Ticket Was ${actionLabel} - ${item.reference_number || booking.reference_number}`
    : `Your Bingo Booking Was ${actionLabel} - ${booking.reference_number}`;

  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  if (postmarkToken) {
    return sendViaPostmark({ token: postmarkToken, to, bcc, subject, html, text, booking: { referenceNumber: booking.reference_number } });
  }

  const transporter = getGmailTransporter();
  if (transporter) {
    return sendViaGmail({ transporter, to, bcc, subject, html, text, booking: { referenceNumber: booking.reference_number } });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return sendViaResend({ apiKey, to, bcc, subject, html, text, booking: { referenceNumber: booking.reference_number } });
  }

  console.warn('[email] No email provider configured. Refund notification cannot be sent.');
  return { ok: false, status: 0, error: 'no_provider_configured' };
}

function renderRescheduleHtml({ booking, session, previousSession }) {
  const presentation = getBookingPresentation(session);
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://booking.wolastoqcasino.ca';
  const ticketUrl = buildTicketUrl(siteUrl, booking.reference_number, booking.ticket_access_token);
  const title = session?.event_title || presentation.brandLabel;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)} Rescheduled</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#0a1628 0%,#1a3a5c 100%);padding:28px 32px;color:#ffffff;text-align:center;">
          <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:${presentation.headerAccent};font-weight:700;">${escapeHtml(presentation.brandLabel)}</div>
          <div style="margin-top:6px;font-size:22px;font-weight:700;">Schedule Update</div>
          <div style="margin-top:4px;font-size:14px;color:#cbd5e1;">${escapeHtml(title)} has been moved</div>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;">
          <div style="background:${presentation.referenceBg};border:2px solid ${presentation.referenceBorder};border-radius:12px;padding:16px;text-align:center;">
            <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;">Booking Reference</div>
            <div style="margin-top:6px;font-family:monospace;font-size:22px;font-weight:700;color:#1a3a5c;letter-spacing:.08em;">${escapeHtml(booking.reference_number)}</div>
          </div>
        </td></tr>
        <tr><td style="padding:8px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
            ${session?.event_title ? `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Event</td><td style="padding:6px 0;font-size:14px;color:#1a3a5c;font-weight:700;text-align:right;">${escapeHtml(session.event_title)}</td></tr>` : ''}
            <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Previous Date</td><td style="padding:6px 0;font-size:14px;text-align:right;">${escapeHtml(formatDateLong(previousSession?.date))}</td></tr>
            <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Previous Time</td><td style="padding:6px 0;font-size:14px;text-align:right;">${escapeHtml(formatTime12h(previousSession?.time))}</td></tr>
            <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">New Date</td><td style="padding:6px 0;font-size:15px;color:#1a3a5c;font-weight:700;text-align:right;">${escapeHtml(formatDateLong(session?.date))}</td></tr>
            <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">New Time</td><td style="padding:6px 0;font-size:15px;color:#1a3a5c;font-weight:700;text-align:right;">${escapeHtml(formatTime12h(session?.time))}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:12px 32px 16px;">
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:13px 14px;font-size:14px;color:#1e40af;line-height:1.5;">
            Your booking, seats, ticket references, and payment remain the same. Please use the new date and time above.
          </div>
        </td></tr>
        <tr><td style="padding:8px 32px 24px;text-align:center;">
          <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">View Tickets Online</a>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f9fafb;text-align:center;font-size:11px;color:#9ca3af;line-height:1.5;">
          This email was sent because a Wolastoq Bingo event or session was rescheduled.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderRescheduleText({ booking, session, previousSession }) {
  const presentation = getBookingPresentation(session);
  const title = session?.event_title || presentation.brandLabel;
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://booking.wolastoqcasino.ca';
  return [
    `${title} has been rescheduled.`,
    '',
    `Booking reference: ${booking.reference_number}`,
    `Previous: ${formatDateLong(previousSession?.date)} at ${formatTime12h(previousSession?.time)}`,
    `New: ${formatDateLong(session?.date)} at ${formatTime12h(session?.time)}`,
    '',
    'Your booking, seats, ticket references, and payment remain the same.',
    `View tickets: ${buildTicketUrl(siteUrl, booking.reference_number, booking.ticket_access_token)}`,
    '',
    'Wolastoq Bingo',
  ].join('\n');
}

export async function sendSessionRescheduleNotification({ to, booking, session, previousSession }) {
  const bccRaw = process.env.EMAIL_BCC || '';
  const bcc = bccRaw
    .split(',')
    .map(s => s.trim())
    .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.warn('[email] reschedule notification has no valid recipient; skipping. ref=' + booking?.reference_number);
    return { ok: false, status: 0, error: 'no_recipient' };
  }

  const presentation = getBookingPresentation(session);
  const title = session?.event_title || presentation.brandLabel;
  const subject = `${title} Rescheduled - ${formatDateLong(session?.date)} - ${booking.reference_number}`;
  const html = renderRescheduleHtml({ booking, session, previousSession });
  const text = renderRescheduleText({ booking, session, previousSession });
  const emailBooking = { referenceNumber: booking.reference_number };

  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  if (postmarkToken) {
    return sendViaPostmark({ token: postmarkToken, to, bcc, subject, html, text, booking: emailBooking });
  }

  const transporter = getGmailTransporter();
  if (transporter) {
    return sendViaGmail({ transporter, to, bcc, subject, html, text, booking: emailBooking });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return sendViaResend({ apiKey, to, bcc, subject, html, text, booking: emailBooking });
  }

  console.warn('[email] No email provider configured. Reschedule notification cannot be sent.');
  return { ok: false, status: 0, error: 'no_provider_configured' };
}

function renderVerificationHtml({ code, firstName }) {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Your Verification Code</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#0a1628 0%,#1a3a5c 100%);padding:24px 28px;color:#ffffff;text-align:center;">
          <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#c5a55a;font-weight:700;">Wolastoq Bingo</div>
          <div style="margin-top:6px;font-size:21px;font-weight:700;">Verify Your Email</div>
        </td></tr>
        <tr><td style="padding:26px 28px;color:#374151;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">${greeting}</p>
          <p style="margin:0 0 18px;">Enter this code on the booking page to continue to payment:</p>
          <div style="background:#fff7e6;border:2px solid #c5a55a;border-radius:12px;padding:16px;text-align:center;">
            <div style="font-family:monospace;font-size:30px;font-weight:800;color:#1a3a5c;letter-spacing:.18em;">${escapeHtml(code)}</div>
          </div>
          <p style="margin:18px 0 0;color:#6b7280;font-size:13px;">This code expires in 10 minutes. If you found this in spam or junk, mark it as not spam.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderVerificationText({ code, firstName }) {
  return [
    firstName ? `Hi ${firstName},` : 'Hi,',
    '',
    'Enter this Wolastoq Bingo verification code on the booking page:',
    '',
    code,
    '',
    'This code expires in 10 minutes. If you found this in spam or junk, mark it as not spam.',
  ].join('\n');
}

export async function sendEmailVerificationCode({ to, code, firstName }) {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !/^\d{6}$/.test(String(code || ''))) {
    return { ok: false, status: 0, error: 'invalid_verification_email_request' };
  }

  const subject = 'Your Wolastoq Bingo verification code';
  const html = renderVerificationHtml({ code, firstName });
  const text = renderVerificationText({ code, firstName });
  const booking = { referenceNumber: 'email verification' };

  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  if (postmarkToken) {
    return sendViaPostmark({ token: postmarkToken, to, bcc: [], subject, html, text, booking });
  }

  const transporter = getGmailTransporter();
  if (transporter) {
    return sendViaGmail({ transporter, to, bcc: [], subject, html, text, booking });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return sendViaResend({ apiKey, to, bcc: [], subject, html, text, booking });
  }

  console.warn('[email] No email provider configured. Set POSTMARK_SERVER_TOKEN (preferred), GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY on Render. Verification email cannot be sent.');
  return { ok: false, status: 0, error: 'no_provider_configured' };
}

// ---------- Provider: Gmail SMTP ----------
async function sendViaGmail({ transporter, to, bcc, subject, html, text, booking }) {
  const fromUser = process.env.GMAIL_USER;
  // Gmail will rewrite the From envelope to match the authenticated user
  // anyway, but a friendly display name in the EMAIL_FROM env var still works
  // (e.g. "Wolastoq Bingo <demo@gmail.com>"). If EMAIL_FROM is unset we fall
  // back to a sensible default.
  const from = process.env.EMAIL_FROM || `Wolastoq Bingo <${fromUser}>`;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      bcc: bcc.length > 0 ? bcc.join(',') : undefined,
      subject,
      html,
      text,
    });
    const bccNote = bcc.length > 0 ? ` bcc=${bcc.join(',')}` : '';
    console.log(`[email] sent ${booking.referenceNumber} to ${to}${bccNote} via Gmail (messageId=${info.messageId})`);
    return { ok: true, status: 200, id: info.messageId };
  } catch (err) {
    // Common Gmail errors: 535 invalid creds, 534 app password required.
    console.error('[email] Gmail send failed:', err?.message || err);
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
}

// ---------- Provider: Resend (fallback) ----------
async function sendViaResend({ apiKey, to, bcc, subject, html, text, booking }) {
  const from = process.env.EMAIL_FROM || 'Wolastoq Bingo <onboarding@resend.dev>';
  const payload = { from, to, subject, html, text };
  if (bcc.length > 0) payload.bcc = bcc;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let errBody = '';
      try { errBody = await res.text(); } catch {}
      console.error(`[email] Resend rejected (${res.status}): ${errBody.slice(0, 500)}`);
      return { ok: false, status: res.status, error: errBody };
    }
    const body = await res.json().catch(() => ({}));
    const bccNote = bcc.length > 0 ? ` bcc=${bcc.join(',')}` : '';
    console.log(`[email] sent ${booking.referenceNumber} to ${to}${bccNote} via Resend (id=${body?.id || 'unknown'})`);
    return { ok: true, status: res.status, id: body?.id };
  } catch (err) {
    console.error('[email] Resend send failed:', err?.message || err);
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
}

// ---------- Provider: Postmark (primary) ----------
// Sends via Postmark's transactional email REST API. Requires the From
// address to be on a Postmark-verified Sender Signature OR a DKIM-verified
// domain — otherwise Postmark returns ErrorCode 405 "must verify sender
// signature". The token serves as both API auth and (if you switch to SMTP
// relay later) as the SMTP username/password.
//
// Postmark response handling:
//   - HTTP 200 + ErrorCode 0  → success, body.MessageID is the unique id
//   - HTTP 422 + ErrorCode X  → validation/sender-not-verified — fix config
//   - HTTP 401                → bad token — rotate it in Postmark dashboard
//   - HTTP 5xx / network err  → transient, caller logs but doesn't retry
async function sendViaPostmark({ token, to, bcc, subject, html, text, booking }) {
  const from = process.env.EMAIL_FROM || 'Wolastoq Bingo <noreply@wolastoqcasino.ca>';
  const messageStream = process.env.POSTMARK_MESSAGE_STREAM || 'outbound';

  const payload = {
    From: from,
    To: to,
    Subject: subject,
    HtmlBody: html,
    TextBody: text,
    MessageStream: messageStream,
    // Disable per-recipient open/click tracking for transactional mail. Booking
    // confirmations don't need it and pixel/link rewrites can trigger spam
    // filters on certain webmail clients.
    TrackOpens: false,
    TrackLinks: 'None',
  };
  if (bcc.length > 0) payload.Bcc = bcc.join(',');

  try {
    const res = await fetch(POSTMARK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    // Postmark returns 200 on success, 422 on validation errors. ErrorCode 0
    // is the success marker inside the body; non-zero means the API accepted
    // the request format but rejected the content (e.g. unverified sender).
    if (!res.ok || (body && body.ErrorCode && body.ErrorCode !== 0)) {
      const errCode = body?.ErrorCode ?? res.status;
      const errMsg = body?.Message || `HTTP ${res.status}`;
      console.error(`[email] Postmark rejected (code=${errCode}): ${errMsg}`);
      return { ok: false, status: res.status, error: `${errCode}: ${errMsg}` };
    }
    const bccNote = bcc.length > 0 ? ` bcc=${bcc.join(',')}` : '';
    console.log(`[email] sent ${booking.referenceNumber} to ${to}${bccNote} via Postmark (messageId=${body?.MessageID || 'unknown'} stream=${messageStream})`);
    return { ok: true, status: res.status, id: body?.MessageID };
  } catch (err) {
    console.error('[email] Postmark send failed:', err?.message || err);
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
}
