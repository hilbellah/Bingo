import React from 'react';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function OrderSummary({ session, attendees, seats, selectedSeats, requiredPkg, optionalPkgs, total }) {
  const getSeatInfo = (seatId) => {
    const seat = seats.find(s => s.id === seatId);
    return seat ? { table: seat.table_number, seat: seat.seat_number } : { table: '?', seat: '?' };
  };

  return (
    <section className="card-warm rounded-3xl p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="section-badge">5</div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-brand-blue">Review Your Order</h2>
          <p className="text-gray-500 text-base">Double-check everything before payment</p>
        </div>
      </div>

      {/* Session Info */}
      <div className="bg-gradient-to-r from-brand-blue to-brand-blue-mid rounded-2xl px-6 py-4 mb-6 text-white">
        <div className="flex items-center gap-3">
          <svg className="w-8 h-8 text-brand-gold flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-lg font-bold">{formatDate(session.date)}</p>
            <p className="text-blue-200">{formatTime(session.time)} — Saint Mary's Entertainment Centre</p>
          </div>
        </div>
      </div>

      {/* Attendee Breakdown */}
      <div className="space-y-3 mb-6">
        {attendees.map((att, i) => {
          const seatInfo = getSeatInfo(selectedSeats[i]);
          let personTotal = requiredPkg?.price || 0;
          const addonDetails = [];

          for (const addon of (att.addons || [])) {
            const pkg = optionalPkgs.find(p => p.id === addon.packageId);
            if (pkg && addon.quantity > 0) {
              personTotal += pkg.price * addon.quantity;
              addonDetails.push({ name: pkg.name, qty: addon.quantity, price: pkg.price * addon.quantity });
            }
          }

          return (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-blue text-white flex items-center justify-center font-bold text-sm">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-bold text-lg text-brand-blue">{att.firstName} {att.lastName}</p>
                    <p className="text-sm text-gray-500">
                      Table {seatInfo.table} — Seat {seatInfo.seat}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-lg text-brand-gold">{formatPrice(personTotal)}</span>
              </div>
              <div className="mt-2 ml-11 text-sm text-gray-500 space-y-0.5">
                <p>{requiredPkg?.name} — {formatPrice(requiredPkg?.price || 0)}</p>
                {addonDetails.map((a, j) => (
                  <p key={j}>{a.name} x{a.qty} — {formatPrice(a.price)}</p>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grand Total */}
      <div className="border-t-2 border-brand-gold/20 pt-4 flex justify-between items-center">
        <div>
          <span className="text-gray-500 text-sm">Grand Total</span>
          <p className="text-brand-blue font-semibold">{attendees.length} {attendees.length === 1 ? 'player' : 'players'}</p>
        </div>
        <span className="text-4xl font-bold text-brand-gold">{formatPrice(total)}</span>
      </div>
    </section>
  );
}
