import React, { useState, useEffect } from 'react';
import { formatDateShort, formatTime } from '../utils/formatters';
import BookingReviewStep from './BookingReviewStep';
import BookingPackagesStep from './BookingPackagesStep';

const PHD_CREDIT_PACKAGE_ID = 'pkg-regular-optional-phd-credit';

// NOTE: All credit-card collection happens on Authorize.Net's hosted payment
// page (Accept Hosted integration). This file does NOT and MUST NOT collect
// card data — doing so would violate our PCI scope (SAQ A) and require
// SAQ A-EP or SAQ D. The booking form only collects: attendee names,
// customer name/email, seat selection, and optional add-ons. The customer is redirected to
// Authorize.Net to enter card details.

export default function BookingPanel({
  isOpen, onClose, onPickChairs, session, partySize, onPartySize,
  attendees, onAttendees, selectedSeats, seats,
  requiredPkg, requiredPkgs, optionalPkgs, serviceFeeUnitAmount = 0, serviceFeeAmount = 0, salesTaxAmount = 0, total,
  maxOptionalPackagesPerPlayer = 3,
  allNamesValid, allSeatsSelected, loading, onSubmit, holdExpiry,
  step, onStepChange, phdInventory
}) {
  // Steps: 0 = party size & names, 1 = packages & add-ons, 2 = review & pay
  const setStep = onStepChange;

  const primaryAttendee = attendees[0] || {};
  const trimmedCustomerFirstName = (primaryAttendee.firstName || '').trim();
  const trimmedCustomerLastName = (primaryAttendee.lastName || '').trim();
  const [customerEmail, setCustomerEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const trimmedCustomerEmail = customerEmail.trim();
  const customerEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedCustomerEmail);

  const handlePaySubmit = () => {
    setEmailTouched(true);
    if (!customerEmailValid) return;

    onSubmit({
      email: trimmedCustomerEmail,
      customerFirstName: trimmedCustomerFirstName,
      customerLastName: trimmedCustomerLastName,
    });
  };

  // Auto-advance: when panel opens and all names valid + all seats selected, go to step 1
  useEffect(() => {
    if (isOpen && allNamesValid && allSeatsSelected && step === 0) {
      setStep(1);
    }
    // Deliberately only when the panel opens or the chairs change: reacting to
    // allNamesValid would jump to Packages while the customer is still typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [isOpen, allSeatsSelected]);

  // Closing the panel clears the contact email for the next checkout.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setCustomerEmail('');
      setEmailTouched(false);
    }
  }

  const getSeatInfo = (seatId) => {
    const seat = seats.find(s => s.id === seatId);
    return seat ? { table: seat.table_number, chair: seat.chair_number } : null;
  };

  const updateAttendee = (index, field, value) => {
    const updated = [...attendees];
    updated[index] = { ...updated[index], [field]: value };
    onAttendees(updated);
  };

  const updateTicketPackage = (index, packageId) => {
    const updated = [...attendees];
    updated[index] = { ...updated[index], ticketPackageId: packageId };
    onAttendees(updated);
  };

  // Calculate PHD devices currently selected across all attendees.
  const requiredPackageList = requiredPkgs?.length ? requiredPkgs : (requiredPkg ? [requiredPkg] : []);
  const sessionType = session?.session_type || (session?.is_special_event ? 'special_bingo' : 'regular_bingo');
  const isRegularBingo = sessionType === 'regular_bingo';
  const isEvent = sessionType === 'event';
  const getCheckoutDescription = (pkg) => {
    const description = String(pkg?.description || '').trim();
    if (sessionType !== 'special_bingo') return description;
    if (pkg?.type === 'required' && pkg?.is_phd) return '';
    return description.replace(/^Additional\s+/i, '');
  };
  const getAttendeeTicketPackage = (attendee) => (
    requiredPackageList.find(pkg => pkg.id === attendee?.ticketPackageId) || requiredPackageList[0] || null
  );
  const requiredPhdIncluded = isRegularBingo && requiredPackageList.some(pkg => pkg?.is_phd);
  const isPhdCreditPackage = (pkg) => pkg?.id === PHD_CREDIT_PACKAGE_ID;
  const getIncludedPhdTotal = () => requiredPhdIncluded ? attendees.length : 0;
  const getAttendeeOptionalPhdQty = (attendee) => (attendee?.addons || []).reduce((sum, addon) => {
    const pkg = optionalPkgs.find(p => p.id === addon.packageId);
    return sum + (pkg?.is_phd ? addon.quantity : 0);
  }, 0);
  const attendeeHasPhdPackage = (attendee) => requiredPhdIncluded || getAttendeeOptionalPhdQty(attendee) > 0;
  const getAddonLimit = (pkg, attendeeIdx = null) => {
    if (!pkg) return 0;
    if (pkg.is_phd) return getOptionalPhdLimit(pkg, attendeeIdx);
    if (isPhdCreditPackage(pkg)) {
      const attendee = attendeeIdx !== null ? attendees[attendeeIdx] : null;
      if (!attendee || !attendeeHasPhdPackage(attendee)) return 0;
    }
    return pkg.max_quantity || 1;
  };
  const getOptionalPhdLimit = (pkg, attendeeIdx = null) => {
    if (!pkg?.is_phd) return pkg?.max_quantity || 1;
    const packageLimit = pkg?.max_quantity || 1;
    const attendee = attendeeIdx !== null ? attendees[attendeeIdx] : null;
    const currentPkgQty = attendee ? getAddonQty(attendeeIdx, pkg.id) : 0;
    const otherPhdQty = attendee ? Math.max(0, getAttendeeOptionalPhdQty(attendee) - currentPkgQty) : 0;
    const perPlayerLimit = isRegularBingo ? (phdInventory?.perPlayerLimit || 2) : 1;
    const perPlayerBase = otherPhdQty;
    const inventoryLimit = Math.max(0, perPlayerLimit - perPlayerBase);
    return Math.min(packageLimit, inventoryLimit);
  };

  const getTotalPhdSelected = () => {
    const optionalDeviceCount = attendees.reduce((sum, attendee) => {
      const optionalQty = getAttendeeOptionalPhdQty(attendee);
      return sum + (isRegularBingo ? (optionalQty > 0 ? 1 : 0) : optionalQty);
    }, 0);
    return getIncludedPhdTotal() + optionalDeviceCount;
  };

  const updateAddon = (attendeeIdx, packageId, quantity) => {
    const pkg = optionalPkgs.find(p => p.id === packageId);
    const maxQty = getAddonLimit(pkg, attendeeIdx);

    // Enforce package quantity and PHD per-player limit.
    if (!pkg || quantity > maxQty) {
      return;
    }

    // Enforce PHD total stock limit
    if (pkg?.is_phd && phdInventory && quantity > getAddonQty(attendeeIdx, packageId)) {
      const attendeeHadPhd = getAttendeeOptionalPhdQty(attendees[attendeeIdx]) > 0;
      const increase = isRegularBingo && attendeeHadPhd ? 0 : quantity - getAddonQty(attendeeIdx, packageId);
      const totalPhdUsed = getTotalPhdSelected();
      if (totalPhdUsed + increase > phdInventory.remaining) {
        return;
      }
    }

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
    if (pkg.is_phd && quantity === 0 && !requiredPhdIncluded) {
      const stillHasPhd = addons.some(addon => {
        const addonPkg = optionalPkgs.find(p => p.id === addon.packageId);
        return addonPkg?.is_phd && addon.quantity > 0;
      });
      if (!stillHasPhd) {
        const creditIndex = addons.findIndex(addon => addon.packageId === PHD_CREDIT_PACKAGE_ID);
        if (creditIndex >= 0) addons.splice(creditIndex, 1);
      }
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
            <h2 className="text-white font-bold text-lg">{isEvent ? 'Book Your Tickets' : 'Book Your Seats'}</h2>
            {session && (
              <p className="text-blue-200 text-sm">{formatDateShort(session.date)} at {formatTime(session.time)}</p>
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
                }`}>{step > t.idx ? '\u2713' : t.idx + 1}</span>
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
                  <span className="text-sm font-bold text-brand-blue uppercase tracking-wide">{isEvent ? 'How many tickets?' : 'How many players?'}</span>
                  {partySize > 0 && (
                    <span className="text-xs bg-brand-blue text-white px-2.5 py-1 rounded-full font-semibold">
                      {partySize} {partySize === 1 ? (isEvent ? 'Ticket' : 'Player') : (isEvent ? 'Tickets' : 'Players')}
                    </span>
                  )}
                </div>

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
              </div>

              {/* Name Forms - shown immediately based on party size */}
              {partySize > 0 && (
                <div>
                  <h3 className="font-bold text-brand-blue text-lg mb-3">
                    {isEvent ? (partySize === 1 ? 'Ticket Holder Name' : 'Ticket Holder Names') : (partySize === 1 ? 'Player Name' : 'Player Names')}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {isEvent
                      ? 'Enter the name for each live event ticket.'
                      : partySize === 1
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
                            {isEvent ? (
                              <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                Ticket ready
                              </span>
                            ) : seatInfo ? (
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
                  {!isEvent && allNamesValid && chairsNeeded > 0 ? (
                    /* Names filled but need more chairs - guide them to floor plan */
                    <button onClick={onPickChairs}
                      className="w-full bg-brand-gold text-white py-3.5 rounded-xl font-semibold text-lg transition hover:bg-brand-gold-light glow-gold-sm flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                      </svg>
                      Select {chairsNeeded} More Chair{chairsNeeded !== 1 ? 's' : ''} on Floor Plan
                    </button>
                  ) : allNamesValid && allSeatsSelected ? (
                    /* All good - go to packages */
                    <button onClick={() => setStep(1)}
                      className="w-full bg-brand-gold text-white py-3.5 rounded-xl font-semibold text-lg transition hover:bg-brand-gold-light glow-gold-sm">
                      {isEvent ? 'Next: Review Ticket' : 'Next: Choose Packages'}
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
            <BookingPackagesStep
              partySize={partySize}
              attendees={attendees}
              selectedSeats={selectedSeats}
              seats={seats}
              optionalPkgs={optionalPkgs}
              serviceFeeUnitAmount={serviceFeeUnitAmount}
              serviceFeeAmount={serviceFeeAmount}
              total={total}
              step={step}
              phdInventory={phdInventory}
              setStep={setStep}
              getSeatInfo={getSeatInfo}
              updateTicketPackage={updateTicketPackage}
              requiredPackageList={requiredPackageList}
              isRegularBingo={isRegularBingo}
              isEvent={isEvent}
              getCheckoutDescription={getCheckoutDescription}
              getAttendeeTicketPackage={getAttendeeTicketPackage}
              isPhdCreditPackage={isPhdCreditPackage}
              getAttendeeOptionalPhdQty={getAttendeeOptionalPhdQty}
              attendeeHasPhdPackage={attendeeHasPhdPackage}
              getAddonLimit={getAddonLimit}
              getTotalPhdSelected={getTotalPhdSelected}
              updateAddon={updateAddon}
              getAddonQty={getAddonQty}
              canGoToReview={canGoToReview}
            />
          )}

          {/* ========== STEP 2: Review & Pay ========== */}
          {step === 2 && (
            <BookingReviewStep
              partySize={partySize}
              attendees={attendees}
              selectedSeats={selectedSeats}
              optionalPkgs={optionalPkgs}
              serviceFeeUnitAmount={serviceFeeUnitAmount}
              serviceFeeAmount={serviceFeeAmount}
              salesTaxAmount={salesTaxAmount}
              total={total}
              loading={loading}
              customerEmail={customerEmail}
              setCustomerEmail={setCustomerEmail}
              emailTouched={emailTouched}
              setEmailTouched={setEmailTouched}
              customerEmailValid={customerEmailValid}
              handlePaySubmit={handlePaySubmit}
              getSeatInfo={getSeatInfo}
              requiredPackageList={requiredPackageList}
              isEvent={isEvent}
              getAttendeeTicketPackage={getAttendeeTicketPackage}
            />
          )}
        </div>
      </div>
    </>
  );
}
