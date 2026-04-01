import React from 'react';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

export default function AttendeeForm({ attendees, onChange, requiredPkg, optionalPkgs, total }) {
  const updateAttendee = (index, field, value) => {
    const updated = [...attendees];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
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
    onChange(updated);
  };

  const getAddonQty = (attendeeIdx, packageId) => {
    return attendees[attendeeIdx]?.addons?.find(a => a.packageId === packageId)?.quantity || 0;
  };

  const getPersonSubtotal = (idx) => {
    let sub = requiredPkg?.price || 0;
    for (const addon of (attendees[idx]?.addons || [])) {
      const pkg = optionalPkgs.find(p => p.id === addon.packageId);
      if (pkg) sub += pkg.price * addon.quantity;
    }
    return sub;
  };

  const allValid = attendees.every(a => a.firstName.trim() && a.lastName.trim());

  return (
    <section className="card-warm rounded-3xl p-6 md:p-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="section-badge">3</div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-brand-blue">Player Names & Packages</h2>
          <p className="text-gray-500 text-sm md:text-base">Enter each player's name and choose their bingo packages</p>
        </div>
      </div>

      <div className="space-y-5 mt-6">
        {attendees.map((att, i) => (
          <div key={i} className="bg-white rounded-2xl border-2 border-gray-100 p-5 md:p-6 hover:border-brand-gold/30 transition-colors">
            {/* Player header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-blue to-brand-blue-mid text-white flex items-center justify-center font-bold text-lg">
                  {i + 1}
                </div>
                <span className="font-semibold text-lg text-brand-blue">Player {i + 1}</span>
              </div>
              <div className="bg-brand-gold/10 rounded-full px-4 py-1.5">
                <span className="text-brand-gold font-bold text-lg">{formatPrice(getPersonSubtotal(i))}</span>
              </div>
            </div>

            {/* Name Fields - larger for older users */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor={`first-${i}`}>
                  First Name
                </label>
                <input
                  id={`first-${i}`}
                  type="text"
                  value={att.firstName}
                  onChange={e => updateAttendee(i, 'firstName', e.target.value)}
                  className={`w-full px-4 py-3 border-2 rounded-xl text-lg focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none transition-colors ${
                    att.firstName.trim() ? 'border-gray-200 bg-white' : 'border-red-200 bg-red-50/50'
                  }`}
                  placeholder="Enter first name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor={`last-${i}`}>
                  Last Name
                </label>
                <input
                  id={`last-${i}`}
                  type="text"
                  value={att.lastName}
                  onChange={e => updateAttendee(i, 'lastName', e.target.value)}
                  className={`w-full px-4 py-3 border-2 rounded-xl text-lg focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none transition-colors ${
                    att.lastName.trim() ? 'border-gray-200 bg-white' : 'border-red-200 bg-red-50/50'
                  }`}
                  placeholder="Enter last name"
                />
              </div>
            </div>

            {/* Required Package */}
            {requiredPkg && (
              <div className="bg-gradient-to-r from-brand-blue/5 to-brand-gold/5 border border-brand-blue/10 rounded-xl px-4 py-3 mb-4 flex justify-between items-center">
                <div>
                  <span className="text-base font-semibold text-brand-blue">{requiredPkg.name}</span>
                  <span className="ml-2 text-xs bg-brand-blue text-white px-2 py-0.5 rounded-full font-medium">Included</span>
                </div>
                <span className="text-lg font-bold text-brand-blue">{formatPrice(requiredPkg.price)}</span>
              </div>
            )}

            {/* Optional Add-ons */}
            {optionalPkgs.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Optional Add-ons</p>
                <div className="space-y-2">
                  {optionalPkgs.map(pkg => {
                    const qty = getAddonQty(i, pkg.id);
                    return (
                      <div key={pkg.id} className={`flex items-center justify-between rounded-xl px-4 py-3 transition-colors ${
                        qty > 0 ? 'bg-brand-gold/10 border border-brand-gold/20' : 'bg-gray-50 border border-transparent'
                      }`}>
                        <div className="flex-1 mr-4">
                          <span className="text-base font-medium text-gray-800">{pkg.name}</span>
                          <span className="text-sm text-brand-gold font-semibold ml-2">{formatPrice(pkg.price)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateAddon(i, pkg.id, Math.max(0, qty - 1))}
                            className="w-9 h-9 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-lg flex items-center justify-center transition-colors"
                            disabled={qty === 0}
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-lg font-bold text-brand-blue">
                            {qty}
                          </span>
                          <button
                            onClick={() => updateAddon(i, pkg.id, Math.min(pkg.max_quantity, qty + 1))}
                            className="w-9 h-9 rounded-full bg-brand-gold hover:bg-brand-gold-light text-white font-bold text-lg flex items-center justify-center transition-colors"
                            disabled={qty >= pkg.max_quantity}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Running Total */}
      <div className="mt-6 bg-gradient-to-r from-brand-blue to-brand-blue-mid rounded-2xl px-6 py-5 flex justify-between items-center glow-gold-sm">
        <div>
          <span className="text-blue-200 text-sm font-medium">Running Total</span>
          <p className="text-white font-semibold text-lg">{attendees.length} {attendees.length === 1 ? 'player' : 'players'}</p>
        </div>
        <span className="text-brand-gold text-3xl font-bold">{formatPrice(total)}</span>
      </div>

      {!allValid && attendees.length > 0 && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-center">
          <p className="text-base text-red-600 font-medium">
            Please fill in all player names before selecting seats
          </p>
        </div>
      )}
    </section>
  );
}
