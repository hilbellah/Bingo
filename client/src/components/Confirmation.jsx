import React from 'react';
import { useNavigate } from 'react-router-dom';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function Confirmation({ booking, session, attendees, seats, selectedSeats }) {
  const navigate = useNavigate();

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
            <span className="font-semibold text-brand-blue">{formatDate(session?.date)}</span>
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
          <h3 className="font-bold text-brand-blue mb-3 text-lg">Your Seats</h3>
          <div className="space-y-2">
            {attendees.map((att, i) => {
              const info = getSeatInfo(selectedSeats[i]);
              return (
                <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
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
              );
            })}
          </div>
        </div>

        {/* Reminder */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 mb-6">
          <p className="text-sm text-blue-700 font-medium">
            Please arrive by <strong>4:30 PM</strong> — Doors open 1 hour before the session starts.
            Bring this reference number with you.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/tickets/${booking.referenceNumber}`)}
            className="flex-1 bg-brand-blue text-white py-3 rounded-xl font-semibold text-base hover:bg-brand-blue/90 transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Tickets
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 bg-brand-gold text-white py-3 rounded-xl font-semibold text-base hover:bg-brand-gold-light transition flex items-center justify-center gap-2"
          >
            Book Again
          </button>
        </div>
      </div>
    </div>
  );
}
