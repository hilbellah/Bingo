import React, { useState } from 'react';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function BookingPanel({
  isOpen, onClose, session, partySize, onPartySize,
  attendees, onAttendees, selectedSeats, seats,
  requiredPkg, optionalPkgs, total,
  allNamesValid, allSeatsSelected, loading, onSubmit, holdExpiry
}) {
  const [step, setStep] = useState(0); // 0=party, 1=names, 2=review/pay

  const getSeatInfo = (seatId) => {
    const seat = seats.find(s => s.id === seatId);
    return seat ? { table: seat.table_number, chair: seat.chair_number } : { table: '?', chair: '?' };
  };

  const updateAttendee = (index, field, value) => {
    const updated = [...attendees];
    updated[index] = { ...updated[index], [field]: value };
    onAttendees(updated);
  };

  const updateAddon = (attendeeIdx, packageId, quantity) => {
    const updated = [...attendees];
    const att = { ...updated[attendeeIdx] };
    const addons = [...(att.addons || [])];
    const existing = addons.findIndex(a => a.packageId === packageId);
    if (existing >= 0) {
      if (quantity === 0) addons.splice(existing, 1);
      else addons[existing] = { ...addons[existing], quantity };
    } else if (quantity > 0) {
      addons.push({ packageId, quantity });
    }
    att.addons = addons;
    updated[attendeeIdx] = att;
    onAttendees(updated);
  };

  const getAddonQty = (idx, pkgId) =>
    attendees[idx]?.addons?.find(a => a.packageId === pkgId)?.quantity || 0;

  const canGoToNames = partySize > 0;
  const canGoToReview = allNamesValid && allSeatsSelected;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose} />
      )}

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Panel Header */}
        <div className="bg-brand-blue px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Book Your Seats</h2>
            {session && (
              <p className="text-blue-200 text-sm">{formatDate(session.date)} at {formatTime(session.time)}</p>
            )}
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white p-1 transition">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {[
            { label: 'Party Size', idx: 0 },
            { label: 'Names & Packages', idx: 1 },
            { label: 'Review & Pay', idx: 2 },
          ].map(t => (
            <button key={t.idx} onClick={() => setStep(t.idx)}
              disabled={t.idx === 1 && !canGoToNames || t.idx === 2 && !canGoToReview}
              className={`flex-1 py-3 text-sm font-medium transition border-b-2 ${
                step === t.idx ? 'text-brand-blue border-brand-gold' :
                'text-gray-400 border-transparent hover:text-gray-600'
              } disabled:opacity-40 disabled:cursor-not-allowed`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Instructions</p>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>&#8226; Daily booking cut-off at <strong>12:00 PM</strong></li>
              <li>&#8226; To add Optional items, set Quantity first then click <strong>+</strong></li>
            </ul>
          </div>

          {/* STEP 0: Party Size */}
          {step === 0 && (
            <div>
              <h3 className="font-bold text-brand-blue text-lg mb-1">How Many Players?</h3>
              <p className="text-gray-500 text-sm mb-5">Choose your group size, then pick chairs on the map</p>

              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button key={n} onClick={() => { onPartySize(n); }}
                    className={`flex flex-col items-center gap-1 p-4 rounded-xl transition-all ${
                      partySize === n
                        ? 'bg-brand-blue text-white shadow-lg scale-105'
                        : 'bg-gray-50 hover:bg-brand-cream border-2 border-gray-100 hover:border-brand-gold/30 text-brand-blue'
                    }`}>
                    <div className="flex flex-wrap justify-center gap-0.5">
                      {Array.from({ length: n }, (_, i) => (
                        <svg key={i} className={`w-4 h-4 ${partySize === n ? 'text-brand-gold' : 'text-brand-gold/60'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-xl font-bold">{n}</span>
                  </button>
                ))}
              </div>

              {partySize > 0 && (
                <div className="mt-5 space-y-3">
                  <div className="bg-brand-gold/10 rounded-xl px-4 py-3 text-center">
                    <p className="text-brand-blue font-semibold">
                      {partySize} {partySize === 1 ? 'player' : 'players'} — now pick {partySize} seat{partySize > 1 ? 's' : ''} on the map
                    </p>
                  </div>

                  {/* Selected seats summary */}
                  {selectedSeats.length > 0 && (
                    <div className="bg-blue-50 rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Your Seats</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedSeats.map((seatId, i) => {
                          const info = getSeatInfo(seatId);
                          return (
                            <span key={seatId} className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                              T{info.table} C{info.chair}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button onClick={() => setStep(1)} disabled={!canGoToNames || !allSeatsSelected}
                    className="w-full bg-brand-blue text-white py-3 rounded-xl font-semibold transition hover:bg-brand-blue/90 disabled:opacity-40 disabled:cursor-not-allowed">
                    {allSeatsSelected ? 'Next: Enter Names' : `Select ${partySize - selectedSeats.length} more seat${partySize - selectedSeats.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 1: Names & Packages */}
          {step === 1 && (
            <div>
              <h3 className="font-bold text-brand-blue text-lg mb-4">Player Details</h3>

              <div className="space-y-4">
                {attendees.map((att, i) => {
                  const info = getSeatInfo(selectedSeats[i]);
                  return (
                    <div key={i} className="border-2 border-gray-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-7 h-7 rounded-full bg-brand-blue text-white flex items-center justify-center text-sm font-bold">{i + 1}</span>
                        <span className="font-semibold text-brand-blue">Player {i + 1}</span>
                        <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                          T{info.table} C{info.chair}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <input value={att.firstName} onChange={e => updateAttendee(i, 'firstName', e.target.value)}
                          className={`px-3 py-2.5 border-2 rounded-xl text-base focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none ${
                            att.firstName.trim() ? 'border-gray-200' : 'border-red-200 bg-red-50/50'
                          }`} placeholder="First name" />
                        <input value={att.lastName} onChange={e => updateAttendee(i, 'lastName', e.target.value)}
                          className={`px-3 py-2.5 border-2 rounded-xl text-base focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none ${
                            att.lastName.trim() ? 'border-gray-200' : 'border-red-200 bg-red-50/50'
                          }`} placeholder="Last name" />
                      </div>

                      {/* Required package */}
                      {requiredPkg && (
                        <div className="bg-blue-50 rounded-lg px-3 py-2 mb-2 flex justify-between text-sm">
                          <span className="font-medium text-brand-blue">{requiredPkg.name} <span className="text-xs text-gray-400">(included)</span></span>
                          <span className="font-bold">{formatPrice(requiredPkg.price)}</span>
                        </div>
                      )}

                      {/* Add-ons */}
                      {optionalPkgs.map(pkg => {
                        const qty = getAddonQty(i, pkg.id);
                        return (
                          <div key={pkg.id} className={`flex items-center justify-between rounded-lg px-3 py-2 mb-1 text-sm ${
                            qty > 0 ? 'bg-brand-gold/10' : 'bg-gray-50'
                          }`}>
                            <div>
                              <span className="font-medium">{pkg.name}</span>
                              <span className="text-brand-gold font-semibold ml-1">{formatPrice(pkg.price)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => updateAddon(i, pkg.id, Math.max(0, qty - 1))}
                                disabled={qty === 0}
                                className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold flex items-center justify-center">-</button>
                              <span className="w-5 text-center font-bold">{qty}</span>
                              <button onClick={() => updateAddon(i, pkg.id, Math.min(pkg.max_quantity, qty + 1))}
                                disabled={qty >= pkg.max_quantity}
                                className="w-7 h-7 rounded-full bg-brand-gold hover:bg-brand-gold-light text-white font-bold flex items-center justify-center">+</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Total + next */}
              <div className="mt-5 space-y-3">
                <div className="bg-brand-blue rounded-xl px-4 py-3 flex justify-between items-center">
                  <span className="text-white font-medium">Total</span>
                  <span className="text-brand-gold text-2xl font-bold">{formatPrice(total)}</span>
                </div>

                <button onClick={() => setStep(2)} disabled={!canGoToReview}
                  className="w-full bg-brand-gold text-white py-3 rounded-xl font-semibold text-lg transition hover:bg-brand-gold-light disabled:opacity-40 disabled:cursor-not-allowed glow-gold-sm">
                  Review & Pay
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Review & Pay */}
          {step === 2 && (
            <div>
              <h3 className="font-bold text-brand-blue text-lg mb-4">Confirm & Pay</h3>

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
                {attendees.map((att, i) => {
                  const info = getSeatInfo(selectedSeats[i]);
                  return (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="font-medium">{att.firstName} {att.lastName}</span>
                      <span className="text-gray-500">T{info.table} C{info.chair}</span>
                    </div>
                  );
                })}
              </div>

              <div className="bg-brand-blue rounded-xl px-4 py-3 flex justify-between items-center mb-5">
                <span className="text-white font-medium">Total Due</span>
                <span className="text-brand-gold text-2xl font-bold">{formatPrice(total)}</span>
              </div>

              {/* Demo payment notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mb-4 text-sm text-amber-700 font-medium">
                Demo mode — no real charges
              </div>

              {/* Payment fields */}
              <div className="space-y-3 mb-5">
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-base focus:border-brand-gold outline-none"
                  placeholder="Cardholder name" />
                <input className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-base focus:border-brand-gold outline-none"
                  placeholder="Card number" maxLength={19} />
                <div className="grid grid-cols-2 gap-3">
                  <input className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-base focus:border-brand-gold outline-none"
                    placeholder="MM/YY" maxLength={5} />
                  <input className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-base focus:border-brand-gold outline-none"
                    placeholder="CVV" maxLength={4} />
                </div>
              </div>

              <button onClick={onSubmit} disabled={loading}
                className="w-full bg-gradient-to-r from-brand-gold to-brand-gold-light text-white py-4 rounded-2xl font-bold text-lg transition hover:shadow-xl glow-gold disabled:opacity-50">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    Processing...
                  </span>
                ) : (
                  `Pay ${formatPrice(total)}`
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
