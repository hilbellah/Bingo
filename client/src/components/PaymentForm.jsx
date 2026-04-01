import React, { useState } from 'react';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

export default function PaymentForm({ total, loading, onSubmit }) {
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [address, setAddress] = useState('');
  const [postal, setPostal] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  const inputClass = "w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none bg-white transition-colors";

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

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="cardName">Cardholder Name</label>
          <input id="cardName" type="text" value={cardName} onChange={e => setCardName(e.target.value)}
            className={inputClass} placeholder="Name as it appears on card" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="cardNumber">Card Number</label>
          <input id="cardNumber" type="text" value={cardNumber} onChange={e => setCardNumber(e.target.value)}
            className={inputClass} placeholder="1234  5678  9012  3456" maxLength={19} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="expiry">Expiry Date</label>
            <input id="expiry" type="text" value={expiry} onChange={e => setExpiry(e.target.value)}
              className={inputClass} placeholder="MM / YY" maxLength={5} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="cvv">CVV</label>
            <input id="cvv" type="text" value={cvv} onChange={e => setCvv(e.target.value)}
              className={inputClass} placeholder="123" maxLength={4} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="address">Billing Address</label>
          <input id="address" type="text" value={address} onChange={e => setAddress(e.target.value)}
            className={inputClass} placeholder="123 Main Street" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="postal">Postal Code</label>
          <input id="postal" type="text" value={postal} onChange={e => setPostal(e.target.value)}
            className={inputClass} placeholder="E3A 1A1" maxLength={7} />
        </div>

        <button
          type="submit"
          disabled={loading}
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
          Your seats are held until payment is completed
        </p>
      </form>
    </section>
  );
}
