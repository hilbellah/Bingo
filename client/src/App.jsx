import React, { useState, useEffect, useRef } from 'react';
import { fetchSessions, fetchSeats, fetchPackages, lockSeat, unlockSeat, createBooking } from './api';
import { useSocket } from './useSocket';
import BookingPanel from './components/BookingPanel';
import Confirmation from './components/Confirmation';
import { SECTIONS } from './seatLayout';

function generateHolderId() {
  const stored = sessionStorage.getItem('bingo_holder_id');
  if (stored) return stored;
  const id = 'holder_' + Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem('bingo_holder_id', id);
  return id;
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

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
    <span className={`font-mono font-bold ${
      remaining === 'EXPIRED' ? 'text-red-400' : isLow ? 'text-amber-400 animate-pulse' : 'text-white'
    }`}>
      {remaining === 'EXPIRED' ? 'Expired' : remaining}
    </span>
  );
}

export default function App() {
  const holderId = useRef(generateHolderId()).current;
  const socketRef = useSocket();

  const [sessions, setSessions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [partySize, setPartySize] = useState(0);
  const [attendees, setAttendees] = useState([]);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [holdExpiry, setHoldExpiry] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [openTable, setOpenTable] = useState(null); // which table's chairs are expanded

  // Load initial data
  useEffect(() => {
    fetchSessions().then(data => {
      setSessions(data);
      if (data.length > 0) setSelectedSession(data[0]);
    });
    fetchPackages().then(setPackages);
  }, []);

  // Load seats when session changes
  useEffect(() => {
    if (!selectedSession) return;
    fetchSeats(selectedSession.id).then(setSeats);
    setOpenTable(null);

    const socket = socketRef.current;
    if (socket) {
      socket.emit('join:session', selectedSession.id);
      const handleLocked = (data) => {
        setSeats(prev => prev.map(s =>
          s.id === data.seatId ? { ...s, status: 'held', held_by: data.holderId, held_until: data.holdUntil } : s
        ));
      };
      const handleUnlocked = (data) => {
        setSeats(prev => prev.map(s =>
          s.id === data.seatId ? { ...s, status: 'vacant', held_by: null, held_until: null } : s
        ));
      };
      const handleSold = (data) => {
        setSeats(prev => prev.map(s =>
          s.id === data.seatId ? { ...s, status: 'sold', held_by: null, held_until: null } : s
        ));
      };
      const handleRefresh = () => fetchSeats(selectedSession.id).then(setSeats);

      socket.on('seat:locked', handleLocked);
      socket.on('seat:unlocked', handleUnlocked);
      socket.on('seat:sold', handleSold);
      socket.on('seats:refresh', handleRefresh);

      return () => {
        socket.emit('leave:session', selectedSession.id);
        socket.off('seat:locked', handleLocked);
        socket.off('seat:unlocked', handleUnlocked);
        socket.off('seat:sold', handleSold);
        socket.off('seats:refresh', handleRefresh);
      };
    }
  }, [selectedSession]);

  // Chair click handler — selecting chairs auto-fills party size
  const handleChairClick = async (chair) => {
    if (chair.is_disabled || chair.status === 'sold') return;
    if (chair.status === 'held' && chair.held_by !== holderId) return;

    // Deselect
    if (selectedSeats.includes(chair.id)) {
      await unlockSeat(chair.id, holderId);
      const newSelected = selectedSeats.filter(id => id !== chair.id);
      setSelectedSeats(newSelected);
      // Auto-update party size and attendees
      const newSize = newSelected.length;
      setPartySize(newSize);
      setAttendees(prev => prev.slice(0, newSize));
      return;
    }

    // Max 6 chairs per booking
    if (selectedSeats.length >= 6) {
      setError('Maximum 6 chairs per booking. Tap a selected chair to deselect.');
      setTimeout(() => setError(''), 4000);
      return;
    }

    const result = await lockSeat(chair.id, holderId);
    if (result.success) {
      const newSelected = [...selectedSeats, chair.id];
      setSelectedSeats(newSelected);
      // Auto-update party size and grow attendees
      const newSize = newSelected.length;
      setPartySize(newSize);
      setAttendees(prev => {
        const updated = [...prev];
        while (updated.length < newSize) {
          updated.push({ firstName: '', lastName: '', addons: [] });
        }
        return updated;
      });
      if (!holdExpiry || new Date(result.holdUntil) > new Date(holdExpiry)) {
        setHoldExpiry(result.holdUntil);
      }
    } else {
      setError(result.error || 'Could not select chair');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handlePartySize = (size) => {
    setPartySize(size);
    setAttendees(Array.from({ length: size }, (_, i) => ({
      firstName: attendees[i]?.firstName || '',
      lastName: attendees[i]?.lastName || '',
      addons: attendees[i]?.addons || []
    })));
    if (size < selectedSeats.length) {
      const toRelease = selectedSeats.slice(size);
      for (const seatId of toRelease) unlockSeat(seatId, holderId);
      setSelectedSeats(selectedSeats.slice(0, size));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    const bookingAttendees = attendees.map((att, i) => ({
      firstName: att.firstName, lastName: att.lastName,
      seatId: selectedSeats[i], addons: att.addons.filter(a => a.quantity > 0)
    }));
    const result = await createBooking(selectedSession.id, holderId, bookingAttendees);
    setLoading(false);
    if (result.bookingId) setBooking(result);
    else setError(result.error || 'Booking failed');
  };

  const requiredPkg = packages.find(p => p.type === 'required');
  const optionalPkgs = packages.filter(p => p.type === 'optional');

  const calculateTotal = () => {
    let total = partySize * (requiredPkg?.price || 0);
    for (const att of attendees) {
      for (const addon of att.addons) {
        const pkg = optionalPkgs.find(p => p.id === addon.packageId);
        if (pkg) total += pkg.price * addon.quantity;
      }
    }
    return total;
  };

  const allNamesValid = attendees.length > 0 && attendees.every(a => a.firstName.trim() && a.lastName.trim());
  const allSeatsSelected = selectedSeats.length === partySize && partySize > 0;

  if (booking) {
    return <Confirmation booking={booking} session={selectedSession} attendees={attendees}
      seats={seats} selectedSeats={selectedSeats} requiredPkg={requiredPkg} />;
  }

  // Group seats by table_number
  const tableMap = {};
  for (const seat of seats) {
    if (!tableMap[seat.table_number]) tableMap[seat.table_number] = [];
    tableMap[seat.table_number].push(seat);
  }

  // Stats (chairs)
  const vacantCount = seats.filter(s => s.status === 'vacant' && !s.is_disabled).length;
  const soldCount = seats.filter(s => s.status === 'sold').length;
  const heldCount = seats.filter(s => s.status === 'held').length;

  // Table status helper
  const getTableStatus = (tableNum) => {
    const chairs = tableMap[tableNum] || [];
    if (chairs.length === 0) return 'empty';
    const hasMyChairs = chairs.some(c => selectedSeats.includes(c.id));
    const allSold = chairs.every(c => c.status === 'sold' || c.is_disabled);
    const allVacant = chairs.every(c => c.status === 'vacant' && !c.is_disabled);
    const vacantChairs = chairs.filter(c => c.status === 'vacant' && !c.is_disabled).length;
    return { hasMyChairs, allSold, allVacant, vacantChairs, total: chairs.length };
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="bg-brand-blue-dark border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-gold flex items-center justify-center">
            <span className="text-white text-lg font-bold">B</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-base md:text-lg leading-tight">Saint Mary's Entertainment Centre</h1>
            <p className="text-brand-gold text-xs font-medium">Bingo — Nightly Jackpots up to $5,000</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {holdExpiry && selectedSeats.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5 text-sm">
              <svg className="w-4 h-4 text-brand-gold" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <CountdownTimer expiry={holdExpiry} />
            </div>
          )}
          <button
            onClick={() => setPanelOpen(true)}
            className={`relative px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
              allSeatsSelected && allNamesValid
                ? 'bg-brand-gold text-white glow-gold-sm hover:bg-brand-gold-light'
                : partySize > 0
                ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                : 'bg-brand-gold text-white hover:bg-brand-gold-light'
            }`}
          >
            {allSeatsSelected && allNamesValid ? 'Complete Booking' : selectedSeats.length > 0 ? `Booking (${selectedSeats.length})` : 'Start Booking'}
            {selectedSeats.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {selectedSeats.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Date Selector Bar */}
      <div className="bg-brand-blue border-b border-white/10 px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-white/50 text-xs font-medium uppercase tracking-wider mr-1 flex-shrink-0">Date:</span>
          {sessions.map(session => {
            const isSelected = selectedSession?.id === session.id;
            return (
              <button
                key={session.id}
                onClick={() => {
                  setSelectedSession(session);
                  setSelectedSeats([]);
                  setHoldExpiry(null);
                  setOpenTable(null);
                }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isSelected
                    ? 'bg-brand-gold text-white shadow-md'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                {formatDateShort(session.date)} — {formatTime(session.time)}
                <span className={`ml-1.5 text-xs ${
                  isSelected ? 'text-white/80' : session.available_seats > 100 ? 'text-green-400' : session.available_seats > 30 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  ({session.available_seats})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content: Table Map */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-green-500/80"></span>
              <span className="text-white/70">Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-amber-500/80"></span>
              <span className="text-white/70">Partial</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-blue-500/80"></span>
              <span className="text-white/70">Your Pick</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-gray-500/80"></span>
              <span className="text-white/70">Full</span>
            </div>
          </div>
          <div className="text-sm text-white/50">
            {vacantCount} chairs available &middot; {soldCount} sold
            {heldCount > 0 && <> &middot; {heldCount} on hold</>}
          </div>

          {selectedSeats.length > 0 && (
            <div className="text-sm text-white/70">
              <span className="text-blue-400 font-semibold">{selectedSeats.length} chair{selectedSeats.length !== 1 ? 's' : ''} selected</span>
            </div>
          )}
        </div>

        {/* Error Toast */}
        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-xl text-center text-sm font-medium">
            {error}
          </div>
        )}

        {/* Room Label */}
        <div className="text-center mb-3">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/30">Front of Room — Caller</span>
          <div className="mt-1 h-1 bg-gradient-to-r from-transparent via-brand-gold/30 to-transparent rounded-full max-w-md mx-auto"></div>
        </div>

        {/* Instruction — hidden once seats are already selected */}
        {selectedSeats.length === 0 && !openTable && (
          <div className="text-center mb-4">
            <p className="text-white/40 text-sm">Tap a table to see available chairs</p>
          </div>
        )}

        {/* Chair picker overlay for expanded table */}
        {openTable && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setOpenTable(null); }}>
            <ChairPicker
              tableNum={openTable}
              chairs={tableMap[openTable] || []}
              selectedSeats={selectedSeats}
              holderId={holderId}
              onChairClick={handleChairClick}
              onClose={() => setOpenTable(null)}
            />
          </div>
        )}

        {/* Table Map — Venue Layout using CSS Grid for automatic row alignment */}
        <div className="seat-map-container">
          <div className="inline-grid mx-auto" style={{
            gridTemplateColumns: 'auto auto auto auto',
            gridTemplateRows: 'auto auto',
            gap: '12px',
            columnGap: '20px',
            minWidth: 'max-content'
          }}>
            {/* Row 1: upper sections — grid auto-sizes to tallest (right-upper = 4 rows) */}
            <div className="self-start">
              {SECTIONS.filter(s => s.id === 'left-upper').map(section => (
                <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                  openTable={openTable} onTableClick={setOpenTable} />
              ))}
            </div>
            <div className="self-start">
              {SECTIONS.filter(s => s.id === 'center-left-upper').map(section => (
                <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                  openTable={openTable} onTableClick={setOpenTable} />
              ))}
            </div>
            <div className="self-end">
              {SECTIONS.filter(s => s.id === 'center-column-upper').map(section => (
                <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                  openTable={openTable} onTableClick={setOpenTable} />
              ))}
            </div>
            <div className="self-start">
              {SECTIONS.filter(s => s.id === 'right-upper').map(section => (
                <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                  openTable={openTable} onTableClick={setOpenTable} />
              ))}
            </div>

            {/* Row 2: lower sections — all auto-aligned */}
            {SECTIONS.filter(s => s.id === 'left-lower').map(section => (
              <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                openTable={openTable} onTableClick={setOpenTable} />
            ))}
            {SECTIONS.filter(s => s.id === 'center-left-lower').map(section => (
              <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                openTable={openTable} onTableClick={setOpenTable} />
            ))}
            {SECTIONS.filter(s => s.id === 'center-column-lower').map(section => (
              <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                openTable={openTable} onTableClick={setOpenTable} />
            ))}
            {SECTIONS.filter(s => s.id === 'right-lower').map(section => (
              <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                openTable={openTable} onTableClick={setOpenTable} />
            ))}
          </div>
        </div>

        {/* Back of room */}
        <div className="text-center mt-4">
          <div className="h-0.5 bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-full max-w-md mx-auto mb-2"></div>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/20">Back of Room — Entrance</span>
        </div>

        {/* CTA if no chairs selected */}
        {selectedSeats.length === 0 && !openTable && (
          <div className="text-center mt-8">
            <button onClick={() => {}} className="px-6 py-3 bg-brand-gold hover:bg-brand-gold-light text-white font-semibold rounded-xl shadow-lg transition-all glow-gold-sm">
              Tap a Table Above to Pick Your Chairs
            </button>
            <p className="text-white/40 text-sm mt-2">
              Your party size will be set automatically based on chairs selected
            </p>
          </div>
        )}
      </div>

      {/* Booking Panel Overlay */}
      <BookingPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        session={selectedSession}
        partySize={partySize}
        onPartySize={handlePartySize}
        attendees={attendees}
        onAttendees={setAttendees}
        selectedSeats={selectedSeats}
        seats={seats}
        requiredPkg={requiredPkg}
        optionalPkgs={optionalPkgs}
        total={calculateTotal()}
        allNamesValid={allNamesValid}
        allSeatsSelected={allSeatsSelected}
        loading={loading}
        onSubmit={handleSubmit}
        holdExpiry={holdExpiry}
      />

      {/* Footer */}
      <footer className="bg-[#1e3a5f] border-t border-white/10 px-4 py-3 text-center flex-shrink-0">
        <p className="text-white/50 text-xs">
          Saint Mary's Entertainment Centre — Fredericton, NB — Booking cut-off daily at 12:00 PM
        </p>
      </footer>
    </div>
  );
}

// Section component — renders table buttons in venue layout grid
function TableSection({ section, getTableStatus, openTable, onTableClick }) {
  return (
    <div className="rounded-2xl p-3 md:p-4 bg-white/5 border border-white/10 shrink-0">
      <div className="flex flex-col gap-1.5">
        {section.seats.map((row, ri) => (
          <div key={ri} className="flex gap-1.5 justify-center shrink-0">
            {row.map((num, ci) => {
              if (num === null) return <div key={ci} className="w-12 h-12 shrink-0" />;
              return <TableBtn key={num} tableNum={num} status={getTableStatus(num)}
                isOpen={openTable === num} onClick={onTableClick} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// Table button — shows table number + vacancy count with inline dark-theme colors
function TableBtn({ tableNum, status, isOpen, onClick }) {
  if (status === 'empty' || !status) {
    return <div className="w-12 h-12 shrink-0" />;
  }

  const { hasMyChairs, allSold, allVacant, vacantChairs } = status;

  let bgClass, borderClass, textClass;
  if (isOpen) {
    bgClass = 'bg-brand-gold'; borderClass = 'border-brand-gold-light'; textClass = 'text-white';
  } else if (hasMyChairs) {
    bgClass = 'bg-blue-500/80'; borderClass = 'border-blue-400'; textClass = 'text-white';
  } else if (allSold) {
    bgClass = 'bg-gray-600/60'; borderClass = 'border-gray-500/50'; textClass = 'text-gray-400';
  } else if (allVacant) {
    bgClass = 'bg-green-600/70'; borderClass = 'border-green-500/50'; textClass = 'text-white';
  } else {
    bgClass = 'bg-amber-600/60'; borderClass = 'border-amber-500/50'; textClass = 'text-white';
  }

  return (
    <button
      onClick={() => onClick(tableNum)}
      disabled={allSold}
      className={`table-btn ${bgClass} border-2 ${borderClass} ${textClass} ${isOpen ? 'ring-2 ring-brand-gold/50 scale-110' : ''}`}
      aria-label={`Table ${tableNum} — ${vacantChairs} chairs available`}
      title={`Table ${tableNum} — ${vacantChairs}/6 available`}
    >
      <span className="text-sm font-bold leading-none">{tableNum}</span>
      {!allSold && !isOpen && (
        <span className="text-[9px] leading-none opacity-70">{vacantChairs}/6</span>
      )}
    </button>
  );
}

// Chair picker — matches venue layout: chairs 5,3,1 on left / 6,4,2 on right / table in center
function ChairPicker({ tableNum, chairs, selectedSeats, holderId, onChairClick, onClose }) {
  const chairMap = {};
  for (const c of chairs) chairMap[c.chair_number] = c;
  const vacantCount = chairs.filter(c => c.status === 'vacant' && !c.is_disabled).length;

  // Layout: left column [5,3,1], right column [6,4,2] — matches venue reference
  const leftChairs = [5, 3, 1];
  const rightChairs = [6, 4, 2];

  const renderChair = (num) => {
    const chair = chairMap[num];
    if (!chair) return <div key={num} className="w-16 h-16" />;

    const isSelected = selectedSeats.includes(chair.id);
    const isMyHold = chair.status === 'held' && chair.held_by === holderId;
    const isOtherHold = chair.status === 'held' && chair.held_by !== holderId;
    const isSold = chair.status === 'sold';
    const isDisabled = chair.is_disabled;

    let bgClass, borderClass, textClass;
    if (isDisabled) { bgClass = 'bg-slate-100'; borderClass = 'border-slate-200'; textClass = 'text-slate-300'; }
    else if (isSold) { bgClass = 'bg-slate-200'; borderClass = 'border-slate-300'; textClass = 'text-slate-400'; }
    else if (isSelected || isMyHold) { bgClass = 'bg-blue-500'; borderClass = 'border-blue-600'; textClass = 'text-white'; }
    else if (isOtherHold) { bgClass = 'bg-amber-100'; borderClass = 'border-amber-400'; textClass = 'text-amber-700'; }
    else { bgClass = 'bg-green-500'; borderClass = 'border-green-600'; textClass = 'text-white'; }

    return (
      <button
        key={chair.id}
        onClick={() => onChairClick(chair)}
        disabled={isDisabled || isSold || isOtherHold}
        className={`${bgClass} border-2 ${borderClass} ${textClass} rounded-xl w-16 h-16 flex flex-col items-center justify-center shrink-0 transition-all hover:scale-110 disabled:hover:scale-100 disabled:cursor-not-allowed`}
        aria-label={`Chair ${num}${chair.booked_name ? ` — ${chair.booked_name}` : ''}`}
        title={`Chair ${num}${chair.booked_name ? ` — ${chair.booked_name}` : ''}`}
      >
        <span className="text-sm font-bold leading-none">{num}</span>
        {isSold && chair.booked_name && (
          <span className="text-[9px] leading-tight mt-0.5 opacity-80 truncate max-w-[56px]">
            {chair.booked_name}
          </span>
        )}
        {(isSelected || isMyHold) && (
          <span className="text-[9px] leading-tight mt-0.5 font-semibold text-blue-200">You</span>
        )}
        {!isSold && !isSelected && !isMyHold && !isOtherHold && !isDisabled && (
          <span className="text-[9px] leading-tight mt-0.5 opacity-50">Open</span>
        )}
        {isOtherHold && (
          <span className="text-[9px] leading-tight mt-0.5 opacity-70">Held</span>
        )}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-sm" onClick={(e) => e.stopPropagation()}>
      <div className="bg-white border border-slate-200 rounded-2xl p-5 relative shadow-lg">
        <button onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 text-xl leading-none"
          aria-label="Close">&times;</button>

        <div className="text-center mb-4">
          <span className="text-[#1e3a5f] font-bold text-lg">Table {tableNum}</span>
          <p className="text-slate-400 text-xs mt-0.5">{vacantCount} of 6 chairs available</p>
        </div>

        {/* Table layout: left chairs — table — right chairs */}
        <div className="flex items-center justify-center gap-3">
          {/* Left column: chairs 5, 3, 1 */}
          <div className="flex flex-col gap-2">
            {leftChairs.map(num => renderChair(num))}
          </div>

          {/* Table center */}
          <div className="w-20 h-[210px] rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
            <span className="text-slate-300 text-[10px] font-bold uppercase tracking-wider [writing-mode:vertical-rl]">
              Table {tableNum}
            </span>
          </div>

          {/* Right column: chairs 6, 4, 2 */}
          <div className="flex flex-col gap-2">
            {rightChairs.map(num => renderChair(num))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block"></span> Vacant</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block"></span> Selected</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-300 inline-block"></span> Occupied</span>
        </div>
      </div>
    </div>
  );
}
