import React, { useState, useEffect } from 'react';

function CountdownTimer({ expiry }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!expiry) return;
    const update = () => {
      const diff = new Date(expiry) - new Date();
      if (diff <= 0) { setRemaining('EXPIRED'); return; }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  if (!expiry) return null;
  const isLow = remaining !== 'EXPIRED' && parseInt(remaining) < 3;

  return (
    <div className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-base font-bold ${
      remaining === 'EXPIRED' ? 'bg-red-100 text-red-700 border-2 border-red-300' :
      isLow ? 'bg-amber-100 text-amber-700 border-2 border-amber-300 animate-pulse' :
      'bg-blue-100 text-blue-700 border-2 border-blue-200'
    }`}>
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
      {remaining === 'EXPIRED' ? 'Time expired — seats released' : `${remaining} to complete booking`}
    </div>
  );
}

function SeatButton({ seat, isSelected, holderId, onClick }) {
  const isMyHold = seat.status === 'held' && seat.held_by === holderId;
  const isOtherHold = seat.status === 'held' && seat.held_by !== holderId;

  let className = 'seat-btn ';
  let label = `Seat ${seat.seat_number}`;

  if (seat.is_disabled) {
    className += 'seat-disabled';
    label += ' - Unavailable';
  } else if (seat.status === 'sold') {
    className += 'seat-sold';
    label += ' - Sold';
  } else if (isSelected || isMyHold) {
    className += 'seat-selected';
    label += ' - Your selection';
  } else if (isOtherHold) {
    className += 'seat-held';
    label += ' - On Hold';
  } else {
    className += 'seat-vacant';
    label += ' - Available';
  }

  return (
    <button
      onClick={() => onClick(seat)}
      disabled={seat.is_disabled || seat.status === 'sold' || isOtherHold}
      className={className}
      aria-label={label}
      title={label}
    >
      {seat.seat_number}
    </button>
  );
}

export default function SeatMap({ seats, selectedSeats, holderId, partySize, onSeatClick, holdExpiry }) {
  const [hoveredTable, setHoveredTable] = useState(null);

  // Group seats by table
  const tables = {};
  for (const seat of seats) {
    const tn = seat.table_number;
    if (!tables[tn]) tables[tn] = { number: tn, posX: seat.position_x, posY: seat.position_y, seats: [] };
    tables[tn].seats.push(seat);
  }

  const tableList = Object.values(tables).sort((a, b) => a.number - b.number);
  const seatsRemaining = partySize - selectedSeats.length;

  return (
    <section className="card-warm rounded-3xl p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="section-badge">4</div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-brand-blue">Choose Your Seats</h2>
            <p className="text-gray-500 text-base">
              {seatsRemaining > 0
                ? <>Tap <strong className="text-brand-blue">{partySize}</strong> {partySize === 1 ? 'seat' : 'seats'} — <span className="text-brand-gold font-semibold">{selectedSeats.length} picked, {seatsRemaining} to go</span></>
                : <span className="text-green-600 font-semibold">All {partySize} seats selected</span>
              }
            </p>
          </div>
        </div>
        <CountdownTimer expiry={holdExpiry} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 mb-6 p-4 bg-gray-50 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg seat-vacant"></span>
          <span className="text-sm font-medium text-gray-600">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg seat-selected"></span>
          <span className="text-sm font-medium text-gray-600">Your Pick</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg seat-held"></span>
          <span className="text-sm font-medium text-gray-600">Someone Else</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg seat-sold"></span>
          <span className="text-sm font-medium text-gray-600">Sold</span>
        </div>
      </div>

      {/* Room Label */}
      <div className="text-center mb-4">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
          Main Bingo Hall — Front of Room
        </span>
        <div className="mt-2 h-1 bg-gradient-to-r from-transparent via-brand-gold/40 to-transparent rounded-full"></div>
      </div>

      {/* Seat Map Grid */}
      <div className="seat-map-container pb-4">
        <div className="grid grid-cols-3 gap-5 min-w-[560px]">
          {tableList.map(table => {
            const leftSeats = table.seats.filter(s => s.seat_number % 2 === 1).sort((a, b) => a.seat_number - b.seat_number);
            const rightSeats = table.seats.filter(s => s.seat_number % 2 === 0).sort((a, b) => a.seat_number - b.seat_number);
            const hasMySeats = table.seats.some(s => selectedSeats.includes(s.id));

            return (
              <div
                key={table.number}
                className={`rounded-2xl p-4 transition-all duration-200 ${
                  hasMySeats ? 'bg-blue-50 border-2 border-blue-200 shadow-lg' :
                  hoveredTable === table.number ? 'bg-brand-cream border-2 border-brand-gold/30 shadow-md' :
                  'bg-white border-2 border-gray-100'
                }`}
                onMouseEnter={() => setHoveredTable(table.number)}
                onMouseLeave={() => setHoveredTable(null)}
              >
                <div className={`text-center text-xs font-bold uppercase tracking-wider mb-3 ${
                  hasMySeats ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  Table {table.number}
                </div>

                <div className="flex items-center gap-3 justify-center">
                  {/* Left column */}
                  <div className="flex flex-col gap-2">
                    {leftSeats.map(seat => (
                      <SeatButton key={seat.id} seat={seat} isSelected={selectedSeats.includes(seat.id)}
                        holderId={holderId} onClick={onSeatClick} />
                    ))}
                  </div>

                  {/* Table surface */}
                  <div className={`w-12 h-28 rounded-xl flex items-center justify-center ${
                    hasMySeats ? 'bg-blue-100 border-2 border-blue-200' : 'bg-gray-100 border-2 border-gray-200'
                  }`}>
                    <span className="text-gray-300 text-[9px] font-bold uppercase tracking-widest [writing-mode:vertical-rl]">
                      Table
                    </span>
                  </div>

                  {/* Right column */}
                  <div className="flex flex-col gap-2">
                    {rightSeats.map(seat => (
                      <SeatButton key={seat.id} seat={seat} isSelected={selectedSeats.includes(seat.id)}
                        holderId={holderId} onClick={onSeatClick} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom room label */}
      <div className="text-center mt-4">
        <div className="h-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent rounded-full mb-2"></div>
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Back of Room — Entrance</span>
      </div>

      {/* Hovered table info */}
      {hoveredTable && (
        <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="font-semibold text-brand-blue mb-1">Table {hoveredTable}</p>
          <div className="flex flex-wrap gap-2">
            {tables[hoveredTable]?.seats.map(s => {
              const status = selectedSeats.includes(s.id) ? 'YOUR PICK' :
                s.status === 'sold' ? 'Sold' :
                s.status === 'held' ? (s.held_by === holderId ? 'YOUR PICK' : 'Held') :
                s.is_disabled ? 'N/A' : 'Open';
              const color = status === 'YOUR PICK' ? 'bg-blue-100 text-blue-700' :
                status === 'Open' ? 'bg-green-100 text-green-700' :
                status === 'Held' ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-500';
              return (
                <span key={s.id} className={`${color} px-3 py-1 rounded-full text-xs font-semibold`}>
                  Seat {s.seat_number}: {status}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
