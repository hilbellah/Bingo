import React, { useState } from 'react';
import PartySize from './PartySize';

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
  // Skip party size step — chairs are selected on the map, auto-filling party size
  const [step, setStep] = useState(selectedSeats.length > 0 ? 1 : 0); // 0=select chairs prompt, 1=names, 2=review/pay

  // Auto-advance to names step when seats are selected
  React.useEffect(() => {
    if (selectedSeats.length > 0 && step === 0) setStep(1);
  }, [selectedSeats.length]);

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

  const canGoToNames = selectedSeats.length > 0;
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
            { label: `Party (${partySize || '?'})`, idx: 0 },
            { label: 'Names & Packages', idx: 1 },
            { label: 'Review & Pay', idx: 2 },
          ].map(t => (
            <button key={t.idx} onClick={() => setStep(t.idx)}
              disabled={(t.idx === 1 && selectedSeats.length === 0) || (t.idx === 2 && !canGoToReview)}
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
              <li>&#8226; Select Optional items from the dropdown to add them</li>
            </ul>
          </div>

          {/* STEP 0: Party Size + Select Chairs prompt */}
          {step === 0 && (
            <div className="py-4">
              {/* Party Size Selector */}
              <PartySize value={partySize} onChange={onPartySize} />

              {/* Go pick chairs prompt */}
              <div className="text-center mt-6">
                <p className="text-gray-500 text-sm mb-4">
                  {partySize > 0
                    ? <>Now pick <strong>{partySize}</strong> chair{partySize !== 1 ? 's' : ''} on the seat map</>
                    : 'Select your party size above, or tap chairs directly on the map'
                  }
                </p>
                <button onClick={onClose}
                  className="bg-brand-blue text-white px-6 py-3 rounded-xl font-semibold transition hover:bg-brand-blue/90">
                  Go to Seat Map
                </button>
              </div>
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

                      {/* Add-ons dropdown */}
                      {optionalPkgs.length > 0 && (
                        <div className="mt-2">
                          <select
                            value=""
                            onChange={e => {
                              if (e.target.value) {
                                const pkgId = parseInt(e.target.value, 10);
                                const currentQty = getAddonQty(i, pkgId);
                                const pkg = optionalPkgs.find(p => p.id === pkgId);
                                if (pkg && currentQty < pkg.max_quantity) {
                                  updateAddon(i, pkgId, currentQty + 1);
                                }
                              }
                            }}
                            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none cursor-pointer"
                          >
                            <option value="">+ Add optional items...</option>
                            {optionalPkgs.map(pkg => (
                              <option key={pkg.id} value={pkg.id}>
                                {pkg.name} — {formatPrice(pkg.price)}
                              </option>
                            ))}
                          </select>

                          {/* Selected add-ons */}
                          {optionalPkgs.filter(pkg => getAddonQty(i, pkg.id) > 0).map(pkg => {
                            const qty = getAddonQty(i, pkg.id);
                            return (
                              <div key={pkg.id} className="flex items-center justify-between rounded-lg px-3 py-2 mt-1 text-sm bg-brand-gold/10">
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium">{pkg.name}</span>
                                  <span className="text-brand-gold font-semibold ml-1">{formatPrice(pkg.price * qty)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button onClick={() => updateAddon(i, pkg.id, qty - 1)}
                                    className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold flex items-center justify-center text-sm">-</button>
                                  <span className="w-5 text-center font-bold">{qty}</span>
                                  <button onClick={() => updateAddon(i, pkg.id, Math.min(pkg.max_quantity, qty + 1))}
                                    disabled={qty >= pkg.max_quantity}
                                    className="w-7 h-7 rounded-full bg-brand-gold hover:bg-brand-gold-light text-white font-bold flex items-center justify-center text-sm disabled:opacity-40">+</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
