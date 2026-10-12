import React from 'react';
import { formatPrice } from '../utils/formatters';

// Step 3 of the booking panel: itemised order summary, totals, confirmation
// email and the Continue to Payment button. Moved verbatim from BookingPanel;
// every value it reads is passed in.
export default function BookingReviewStep({
  partySize,
  attendees,
  selectedSeats,
  optionalPkgs,
  serviceFeeUnitAmount,
  serviceFeeAmount,
  salesTaxAmount,
  total,
  loading,
  customerEmail,
  setCustomerEmail,
  emailTouched,
  setEmailTouched,
  customerEmailValid,
  handlePaySubmit,
  getSeatInfo,
  requiredPackageList,
  isEvent,
  getAttendeeTicketPackage,
}) {
  const requiredTotal = requiredPackageList.reduce((sum, pkg) => sum + (pkg?.price || 0), 0);
  const subtotal = isEvent
    ? attendees.reduce((sum, att) => sum + (getAttendeeTicketPackage(att)?.price || 0), 0)
    : partySize * requiredTotal;
  const addonsTotal = attendees.reduce((sum, att) => {
    return sum + (att.addons || []).reduce((aSum, addon) => {
      const pkg = optionalPkgs.find(p => p.id === addon.packageId);
      return aSum + (pkg ? pkg.price * addon.quantity : 0);
    }, 0);
  }, 0);

  return (
  <div>
    <h3 className="font-bold text-brand-blue text-lg mb-4">Confirm & Pay</h3>

    {/* Itemized Order Summary */}
    <div className="bg-white border-2 border-gray-100 rounded-xl overflow-hidden mb-4">
      <div className="bg-brand-blue/5 px-4 py-2.5 border-b border-gray-100">
        <span className="text-xs font-bold text-brand-blue uppercase tracking-wide">Order Summary</span>
      </div>

      <div className="divide-y divide-gray-100">
        {attendees.map((att, i) => {
          const info = getSeatInfo(selectedSeats[i]);
          const playerAddons = (att.addons || []).filter(a => a.quantity > 0);
          return (
            <div key={i} className="px-4 py-3">
              {/* Player header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-brand-blue text-white flex items-center justify-center text-xs font-bold">{i + 1}</span>
                <span className="font-semibold text-brand-blue text-sm">{att.firstName} {att.lastName}</span>
                {isEvent ? (
                  <span className="ml-auto text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                    {getAttendeeTicketPackage(att)?.name || 'Ticket'}
                  </span>
                ) : info && (
                  <span className="ml-auto text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                    Table {info.table}, Chair {info.chair}
                  </span>
                )}
              </div>

              {/* Required package line */}
              {(isEvent ? [getAttendeeTicketPackage(att)].filter(Boolean) : requiredPackageList).map(pkg => (
                  <div key={pkg.id} className="flex justify-between text-sm ml-8 py-1">
                    <span className="text-gray-600">{pkg.name}</span>
                    <span className="font-medium text-gray-800">{formatPrice(pkg.price)}</span>
                  </div>
                ))}

              {/* Add-on lines */}
              {playerAddons.map(addon => {
                const pkg = optionalPkgs.find(p => p.id === addon.packageId);
                if (!pkg) return null;
                return (
                  <div key={addon.packageId} className="flex justify-between text-sm ml-8 py-1">
                    <span className="text-gray-600">
                      {pkg.name}
                      {addon.quantity > 1 && <span className="text-gray-400 ml-1">x{addon.quantity}</span>}
                    </span>
                    <span className="font-medium text-gray-800">{formatPrice(pkg.price * addon.quantity)}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Subtotal / Add-ons / Total breakdown */}
      <div className="border-t-2 border-gray-100 px-4 py-3 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Subtotal ({partySize} {partySize === 1 ? 'player' : 'players'})</span>
          <span className="text-gray-700 font-medium">{formatPrice(subtotal)}</span>
        </div>
        {addonsTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Add-ons</span>
            <span className="text-gray-700 font-medium">{formatPrice(addonsTotal)}</span>
          </div>
        )}
        {serviceFeeAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Service charge ({formatPrice(serviceFeeUnitAmount)} x {partySize} {partySize === 1 ? 'player' : 'players'})</span>
            <span className="text-gray-700 font-medium">{formatPrice(serviceFeeAmount)}</span>
          </div>
        )}
        {salesTaxAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">HST (15%)</span>
            <span className="text-gray-700 font-medium">{formatPrice(salesTaxAmount)}</span>
          </div>
        )}
      </div>
    </div>

    {/* Total Due */}
    <div className="bg-brand-blue rounded-xl px-4 py-3 flex justify-between items-center mb-5">
      <span className="text-white font-medium text-base">Total Due</span>
      <span className="text-brand-gold text-2xl font-bold">{formatPrice(total)}</span>
    </div>

    <div className="bg-white border-2 border-gray-100 rounded-xl px-4 py-3 mb-4">
      <label htmlFor="booking-email" className="block text-xs font-bold text-brand-blue uppercase tracking-wide mb-1.5">
        Email for confirmation
      </label>
      <input
        id="booking-email"
        type="email"
        value={customerEmail}
        onChange={event => setCustomerEmail(event.target.value)}
        onBlur={() => setEmailTouched(true)}
        placeholder="name@example.com"
        autoComplete="email"
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-brand-gold/40 ${emailTouched && !customerEmailValid ? 'border-red-400' : 'border-gray-200'}`}
      />
      {emailTouched && !customerEmailValid ? (
        <p className="mt-1.5 text-xs text-red-600">Enter a valid email address so we can send your confirmation.</p>
      ) : (
        <p className="mt-1.5 text-xs text-gray-500">Your booking confirmation and ticket link will be sent here.</p>
      )}
    </div>

    {/* Authorize.Net redirect notice — replaces the old in-page card form.
        Card details are now collected on Authorize.Net's hosted page
        (PCI-compliant — we never touch the card on our domain). */}
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
      <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
      </svg>
      <div className="text-sm text-blue-900">
        <p className="font-semibold mb-0.5">Secure payment via Authorize.Net</p>
        <p className="text-xs text-blue-700">
          When you click below you'll be taken to our payment processor (Authorize.Net) to enter your card details. Your card information is never seen or stored by this site.
        </p>
      </div>
    </div>

    <button onClick={handlePaySubmit} disabled={loading || !customerEmailValid}
      className="w-full bg-gradient-to-r from-brand-gold to-brand-gold-light text-white py-4 rounded-2xl font-bold text-lg transition hover:shadow-xl glow-gold disabled:opacity-50 disabled:cursor-not-allowed">
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          Redirecting to payment...
        </span>
      ) : (
        `Continue to Payment - ${formatPrice(total)}`
      )}
    </button>
  </div>
  );
}
