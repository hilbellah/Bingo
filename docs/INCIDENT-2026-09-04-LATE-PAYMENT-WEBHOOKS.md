# Incident: customers charged, reservation not registered (2026-09-04)

**Reported by staff (2026-09-05):** Pat & Dan Johnson booked two seats for the Nov 7 Big Bank Bingo in two transactions; only Pat's registered. Ashley Tucker booked for the Sep 5 session; charged, not registered. Both payments were captured in Authorize.Net. Staff reserved the seats manually with promo tickets.

**Actual scope (from `payment_events` in the live Postgres DB):** six payments on 2026-09-04 were affected, including two customers who were charged more than once.

## What the customers experienced

1. Chose a seat (20-minute hold), entered details, paid on the embedded Authorize.Net card form.
2. The card form's success message never reached our page for most customers (see "instant path", below), so the page kept showing "Confirming your payment...".
3. Nothing happened for a long time. Some customers closed the page; some tried again (and paid again).
4. ~60 minutes after checkout Authorize.Net delivered the `authcapture.created` webhook. By then the 20-minute hold had expired and the seat had been swept back to vacant, so `markBookingPaid` refused to attach the payment (`seat_hold_expired_or_released`) and parked the booking in `payment_review`.
5. Staff were not alerted in a way anyone noticed: the only signal was a socket event the admin dashboard did not render.

## Timeline (UTC, 2026-09-04)

| Booking | Customer | Checkout started | Webhook arrived | Delay | Result |
|---|---|---|---|---|---|
| BNG-97A54FC584 | Wendi Colton | 14:46:27 | 15:46:41 | 60.2 min | payment_review, $124 |
| BNG-9A9599A389 | Wendi Colton (2nd attempt, seat 54/2) | 15:17:31 | 16:18:35 | 61.1 min | payment_review, $124 |
| BNG-78F5673391 | Ashley Tucker | 15:49:46 | 16:50:10 | 60.4 min | payment_review, $84 |
| BNG-6560EE2314 | Dan Johnson | 16:25:26 | 17:26:05 | 60.7 min | payment_review, $175 |
| BNG-5D570FAB1D | Dawn Fraser | 17:28:45 | 18:29:09 | 60.4 min | payment_review, $164 |
| BNG-40BE8C8467 | Annie Arsenault (1st charge, tx 121811694035) | 18:30:54 | 19:31:42 | ~60 min | duplicate charge, $300 |

The other 16 payments that afternoon received their webhook in 0.2-2.6 minutes, interleaved with the failures. The server had 56 h uptime and no restarts. Authorize.Net's documented retry schedule (3 x 3 min, then 8 h, then 48 h) cannot produce a 60-minute gap, so these six notifications were generated late on Authorize.Net's side. Earlier isolated cases exist (Aug 16: 40 min; Aug 20: 183 min -> Bertha Dedam payment_review; Aug 23: 959 min; Aug 24: 36 min).

## Root causes

1. **Single signal.** Confirmation depended entirely on the webhook. The server never asked the gateway whether a pending booking had been paid.
2. **Instant path mostly broken.** After a successful charge the embedded form is supposed to call back into our page with the transaction id, which then hits `/payment/return` and verifies immediately. That path worked for only 19 of ~340 payments in 45 days and for 0 since Aug 29. Suspected: the Render environment's `PUBLIC_BASE_URL` / iframe-communicator origin not matching `booking.wolastoqcasino.ca` (cross-origin blocks the callback). **Still to verify in the Render dashboard.**
3. **Hold expiry judged at signal time, not payment time.** A late payment for a seat that was still completely free was quarantined instead of claimed.
4. **No staff alerting** for `payment_review` / duplicate charges, and no one-click resolution.
5. **Customer page gave no guidance**, so people paid again.

## Fixes shipped (this change set)

| # | Fix | Where |
|---|---|---|
| 1 | **Gateway reconciliation poller.** Every 60 s (and on demand from a waiting customer's status poll, debounced 20 s) the server lists the gateway's unsettled transactions, matches invoice numbers to pending bookings that reached the card form, verifies each match server-to-server, and confirms it through `markBookingPaid`. Settled batches are scanned every 30 min for the rare pending booking that slipped past a settlement. Idempotent with the webhook. | `server/src/services/paymentReconciliation.js`, `payments.js` (`listUnsettledTransactions`, `listSettledTransactions`), `index.js` (`start()`, `/api/bookings/:id/status`) |
| 2 | **Late payments reclaim a free seat.** `markBookingPaid` now confirms when every seat is vacant, still held by this customer, or held by someone whose hold already lapsed. It quarantines only when another customer actively holds or has bought the seat. Logged as `late_payment_seat_reclaimed`. | `server/src/index.js` |
| 3 | **Hold heartbeat.** While the customer is on the card form or the confirming page, their 2-second status poll extends the seat hold (only writes when < 19 min left; capped at `CHECKOUT_HEARTBEAT_MAX_MINUTES`, default 90). | `index.js` (`keepCheckoutHoldAlive`) |
| 4 | **Browser hands over the transaction id.** The card form's success message now POSTs `transId` to `/api/bookings/:id/payment-result` (keepalive) before navigating; the server verifies it with the gateway. | `EmbeddedAuthorizeNetPayment.jsx`, `index.js` |
| 5 | **Staff alerting + one-click fix.** Every quarantine or duplicate charge emails all active super users (plus `PAYMENT_REVIEW_EMAILS`), and the admin dashboard shows a red "Payments Needing Attention" panel with a **Confirm seat** button (re-verifies with Authorize.Net, marks the seat sold, sends the normal confirmation email) and a **Mark refunded** button for duplicates. | `email.js` (`sendPaymentReviewAlert`), `routes/adminPaymentReviewRoutes.js`, `AdminDashboard.jsx`, `DashboardTab.jsx` |
| 6 | Customer-facing copy on the confirming/review pages now says the seat stays reserved, not to pay again, and what happens next. | `BookingProcessing.jsx` |
| 7 | **Gateway-side audit.** Every 6 h the server pulls every transaction Authorize.Net captured in the last 48 h (unsettled + settled) and checks each against bookings: booking exists, is confirmed/reviewed/refunded, transaction id matches. Critical anomalies (charge with no confirmed seat, charge on cancelled/failed booking, unflagged second charge) are emailed to super users and recorded in `audit_log`. | `server/src/services/paymentAudit.js`, `email.js` (`sendPaymentAuditAlert`) |
| 8 | **`/health/payments`** for external monitoring: 503 when the reconciler or audit is failing or a critical anomaly is open; `attention` (200) while staff reviews are outstanding. Point an uptime monitor at it. | `index.js` |
| 9 | Admin **notifications bell** (header) replaces the overview block; **Mark handled** (note required, audit-logged) clears a case resolved another way. | `NotificationsBell.jsx`, `adminPaymentReviewRoutes.js` |

Tests: `scripts/late-payment-seat-reclaim-check.mjs` (reclaim, heartbeat, admin confirm, duplicate list, browser payment-result) and `scripts/payment-reconciliation-check.mjs` (confirm without webhook, settled fallback, idempotency, gateway outage). Both are in `npm run test:api`.

## New environment variables (all optional)

| Variable | Default | Purpose |
|---|---|---|
| `PAYMENT_RECONCILE_INTERVAL_MS` | `60000` | Poller cadence (min 15000) |
| `PAYMENT_RECONCILE_DISABLED` | unset | Set to `1` to stop the poller (emergency only) |
| `PAYMENT_RECONCILE_LOOKBACK_HOURS` | `72` | How old a pending booking may be and still be reconciled |
| `PAYMENT_RECONCILE_MIN_AGE_SECONDS` | `20` | Ignore checkouts younger than this (customer is still typing) |
| `PAYMENT_RECONCILE_SETTLED_INTERVAL_MS` | `1800000` | How often settled batches are scanned |
| `CHECKOUT_HEARTBEAT_MAX_MINUTES` | `90` | Longest an open checkout tab can keep extending its hold (max 240) |
| `PAYMENT_REVIEW_EMAILS` | unset | Extra alert recipients (comma-separated); active super users always receive alerts |
| `PAYMENT_AUDIT_INTERVAL_MS` | `21600000` | Gateway-side audit cadence (min 15 min) |
| `PAYMENT_AUDIT_WINDOW_HOURS` | `48` | Audit look-back window |
| `PAYMENT_AUDIT_ALWAYS_EMAIL` | unset | `1` = email a summary after every audit, not only on anomalies |
| `PAYMENT_AUDIT_DISABLED` | unset | `1` = stop the audit (emergency only) |

## Remediation for the affected customers (do in the admin dashboard after deploy)

The red "Payments Needing Attention" panel lists all of these. Refund only through the admin refund workflow (never directly in the Authorize.Net dashboard) so seat records stay in sync.

| Customer | Booking | Action |
|---|---|---|
| Dawn Fraser (Sep 5, 6pm) | BNG-5D570FAB1D, $164, tx 121811581388 | Seat T1/1 is still vacant and nobody had contacted her. **Confirm seat** -> she gets her ticket email. Call her too. |
| Dan Johnson (Nov 7) | BNG-6560EE2314, $175, tx 121811467250 | Seat T42/5 is occupied by the $0 promo ticket BNG-AA82DB93CB. Remove that assigned ticket, then **Confirm seat** on the paid booking. |
| Ashley Tucker (Sep 5) | BNG-78F5673391, $84, tx 121811400838 | Paid seat T49/4 is vacant; staff put her on T45/5 with promo BNG-57B1678CFE. Either **Confirm seat** (she plays at 49/4; remove the promo) or keep 45/5 and refund the $84 via the refund workflow. Tell her which. |
| Wendi Colton (Sep 6) | BNG-97A54FC584 and BNG-9A9599A389, 2 x $124 | She already has a paid seat (BNG-15F1655398, T54/4). Refund both extra bookings through the refund workflow. |
| Annie Arsenault (Sep 4) | BNG-40BE8C8467, extra $300, tx 121811694035 | Refund the duplicate transaction, then **Mark refunded** in the panel. |
| Bertha Dedam (Aug 20/23) | BNG-0BBE68EFEF, $300, tx 121786153215 | Her seats T73/4,6 were sold to someone else; she has a separate paid booking. Confirm with her whether the $300 was ever refunded; refund if not. |

## Still open

1. **Render dashboard:** confirm `PUBLIC_BASE_URL` and `ANET_RETURN_URL` are `https://booking.wolastoqcasino.ca...` (not `bingo-jk2h.onrender.com`). If wrong, fix them - it restores the instant confirmation path for every customer. Then watch for `returned` events with source `authorize_net_iframe` in `payment_events`.
2. **Authorize.Net support:** look up tx 121811467250 (Dan Johnson). If the submit time is ~16:26 UTC (1:26 pm Atlantic), the customer paid on time and the hour-long webhook delay is theirs to explain. Consider a support ticket referencing notification ids `208cec4a-4481-4304-b39d-751c4d262bed`, `b335873e-de5c-4c30-8662-77242a46a557`, `5fca7630-6ed7-4db2-b266-dea4c126a224`.
3. Reconcile every Sept 4 gateway transaction against bookings (needs production API credentials) to rule out charges we never received any webhook for.

## How to check it is working after deploy

- Server log on boot: `[reconcile] gateway payment reconciliation every 60s`.
- `payment_events` will show `reconciled_from_gateway` + `approved` (source `gateway_reconciliation`) for any payment the webhook was late on, and `late_payment_seat_reclaimed` when a lapsed hold was recovered.
- Every quarantine logs `review_alert_email` with `ok: true` and the recipient count; super users receive "ACTION: Paid booking has no seat".
