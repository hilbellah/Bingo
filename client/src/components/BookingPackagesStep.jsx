import React from 'react';
import { formatPrice } from '../utils/formatters';

// Step 2 of the booking panel: seats summary, PHD notice, each player's
// required package and add-ons, and the running total. Moved verbatim from
// BookingPanel; every value it reads is passed in.
export default function BookingPackagesStep({
  partySize,
  attendees,
  selectedSeats,
  seats,
  optionalPkgs,
  serviceFeeUnitAmount,
  serviceFeeAmount,
  total,
  step,
  phdInventory,
  setStep,
  getSeatInfo,
  updateTicketPackage,
  requiredPackageList,
  isRegularBingo,
  isEvent,
  getCheckoutDescription,
  getAttendeeTicketPackage,
  isPhdCreditPackage,
  getAttendeeOptionalPhdQty,
  attendeeHasPhdPackage,
  getAddonLimit,
  getTotalPhdSelected,
  updateAddon,
  getAddonQty,
  canGoToReview,
}) {
  return (
    <div>
      {/* Selected seats summary */}
      {selectedSeats.length > 0 && (
        <div className="bg-brand-blue/5 border-2 border-brand-blue/20 rounded-xl px-4 py-3 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-brand-blue uppercase tracking-wide">{isEvent ? 'Your Tickets' : 'Your Seats'}</span>
            <span className="text-xs bg-brand-blue text-white px-2.5 py-1 rounded-full font-semibold">
              {partySize} {partySize === 1 ? (isEvent ? 'Ticket' : 'Player') : (isEvent ? 'Tickets' : 'Players')}
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
                  {isEvent ? `${attendees[i]?.firstName || 'Guest'} - General admission` : `${attendees[i]?.firstName || 'Player'} - T${info?.table} C${info?.chair}`}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* PHD Inventory Notice */}
      {phdInventory && optionalPkgs.some(p => p.is_phd) && (
        <div className={`rounded-xl px-4 py-3 mb-4 border ${
          phdInventory.remaining <= 10 ? 'bg-red-50 border-red-200' :
          phdInventory.remaining <= 30 ? 'bg-amber-50 border-amber-200' :
          'bg-purple-50 border-purple-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Handheld Devices (PHD)</span>
            <span className={`text-sm font-bold ${phdInventory.remaining <= 10 ? 'text-red-600' : 'text-purple-700'}`}>
              {phdInventory.remaining} available
            </span>
          </div>
        </div>
      )}

      <h3 className="font-bold text-brand-blue text-lg mb-4">Packages & Add-ons</h3>

      <div className="space-y-4">
        {attendees.map((att, i) => {
          const seatInfo = getSeatInfo(selectedSeats[i]);
          const phdCreditPkg = optionalPkgs.find(isPhdCreditPackage);
          const showPhdCreditPrompt = phdCreditPkg && attendeeHasPhdPackage(att) && getAddonQty(i, phdCreditPkg.id) === 0;
          return (
            <div key={i} className="border-2 border-gray-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-full bg-brand-blue text-white flex items-center justify-center text-sm font-bold">{i + 1}</span>
                <span className="font-semibold text-brand-blue">{att.firstName} {att.lastName}</span>
                {isEvent ? (
                  <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                    {getAttendeeTicketPackage(att)?.name || 'Ticket'}
                  </span>
                ) : seatInfo && (
                  <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                    T{seatInfo.table} C{seatInfo.chair}
                  </span>
                )}
              </div>

              {/* Required package */}
              {isEvent ? (
                <div className="bg-blue-50 rounded-lg px-3 py-2 mb-2 text-sm">
                  <label className="block text-xs font-semibold text-brand-blue mb-1">Ticket Type</label>
                  <select
                    value={att.ticketPackageId || requiredPackageList[0]?.id || ''}
                    onChange={e => updateTicketPackage(i, e.target.value)}
                    className="w-full px-3 py-2 border border-blue-100 rounded-lg bg-white text-sm focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none"
                  >
                    {requiredPackageList.map(pkg => (
                      <option key={pkg.id} value={pkg.id}>{pkg.name} - {formatPrice(pkg.price)}</option>
                    ))}
                  </select>
                  {getCheckoutDescription(getAttendeeTicketPackage(att)) ? (
                    <p className="mt-1 text-xs text-blue-700/70">{getCheckoutDescription(getAttendeeTicketPackage(att))}</p>
                  ) : null}
                </div>
              ) : (
                requiredPackageList.map(pkg => (
                  <div key={pkg.id} className="bg-blue-50 rounded-lg px-3 py-2 mb-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-brand-blue">{pkg.name} <span className="text-xs text-gray-400">(required)</span></span>
                      <span className="font-bold">{formatPrice(pkg.price)}</span>
                    </div>
                    {getCheckoutDescription(pkg) ? <p className="mt-1 text-xs text-blue-700/70">{getCheckoutDescription(pkg)}</p> : null}
                  </div>
                ))
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
                        const maxQty = getAddonLimit(pkg, i);
                        if (pkg && currentQty < maxQty) {
                          updateAddon(i, pkgId, currentQty + 1);
                        }
                      }
                    }}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none cursor-pointer"
                  >
                    <option value="">+ Add optional items...</option>
                    {optionalPkgs.filter(pkg => !isPhdCreditPackage(pkg)).map(pkg => {
                      const attendeeHasPhd = getAttendeeOptionalPhdQty(attendees[i]) > 0;
                      const stockBlocked = !isRegularBingo || !attendeeHasPhd;
                      const optionLimit = getAddonLimit(pkg, i);
                      const soldOut = pkg.is_phd && phdInventory && (optionLimit <= 0 || (stockBlocked && phdInventory.remaining - getTotalPhdSelected() <= 0)) && getAddonQty(i, pkg.id) === 0;
                      const limitReached = !pkg.is_phd && optionLimit <= getAddonQty(i, pkg.id);
                      return (
                        <option key={pkg.id} value={pkg.id} disabled={soldOut || limitReached}>
                          {pkg.name} - {formatPrice(pkg.price)}{pkg.is_phd ? ' (PHD)' : ''}{soldOut ? ' - SOLD OUT' : limitReached ? ' - LIMIT REACHED' : ''}
                        </option>
                      );
                    })}
                  </select>

                  {showPhdCreditPrompt && (
                    <div className="flex items-center justify-between rounded-lg px-3 py-2 mt-2 text-sm bg-purple-50 border border-purple-100">
                      <div className="flex-1 min-w-0">
                        <div>
                          <span className="font-medium">{phdCreditPkg.name}</span>
                          <span className="text-[10px] ml-1 text-purple-600 font-bold">PHD CREDIT</span>
                          <span className="text-brand-gold font-semibold ml-1">{formatPrice(phdCreditPkg.price)}</span>
                        </div>
                        {phdCreditPkg.description ? <p className="mt-0.5 text-xs text-gray-500">{phdCreditPkg.description}</p> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateAddon(i, phdCreditPkg.id, 1)}
                        className="ml-3 px-3 py-1.5 rounded-lg bg-brand-gold hover:bg-brand-gold-light text-white text-xs font-bold"
                      >
                        Add
                      </button>
                    </div>
                  )}

                  {/* Selected add-ons */}
                  {optionalPkgs.filter(pkg => getAddonQty(i, pkg.id) > 0).map(pkg => {
                    const qty = getAddonQty(i, pkg.id);
                    const maxQty = getAddonLimit(pkg, i);
                    const attendeeHasOtherPhd = getAttendeeOptionalPhdQty(attendees[i]) - qty > 0;
                    const atStockLimit = pkg.is_phd && phdInventory && (!isRegularBingo || !attendeeHasOtherPhd) && (phdInventory.remaining - getTotalPhdSelected() + qty) <= qty;
                    return (
                      <div key={pkg.id} className={`flex items-center justify-between rounded-lg px-3 py-2 mt-1 text-sm ${pkg.is_phd ? 'bg-purple-50' : 'bg-brand-gold/10'}`}>
                        <div className="flex-1 min-w-0">
                          <div>
                            <span className="font-medium">{pkg.name}</span>
                            {pkg.is_phd && <span className="text-[10px] ml-1 text-purple-600 font-bold">PHD</span>}
                            <span className="text-brand-gold font-semibold ml-1">{formatPrice(pkg.price * qty)}</span>
                          </div>
                          {getCheckoutDescription(pkg) ? <p className="mt-0.5 text-xs text-gray-500">{getCheckoutDescription(pkg)}</p> : null}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => updateAddon(i, pkg.id, qty - 1)}
                            className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold flex items-center justify-center text-sm">-</button>
                          {isPhdCreditPackage(pkg) ? (
                            <input
                              type="number"
                              min="1"
                              max={maxQty}
                              step="1"
                              inputMode="numeric"
                              aria-label={`${pkg.name} quantity`}
                              value={qty}
                              onChange={e => {
                                const nextQty = Number.parseInt(e.target.value, 10);
                                if (!Number.isFinite(nextQty)) return;
                                updateAddon(i, pkg.id, Math.min(maxQty, Math.max(1, nextQty)));
                              }}
                              onFocus={e => e.currentTarget.select()}
                              onWheel={e => e.currentTarget.blur()}
                              className="w-16 h-8 rounded-lg border border-gray-300 bg-white px-1 text-center font-bold text-gray-800 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 outline-none"
                            />
                          ) : (
                            <span className="w-5 text-center font-bold">{qty}</span>
                          )}
                          <button onClick={() => updateAddon(i, pkg.id, Math.min(maxQty, qty + 1))}
                            disabled={qty >= maxQty || atStockLimit}
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
          <span className="text-white font-medium">
            Total{serviceFeeAmount > 0 ? ` incl. ${formatPrice(serviceFeeUnitAmount)} x ${partySize} ${partySize === 1 ? 'player' : 'players'} service charge` : ''}
          </span>
          <span className="text-brand-gold text-2xl font-bold">{formatPrice(total)}</span>
        </div>

        <button onClick={() => setStep(2)} disabled={!canGoToReview}
          className="w-full bg-brand-gold text-white py-3 rounded-xl font-semibold text-lg transition hover:bg-brand-gold-light disabled:opacity-40 disabled:cursor-not-allowed glow-gold-sm">
          Review & Pay
        </button>
      </div>
    </div>
  );
}
