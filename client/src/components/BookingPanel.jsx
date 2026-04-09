import React, { useState, useEffect, useMemo } from 'react';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function BookingPanel({
  isOpen, onClose, onPickChairs, session, partySize, onPartySize,
  attendees, onAttendees, selectedSeats, seats,
  requiredPkg, optionalPkgs, total,
  allNamesValid, allSeatsSelected, loading, onSubmit, holdExpiry,
  step, onStepChange
}) {
  // Steps: 0 = party size & names, 1 = packages & add-ons, 2 = review & pay
  const setStep = onStepChange;
  const [cardNumber, setCardNumber] = useState('');
  const [selectedCard, setSelectedCard] = useState('');

  // Auto-detect card type from number using IIN/BIN ranges
  const detectCardType = (number) => {
    const n = number.replace(/\s/g, '');
    if (/^4/.test(n)) return 'visa';
    if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard';
    if (/^3[47]/.test(n)) return 'amex';
    if (/^6(?:011|5)/.test(n)) return 'discover';
    return '';
  };

  const handleCardNumberChange = (e) => {
    // Strip non-digits, limit to 16 (19 with spaces)
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
    // Format as groups of 4
    const formatted = raw.replace(/(.{4})/g, '$1 ').trim();
    setCardNumber(formatted);
    setSelectedCard(detectCardType(raw));
  };

  // Auto-advance: when panel opens and all names valid + all seats selected, go to step 1
  useEffect(() => {
    if (isOpen && allNamesValid && allSeatsSelected && step === 0) {
      setStep(1);
    }
  }, [isOpen, allSeatsSelected]);

  const getSeatInfo = (seatId) => {
    const seat = seats.find(s => s.id === seatId);
    return seat ? { table: seat.table_number, chair: seat.chair_number } : null;
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

  const chairsNeeded = partySize - selectedSeats.length;
  const canGoToPackages = allNamesValid && allSeatsSelected;
  const canGoToReview = allNamesValid && allSeatsSelected;

  const stepLabels = [
    { label: 'Party & Names', idx: 0 },
    { label: 'Packages', idx: 1 },
    { label: 'Review & Pay', idx: 2 },
  ];

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

        {/* Step indicators */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {stepLabels.map(t => {
            const disabled = (t.idx === 1 && !canGoToPackages) || (t.idx === 2 && !canGoToReview);
            return (
              <button key={t.idx}
                onClick={() => !disabled && setStep(t.idx)}
                disabled={disabled}
                className={`flex-1 py-3 text-sm font-medium transition border-b-2 ${
                  step === t.idx ? 'text-brand-blue border-brand-gold' :
                  'text-gray-400 border-transparent hover:text-gray-600'
                } disabled:opacity-40 disabled:cursor-not-allowed`}>
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold mr-1.5 ${
                  step === t.idx ? 'bg-brand-blue text-white' :
                  step > t.idx ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>{step > t.idx ? '✓' : t.idx + 1}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ========== STEP 0: Party Size & Names ========== */}
          {step === 0 && (
            <div>
              {/* Party Size Selector */}
              <div className="bg-brand-blue/5 border-2 border-brand-blue/20 rounded-xl px-4 py-3 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-brand-blue uppercase tracking-wide">How many players?</span>
                  {partySize > 0 && (
                    <span className="text-xs bg-brand-blue text-white px-2.5 py-1 rounded-full font-semibold">
                      {partySize} {partySize === 1 ? 'Player' : 'Players'}
                    </span>
                  )}
                </div>

                {session?.is_special_event ? (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-center">
                    <p className="text-sm font-semibold text-amber-700">Special Event — 1 Player Only</p>
                  </div>
                ) : (
                <div className="grid grid-cols-6 gap-2">
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      onClick={() => onPartySize(n)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-all border-2 ${
                        partySize === n
                          ? 'bg-brand-blue border-brand-blue text-white shadow-md'
                          : 'bg-white border-gray-200 text-brand-blue hover:border-brand-gold/50 hover:shadow-sm'
                      }`}
                    >
                      <span className="text-lg font-bold leading-none">{n}</span>
                      <div className="flex flex-wrap justify-center gap-px">
                        {Array.from({ length: n }, (_, i) => (
                          <svg key={i} className={`w-3 h-3 ${partySize === n ? 'text-brand-gold' : 'text-brand-blue/50'}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
                )}
              </div>

              {/* Name Forms — shown immediately based on party size */}
              {partySize > 0 && (
                <div>
                  <h3 className="font-bold text-brand-blue text-lg mb-3">
                    {session?.is_special_event ? 'Player Name' : 'Player Names'}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {session?.is_special_event
                      ? 'Enter Name below and pick your chair on the floor plan.'
                      : "Enter everyone's name, then you'll pick chairs on the floor plan."}
                  </p>

                  <div className="space-y-3">
                    {attendees.map((att, i) => {
                      const seatInfo = getSeatInfo(selectedSeats[i]);
                      return (
                        <div key={i} className="border-2 border-gray-100 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="w-7 h-7 rounded-full bg-brand-blue text-white flex items-center justify-center text-sm font-bold">{i + 1}</span>
                            <span className="font-semibold text-brand-blue">Player {i + 1}</span>
                            {seatInfo ? (
                              <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                T{seatInfo.table} C{seatInfo.chair}
                              </span>
                            ) : (
                              <span className="ml-auto text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium">
                                Chair TBD
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <input value={att.firstName} onChange={e => updateAttendee(i, 'firstName', e.target.value)}
                              className={`px-3 py-2.5 border-2 rounded-xl text-base focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none ${
                                att.firstName.trim() ? 'border-gray-200' : 'border-red-200 bg-red-50/50'
                              }`} placeholder="First name" />
                            <input value={att.lastName} onChange={e => updateAttendee(i, 'lastName', e.target.value)}
                              className={`px-3 py-2.5 border-2 rounded-xl text-base focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none ${
                                att.lastName.trim() ? 'border-gray-200' : 'border-red-200 bg-red-50/50'
                              }`} placeholder="Last name" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Next step CTA */}
              {partySize > 0 && (
                <div className="mt-5 space-y-3">
                  {allNamesValid && chairsNeeded > 0 ? (
                    /* Names filled but need more chairs — guide them to floor plan */
                    <button onClick={onPickChairs}
                      className="w-full bg-brand-gold text-white py-3.5 rounded-xl font-semibold text-lg transition hover:bg-brand-gold-light glow-gold-sm flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                      </svg>
                      Select {chairsNeeded} More Chair{chairsNeeded !== 1 ? 's' : ''} on Floor Plan
                    </button>
                  ) : allNamesValid && allSeatsSelected ? (
                    /* All good — go to packages */
                    <button onClick={() => setStep(1)}
                      className="w-full bg-brand-gold text-white py-3.5 rounded-xl font-semibold text-lg transition hover:bg-brand-gold-light glow-gold-sm">
                      Next: Choose Packages
                    </button>
                  ) : (
                    /* Names not filled yet */
                    <div className="bg-gray-50 rounded-xl px-4 py-3 text-center text-sm text-gray-400">
                      Fill in all player names to continue
                    </div>
                  )}
                </div>
              )}

              {partySize === 0 && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-blue/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-brand-blue/40" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-gray-400 text-sm">Select how many players are in your party to get started</p>
                </div>
              )}
            </div>
          )}

          {/* ========== STEP 1: Packages & Add-ons ========== */}
          {step === 1 && (
            <div>
              {/* Selected seats summary */}
              {selectedSeats.length > 0 && (
                <div className="bg-brand-blue/5 border-2 border-brand-blue/20 rounded-xl px-4 py-3 mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-brand-blue uppercase tracking-wide">Your Seats</span>
                    <span className="text-xs bg-brand-blue text-white px-2.5 py-1 rounded-full font-semibold">
                      {partySize} {partySize === 1 ? 'Player' : 'Players'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedSeats.map((seatId, i) => {
                      const info = getSeatInfo(seatId);
                      return (
                        <span key={seatId} className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-brand-blue px-2.5 py-1.5 rounded-lg text-xs font-medium">
                          <span className="w-5 h-5 rounded-md bg-brand-blue text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
                            {i + 1}
                          </span>
                          {attendees[i]?.firstName || 'Player'} — T{info?.table} C{info?.chair}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Instructions</p>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>&#8226; Daily booking cut-off at <strong>12:00 PM</strong></li>
                  <li>&#8226; Select Optional items from the dropdown to add them</li>
                </ul>
              </div>

              <h3 className="font-bold text-brand-blue text-lg mb-4">Packages & Add-ons</h3>

              <div className="space-y-4">
                {attendees.map((att, i) => {
                  const seatInfo = getSeatInfo(selectedSeats[i]);
                  return (
                    <div key={i} className="border-2 border-gray-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-7 h-7 rounded-full bg-brand-blue text-white flex items-center justify-center text-sm font-bold">{i + 1}</span>
                        <span className="font-semibold text-brand-blue">{att.firstName} {att.lastName}</span>
                        {seatInfo && (
                          <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                            T{seatInfo.table} C{seatInfo.chair}
                          </span>
                        )}
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
                                const pkgId = e.target.value;
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

          {/* ========== STEP 2: Review & Pay ========== */}
          {step === 2 && (() => {
            const subtotal = partySize * (requiredPkg?.price || 0);
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
                          {info && (
                            <span className="ml-auto text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                              Table {info.table}, Chair {info.chair}
                            </span>
                          )}
                        </div>

                        {/* Required package line */}
                        {requiredPkg && (
                          <div className="flex justify-between text-sm ml-8 py-1">
                            <span className="text-gray-600">{requiredPkg.name}</span>
                            <span className="font-medium text-gray-800">{formatPrice(requiredPkg.price)}</span>
                          </div>
                        )}

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
                </div>
              </div>

              {/* Total Due */}
              <div className="bg-brand-blue rounded-xl px-4 py-3 flex justify-between items-center mb-5">
                <span className="text-white font-medium text-base">Total Due</span>
                <span className="text-brand-gold text-2xl font-bold">{formatPrice(total)}</span>
              </div>

              {/* Demo payment notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mb-4 text-sm text-amber-700 font-medium flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Demo mode — no real charges
              </div>

              {/* Card Type Auto-Detection Display */}
              <div className="mb-4">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Card Type {selectedCard ? `— ${selectedCard === 'visa' ? 'Visa' : selectedCard === 'mastercard' ? 'Mastercard' : selectedCard === 'amex' ? 'American Express' : 'Discover'} detected` : '— enter card number'}</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'visa', name: 'Visa',
                      logo: <svg viewBox="0 0 48 32" className="w-10 h-7"><rect width="48" height="32" rx="4" fill="#1A1F71"/><text x="24" y="20" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="bold" fontStyle="italic" fontFamily="Arial">VISA</text></svg> },
                    { id: 'mastercard', name: 'Mastercard',
                      logo: <svg viewBox="0 0 48 32" className="w-10 h-7"><rect width="48" height="32" rx="4" fill="#252525"/><circle cx="19" cy="16" r="8" fill="#EB001B"/><circle cx="29" cy="16" r="8" fill="#F79E1B"/><path d="M24 9.86A8 8 0 0124 22.14 8 8 0 0124 9.86z" fill="#FF5F00"/></svg> },
                    { id: 'amex', name: 'Amex',
                      logo: <svg viewBox="0 0 48 32" className="w-10 h-7"><rect width="48" height="32" rx="4" fill="#006FCF"/><text x="24" y="20" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="bold" fontFamily="Arial">AMEX</text></svg> },
                    { id: 'discover', name: 'Discover',
                      logo: <svg viewBox="0 0 48 32" className="w-10 h-7"><rect width="48" height="32" rx="4" fill="#FFFFFF" stroke="#E0E0E0"/><circle cx="28" cy="16" r="7" fill="#F47216"/><text x="18" y="20" textAnchor="middle" fill="#000" fontSize="6" fontWeight="bold" fontFamily="Arial">D</text></svg> },
                  ].map(card => (
                    <div key={card.id}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                        selectedCard === card.id
                          ? 'border-brand-gold shadow-md ring-2 ring-brand-gold/30 scale-105'
                          : cardNumber.replace(/\s/g, '').length > 0 && selectedCard !== card.id
                            ? 'border-gray-100 opacity-30'
                            : 'border-gray-200'
                      }`}>
                      {card.logo}
                      <span className="text-[10px] font-semibold text-gray-600">{card.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment fields */}
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Cardholder Name</label>
                  <input className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-base focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none transition"
                    placeholder="Name on card" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Card Number</label>
                  <div className="relative">
                    <input className="w-full px-3 py-2.5 pr-14 border-2 border-gray-200 rounded-xl text-base focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none transition tracking-wider"
                      placeholder="0000 0000 0000 0000" maxLength={19} value={cardNumber} onChange={handleCardNumberChange} />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40">
                      {selectedCard === 'visa' && <svg viewBox="0 0 36 24" className="w-8 h-5"><rect width="36" height="24" rx="3" fill="#1A1F71"/><text x="18" y="15" textAnchor="middle" fill="#FFF" fontSize="9" fontWeight="bold" fontStyle="italic" fontFamily="Arial">VISA</text></svg>}
                      {selectedCard === 'mastercard' && <svg viewBox="0 0 36 24" className="w-8 h-5"><rect width="36" height="24" rx="3" fill="#252525"/><circle cx="14" cy="12" r="6" fill="#EB001B"/><circle cx="22" cy="12" r="6" fill="#F79E1B"/></svg>}
                      {selectedCard === 'amex' && <svg viewBox="0 0 36 24" className="w-8 h-5"><rect width="36" height="24" rx="3" fill="#006FCF"/><text x="18" y="15" textAnchor="middle" fill="#FFF" fontSize="6" fontWeight="bold" fontFamily="Arial">AMEX</text></svg>}
                      {selectedCard === 'discover' && <svg viewBox="0 0 36 24" className="w-8 h-5"><rect width="36" height="24" rx="3" fill="#FFF" stroke="#E0E0E0"/><circle cx="21" cy="12" r="5" fill="#F47216"/></svg>}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">Expiry</label>
                    <input className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-base focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none transition"
                      placeholder="MM/YY" maxLength={5} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">CVV</label>
                    <input className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-base focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none transition"
                      placeholder="123" maxLength={4} type="password" />
                  </div>
                </div>
              </div>

              {/* Secure payment indicator */}
              <div className="flex items-center justify-center gap-1.5 mb-4 text-xs text-gray-400">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Secure payment — your data is encrypted
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
            );
          })()}
        </div>
      </div>
    </>
  );
}
