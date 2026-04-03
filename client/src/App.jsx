import React, { useState, useEffect, useRef } from 'react';
import { fetchSessions, fetchSeats, fetchPackages, fetchSessionPackages, lockSeat, unlockSeat, createBooking } from './api';
import AnnouncementBanner from './components/AnnouncementBanner';
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
  const [openTable, setOpenTable] = useState(null); // which table's chairs are expanded inline
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, 1 = next week, etc.
  const [namesFilledBeforeChairs, setNamesFilledBeforeChairs] = useState(false); // track if user filled names and went to pick chairs
  const [bookingStep, setBookingStep] = useState(0); // 0 = party/names, 1 = packages, 2 = review/pay

  // Load initial data
  useEffect(() => {
    fetchSessions().then(data => {
      setSessions(data);
      if (data.length > 0) setSelectedSession(data[0]);
    });
  }, []);

  // Load seats and session-specific packages when session changes
  useEffect(() => {
    if (!selectedSession) return;
    fetchSeats(selectedSession.id).then(setSeats);
    fetchSessionPackages(selectedSession.id).then(setPackages);
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
    // Block chair changes during payment step
    if (bookingStep === 2) return;

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
      const newSize = newSelected.length;
      // Only auto-sync party size and attendees when user hasn't explicitly
      // set a party size via the panel (i.e., not in "pick more chairs" mode)
      if (!namesFilledBeforeChairs) {
        setPartySize(newSize);
        setAttendees(prev => {
          const updated = [...prev];
          while (updated.length < newSize) {
            updated.push({ firstName: '', lastName: '', addons: [] });
          }
          return updated;
        });
      }
      if (!holdExpiry || new Date(result.holdUntil) > new Date(holdExpiry)) {
        setHoldExpiry(result.holdUntil);
      }
      // Only auto-open panel on first seat selection to start the booking flow;
      // subsequent seats are picked without the overlay covering the chair map
      if (selectedSeats.length === 0 && !namesFilledBeforeChairs) {
        setPanelOpen(true);
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

  // Auto-reopen panel when all chairs are selected after user filled names and went to pick chairs
  useEffect(() => {
    if (namesFilledBeforeChairs && allSeatsSelected && allNamesValid && !panelOpen) {
      setPanelOpen(true);
      setNamesFilledBeforeChairs(false);
    }
  }, [selectedSeats.length, allSeatsSelected]);

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

      {/* Date Selector Bar with Week Navigation */}
      <div className="bg-brand-blue border-b border-white/10 px-4 py-2 flex-shrink-0">
        {(() => {
          // Group sessions into weeks (Mon-Sun)
          const getWeekStart = (dateStr) => {
            const d = new Date(dateStr + 'T12:00:00');
            const day = d.getDay();
            const diff = (day === 0 ? -6 : 1) - day; // Monday start
            const monday = new Date(d);
            monday.setDate(d.getDate() + diff);
            return monday.toISOString().split('T')[0];
          };

          const weeks = {};
          sessions.forEach(s => {
            const wk = getWeekStart(s.date);
            if (!weeks[wk]) weeks[wk] = [];
            weeks[wk].push(s);
          });
          const weekKeys = Object.keys(weeks).sort();
          const clampedOffset = Math.max(0, Math.min(weekOffset, weekKeys.length - 1));
          const currentWeekKey = weekKeys[clampedOffset];
          const visibleSessions = currentWeekKey ? weeks[currentWeekKey] : [];

          const weekLabel = currentWeekKey ? (() => {
            const start = new Date(currentWeekKey + 'T12:00:00');
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return `${months[start.getMonth()]} ${start.getDate()} – ${months[end.getMonth()]} ${end.getDate()}`;
          })() : '';

          return (
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={clampedOffset === 0}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-white/60 text-xs font-semibold uppercase tracking-wider flex-shrink-0 min-w-[120px] text-center">{weekLabel}</span>
              <button onClick={() => setWeekOffset(Math.min(weekKeys.length - 1, weekOffset + 1))} disabled={clampedOffset >= weekKeys.length - 1}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 ml-2">
                {visibleSessions.map(session => {
                  const isSelected = selectedSession?.id === session.id;
                  return (
                    <button
                      key={session.id}
                      onClick={() => {
                        setSelectedSession(session);
                        setSelectedSeats([]);
                        setHoldExpiry(null);
                        setOpenTable(null);
                        setBookingStep(0);
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
          );
        })()}
      </div>

      {/* Main Content: Table Map */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {/* Announcement Banner */}
        <AnnouncementBanner socket={socketRef.current} />

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

        {/* Instruction — hidden once seats are already selected */}
        {selectedSeats.length === 0 && !openTable && (
          <div className="text-center mb-4">
            <p className="text-white/40 text-sm">Tap a table to see available chairs</p>
          </div>
        )}


        {/* Floorplan Room Outline */}
        <div className="seat-map-container" onClick={() => setOpenTable(null)}>
          <div className="floorplan-room" onClick={e => e.stopPropagation()}>
            {/* Front Wall — Caller / Stage Area */}
            <div className="floorplan-front-wall">
              <div className="floorplan-stage-label">
                <svg className="w-4 h-4 text-brand-gold/60 inline-block mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
                Front of Room — Stage
              </div>
            </div>

            {/* Table Map — Venue Layout matching blueprint */}
            <div className="floorplan-interior">
              {/* === UPPER ROW: Left block + Floor Stage + Right block === */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="self-start">
                  {SECTIONS.filter(s => s.id === 'upper-left').map(section => (
                    <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                      openTable={openTable} onTableClick={setOpenTable}
                      tableMap={tableMap} selectedSeats={selectedSeats} holderId={holderId} onChairClick={handleChairClick} />
                  ))}
                </div>
                {/* Floor Stage */}
                <div className="flex-1 flex items-center justify-center min-h-[160px]">
                  <div className="w-full max-w-[200px] h-[130px] border-2 border-white/20 bg-white/5 rounded-lg flex items-center justify-center">
                    <span className="text-white/30 font-bold text-base tracking-wide">Floor Stage</span>
                  </div>
                </div>
                <div className="self-start">
                  {SECTIONS.filter(s => s.id === 'upper-right').map(section => (
                    <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                      openTable={openTable} onTableClick={setOpenTable}
                      tableMap={tableMap} selectedSeats={selectedSeats} holderId={holderId} onChairClick={handleChairClick} />
                  ))}
                </div>
              </div>

              {/* === LOWER ROW: Left + Center-Left + Inner + Caller + Center Column + Right === */}
              <div className="flex items-start gap-3">
                {SECTIONS.filter(s => s.id === 'lower-left').map(section => (
                  <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                    openTable={openTable} onTableClick={setOpenTable}
                    tableMap={tableMap} selectedSeats={selectedSeats} holderId={holderId} onChairClick={handleChairClick} />
                ))}
                {SECTIONS.filter(s => s.id === 'lower-center-left').map(section => (
                  <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                    openTable={openTable} onTableClick={setOpenTable}
                    tableMap={tableMap} selectedSeats={selectedSeats} holderId={holderId} onChairClick={handleChairClick} />
                ))}
                {SECTIONS.filter(s => s.id === 'center-left-inner').map(section => (
                  <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                    openTable={openTable} onTableClick={setOpenTable}
                    tableMap={tableMap} selectedSeats={selectedSeats} holderId={holderId} onChairClick={handleChairClick} />
                ))}
                {/* Caller position marker */}
                <div className="flex items-center justify-center self-center">
                  <div className="w-7 h-7 bg-amber-800/60 border-2 border-amber-600/40 rounded-sm" title="Caller"></div>
                </div>
                {SECTIONS.filter(s => s.id === 'center-column').map(section => (
                  <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                    openTable={openTable} onTableClick={setOpenTable}
                    tableMap={tableMap} selectedSeats={selectedSeats} holderId={holderId} onChairClick={handleChairClick} />
                ))}
                {SECTIONS.filter(s => s.id === 'lower-right').map(section => (
                  <TableSection key={section.id} section={section} getTableStatus={getTableStatus}
                    openTable={openTable} onTableClick={setOpenTable}
                    tableMap={tableMap} selectedSeats={selectedSeats} holderId={holderId} onChairClick={handleChairClick} />
                ))}
              </div>
            </div>

            {/* Back Wall — Entrance with door opening */}
            <div className="floorplan-back-wall">
              <div className="floorplan-wall-segment"></div>
              <div className="floorplan-entrance-gap">
                <div className="floorplan-door-swing floorplan-door-left"></div>
                <span className="floorplan-entrance-label">Entrance</span>
                <div className="floorplan-door-swing floorplan-door-right"></div>
              </div>
              <div className="floorplan-wall-segment"></div>
            </div>
            <div className="text-center mt-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/25">Back of Room</span>
            </div>
          </div>
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
        onPickChairs={() => { setNamesFilledBeforeChairs(true); setPanelOpen(false); }}
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
        step={bookingStep}
        onStepChange={setBookingStep}
      />

      {/* Footer */}
      <footer className="bg-brand-blue-dark border-t border-white/10 px-4 py-3 text-center flex-shrink-0">
        <p className="text-white/30 text-xs">
          Saint Mary's Entertainment Centre — Fredericton, NB — Booking cut-off daily at 12:00 PM
        </p>
      </footer>
    </div>
  );
}

// Section component — renders table buttons in venue layout grid
function TableSection({ section, getTableStatus, openTable, onTableClick, tableMap, selectedSeats, holderId, onChairClick }) {
  return (
    <div className="rounded-2xl p-3 md:p-4 bg-white/5 border border-white/10 shrink-0">
      <div className="flex flex-col gap-1.5">
        {section.seats.map((row, ri) => (
          <div key={ri} className="flex gap-1.5 justify-center shrink-0">
            {row.map((num, ci) => {
              if (num === null) return <div key={ci} className="w-12 h-12 shrink-0" />;
              return <TableBtn key={num} tableNum={num} status={getTableStatus(num)}
                isOpen={openTable === num} onClick={onTableClick}
                chairs={tableMap[num] || []} selectedSeats={selectedSeats} holderId={holderId} onChairClick={onChairClick} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// Inline chair button for the dropdown
function InlineChair({ chair, isSelected, holderId, onChairClick }) {
  const isMyHold = chair.status === 'held' && chair.held_by === holderId;
  const isOtherHold = chair.status === 'held' && chair.held_by !== holderId;
  const isSold = chair.status === 'sold';
  const isDisabled = chair.is_disabled;

  let bgClass, borderClass, textClass;
  if (isDisabled) { bgClass = 'bg-gray-700/40'; borderClass = 'border-gray-600/30'; textClass = 'text-gray-500'; }
  else if (isSold) { bgClass = 'bg-gray-600/50'; borderClass = 'border-gray-500/40'; textClass = 'text-gray-400'; }
  else if (isSelected || isMyHold) { bgClass = 'bg-blue-500/70'; borderClass = 'border-blue-400'; textClass = 'text-white'; }
  else if (isOtherHold) { bgClass = 'bg-amber-500/50'; borderClass = 'border-amber-400/50'; textClass = 'text-amber-200'; }
  else { bgClass = 'bg-green-600/60'; borderClass = 'border-green-500/50'; textClass = 'text-white'; }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChairClick(chair); }}
      disabled={isDisabled || isSold || isOtherHold}
      className={`${bgClass} border-2 ${borderClass} ${textClass} rounded-lg w-10 h-10 flex items-center justify-center shrink-0 transition-all text-sm font-bold hover:scale-110 disabled:hover:scale-100 disabled:cursor-not-allowed`}
      title={`Chair ${chair.chair_number}`}
    >
      {chair.chair_number}
    </button>
  );
}

// Table button — shows table number + vacancy count, with inline chair dropdown
function TableBtn({ tableNum, status, isOpen, onClick, chairs, selectedSeats, holderId, onChairClick }) {
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

  // Sort chairs for layout: left [5,3,1], right [6,4,2]
  const chairMap = {};
  for (const c of chairs) chairMap[c.chair_number] = c;
  const leftNums = [5, 3, 1];
  const rightNums = [6, 4, 2];

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => onClick(allSold ? null : (isOpen ? null : tableNum))}
        disabled={allSold}
        className={`table-btn ${bgClass} border-2 ${borderClass} ${textClass} ${isOpen ? 'ring-2 ring-brand-gold/50 scale-110 z-10' : ''}`}
        aria-label={`Table ${tableNum} — ${vacantChairs} chairs available`}
        title={`Table ${tableNum} — ${vacantChairs}/6 available`}
      >
        <span className="text-sm font-bold leading-none">{tableNum}</span>
        {!allSold && !isOpen && (
          <span className="text-[9px] leading-none opacity-70">{vacantChairs}/6</span>
        )}
      </button>

      {/* Inline chair picker dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1.5 bg-slate-800/95 border border-white/20 rounded-xl p-3 shadow-2xl backdrop-blur-sm"
          onClick={e => e.stopPropagation()} style={{ minWidth: '160px' }}>
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2 text-center">
            Table {tableNum}
          </div>
          <div className="flex items-center justify-center gap-2">
            {/* Left chairs */}
            <div className="flex flex-col gap-1.5">
              {leftNums.map(num => chairMap[num] ?
                <InlineChair key={num} chair={chairMap[num]} isSelected={selectedSeats.includes(chairMap[num].id)}
                  holderId={holderId} onChairClick={onChairClick} /> :
                <div key={num} className="w-10 h-10" />
              )}
            </div>
            {/* Table surface */}
            <div className="w-8 h-[130px] rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
              <span className="text-white/15 text-[8px] font-bold [writing-mode:vertical-rl]">Table {tableNum}</span>
            </div>
            {/* Right chairs */}
            <div className="flex flex-col gap-1.5">
              {rightNums.map(num => chairMap[num] ?
                <InlineChair key={num} chair={chairMap[num]} isSelected={selectedSeats.includes(chairMap[num].id)}
                  holderId={holderId} onChairClick={onChairClick} /> :
                <div key={num} className="w-10 h-10" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

