import React from 'react';
import { formatDateLong, formatTime, formatPrice } from '../utils/formatters';

export default function Confirmation({ booking, session, attendees, seats, selectedSeats, requiredPkg, optionalPkgs = [] }) {

  const getSeatInfo = (seatId) => {
    const seat = seats.find(s => s.id === seatId);
    return seat ? { table: seat.table_number, chair: seat.chair_number } : { table: '?', chair: '?' };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-blue-dark via-brand-blue to-brand-blue-mid flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 md:p-10">
        {/* Success icon */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-brand-blue">You're All Set!</h1>
          <p className="text-gray-500 text-lg mt-1">Your bingo seats are confirmed</p>
        </div>

        {/* Reference number */}
        <div className="bg-brand-gold/10 border-2 border-brand-gold/30 rounded-2xl p-5 mb-6 text-center">
          <p className="text-sm text-gray-500 font-medium">Booking Reference</p>
          <p className="text-2xl font-mono font-bold text-brand-blue mt-1 tracking-wider">{booking.referenceNumber}</p>
        </div>

        {/* Booking details */}
        <div className="bg-gray-50 rounded-2xl p-5 mb-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 font-medium">Session</span>
            <span className="font-semibold text-brand-blue">{formatDateLong(session?.date)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 font-medium">Time</span>
            <span className="font-semibold">{formatTime(session?.time)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 font-medium">Total Paid</span>
            <span className="font-bold text-xl text-brand-gold">{booking.totalFormatted}</span>
          </div>
        </div>

        {/* Seats */}
        <div className="mb-6">
          <h3 className="font-bold text-brand-blue mb-3 text-lg">Your Tickets</h3>
          <div className="space-y-2">
            {attendees.map((att, i) => {
              const info = getSeatInfo(selectedSeats[i]);
              const ticketRef = booking.itemReferences?.[i];
              const addonDetails = [];
              for (const addon of (att.addons || [])) {
                const pkg = optionalPkgs.find(p => p.id === addon.packageId);
                if (pkg && addon.quantity > 0) {
                  addonDetails.push({ name: pkg.name, qty: addon.quantity, price: pkg.price * addon.quantity });
                }
              }
              return (
                <div key={i} className="py-2 border-b border-gray-100 last:border-0">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-blue text-white flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </div>
                      <span className="font-medium text-base">{att.firstName} {att.lastName}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      Table {info.table}, Chair {info.chair}
                    </span>
                  </div>
                  {ticketRef && (
                    <div className="ml-9 mt-1">
                      <span className="font-mono text-xs text-brand-blue font-semibold bg-brand-gold/10 px-2 py-0.5 rounded">{ticketRef}</span>
                    </div>
                  )}
                  <div className="ml-9 mt-1 text-sm text-gray-500 space-y-0.5">
                    {requiredPkg && <p>{requiredPkg.name} - {formatPrice(requiredPkg.price)}</p>}
                    {addonDetails.map((a, j) => (
                      <p key={j}>{a.name} x{a.qty} - {formatPrice(a.price)}</p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Email-confirmation notice — replaces the old Print Tickets flow.
            Customers now receive their booking by email; this block tells them
            where to expect it and what to do if it doesn't arrive. */}
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 mb-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-green-800">
                Confirmation email sent
              </p>
              {booking.email ? (
                <p className="text-sm text-green-700 mt-0.5">
                  We've emailed your tickets to <strong className="font-semibold">{booking.email}</strong>.
                </p>
              ) : (
                <p className="text-sm text-green-700 mt-0.5">
                  We've emailed your tickets to the address you provided.
                </p>
              )}
              <p className="text-xs text-green-700 mt-1">
                Don't see it? Check your spam or junk folder, then keep this booking reference handy as a backup.
              </p>
            </div>
          </div>
        </div>

        {/* Reminder */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 mb-6">
          <p className="text-sm text-blue-700 font-medium">
            Please arrive by <strong>4:30 PM</strong> - Doors open 1 hour before the session starts.
            Bring this reference number with you.
          </p>
        </div>

        {/* Actions */}
        <div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-brand-gold text-white py-3 rounded-xl font-semibold text-base hover:bg-brand-gold-light transition flex items-center justify-center gap-2"
          >
            Book Again
          </button>
        </div>
      </div>
    </div>
  );
}
