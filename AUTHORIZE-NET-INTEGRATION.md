# Authorize.Net Integration Plan — Wolastoq BINGO

**Project:** Saint Mary's Entertainment Centre — Bingo Ticket Booking System
**Repo:** `hilbellah/Bingo` → Render service `bingo-jk2h` (https://bingo-jk2h.onrender.com)
**Stack:** Node 18 / Express 4 / Socket.io 4 / sql.js (SQLite) / React 18 + Vite
**Author of this doc:** Sir Hilbert (drafted with Claude)
**Date:** 2026-05-07
**Status:** PROPOSAL — nothing in production has been changed yet.

---

## 0. TL;DR

1. **You can probably use Authorize.Net**, but bingo is a "high-risk" MCC. Confirm acceptance with the merchant-account underwriter BEFORE coding.
2. **Use the "Accept Hosted" integration.** Lowest PCI burden (SAQ A), least code, your server never touches card data.
3. **Your current booking flow must be split into two stages**: create-as-pending → redirect to Authorize.Net → verify on return → mark paid. Right now `POST /api/bookings` marks bookings `paid` instantly with no payment processor — that has to change.
4. **Add a webhook handler** so you don't lose payments when customers close the browser tab.
5. **Test everything in the sandbox first** (`apitest.authorize.net` + `https://test.authorize.net/gateway/transact.dll`).

---

## 1. Business Prerequisites (do these BEFORE writing any code)

### 1.1 Merchant Category Code (MCC) approval — THE BIG RISK
Bingo halls fall under "gaming/gambling" categories, which most North American payment processors flag as **high-risk**. Authorize.Net's standard underwriting can decline these.

**Action items:**
- [ ] When applying, describe the business as "**community/charitable bingo ticket sales for Saint Mary's First Nation Entertainment Centre**" — emphasize the charitable/non-profit nature if it applies.
- [ ] Ask the underwriter explicitly whether MCC 7995 (gambling), 8398 (charitable), or 7999 (recreation) will be assigned. Different MCCs have different fees and rules.
- [ ] Get written confirmation that bingo ticket sales are acceptable on the account before paying gateway fees.
- [ ] If declined, alternatives that are friendlier to gaming merchants in Canada/US:
    - **Moneris** (Canada, strong)
    - **Helcim** (Canada-based, transparent)
    - **Square** (some bingo categories)
    - High-risk specialists: PayKings, Soar Payments, Easy Pay Direct

### 1.2 Accounts you need to open
| Item | Where | Cost (approx) | Notes |
|---|---|---|---|
| Merchant account | Bank or ISO that resells Authorize.Net | ~2.9% + $0.30/txn | Required to receive funds |
| Authorize.Net gateway | https://www.authorize.net/ | ~$25/mo + $0.10/txn | The API/dashboard |
| Authorize.Net **sandbox** | https://developer.authorize.net/ | FREE | Open this TODAY, dev with this |
| SSL certificate | Render provides automatically | Included | Required for production |

### 1.3 Currency
- Saint Mary's is in New Brunswick, Canada → you almost certainly want **CAD**.
- Confirm during merchant-account application that the processor settles in CAD. Authorize.Net supports CAD with Canadian merchants but the **processor** (the bank behind the gateway) is what determines settlement currency.

---

## 2. Credentials You'll Receive

Once your gateway account is live, log into the Authorize.Net Merchant Interface and grab:

| Credential | Where in dashboard | Used for |
|---|---|---|
| **API Login ID** | Account → API Credentials & Keys | Identifies your account on every API call |
| **Transaction Key** | Same page (generate new) | Server-side authentication |
| **Signature Key** | Same page | Verifying webhooks (HMAC-SHA512) |
| **Public Client Key** | Same page | Optional — only needed if you use Accept.js instead of Accept Hosted |
| **Webhook(s)** | Account → Settings → Webhooks | Server endpoint URL Authorize.Net pings on events |

**Sandbox vs Production:**
- Sandbox base URL: `https://apitest.authorize.net/xml/v1/request.api`
- Production base URL: `https://api.authorize.net/xml/v1/request.api`
- Sandbox hosted page: `https://test.authorize.net/payment/payment`
- Production hosted page: `https://accept.authorize.net/payment/payment`

The credentials are **different** between sandbox and production — store both in your env vars and switch by environment.

---

## 3. Choose Integration Style

### Recommended: **Accept Hosted** ✅
- Card data is entered on Authorize.Net's hosted page (iframe or full redirect).
- Your server never sees PAN/CVV → you self-attest the **simplest** PCI form (SAQ A).
- Less code, fewer ways to break.

### Not recommended for you
| Option | Why skip |
|---|---|
| **Accept.js** (drop-in card field) | Slightly nicer UX, but you must self-attest SAQ A-EP and ensure no analytics/tag-manager scripts can ever touch the form. Not worth it. |
| **AIM / Direct Post** | Full PCI scope (SAQ D). You'd be on the hook for full annual security audits. Hard pass. |
| **CIM** (Customer Info Manager) | Stores cards for recurring billing. You don't need it — bingo is one-off purchases. |

The rest of this document assumes Accept Hosted.

---

## 4. Architectural Changes Required

### 4.1 Today's flow (server/src/index.js, around line 233–460)
```
Customer clicks "Confirm" 
  → POST /api/bookings
    → seats are flipped 'held' → 'sold' immediately
    → bookings row inserted with payment_status='paid'   ❌ no money was taken!
    → confirmation email sent
```

This worked when the system was demo/comp-only. With real card payments, you cannot mark anything `paid` until Authorize.Net says so.

### 4.2 New flow
```
Customer clicks "Confirm"
  → POST /api/bookings/initiate          (NEW)
      • validates session/seats/PHD inventory exactly as today
      • inserts booking with payment_status='pending'
      • inserts booking_items / booking_addons
      • seats stay 'held' (NOT 'sold')
      • calls Authorize.Net getHostedPaymentPageRequest
      • returns { token, redirectUrl, bookingId }

Frontend redirects browser → Authorize.Net hosted page
  
Customer pays on Authorize.Net's page
  → Authorize.Net redirects browser back to /payment/return?bookingId=XYZ
  → Authorize.Net calls webhook → POST /api/webhooks/authorize-net

GET /api/payment/return                  (NEW)
  → server calls getTransactionDetailsRequest to verify outcome
  → if approved: flip booking to 'paid', flip seats 'held' → 'sold', send email
  → if declined/cancelled: release holds, mark 'failed'
  → redirect customer to /booking/:id (existing receipt page)

POST /api/webhooks/authorize-net         (NEW)
  → verifies HMAC-SHA512 signature using Signature Key
  → handles event 'net.authorize.payment.authcapture.created'
  → idempotent — same as /payment/return logic, used as backup if customer closes the tab
```

The webhook is the **safety net**. Customers WILL close tabs after paying. Without a webhook, those bookings would stay stuck in `pending` forever.

### 4.3 Idempotency
Both `/payment/return` and `/api/webhooks/authorize-net` may fire for the same booking. Wrap the "flip to paid" logic with:
```
if (booking.payment_status === 'paid') return earlySuccess();
```
…and only execute the seat-flip + email send once.

---

## 5. Database Schema Changes

Add a new migration in `server/src/migrate.js`. Do NOT drop or rename existing columns — keep the existing booking flow working until cutover.

```sql
-- New columns on bookings
ALTER TABLE bookings ADD COLUMN payment_provider TEXT DEFAULT 'authorize_net';
ALTER TABLE bookings ADD COLUMN transaction_id TEXT;        -- Authorize.Net trans ID
ALTER TABLE bookings ADD COLUMN auth_code TEXT;             -- Authorize.Net auth code
ALTER TABLE bookings ADD COLUMN payment_attempted_at TEXT;  -- ISO timestamp
ALTER TABLE bookings ADD COLUMN payment_completed_at TEXT;  -- ISO timestamp
ALTER TABLE bookings ADD COLUMN payment_failure_reason TEXT;
ALTER TABLE bookings ADD COLUMN hosted_token TEXT;          -- short-lived token from Authorize.Net

CREATE INDEX IF NOT EXISTS idx_bookings_transaction_id ON bookings(transaction_id);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);

-- Optional: a payment_events log for audit/debug
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  event_type TEXT NOT NULL,        -- 'initiated','redirected','returned','webhook','approved','declined','refunded'
  source TEXT NOT NULL,            -- 'server','authorize_net_webhook','admin'
  raw_payload TEXT,                -- JSON dump of the event
  created_at TEXT NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);
CREATE INDEX IF NOT EXISTS idx_payment_events_booking ON payment_events(booking_id);
```

Update `payment_status` allowed values to include: `pending`, `paid`, `failed`, `cancelled`, `refunded`, `voided`. (sql.js doesn't enforce CHECK constraints by default, so this is a code-level convention — but document it.)

---

## 6. Environment Variables (add to `server/.env` AND Render dashboard)

```env
# Authorize.Net — switch ANET_ENV between 'sandbox' and 'production'
ANET_ENV=sandbox
ANET_API_LOGIN_ID=
ANET_TRANSACTION_KEY=
ANET_SIGNATURE_KEY=
ANET_PUBLIC_CLIENT_KEY=          # optional, only if you ever switch to Accept.js

# URLs your Authorize.Net page will redirect/post back to
PUBLIC_BASE_URL=https://bingo-jk2h.onrender.com
ANET_RETURN_URL=https://bingo-jk2h.onrender.com/payment/return
ANET_CANCEL_URL=https://bingo-jk2h.onrender.com/payment/cancel
ANET_WEBHOOK_PATH=/api/webhooks/authorize-net

# Currency for the line items
ANET_CURRENCY=CAD
```

**Render config:** Add these in the Render dashboard under your service → Environment, NOT in `render.yaml` (so secrets aren't committed). Update `render.yaml` to declare them with `sync: false` so Render knows they exist but doesn't write the values.

---

## 7. Server-Side Code Changes

### 7.1 Install the SDK
```bash
cd server
npm install authorizenet
```
Authorize.Net's official Node SDK is `authorizenet`. It wraps the XML/JSON API. Alternatively you can hit the JSON API directly with `fetch` — fewer dependencies, more code. Pick one.

### 7.2 New file: `server/src/services/payments.js`
Skeleton — adapt to your style. Key responsibilities:
- `createHostedPaymentPage({ bookingId, amount, email, refNumber })` → returns `{ token, redirectUrl }`
- `verifyTransaction(transId)` → returns `{ approved, authCode, amount, raw }`
- `verifyWebhookSignature(rawBody, headerSignature)` → boolean
- `refundTransaction({ transId, amount, last4 })` → returns `{ ok, raw }`

```js
// server/src/services/payments.js
import { APIContracts, APIControllers, Constants } from 'authorizenet';
import crypto from 'crypto';

const ENV = process.env.ANET_ENV === 'production'
  ? Constants.endpoint.production
  : Constants.endpoint.sandbox;

const HOSTED_BASE = process.env.ANET_ENV === 'production'
  ? 'https://accept.authorize.net/payment/payment'
  : 'https://test.authorize.net/payment/payment';

function merchantAuth() {
  const m = new APIContracts.MerchantAuthenticationType();
  m.setName(process.env.ANET_API_LOGIN_ID);
  m.setTransactionKey(process.env.ANET_TRANSACTION_KEY);
  return m;
}

export async function createHostedPaymentPage({ bookingId, amount, email, refNumber }) {
  return new Promise((resolve, reject) => {
    const tx = new APIContracts.TransactionRequestType();
    tx.setTransactionType(APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
    tx.setAmount(Number(amount).toFixed(2));
    tx.setCurrencyCode(process.env.ANET_CURRENCY || 'CAD');

    const order = new APIContracts.OrderType();
    order.setInvoiceNumber(refNumber);
    order.setDescription(`Wolastoq Bingo booking ${refNumber}`);
    tx.setOrder(order);

    const customer = new APIContracts.CustomerDataType();
    customer.setEmail(email);
    tx.setCustomer(customer);

    // Hosted page settings
    const settings = [];
    const push = (name, value) => {
      const s = new APIContracts.SettingType();
      s.setSettingName(name);
      s.setSettingValue(JSON.stringify(value));
      settings.push(s);
    };
    push('hostedPaymentReturnOptions', {
      showReceipt: false,
      url: `${process.env.ANET_RETURN_URL}?bookingId=${bookingId}`,
      urlText: 'Continue',
      cancelUrl: process.env.ANET_CANCEL_URL,
      cancelUrlText: 'Cancel'
    });
    push('hostedPaymentButtonOptions', { text: 'Pay Now' });
    push('hostedPaymentOrderOptions', { show: true, merchantName: "Saint Mary's Bingo" });
    push('hostedPaymentPaymentOptions', { cardCodeRequired: true, showCreditCard: true });
    push('hostedPaymentBillingAddressOptions', { show: true, required: false });
    push('hostedPaymentCustomerOptions', { showEmail: true, requiredEmail: true, addPaymentProfile: false });

    const arrayList = new APIContracts.ArrayOfSetting();
    arrayList.setSetting(settings);

    const req = new APIContracts.GetHostedPaymentPageRequest();
    req.setMerchantAuthentication(merchantAuth());
    req.setTransactionRequest(tx);
    req.setHostedPaymentSettings(arrayList);

    const ctrl = new APIControllers.GetHostedPaymentPageController(req.getJSON());
    ctrl.setEnvironment(ENV);
    ctrl.execute(() => {
      const apiResponse = ctrl.getResponse();
      const response = new APIContracts.GetHostedPaymentPageResponse(apiResponse);
      if (response && response.getMessages().getResultCode() === APIContracts.MessageTypeEnum.OK) {
        resolve({ token: response.getToken(), redirectUrl: HOSTED_BASE });
      } else {
        const msg = response?.getMessages()?.getMessage()?.[0]?.getText() || 'Unknown error';
        reject(new Error(`Authorize.Net hosted page error: ${msg}`));
      }
    });
  });
}

export async function verifyTransaction(transId) {
  return new Promise((resolve, reject) => {
    const req = new APIContracts.GetTransactionDetailsRequest();
    req.setMerchantAuthentication(merchantAuth());
    req.setTransId(String(transId));

    const ctrl = new APIControllers.GetTransactionDetailsController(req.getJSON());
    ctrl.setEnvironment(ENV);
    ctrl.execute(() => {
      const apiResponse = ctrl.getResponse();
      const response = new APIContracts.GetTransactionDetailsResponse(apiResponse);
      if (response && response.getMessages().getResultCode() === APIContracts.MessageTypeEnum.OK) {
        const t = response.getTransaction();
        resolve({
          approved: t.getResponseCode() === '1' || t.getResponseCode() === 1,
          status: t.getTransactionStatus(),
          authCode: t.getAuthCode(),
          amount: t.getAuthAmount(),
          raw: response
        });
      } else {
        reject(new Error('Could not fetch transaction details'));
      }
    });
  });
}

// HMAC-SHA512 signature verification for webhooks
export function verifyWebhookSignature(rawBodyString, signatureHeader) {
  if (!signatureHeader || !process.env.ANET_SIGNATURE_KEY) return false;
  // Header format: "sha512=ABCDEF..."
  const expectedHex = crypto
    .createHmac('sha512', process.env.ANET_SIGNATURE_KEY)
    .update(rawBodyString, 'utf8')
    .digest('hex')
    .toUpperCase();
  const provided = signatureHeader.replace(/^sha512=/i, '').toUpperCase();
  return crypto.timingSafeEqual(Buffer.from(expectedHex), Buffer.from(provided));
}
```

### 7.3 New routes in `server/src/index.js`
Refactor existing `POST /api/bookings` into `POST /api/bookings/initiate` (keep the validation + insert logic, but stop at `payment_status='pending'` and DON'T flip seats to `sold`). Then add three new endpoints:

```js
// 1) INITIATE — call Authorize.Net for a hosted-page token
app.post('/api/bookings/initiate', async (req, res) => {
  // ... existing validation, PHD inventory checks, holds verification ...
  // ... insert bookings row with payment_status='pending', booking_items, booking_addons ...
  // ... DO NOT update seats to 'sold' here. Do extend held_until by ~15 min so they don't expire mid-payment ...

  try {
    const { token, redirectUrl } = await createHostedPaymentPage({
      bookingId,
      amount: totalAmount,
      email: trimmedEmail,
      refNumber
    });
    run(`UPDATE bookings SET hosted_token = ?, payment_attempted_at = ? WHERE id = ?`,
      [token, new Date().toISOString(), bookingId]);
    saveDb();
    logPaymentEvent(bookingId, 'initiated', 'server', { token: token.slice(0, 8) + '…' });
    res.json({ bookingId, redirectUrl, token });
  } catch (err) {
    // refund the holds-extension by leaving seats as 'held' — cleanup job will release them
    run(`UPDATE bookings SET payment_status = 'failed', payment_failure_reason = ? WHERE id = ?`,
      [String(err.message).slice(0, 500), bookingId]);
    saveDb();
    res.status(502).json({ error: 'Could not start payment. Please try again.' });
  }
});

// 2) RETURN — customer comes back from Authorize.Net hosted page
app.get('/payment/return', async (req, res) => {
  const { bookingId } = req.query;
  // Authorize.Net also POSTs transaction details to this URL with form fields
  // including transId. Either accept POST or use GET + lookup-by-bookingId.
  // The safest path: lookup the most recent transaction by bookingId via getTransactionDetailsRequest
  // is NOT possible without a transId. Better: capture transId from POST body OR rely on the webhook.
  //
  // Pattern: redirect customer to a "processing..." page that polls /api/bookings/:id/status
  // until webhook flips it to paid/failed.
  return res.redirect(`/booking/${bookingId}/processing`);
});

// 3) WEBHOOK — Authorize.Net pings here on every payment event
import express from 'express';
const rawJson = express.raw({ type: 'application/json' });
app.post('/api/webhooks/authorize-net', rawJson, async (req, res) => {
  const raw = req.body.toString('utf8');
  const sig = req.get('X-ANET-Signature');
  if (!verifyWebhookSignature(raw, sig)) return res.status(401).end();

  const event = JSON.parse(raw);
  const { eventType, payload } = event;
  // payload.id is the transaction id, payload.merchantReferenceId or invoice number is your refNumber
  const transId = payload?.id;
  const invoiceNumber = payload?.merchantReferenceId || payload?.invoiceNumber;

  // Look up booking by reference_number (which we set as invoiceNumber)
  const booking = get('SELECT * FROM bookings WHERE reference_number = ?', [invoiceNumber]);
  if (!booking) return res.status(202).end(); // unknown — ack so Authorize.Net stops retrying

  if (eventType === 'net.authorize.payment.authcapture.created') {
    if (booking.payment_status === 'paid') return res.status(200).end(); // idempotent
    const verify = await verifyTransaction(transId);
    if (verify.approved) {
      flipBookingToPaid(booking, transId, verify.authCode);
    } else {
      flipBookingToFailed(booking, 'declined');
    }
  } else if (eventType === 'net.authorize.payment.refund.created') {
    flipBookingToRefunded(booking, transId);
  } else if (eventType === 'net.authorize.payment.void.created') {
    flipBookingToVoided(booking, transId);
  }
  res.status(200).end();
});
```

`flipBookingToPaid()` is essentially the second half of your existing `POST /api/bookings` handler (the part that flips seats to `sold`, fires `seat:sold`, fires `booking:new` to the admin receipts socket room, sends the confirmation email, and emits PHD inventory updates). Pull that into a function so both `/payment/return` and the webhook can call it idempotently.

### 7.4 Don't forget the sql.js write flush
Your `database.js` debounces writes by 500ms. For payment events, **call `saveDb()` synchronously** after the flip-to-paid block, exactly as your current booking handler does at line ~437. A crash 400ms after a successful payment flip would otherwise lose the `paid` state.

---

## 8. Client-Side Code Changes

### 8.1 In `client/src/api.js` (or wherever booking submit lives)
Replace the call that today hits `POST /api/bookings` (and shows a receipt) with:
```js
const res = await fetch('/api/bookings/initiate', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
const { redirectUrl, token, bookingId } = await res.json();

// Build a self-submitting form so the browser POSTs the token to Authorize.Net
const form = document.createElement('form');
form.method = 'POST';
form.action = redirectUrl;
const input = document.createElement('input');
input.type = 'hidden';
input.name = 'token';
input.value = token;
form.appendChild(input);
document.body.appendChild(form);
form.submit();
```
The token is short-lived (~15 min). Once submitted, the browser is on Authorize.Net's domain.

### 8.2 New page: `/booking/:id/processing`
After return from Authorize.Net, your customer lands here. The page:
1. Shows a spinner with "Confirming your payment…"
2. Polls `GET /api/bookings/:id/status` every 2 seconds
3. When `status = 'paid'`, redirect to your existing receipt page `/booking/:id`
4. When `status = 'failed'`, show "Payment was declined" with a "Try again" button that re-runs `/api/bookings/initiate` (reusing the held seats — don't re-validate inventory unless seats have already expired)
5. After 60 seconds without resolution, show "Still processing — we'll email you the receipt" (the webhook will handle it)

### 8.3 Hold-extension UX
Your current `held_until` is `SESSION_HOLD_MINUTES=10`. A customer can easily take 10 minutes on Authorize.Net's page. **Extend the hold to 20 min** when `/initiate` is called, so seats don't get released mid-payment.

---

## 9. Render Deployment Changes

### 9.1 `render.yaml` updates
Add the new env vars with `sync: false` (so Render knows about them but the actual values are set in the dashboard):
```yaml
      - key: ANET_ENV
        value: sandbox          # flip to 'production' after go-live testing
      - key: ANET_API_LOGIN_ID
        sync: false
      - key: ANET_TRANSACTION_KEY
        sync: false
      - key: ANET_SIGNATURE_KEY
        sync: false
      - key: ANET_PUBLIC_CLIENT_KEY
        sync: false
      - key: PUBLIC_BASE_URL
        value: https://bingo-jk2h.onrender.com
      - key: ANET_RETURN_URL
        value: https://bingo-jk2h.onrender.com/payment/return
      - key: ANET_CANCEL_URL
        value: https://bingo-jk2h.onrender.com/payment/cancel
      - key: ANET_CURRENCY
        value: CAD
      - key: SESSION_HOLD_MINUTES
        value: "20"             # bumped from 10 to survive the hosted-page detour
```

### 9.2 Free plan caveat
Render free services spin down after 15 minutes of inactivity. **A cold start is 30–60 seconds.** That's a problem for:
- The `/payment/return` redirect (customer waits, may give up)
- The webhook (Authorize.Net retries with backoff, so eventually OK, but adds latency to email confirmations)

**Recommendation:** Upgrade to **Starter ($7/mo)** before taking real money. It's the cheapest fix and removes the cold-start risk entirely. Document this in your launch checklist.

### 9.3 Webhook URL registration
After deploy, in the Authorize.Net dashboard → Account → Settings → Webhooks → Add Endpoint:
- URL: `https://bingo-jk2h.onrender.com/api/webhooks/authorize-net`
- Events:
    - `net.authorize.payment.authcapture.created`
    - `net.authorize.payment.refund.created`
    - `net.authorize.payment.void.created`
    - (optional) `net.authorize.payment.fraud.held` and `net.authorize.payment.fraud.declined`

Test it from the dashboard's "Send Test" button before any real customer touches the system.

---

## 10. Refunds and Admin Actions

The admin dashboard should grow a "Refund" button on a booking. Refund flow:
1. Admin clicks Refund on `bookings/:id`
2. Server calls Authorize.Net `createTransactionRequest` with `transactionType=refundTransaction` and the original `transactionId` + last-4 of card.
3. On success, mark `payment_status='refunded'`, optionally release the seats back to `vacant` (or keep them `sold` if the bingo session already happened — your business call).
4. Send a refund-confirmation email via your existing `email.js`.

**Important:** Authorize.Net only allows a refund **after settlement** (usually next business day). Before settlement you must use **void** instead. Build both buttons or auto-decide based on settlement status.

---

## 11. Testing Plan (Sandbox)

### 11.1 Test cards
In sandbox, use these — they trigger different responses:
| Card number | Expected outcome |
|---|---|
| 4111 1111 1111 1111 | Approved (Visa) |
| 5424 0000 0000 0015 | Approved (Mastercard) |
| 4222 2222 2222 2 | Decline |
| 4000 0000 0000 0002 | Decline (test general) |
| any expired date past today | Approved still in sandbox |
| CVV 123 | OK |
| Trigger amounts: e.g. amount of $70.01 → approved, $70.02 → declined (varies) |

### 11.2 Test cases to walk through
- [ ] Happy path: held seats → initiate → pay sandbox card → return → seats `sold`, email sent
- [ ] Customer closes tab after paying → webhook still fires → seats `sold`, email sent
- [ ] Customer clicks Cancel on hosted page → returns to `/payment/cancel` → seats stay `held`, booking marked `cancelled`
- [ ] Card declined → returns to processing page → message shown → user retries with different card (same booking, same held seats, new transaction)
- [ ] Hold expires during payment (test by setting `SESSION_HOLD_MINUTES=1`) → graceful failure with "Sorry, your seats were released"
- [ ] Two browsers race for the same seat → second `/initiate` call should fail at hold-validation step
- [ ] Webhook fires twice → second one is a no-op (idempotency check)
- [ ] Webhook arrives with bad signature → 401, no DB changes
- [ ] Refund from admin dashboard → booking marked `refunded`, refund email sent
- [ ] PHD inventory: pay with PHD add-on → inventory decrements → confirm `/api/phd-inventory` returns lower number
- [ ] Multi-attendee booking with mix of packages → totalAmount on Authorize.Net side matches our calculation exactly

---

## 12. Go-Live Checklist

- [ ] Merchant account approved with bingo MCC accepted in writing
- [ ] Production Authorize.Net credentials issued
- [ ] Render upgraded from Free to at least Starter
- [ ] All env vars set in Render dashboard (production values)
- [ ] `ANET_ENV=production` flipped
- [ ] Webhook URL registered in production Authorize.Net dashboard
- [ ] Test transaction with a real card for $1 → refund it → confirm refund clears
- [ ] Confirmation email actually arrives (Resend / nodemailer working)
- [ ] Existing admin "create comp booking" path still works (we kept old `POST /api/bookings` for staff)
- [ ] Logging: every payment event written to `payment_events` AND to your existing `audit_log`
- [ ] Privacy/PCI: confirm no card data ever lands in your logs (`logger.js` should sanitize anything that looks like a PAN or CVV — though with Accept Hosted it shouldn't, double-check)
- [ ] Updated terms-of-purchase / refund policy on the public site
- [ ] Phone number for customer support shown on the receipt page

---

## 13. Files That Will Change (summary)

| File | Change type |
|---|---|
| `server/package.json` | Add `authorizenet` dependency |
| `server/src/migrate.js` | New ALTER TABLE migrations |
| `server/src/services/payments.js` | NEW |
| `server/src/index.js` | Refactor `POST /api/bookings`, add `/api/bookings/initiate`, `/payment/return`, `/payment/cancel`, `/api/webhooks/authorize-net`, `GET /api/bookings/:id/status` |
| `server/.env` | Add Authorize.Net keys (sandbox first) |
| `render.yaml` | Add env var declarations |
| `client/src/api.js` | Switch booking submit to /initiate + redirect-form pattern |
| `client/src/` (new page) | `BookingProcessing.jsx` polling page |
| `client/src/` (new page) | `PaymentCancel.jsx` |
| Admin dashboard | Add "Refund" / "Void" button + `POST /api/admin/bookings/:id/refund` endpoint |

---

## 14. Open Questions for You (Sir Hilbert) Before We Code

1. **Currency:** confirming CAD for Saint Mary's, yes?
2. **Comp/admin bookings:** should staff still be able to create no-payment bookings (e.g. for VIP / staff family)? If yes, we keep the old endpoint behind admin auth and add `payment_status='comp'`.
3. **Tax:** does Authorize.Net need to know the tax breakdown, or is the ticket price tax-inclusive? (Affects whether we send a `TaxType` block.)
4. **Cancel-and-refund window:** if a customer cancels a session ticket, do they get a refund automatically, or is that a manual admin step?
5. **Receipt:** keep your custom email receipt, or also let Authorize.Net send their own? (Recommend keeping yours; it's already branded.)
6. **Domain:** still using `bingo-jk2h.onrender.com`, or moving to a custom domain like `tickets.stmec.ca` before launch? (Custom domain is better for trust at the payment step.)

---

## 15. Estimated Effort

| Phase | Time |
|---|---|
| Sandbox account setup + first successful test charge from Postman | 2–3 hours |
| Backend integration (services/payments.js + new routes + migration) | 1 day |
| Frontend changes (initiate flow + processing page) | 0.5 day |
| Webhook + idempotency + payment_events logging | 0.5 day |
| Admin refund/void UI | 0.5 day |
| End-to-end sandbox testing (all cases in §11.2) | 1 day |
| Production credentials + go-live + smoke test | 0.5 day |
| **Total** | **~4 working days** |

---

*Nothing in this document has been applied to the codebase yet. When you're ready, tell Claude which section to start with — recommended order: §1 (merchant approval) → §11 (sandbox setup) → §5 (migration) → §7 (server) → §8 (client) → §10 (admin) → §12 (go-live).*
