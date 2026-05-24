/**
 * Local Postmark integration test
 * --------------------------------
 *
 * Sends one realistic booking-confirmation email through the production
 * code path (sendBookingConfirmation → sendViaPostmark) using credentials
 * from server/.env. Lets us verify deliverability, DKIM signing, and
 * template rendering BEFORE flipping production env vars.
 *
 * Required env vars in server/.env (or passed inline):
 *   POSTMARK_SERVER_TOKEN     — Server API Token from the "Wolastoq Bingo"
 *                               server in Postmark (Servers → Wolastoq Bingo
 *                               → API Tokens). Keep secret; do NOT commit.
 *   EMAIL_FROM                — Optional. Defaults to:
 *                               "Wolastoq Bingo <noreply@wolastoqcasino.ca>"
 *   POSTMARK_MESSAGE_STREAM   — Optional. Defaults to "outbound".
 *   PUBLIC_SITE_URL           — Optional. Defaults to
 *                               https://booking.wolastoqcasino.ca
 *
 * Usage:
 *   cd server
 *   node scripts/test-postmark-email.js                          # sends to default
 *   node scripts/test-postmark-email.js you@example.com          # override recipient
 *
 * Exit codes:
 *   0  email accepted by Postmark API
 *   1  configuration error (no token, no recipient, etc.)
 *   2  Postmark rejected the send (auth, domain, validation, etc.)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load env from server/.env regardless of where the script is invoked from.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import after dotenv so the email service sees the loaded vars.
const { sendBookingConfirmation } = await import('../src/services/email.js');

// ----- 1. Resolve recipient -----
const DEFAULT_RECIPIENT = 'hilbert_magculang@yahoo.com';
const recipient = (process.argv[2] || DEFAULT_RECIPIENT).trim();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
  console.error(`[test-postmark] Invalid recipient email: "${recipient}"`);
  process.exit(1);
}

// ----- 2. Sanity-check the token is present -----
if (!process.env.POSTMARK_SERVER_TOKEN) {
  console.error(`[test-postmark] POSTMARK_SERVER_TOKEN is not set in server/.env.

To run this test:
  1. Open Postmark → Servers → "Wolastoq Bingo" → API Tokens
  2. Copy the Server API Token
  3. Add this line to server/.env:
       POSTMARK_SERVER_TOKEN=<paste-token-here>
  4. Re-run this script.

(Optional companion vars also recommended in server/.env:
   EMAIL_FROM="Wolastoq Bingo <noreply@wolastoqcasino.ca>"
   POSTMARK_MESSAGE_STREAM=outbound
   PUBLIC_SITE_URL=https://booking.wolastoqcasino.ca
)`);
  process.exit(1);
}

// ----- 3. Build a realistic mock booking -----
// Mirrors the shape produced by the real booking route so we exercise
// the same render/email path that production will hit. Special-bingo
// session_type because that's the typical booking variant Wolastoq sells.
const isoToday = new Date().toISOString().slice(0, 10);
const referenceNumber = `TEST-${Date.now().toString(36).toUpperCase()}`;

const booking = {
  referenceNumber,
  totalAmount: 5500,                  // 55.00 in cents
  totalFormatted: '$55.00',
  ticketAccessToken: 'demo-access-token-do-not-use-in-prod',
  itemReferences: [`${referenceNumber}-A`, `${referenceNumber}-B`],
};

const session = {
  date: isoToday,
  time: '19:00',
  event_title: 'Postmark Local Smoke Test',
  session_type: 'special_bingo',
  is_special_event: 0,
};

const seats = [
  { id: 1, table_number: 5, chair_number: 3 },
  { id: 2, table_number: 5, chair_number: 4 },
];

const packages = [
  { id: 10, name: 'Strip of 6 — Early Bird' },
  { id: 11, name: 'Dauber (souvenir)' },
];

const attendees = [
  {
    firstName: 'Sir',
    lastName: 'Hilbert',
    seatId: 1,
    addons: [
      { quantity: 1, packageId: 10 },
      { quantity: 1, packageId: 11 },
    ],
  },
  {
    firstName: 'Test',
    lastName: 'Companion',
    seatId: 2,
    addons: [{ quantity: 1, packageId: 10 }],
  },
];

// ----- 4. Send -----
console.log('[test-postmark] Sending booking confirmation...');
console.log(`  to:        ${recipient}`);
console.log(`  from:      ${process.env.EMAIL_FROM || 'Wolastoq Bingo <noreply@wolastoqcasino.ca>'}`);
console.log(`  stream:    ${process.env.POSTMARK_MESSAGE_STREAM || 'outbound'}`);
console.log(`  reference: ${referenceNumber}`);
console.log('');

const result = await sendBookingConfirmation({
  to: recipient,
  booking,
  session,
  attendees,
  seats,
  packages,
});

// ----- 5. Report result -----
if (result?.ok) {
  console.log('');
  console.log('=========================================================');
  console.log('SUCCESS — Postmark accepted the email.');
  console.log('---------------------------------------------------------');
  console.log(`  MessageID:  ${result.id ?? 'unknown'}`);
  console.log(`  HTTP:       ${result.status}`);
  console.log(`  Reference:  ${referenceNumber}`);
  console.log('=========================================================');
  console.log('');
  console.log('Now check the recipient inbox:');
  console.log(`  1. Open ${recipient}`);
  console.log(`  2. Look for subject containing "${referenceNumber}"`);
  console.log('  3. Verify:');
  console.log('     - Email arrives in inbox (not spam/junk)');
  console.log('     - HTML renders correctly (header, reference card, attendee table)');
  console.log('     - "Show original" / message-source shows DKIM=pass for wolastoqcasino.ca');
  console.log('     - Return-Path domain is pm-bounces.wolastoqcasino.ca');
  console.log('');
  process.exit(0);
} else {
  console.error('');
  console.error('=========================================================');
  console.error('FAILURE — Postmark rejected or transport errored.');
  console.error('---------------------------------------------------------');
  console.error(`  HTTP:    ${result?.status ?? 'unknown'}`);
  console.error(`  Error:   ${result?.error ?? 'unknown'}`);
  console.error('=========================================================');
  console.error('');
  console.error('Common causes:');
  console.error('  - Bad/expired Server API Token in POSTMARK_SERVER_TOKEN');
  console.error('  - From: domain (wolastoqcasino.ca) not yet DKIM-verified in Postmark');
  console.error('  - Free-tier sandbox restriction (can only send to verified addresses)');
  console.error('  - Recipient bounced/blocked previously in Postmark suppression list');
  console.error('');
  process.exit(2);
}
