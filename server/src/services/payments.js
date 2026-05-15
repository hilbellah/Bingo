// Authorize.Net payment integration service.
//
// Wraps the Authorize.Net Node SDK with a small, well-typed API surface
// designed for our booking flow. Functions never throw — they return
// { ok, ..., error } objects the caller can branch on. This matches the
// pattern in email.js so booking handlers handle payment results the same
// way they handle email results.
//
// Integration style: Accept Hosted (lowest PCI burden — SAQ A).
//   - Customer is redirected to a hosted page on Authorize.Net's domain
//   - Our server never sees PAN / CVV
//   - We get a short-lived token from getHostedPaymentPage and post it via
//     a self-submitting form in the client
//
// Money convention:
//   The rest of the codebase stores money as INTEGER CENTS
//   (bookings.total_amount, packages.price, booking_items.price). This
//   module accepts the same — pass amountCents, we convert to the
//   "dollars.cents" string Authorize.Net expects.
//
// Environment variables (all read from process.env at call time, NOT at
// module load — supports tests that mock env and runtime hot-swaps):
//
//   ANET_ENV             "sandbox" (default) or "production". Determines
//                        both the API endpoint and the hosted-page redirect
//                        URL base. The credentials must match the env.
//   ANET_API_LOGIN_ID    Required. Identifies your merchant account.
//   ANET_TRANSACTION_KEY Required. 16-char alphanumeric, used as the
//                        server-side auth secret for API calls.
//   ANET_SIGNATURE_KEY   Required for webhook verification. 128-char hex.
//                        HMAC-SHA512 key for verifying webhook payloads.
//                        Decoded from hex to bytes before use.
//   ANET_CURRENCY        Default "USD". Set to "CAD" in production once the
//                        merchant account is bound to a Canadian processor.
//   ANET_RETURN_URL      Where Authorize.Net sends the customer after they
//                        complete payment on the hosted page. Must be a
//                        public URL (Authorize.Net cannot redirect to
//                        localhost — use ngrok for local dev if you want
//                        to test the redirect path).
//   ANET_CANCEL_URL      Where Authorize.Net sends the customer if they
//                        click Cancel on the hosted page.
//   ANET_MERCHANT_NAME   Optional display name on the hosted payment page.
//   ANET_PAYMENT_BG_COLOR Optional hosted page background color. Default
//                        matches the site brand blue.
//   ANET_PAY_BUTTON_TEXT Optional hosted payment submit button label.
//   ANET_RETURN_BUTTON_TEXT Optional receipt/return button label.
//   ANET_CANCEL_BUTTON_TEXT Optional cancel button label.
//   ANET_IFRAME_COMMUNICATOR_URL Optional HTTPS URL for the small static
//                        callback page required when Accept Hosted is embedded
//                        in our branded payment screen. Defaults to
//                        PUBLIC_BASE_URL/IFrameCommunicator.html, or the same
//                        origin as ANET_RETURN_URL.
//
// Endpoints used:
//   API:           https://apitest.authorize.net/xml/v1/request.api (sandbox)
//                  https://api.authorize.net/xml/v1/request.api (production)
//   Hosted page:   https://test.authorize.net/payment/payment (sandbox)
//                  https://accept.authorize.net/payment/payment (production)

import pkg from 'authorizenet';
import crypto from 'crypto';

const { APIContracts, APIControllers, Constants } = pkg;

// ---------- Config helpers (lazy reads — no module-load freeze) ----------

function isProduction() {
  return process.env.ANET_ENV === 'production';
}

function getEndpointConst() {
  return isProduction() ? Constants.endpoint.production : Constants.endpoint.sandbox;
}

function getHostedBaseUrl() {
  return isProduction()
    ? 'https://accept.authorize.net/payment/payment'
    : 'https://test.authorize.net/payment/payment';
}

function getMerchantAuth() {
  const loginId = process.env.ANET_API_LOGIN_ID;
  const txKey = process.env.ANET_TRANSACTION_KEY;
  if (!loginId || !txKey) {
    throw new Error('payments: ANET_API_LOGIN_ID and ANET_TRANSACTION_KEY must be set in env');
  }
  const m = new APIContracts.MerchantAuthenticationType();
  m.setName(loginId);
  m.setTransactionKey(txKey);
  return m;
}

/** Convert integer cents to the "1234.56" string Authorize.Net expects. */
function centsToDollarString(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`payments: invalid amountCents value: ${cents}`);
  }
  return (n / 100).toFixed(2);
}

function hostedPaymentTheme() {
  const merchantName = process.env.ANET_MERCHANT_NAME || 'Saint Marys Entertainment Centre';
  return {
    bgColor: process.env.ANET_PAYMENT_BG_COLOR || '#1a3a5c',
    payButtonText: process.env.ANET_PAY_BUTTON_TEXT || 'Pay Securely',
    returnButtonText: process.env.ANET_RETURN_BUTTON_TEXT || 'Proceed with Payment',
    cancelButtonText: process.env.ANET_CANCEL_BUTTON_TEXT || 'Cancel Payment',
    merchantName: merchantName.replace(/[^\w\s]/g, '').slice(0, 60).trim() || 'Wolastoq Bingo',
  };
}

function getIframeCommunicatorUrl() {
  if (process.env.ANET_IFRAME_COMMUNICATOR_URL) {
    return process.env.ANET_IFRAME_COMMUNICATOR_URL;
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.ANET_RETURN_URL;
  if (!baseUrl) return '';

  try {
    const url = new URL(baseUrl);
    return `${url.origin}/IFrameCommunicator.html`;
  } catch {
    return '';
  }
}

// ---------- 1) Create hosted payment page (get redirect token) ----------

/**
 * Request a short-lived token from Authorize.Net that, when POSTed to the
 * hosted-page URL, displays the card-entry page to the customer with our
 * branding and return URL preconfigured.
 *
 * The client builds a self-submitting <form> with this token and POSTs it
 * to redirectUrl, which navigates the customer to Authorize.Net's domain.
 *
 * @param {Object} args
 * @param {string} args.bookingId      Our internal booking ID. Appended to
 *                                      the return URL so /payment/return knows
 *                                      which booking to reconcile.
 * @param {number} args.amountCents    Total to charge, in cents.
 * @param {string} args.email          Customer email — prefilled on hosted page.
 * @param {string} args.refNumber      Our reference number (BNG-XXXX).
 *                                      Sent as the Authorize.Net invoiceNumber
 *                                      so we can later look up by either.
 * @returns {Promise<{ok: boolean, token?: string, redirectUrl?: string, error?: string}>}
 */
export async function createHostedPaymentPage({ bookingId, amountCents, email, firstName, lastName, refNumber }) {
  if (!bookingId || !refNumber) {
    return { ok: false, error: 'createHostedPaymentPage: bookingId and refNumber required' };
  }

  let merchantAuth, amount;
  try {
    merchantAuth = getMerchantAuth();
    amount = centsToDollarString(amountCents);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return new Promise((resolve) => {
    const tx = new APIContracts.TransactionRequestType();
    tx.setTransactionType(APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
    tx.setAmount(amount);
    tx.setCurrencyCode(process.env.ANET_CURRENCY || 'USD');

    // Tie the Authorize.Net transaction back to our booking via invoiceNumber.
    const order = new APIContracts.OrderType();
    order.setInvoiceNumber(refNumber);
    order.setDescription(`Wolastoq Bingo booking ${refNumber}`);
    tx.setOrder(order);

    if (email) {
      const customer = new APIContracts.CustomerDataType();
      customer.setEmail(email);
      tx.setCustomer(customer);
    }

    if (firstName || lastName) {
      const billTo = new APIContracts.CustomerAddressType();
      if (firstName) billTo.setFirstName(String(firstName).slice(0, 50));
      if (lastName) billTo.setLastName(String(lastName).slice(0, 50));
      tx.setBillTo(billTo);
    }

    // Hosted-page settings — controls what the customer sees on Authorize.Net's domain.
    const settings = [];
    const pushSetting = (name, value) => {
      const s = new APIContracts.SettingType();
      s.setSettingName(name);
      s.setSettingValue(JSON.stringify(value));
      settings.push(s);
    };
    const returnUrl = process.env.ANET_RETURN_URL || '';
    const cancelUrl = process.env.ANET_CANCEL_URL || '';
    const theme = hostedPaymentTheme();
    pushSetting('hostedPaymentReturnOptions', {
      showReceipt: false,
      url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}bookingId=${encodeURIComponent(bookingId)}`,
      urlText: theme.returnButtonText,
      cancelUrl: `${cancelUrl}${cancelUrl.includes('?') ? '&' : '?'}bookingId=${encodeURIComponent(bookingId)}`,
      cancelUrlText: theme.cancelButtonText,
    });
    pushSetting('hostedPaymentButtonOptions', { text: theme.payButtonText });
    // Background color of the hosted page (frames the white form box).
    // Brand-blue-dark from the site theme settings. The form box itself stays
    // white for readability — only the page background takes this color.
    // For richer branding (logo, header text, color theming), use the
    // Authorize.Net merchant dashboard's "Hosted Payment Form" settings.
    pushSetting('hostedPaymentStyleOptions', { bgColor: theme.bgColor });
    // NOTE: Authorize.Net's merchantName parser rejects apostrophes (and likely
    // other non-alphanumeric punctuation). Keep this string letters/numbers/spaces only.
    // Customer sees this text on the hosted card-entry page next to the order summary.
    pushSetting('hostedPaymentOrderOptions', { show: true, merchantName: theme.merchantName });
    pushSetting('hostedPaymentPaymentOptions', { cardCodeRequired: true, showCreditCard: true, showBankAccount: false });
    pushSetting('hostedPaymentSecurityOptions', { captcha: false });
    pushSetting('hostedPaymentShippingAddressOptions', { show: false, required: false });
    // UX: hide the billing address form on the hosted page. The customer already
    // entered their info on our booking form (name, email), so re-collecting it
    // would feel redundant. They only need to enter card number / exp / CVV on
    // Authorize.Net's hosted page.
    // Tradeoff: AVS (Address Verification System) won't run. For low-risk
    // community bingo transactions this is acceptable. Re-enable show:true if
    // chargebacks become a concern.
    pushSetting('hostedPaymentBillingAddressOptions', { show: false });
    // Show the email field but pre-filled (from the customer data we passed
    // above) and NOT required — customer can glance at it to confirm without
    // having to type it again.
    pushSetting('hostedPaymentCustomerOptions', { showEmail: true, requiredEmail: false, addPaymentProfile: false });
    const iframeCommunicatorUrl = getIframeCommunicatorUrl();
    if (iframeCommunicatorUrl) {
      pushSetting('hostedPaymentIFrameCommunicatorUrl', { url: iframeCommunicatorUrl });
    }

    const arrayOfSettings = new APIContracts.ArrayOfSetting();
    arrayOfSettings.setSetting(settings);

    const req = new APIContracts.GetHostedPaymentPageRequest();
    req.setMerchantAuthentication(merchantAuth);
    req.setTransactionRequest(tx);
    req.setHostedPaymentSettings(arrayOfSettings);

    const ctrl = new APIControllers.GetHostedPaymentPageController(req.getJSON());
    ctrl.setEnvironment(getEndpointConst());
    ctrl.execute(() => {
      try {
        const apiResponse = ctrl.getResponse();
        if (!apiResponse) {
          console.error('[payments] hosted page: no response from Authorize.Net');
          return resolve({ ok: false, error: 'no_response' });
        }
        const response = new APIContracts.GetHostedPaymentPageResponse(apiResponse);
        if (response && response.getMessages().getResultCode() === APIContracts.MessageTypeEnum.OK) {
          const token = response.getToken();
          console.log(`[payments] hosted page token issued for ref=${refNumber} bookingId=${bookingId}`);
          return resolve({ ok: true, token, redirectUrl: getHostedBaseUrl() });
        }
        const msg = response?.getMessages()?.getMessage()?.[0];
        const code = msg?.getCode?.();
        const text = msg?.getText?.();
        console.error(`[payments] hosted page error code=${code} text=${text}`);
        return resolve({ ok: false, error: `${code || 'unknown'}: ${text || 'no message'}` });
      } catch (err) {
        console.error('[payments] hosted page exception:', err?.message || err);
        return resolve({ ok: false, error: err?.message || String(err) });
      }
    });
  });
}

// ---------- 2) Verify a transaction by transId ----------

/**
 * Fetch the current state of a transaction from Authorize.Net. Used by
 * /payment/return (where the customer's browser lands after paying) and by
 * the webhook handler to confirm a payment before flipping the booking.
 *
 * @param {string} transId  The Authorize.Net transaction id.
 * @returns {Promise<{ok: boolean, approved?: boolean, status?: string, authCode?: string, amountCents?: number, error?: string}>}
 */
export async function verifyTransaction(transId) {
  if (!transId) return { ok: false, error: 'verifyTransaction: transId required' };

  let merchantAuth;
  try {
    merchantAuth = getMerchantAuth();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return new Promise((resolve) => {
    const req = new APIContracts.GetTransactionDetailsRequest();
    req.setMerchantAuthentication(merchantAuth);
    req.setTransId(String(transId));

    const ctrl = new APIControllers.GetTransactionDetailsController(req.getJSON());
    ctrl.setEnvironment(getEndpointConst());
    ctrl.execute(() => {
      try {
        const apiResponse = ctrl.getResponse();
        if (!apiResponse) return resolve({ ok: false, error: 'no_response' });
        const response = new APIContracts.GetTransactionDetailsResponse(apiResponse);
        if (response.getMessages().getResultCode() !== APIContracts.MessageTypeEnum.OK) {
          const msg = response.getMessages().getMessage()[0];
          return resolve({ ok: false, error: `${msg.getCode()}: ${msg.getText()}` });
        }
        const t = response.getTransaction();
        const responseCode = t.getResponseCode?.();
        // responseCode: '1' = approved, '2' = declined, '3' = error, '4' = held for review
        const approved = String(responseCode) === '1';
        const status = t.getTransactionStatus?.(); // e.g. 'capturedPendingSettlement', 'settledSuccessfully'
        const authCode = t.getAuthCode?.();
        const authAmount = Number(t.getAuthAmount?.()) || 0;
        const invoiceNumber = t.getOrder?.()?.getInvoiceNumber?.() || null;
        // Extract the last 4 digits of the card from the response. The SDK
        // returns the card number masked (e.g. "XXXX1111"); we slice the last
        // 4. Refunds require this; voids don't but we return it anyway.
        const cardNumber = t.getPayment?.()?.getCreditCard?.()?.getCardNumber?.();
        const last4 = cardNumber ? String(cardNumber).slice(-4) : null;
        return resolve({
          ok: true,
          approved,
          status,
          authCode,
          responseCode,
          invoiceNumber,
          amountCents: Math.round(authAmount * 100),
          last4,
        });
      } catch (err) {
        console.error('[payments] verifyTransaction exception:', err?.message || err);
        return resolve({ ok: false, error: err?.message || String(err) });
      }
    });
  });
}

// ---------- 3) Verify webhook signature (HMAC-SHA512) ----------

/**
 * Verify an inbound Authorize.Net webhook by HMAC-SHA512 of the raw body.
 *
 * IMPORTANT: pass the RAW request body (the un-parsed Buffer or string).
 * Once you JSON.parse it, the formatting may change (whitespace, key order)
 * and the hash won't match.
 *
 * The signature key from the Authorize.Net dashboard is a 128-character hex
 * value. It must be decoded to bytes before being used as the HMAC key —
 * see Authorize.Net's developer forum and official samples.
 *
 * @param {string|Buffer} rawBody     The exact request body as received.
 * @param {string} signatureHeader    Value of the "X-ANET-Signature" header.
 *                                    Format: "sha512=ABCDEF..."
 * @returns {boolean}                 True if signature is valid.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const signatureKey = normalizeSignatureHex(process.env.ANET_SIGNATURE_KEY);
  const provided = normalizeSignatureHex(signatureHeader);
  if (!signatureKey || !provided) return false;

  if (!/^[A-F0-9]{128}$/.test(provided)) {
    console.error(`[payments] webhook: X-ANET-Signature format invalid (hex length=${provided.length})`);
    return false;
  }

  if (!/^[A-F0-9]{128}$/.test(signatureKey)) {
    console.error(`[payments] webhook: ANET_SIGNATURE_KEY format invalid (hex length=${signatureKey.length})`);
    return false;
  }

  let keyBuffer;
  try {
    keyBuffer = Buffer.from(signatureKey, 'hex');
    if (keyBuffer.length !== 64) {
      console.error('[payments] webhook: ANET_SIGNATURE_KEY is not 64 bytes when hex-decoded — check the value');
      return false;
    }
  } catch (err) {
    console.error('[payments] webhook: ANET_SIGNATURE_KEY not valid hex:', err?.message || err);
    return false;
  }

  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expected = crypto.createHmac('sha512', keyBuffer).update(bodyBuf).digest('hex').toUpperCase();

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function normalizeSignatureHex(value) {
  return String(value || '')
    .trim()
    .replace(/^sha512=/i, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

// ---------- 4) Refund (post-settlement) ----------

/**
 * Refund an already-settled transaction. If the transaction has NOT yet
 * settled (typically within the first ~24h), Authorize.Net will reject this
 * and you must use voidTransaction() instead. Check transaction status
 * via verifyTransaction() to decide which to call.
 *
 * @param {Object} args
 * @param {string} args.transId    Original transaction id.
 * @param {number} args.amountCents Amount to refund, in cents.
 * @param {string} args.last4      Last 4 digits of the card (Authorize.Net
 *                                  requires this for security).
 * @returns {Promise<{ok: boolean, refundTransId?: string, error?: string}>}
 */
export async function refundTransaction({ transId, amountCents, last4 }) {
  if (!transId || !amountCents || !last4) {
    return { ok: false, error: 'refundTransaction: transId, amountCents, last4 all required' };
  }

  let merchantAuth, amount;
  try {
    merchantAuth = getMerchantAuth();
    amount = centsToDollarString(amountCents);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return new Promise((resolve) => {
    const creditCard = new APIContracts.CreditCardType();
    // Authorize.Net's refund API only needs the last 4 (it joins by transId).
    // Pad to a 16-char placeholder with the last 4 at the end.
    creditCard.setCardNumber(`XXXXXXXXXXXX${String(last4).padStart(4, '0')}`);
    creditCard.setExpirationDate('XXXX');

    const payment = new APIContracts.PaymentType();
    payment.setCreditCard(creditCard);

    const tx = new APIContracts.TransactionRequestType();
    tx.setTransactionType(APIContracts.TransactionTypeEnum.REFUNDTRANSACTION);
    tx.setAmount(amount);
    tx.setPayment(payment);
    tx.setRefTransId(String(transId));

    const req = new APIContracts.CreateTransactionRequest();
    req.setMerchantAuthentication(merchantAuth);
    req.setTransactionRequest(tx);

    const ctrl = new APIControllers.CreateTransactionController(req.getJSON());
    ctrl.setEnvironment(getEndpointConst());
    ctrl.execute(() => {
      try {
        const apiResponse = ctrl.getResponse();
        if (!apiResponse) return resolve({ ok: false, error: 'no_response' });
        const response = new APIContracts.CreateTransactionResponse(apiResponse);
        const okOuter = response.getMessages().getResultCode() === APIContracts.MessageTypeEnum.OK;
        const txResp = response.getTransactionResponse();
        if (okOuter && txResp && txResp.getMessages()) {
          const refundTransId = txResp.getTransId();
          console.log(`[payments] refund OK transId=${transId} refundTransId=${refundTransId} amount=${amount}`);
          return resolve({ ok: true, refundTransId });
        }
        const errs = txResp?.getErrors?.()?.getError?.() || [];
        const detail = errs[0] ? `${errs[0].getErrorCode()}: ${errs[0].getErrorText()}` : null;
        const outerMsg = response.getMessages().getMessage()[0];
        const error = detail || `${outerMsg.getCode()}: ${outerMsg.getText()}`;
        console.error(`[payments] refund FAILED transId=${transId} error=${error}`);
        return resolve({ ok: false, error });
      } catch (err) {
        console.error('[payments] refundTransaction exception:', err?.message || err);
        return resolve({ ok: false, error: err?.message || String(err) });
      }
    });
  });
}

// ---------- 5) Void (pre-settlement) ----------

/**
 * Void an unsettled transaction. Use this when refundTransaction would fail
 * because the original transaction hasn't yet settled (typically within
 * ~24h of charge). After settlement, use refundTransaction instead.
 *
 * @param {string} transId  The transaction to void.
 * @returns {Promise<{ok: boolean, voidTransId?: string, error?: string}>}
 */
export async function voidTransaction(transId) {
  if (!transId) return { ok: false, error: 'voidTransaction: transId required' };

  let merchantAuth;
  try {
    merchantAuth = getMerchantAuth();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return new Promise((resolve) => {
    const tx = new APIContracts.TransactionRequestType();
    tx.setTransactionType(APIContracts.TransactionTypeEnum.VOIDTRANSACTION);
    tx.setRefTransId(String(transId));

    const req = new APIContracts.CreateTransactionRequest();
    req.setMerchantAuthentication(merchantAuth);
    req.setTransactionRequest(tx);

    const ctrl = new APIControllers.CreateTransactionController(req.getJSON());
    ctrl.setEnvironment(getEndpointConst());
    ctrl.execute(() => {
      try {
        const apiResponse = ctrl.getResponse();
        if (!apiResponse) return resolve({ ok: false, error: 'no_response' });
        const response = new APIContracts.CreateTransactionResponse(apiResponse);
        const okOuter = response.getMessages().getResultCode() === APIContracts.MessageTypeEnum.OK;
        const txResp = response.getTransactionResponse();
        if (okOuter && txResp && txResp.getMessages()) {
          const voidTransId = txResp.getTransId();
          console.log(`[payments] void OK transId=${transId} voidTransId=${voidTransId}`);
          return resolve({ ok: true, voidTransId });
        }
        const errs = txResp?.getErrors?.()?.getError?.() || [];
        const detail = errs[0] ? `${errs[0].getErrorCode()}: ${errs[0].getErrorText()}` : null;
        const outerMsg = response.getMessages().getMessage()[0];
        const error = detail || `${outerMsg.getCode()}: ${outerMsg.getText()}`;
        console.error(`[payments] void FAILED transId=${transId} error=${error}`);
        return resolve({ ok: false, error });
      } catch (err) {
        console.error('[payments] voidTransaction exception:', err?.message || err);
        return resolve({ ok: false, error: err?.message || String(err) });
      }
    });
  });
}
