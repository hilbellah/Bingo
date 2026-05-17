// Booking-confirmation email service.
//
// Two providers are supported, chosen automatically by which env vars are set:
//
//   1. Gmail SMTP (preferred when configured) — works for any recipient with
//      no DNS setup. Uses nodemailer + a Gmail App Password. Best for demos
//      and small deployments.
//   2. Resend (fallback) — REST-based transactional email service. Requires
//      domain verification before it'll deliver to non-account emails.
//
// Selection logic: if BOTH GMAIL_USER and GMAIL_APP_PASSWORD are set, Gmail is
// used. Otherwise, if RESEND_API_KEY is set, Resend is used. Otherwise the
// module logs a warning and no-ops so the booking flow still completes.
//
// Env vars (all optional unless noted):
//
//   --- Gmail SMTP path ---
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
//                         Default: "https://bingo-jk2h.onrender.com".
//
//   --- Shared (used by both providers) ---
//   EMAIL_FROM            Display name + address shown to the customer.
//                         e.g. "Wolastoq Bingo <demo@gmail.com>". For Gmail,
//                         the address part SHOULD match GMAIL_USER (Gmail
//                         rewrites mismatched From addresses anyway).
//   EMAIL_BCC             Comma-separated addresses to BCC on every booking
//                         confirmation/refund email.
//                         Customer doesn't see these. Admin notification.
//
// All export functions are async and return { ok, status, error? }. They
// never throw — the booking flow shouldn't roll back if email is broken.

import nodemailer from 'nodemailer';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

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
  return '$' + ((cents || 0) / 100).toFixed(2);
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

/**
 * Build the HTML body for a booking-confirmation email.
 * Inline-styled so every webmail client (Gmail / Outlook / Yahoo) renders it.
 */
function renderBookingHtml({ booking, session, attendees, seats, packages, siteUrl }) {
  const seatById = new Map(seats.map(s => [s.id, s]));
  const pkgById = new Map(packages.map(p => [p.id, p]));
  const thankYouMessage = 'Thank you for booking with us. We look forward to seeing you there!';
  const isSpecialEvent = !!session?.is_special_event;

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
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
          <div style="font-weight:600;color:#1a3a5c;font-size:15px;">
            ${escapeHtml(att.firstName)} ${escapeHtml(att.lastName)}
          </div>
          <div style="margin-top:4px;font-size:13px;color:#374151;">
            Table <strong>${escapeHtml(seat.table_number ?? '?')}</strong>,
            Chair <strong>${escapeHtml(seat.chair_number ?? '?')}</strong>
          </div>
          ${ticketRef ? `<div style="margin-top:4px;font-family:monospace;font-size:12px;color:#1a3a5c;background:#fff7e6;display:inline-block;padding:2px 8px;border-radius:4px;">${escapeHtml(ticketRef)}</div>` : ''}
          ${addonLines ? `<div style="margin-top:6px;">${addonLines}</div>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  const ticketUrl = `${siteUrl}/tickets/${encodeURIComponent(booking.referenceNumber)}`;
  const ctaLabel = isSpecialEvent ? 'View Tickets Online' : 'View Booking Receipt';
  const proofText = isSpecialEvent
    ? "Or save this email - it's all the proof you need."
    : 'Regular bingo orders are printed on receipt paper. Save this email or bring your booking reference as proof.';
  const sectionLabel = isSpecialEvent ? 'Your Tickets' : 'Regular Bingo Order';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Your Bingo Booking</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0a1628 0%,#1a3a5c 100%);padding:28px 32px;color:#ffffff;text-align:center;">
          <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#c5a55a;font-weight:700;">Wolastoq Bingo</div>
          <div style="margin-top:6px;font-size:22px;font-weight:700;">You're All Set!</div>
          <div style="margin-top:4px;font-size:14px;color:#cbd5e1;">Your bingo seats are confirmed</div>
        </td></tr>

        <!-- Reference -->
        <tr><td style="padding:24px 32px 8px;">
          <div style="background:#fff7e6;border:2px solid #c5a55a;border-radius:12px;padding:16px;text-align:center;">
            <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;">Booking Reference</div>
            <div style="margin-top:6px;font-family:monospace;font-size:22px;font-weight:700;color:#1a3a5c;letter-spacing:.08em;">
              ${escapeHtml(booking.referenceNumber)}
            </div>
          </div>
        </td></tr>

        <!-- Session info -->
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
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">Total Paid</td>
              <td style="padding:6px 0;font-size:18px;font-weight:700;color:#c5a55a;text-align:right;">${escapeHtml(booking.totalFormatted || formatPriceDollars(booking.totalAmount))}</td>
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
          <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:8px;">${escapeHtml(sectionLabel)}</div>
          <table width="100%" cellpadding="0" cellspacing="0">${attendeeBlocks}</table>
        </td></tr>

        <!-- Reminder -->
        <tr><td style="padding:8px 32px 16px;">
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 14px;font-size:13px;color:#1e40af;line-height:1.5;">
            Please arrive by <strong>4:30 PM</strong>. Doors open one hour before the session starts. Bring this booking reference with you.
          </div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:8px 32px 24px;text-align:center;">
          <a href="${escapeHtml(ticketUrl)}"
             style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">
            ${escapeHtml(ctaLabel)}
          </a>
          <div style="margin-top:10px;font-size:12px;color:#6b7280;">
            If this email was in spam or junk, mark it as not spam so future booking emails are easier to find.
          </div>
          <div style="margin-top:10px;font-size:12px;color:#9ca3af;">
            ${escapeHtml(proofText)}
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
  const isSpecialEvent = !!session?.is_special_event;
  const lines = [];

  lines.push("You're all set — your bingo seats are confirmed.");
  lines.push('');
  lines.push(`Booking reference: ${booking.referenceNumber}`);
  lines.push(`Session: ${formatDateLong(session?.date)} at ${formatTime12h(session?.time)}`);
  lines.push(`Total paid: ${booking.totalFormatted || formatPriceDollars(booking.totalAmount)}`);
  lines.push('');
  lines.push('Thank you for booking with us. We look forward to seeing you there!');
  lines.push('');
  lines.push('Tickets:');
  attendees.forEach((att, idx) => {
    const seat = seatById.get(att.seatId) || {};
    const ticketRef = booking.itemReferences?.[idx] || '';
    lines.push(`  ${idx + 1}. ${att.firstName} ${att.lastName} — Table ${seat.table_number ?? '?'}, Chair ${seat.chair_number ?? '?'}${ticketRef ? ` (${ticketRef})` : ''}`);
    for (const a of (att.addons || [])) {
      if (!a.quantity) continue;
      const pkg = pkgById.get(a.packageId);
      if (pkg) lines.push(`     + ${pkg.name} x${a.quantity}`);
    }
  });
  lines.push('');
  lines.push('Please arrive by 4:30 PM. Doors open one hour before the session.');
  lines.push(`${isSpecialEvent ? 'View your tickets online' : 'View your booking receipt'}: ${siteUrl}/tickets/${booking.referenceNumber}`);
  if (!isSpecialEvent) {
    lines.push('Regular bingo orders are printed on receipt paper. Save this email or bring your booking reference as proof.');
  }
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
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://bingo-jk2h.onrender.com';

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
  const subject = `Your Bingo Booking — ${booking.referenceNumber}`;

  // Decide provider: Gmail SMTP if creds are present, else Resend, else no-op.
  const transporter = getGmailTransporter();
  if (transporter) {
    return sendViaGmail({ transporter, to, bcc, subject, html, text, booking });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return sendViaResend({ apiKey, to, bcc, subject, html, text, booking });
  }

  console.warn('[email] No email provider configured. Set GMAIL_USER + GMAIL_APP_PASSWORD or RESEND_API_KEY on Render. Booking continues without email.');
  return { ok: false, status: 0, error: 'no_provider_configured' };
}

function renderRefundHtml({ booking, session, actionLabel, refundTransactionId }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Your Bingo Booking Refund</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#0a1628 0%,#1a3a5c 100%);padding:28px 32px;color:#ffffff;text-align:center;">
          <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#c5a55a;font-weight:700;">Wolastoq Bingo</div>
          <div style="margin-top:6px;font-size:22px;font-weight:700;">Booking ${escapeHtml(actionLabel)}</div>
          <div style="margin-top:4px;font-size:14px;color:#cbd5e1;">Your seats have been released</div>
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
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#6b7280;">Amount</td>
              <td style="padding:6px 0;font-size:18px;font-weight:700;color:#c5a55a;text-align:right;">${escapeHtml(formatPriceDollars(booking.total_amount))}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:12px 32px 24px;">
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:13px 14px;font-size:14px;color:#991b1b;line-height:1.5;">
            Your booking has been ${escapeHtml(actionLabel.toLowerCase())}. Your seats have been released and may become available for other customers.
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

function renderRefundText({ booking, session, actionLabel, refundTransactionId }) {
  return [
    `Your Wolastoq Bingo booking has been ${actionLabel.toLowerCase()}.`,
    '',
    `Booking reference: ${booking.reference_number}`,
    `Session: ${formatDateLong(session?.date)} at ${formatTime12h(session?.time)}`,
    `Amount: ${formatPriceDollars(booking.total_amount)}`,
    refundTransactionId ? `Transaction reference: ${refundTransactionId}` : '',
    '',
    'Your seats have been released and may become available for other customers.',
    'The payment reversal has been submitted through Authorize.Net. Refund timing depends on Authorize.Net processing and your card issuer or bank; it may take several business days before the credit appears on your statement.',
    '',
    'Wolastoq Bingo',
  ].filter(Boolean).join('\n');
}

export async function sendBookingRefundNotification({ to, booking, session, action = 'refund', refundTransactionId = '' }) {
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
  const html = renderRefundHtml({ booking, session, actionLabel, refundTransactionId });
  const text = renderRefundText({ booking, session, actionLabel, refundTransactionId });
  const subject = `Your Bingo Booking Was ${actionLabel} - ${booking.reference_number}`;

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

  const transporter = getGmailTransporter();
  if (transporter) {
    return sendViaGmail({ transporter, to, bcc: [], subject, html, text, booking });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return sendViaResend({ apiKey, to, bcc: [], subject, html, text, booking });
  }

  console.warn('[email] No email provider configured. Set GMAIL_USER + GMAIL_APP_PASSWORD or RESEND_API_KEY on Render. Verification email cannot be sent.');
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
