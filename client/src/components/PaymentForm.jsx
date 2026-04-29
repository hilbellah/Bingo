import React, { useState } from 'react';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

// ---------- Payment validation helpers ----------
// Luhn checksum — every real credit card number passes this.
// Accepts ANY brand (Visa/MC/Amex/Discover/JCB/Diners/etc.) so we can keep
// testing with whichever card while still rejecting bogus input.
function luhnValid(rawNumber) {
  const digits = (rawNumber || '').replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (shouldDouble) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function detectCardBrand(rawNumber) {
  const n = (rawNumber || '').replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^6(?:011|5)/.test(n)) return 'discover';
  return '';
}

function formatCardNumberInput(input) {
  // Amex is 15 digits in 4-6-5 grouping; everything else groups as 4s up to 16.
  const digits = (input || '').replace(/\D/g, '').slice(0, 19);
  if (/^3[47]/.test(digits)) {
    const trimmed = digits.slice(0, 15);
    return [trimmed.slice(0, 4), trimmed.slice(4, 10), trimmed.slice(10, 15)]
      .filter(Boolean).join(' ');
  }
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiryInput(input) {
  const digits = (input || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + '/' + digits.slice(2);
}

function expiryValid(exp) {
  const m = (exp || '').match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const mm = parseInt(m[1], 10);
  return mm >= 1 && mm <= 12;
}

function cvvValid(cvv, brand) {
  if (brand === 'amex') return /^\d{4}$/.test(cvv);
  return /^\d{3,4}$/.test(cvv);
}

function nameValid(name) {
  return (name || '').trim().length >= 2;
}

export default function PaymentForm({ total, loading, onSubmit }) {
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [address, setAddress] = useState('');
  const [postal, setPostal] = useState('');
  const [touched, setTouched] = useState({
    cardName: false, cardNumber: false, expiry: false, cvv: false, address: false, postal: false,
  });

  const markTouched = (field) => setTouched(t => ({ ...t, [field]: true }));

  const cardNumberDigits = cardNumber.replace(/\s/g, '');
  const brand = detectCardBrand(cardNumberDigits);

  const isCardNameValid = nameValid(cardName);
  const isCardNumberValid = luhnValid(cardNumberDigits);
  const isExpiryValid = expiryValid(expiry);
  const isCvvValid = cvvValid(cvv, brand);
  const isAddressValid = address.trim().length >= 3;
  const isPostalValid = postal.trim().length >= 3;

  const isPaymentValid =
    isCardNameValid && isCardNumberValid && isExpiryValid && isCvvValid &&
    isAddressValid && isPostalValid;

  const handleCardNumberChange = (e) => {
    setCardNumber(formatCardNumberInput(e.target.value));
  };

  const handleExpiryChange = (e) => {
    setExpiry(formatExpiryInput(e.target.value));
  };

  const handleCvvChange = (e) => {
    setCvv(e.target.value.replace(/\D/g, '').slice(0, 4));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({
      cardName: true, cardNumber: true, expiry: true, cvv: true, address: true, postal: true,
    });
    if (!isPaymentValid) return;
    onSubmit();
  };

  const baseInputClass =
    "w-full px-4 py-3 border-2 rounded-xl text-lg focus:ring-2 focus:ring-brand-gold/50 outline-none bg-white transition-colors";

  const inputClass = (isInvalid) =>
    `${baseInputClass} ${
      isInvalid ? 'border-red-300 bg-red-50/40 focus:border-red-400' : 'border-gray-200 focus:border-brand-gold'
    }`;

  return (
    <section className="card-warm rounded-3xl p-6 md:p-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="section-badge">6</div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-brand-blue">Payment</h2>
          <p className="text-gray-500 text-base">Secure checkout</p>
        </div>
      </div>

      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl px-5 py-3 mb-6 mt-4 flex items-center gap-3">
        <svg className="w-6 h-6 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <p className="text-amber-800 font-medium">Demo Mode — No real charges will be made</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="cardName">Cardholder Name</label>
          <input id="cardName" type="text" value={cardName}
            onChange={e => setCardName(e.target.value)}
            onBlur={() => markTouched('cardName')}
            className={inputClass(touched.cardName && !isCardNameValid)}
            placeholder="Name as it appears on card" autoComplete="cc-name" />
          {touched.cardName && !isCardNameValid && (
            <p className="text-xs text-red-500 mt-1">Enter the cardholder's full name.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="cardNumber">Card Number</label>
          <input id="cardNumber" type="text" value={cardNumber}
            onChange={handleCardNumberChange}
            onBlur={() => markTouched('cardNumber')}
            inputMode="numeric"
            autoComplete="cc-number"
            className={inputClass(touched.cardNumber && !isCardNumberValid)}
            placeholder="1234  5678  9012  3456" maxLength={19} />
          {touched.cardNumber && !isCardNumberValid && (
            <p className="text-xs text-red-500 mt-1">
              {cardNumberDigits.length === 0
                ? 'Card number is required.'
                : cardNumberDigits.length < 13
                  ? 'Card number is too short.'
                  : 'That card number isn’t valid. Please double-check it.'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="expiry">Expiry Date</label>
            <input id="expiry" type="text" value={expiry}
              onChange={handleExpiryChange}
              onBlur={() => markTouched('expiry')}
              inputMode="numeric"
              autoComplete="cc-exp"
              className={inputClass(touched.expiry && !isExpiryValid)}
              placeholder="MM / YY" maxLength={5} />
            {touched.expiry && !isExpiryValid && (
              <p className="text-xs text-red-500 mt-1">Use MM/YY format.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="cvv">CVV</label>
            <input id="cvv" type="password" value={cvv}
              onChange={handleCvvChange}
              onBlur={() => markTouched('cvv')}
              inputMode="numeric"
              autoComplete="cc-csc"
              className={inputClass(touched.cvv && !isCvvValid)}
              placeholder={brand === 'amex' ? '1234' : '123'} maxLength={4} />
            {touched.cvv && !isCvvValid && (
              <p className="text-xs text-red-500 mt-1">{brand === 'amex' ? '4-digit CVV.' : '3 or 4 digits.'}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="address">Billing Address</label>
          <input id="address" type="text" value={address}
            onChange={e => setAddress(e.target.value)}
            onBlur={() => markTouched('address')}
            autoComplete="street-address"
            className={inputClass(touched.address && !isAddressValid)}
            placeholder="123 Main Street" />
          {touched.address && !isAddressValid && (
            <p className="text-xs text-red-500 mt-1">Enter your billing address.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="postal">Postal Code</label>
          <input id="postal" type="text" value={postal}
            onChange={e => setPostal(e.target.value)}
            onBlur={() => markTouched('postal')}
            autoComplete="postal-code"
            className={inputClass(touched.postal && !isPostalValid)}
            placeholder="E3A 1A1" maxLength={7} />
          {touched.postal && !isPostalValid && (
            <p className="text-xs text-red-500 mt-1">Enter your postal code.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !isPaymentValid}
          className="w-full bg-gradient-to-r from-brand-gold to-brand-gold-light hover:from-brand-gold-light hover:to-brand-gold text-white font-bold py-4 px-8 rounded-2xl text-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl glow-gold"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Processing Payment...
            </span>
          ) : (
            <>Complete Booking — {formatPrice(total)}</>
          )}
        </button>

        <p className="text-center text-sm text-gray-400">
          {isPaymentValid
            ? 'Your seats are held until payment is completed'
            : 'Enter valid card details to complete booking'}
        </p>
      </form>
    </section>
  );
}
