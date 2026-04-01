import React, { useState, useEffect } from 'react';
import { SECTIONS } from '../seatLayout';

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

/* Compact table box for the floor plan */
function TableBox({ tableNumber, tableSeats, selectedSeats, holderId, onSeatClick, isExpanded, onToggle }) {
  if (tableNumber === null) return <div className="w-[52px] h-[52px]" />;

  const total = tableSeats.length;
  const available = tableSeats.filter(s => s.status === 'available' && !s.is_disabled).length;
  const mySelections = tableSeats.filter(s => selectedSeats.includes(s.id) || (s.status === 'held' && s.held_by === holderId)).length;
  const soldOrHeld = tableSeats.filter(s => s.status === 'sold' || (s.status === 'held' && s.held_by !== holderId)).length;
  const allSold = available === 0 && mySelections === 0;

  let bgColor = 'bg-emerald-600 hover:bg-emerald-500 border-emerald-700';
  let textColor = 'text-white';
  if (allSold) {
    bgColor = 'bg-gray-500 border-gray-600 cursor-not-allowed';
    textColor = 'text-gray-300';
  } else if (mySelections > 0) {
    bgColor = 'bg-blue-500 hover:bg-blue-400 border-blue-600 ring-2 ring-blue-300';
    textColor = 'text-white';
  } else if (available < total && available > 0) {
    bgColor = 'bg-amber-500 hover:bg-amber-400 border-amber-600';
    textColor = 'text-white';
  }

  return (
    <div className="relative">
      <button
        onClick={() => !allSold && onToggle(tableNumber)}
        disabled={allSold}
        className={`w-[52px] h-[52px] rounded-lg border-2 flex flex-col items-center justify-center transition-all duration-150 ${bgColor} ${textColor}`}
        title={`Table ${tableNumber} — ${available}/${total} available`}
      >
        <span className="text-sm font-bold leading-none">{tableNumber}</span>
        <span className="text-[9px] leading-none mt-0.5 opacity-80">{mySelections > 0 ? `${mySelections}sel` : `${available}/${total}`}</span>
      </button>

      {/* Expanded seat picker dropdown */}
      {isExpanded && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-xl shadow-2xl border-2 border-gray-200 p-3 min-w-[180px]"
          onClick={e => e.stopPropagation()}>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 text-center">
            Table {tableNumber} — Pick Seats
          </div>
          <div className="flex items-center gap-2 justify-center">
            {/* Left seats */}
            <div className="flex flex-col gap-1.5">
              {tableSeats.filter(s => s.seat_number % 2 === 1).sort((a, b) => a.seat_number - b.seat_number).map(seat => (
                <SeatButton key={seat.id} seat={seat} isSelected={selectedSeats.includes(seat.id)}
                  holderId={holderId} onClick={onSeatClick} />
              ))}
            </div>
            {/* Table surface */}
            <div className="w-8 h-20 rounded-lg bg-gray-100 border-2 border-gray-200 flex items-center justify-center">
              <span className="text-gray-300 text-[8px] font-bold uppercase [writing-mode:vertical-rl]">Table</span>
            </div>
            {/* Right seats */}
            <div className="flex flex-col gap-1.5">
              {tableSeats.filter(s => s.seat_number % 2 === 0).sort((a, b) => a.seat_number - b.seat_number).map(seat => (
                <SeatButton key={seat.id} seat={seat} isSelected={selectedSeats.includes(seat.id)}
                  holderId={holderId} onClick={onSeatClick} />
              ))}
            </div>
          </div>
          <button onClick={() => onToggle(null)}
            className="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 text-center">
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function SeatButton({ seat, isSelected, holderId, onClick }) {
  const isMyHold = seat.status === 'held' && seat.held_by === holderId;
  const isOtherHold = seat.status === 'held' && seat.held_by !== holderId;

  let className = 'w-8 h-8 rounded-md text-xs font-bold transition-all duration-150 border-2 ';
  let label = `Seat ${seat.seat_number}`;

  if (seat.is_disabled) {
    className += 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed';
    label += ' - Unavailable';
  } else if (seat.status === 'sold') {
    className += 'bg-gray-400 border-gray-500 text-gray-200 cursor-not-allowed';
    label += ' - Sold';
  } else if (isSelected || isMyHold) {
    className += 'bg-blue-500 border-blue-600 text-white shadow-md';
    label += ' - Your selection';
  } else if (isOtherHold) {
    className += 'bg-amber-400 border-amber-500 text-white cursor-not-allowed';
    label += ' - On Hold';
  } else {
    className += 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-400 cursor-pointer';
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

/* Render a section as a grid of TableBoxes */
function SectionGrid({ section, tables, selectedSeats, holderId, onSeatClick, expandedTable, onToggle }) {
  return (
    <div className="flex flex-col gap-1">
      {section.seats.map((row, ri) => (
        <div key={ri} className="flex gap-1">
          {row.map((num, ci) => {
            const table = num !== null ? tables[num] : null;
            return (
              <TableBox
                key={`${section.id}-${ri}-${ci}`}
                tableNumber={num}
                tableSeats={table ? table.seats : []}
                selectedSeats={selectedSeats}
                holderId={holderId}
                onSeatClick={onSeatClick}
                isExpanded={expandedTable === num}
                onToggle={onToggle}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function SeatMap({ seats, selectedSeats, holderId, partySize, onSeatClick, holdExpiry }) {
  const [expandedTable, setExpandedTable] = useState(null);

  const handleToggle = (tableNum) => {
    setExpandedTable(prev => prev === tableNum ? null : tableNum);
  };

  // Close expanded table when clicking outside
  useEffect(() => {
    const handler = () => setExpandedTable(null);
    if (expandedTable !== null) {
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [expandedTable]);

  // Group seats by table
  const tables = {};
  for (const seat of seats) {
    const tn = seat.table_number;
    if (!tables[tn]) tables[tn] = { number: tn, seats: [] };
    tables[tn].seats.push(seat);
  }

  const seatsRemaining = partySize - selectedSeats.length;

  // Get section data
  const upperLeft = SECTIONS.find(s => s.id === 'upper-left');
  const upperRight = SECTIONS.find(s => s.id === 'upper-right');
  const lowerLeft = SECTIONS.find(s => s.id === 'lower-left');
  const lowerCenterLeft = SECTIONS.find(s => s.id === 'lower-center-left');
  const centerLeftInner = SECTIONS.find(s => s.id === 'center-left-inner');
  const centerColumn = SECTIONS.find(s => s.id === 'center-column');
  const lowerRight = SECTIONS.find(s => s.id === 'lower-right');

  const sectionProps = { tables, selectedSeats, holderId, onSeatClick, expandedTable, onToggle: handleToggle };

  return (
    <section className="card-warm rounded-3xl p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="section-badge">4</div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-brand-blue">Choose Your Seats</h2>
            <p className="text-gray-500 text-base">
              {seatsRemaining > 0
                ? <>Tap a table, then pick <strong className="text-brand-blue">{partySize}</strong> {partySize === 1 ? 'seat' : 'seats'} — <span className="text-brand-gold font-semibold">{selectedSeats.length} picked, {seatsRemaining} to go</span></>
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
          <span className="w-6 h-6 rounded-lg bg-emerald-600 border-2 border-emerald-700"></span>
          <span className="text-sm font-medium text-gray-600">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-blue-500 border-2 border-blue-600"></span>
          <span className="text-sm font-medium text-gray-600">Your Pick</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-amber-500 border-2 border-amber-600"></span>
          <span className="text-sm font-medium text-gray-600">Partial</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-gray-500 border-2 border-gray-600"></span>
          <span className="text-sm font-medium text-gray-600">Sold Out</span>
        </div>
      </div>

      {/* Floor Plan */}
      <div className="seat-map-container overflow-x-auto pb-4" onClick={() => setExpandedTable(null)}>
        <div className="min-w-[700px] bg-slate-800 rounded-2xl p-5 border-2 border-slate-600" onClick={e => e.stopPropagation()}>

          {/* FRONT OF ROOM — STAGE label */}
          <div className="text-center mb-3">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
              Front of Room — Stage
            </span>
            <div className="mt-1.5 h-0.5 bg-gradient-to-r from-transparent via-slate-500 to-transparent"></div>
          </div>

          {/* === UPPER SECTION: Left block + Floor Stage + Right block === */}
          <div className="flex items-start justify-between gap-4 mb-6">
            {/* Upper Left Block */}
            <SectionGrid section={upperLeft} {...sectionProps} />

            {/* Floor Stage */}
            <div className="flex-1 flex items-center justify-center min-h-[168px]">
              <div className="w-full max-w-[220px] h-[140px] border-2 border-slate-500 bg-slate-700/50 rounded-lg flex items-center justify-center">
                <span className="text-slate-400 font-bold text-lg tracking-wide">Floor Stage</span>
              </div>
            </div>

            {/* Upper Right Block */}
            <SectionGrid section={upperRight} {...sectionProps} />
          </div>

          {/* === LOWER SECTION: Left + Center-Left + Inner + Center Column + Right === */}
          <div className="flex items-start gap-3">
            {/* Lower Left */}
            <SectionGrid section={lowerLeft} {...sectionProps} />

            {/* Lower Center Left */}
            <SectionGrid section={lowerCenterLeft} {...sectionProps} />

            {/* Center Left Inner (transition tables 34-36, 40) */}
            <SectionGrid section={centerLeftInner} {...sectionProps} />

            {/* Caller / Announcer position */}
            <div className="flex items-center justify-center self-center">
              <div className="w-8 h-8 bg-amber-800 border-2 border-amber-600 rounded-sm" title="Caller Position"></div>
            </div>

            {/* Center Column */}
            <SectionGrid section={centerColumn} {...sectionProps} />

            {/* Lower Right */}
            <SectionGrid section={lowerRight} {...sectionProps} />
          </div>

          {/* BACK OF ROOM — ENTRANCE label */}
          <div className="text-center mt-4">
            <div className="h-0.5 bg-gradient-to-r from-transparent via-slate-500 to-transparent mb-1.5"></div>
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
              Back of Room — Entrance
            </span>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100 text-center">
        <p className="text-sm text-blue-600">
          <strong>Tap a table</strong> to see and select individual seats. Green = available, Blue = your pick.
        </p>
      </div>
    </section>
  );
}
