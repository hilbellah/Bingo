import React, { useEffect, useRef, useState } from 'react';
import {
  initiateBooking,
  fetchPhdInventory,
  fetchSeats,
  fetchSessionPackages,
  fetchSessions,
  fetchTheme,
  lockSeat,
  unlockSeat
} from './api';
import AnnouncementBanner from './components/AnnouncementBanner';
import BookingPanel from './components/BookingPanel';
import BookingProcessing from './components/BookingProcessing';
import Confirmation from './components/Confirmation';
import CountdownTimer from './components/CountdownTimer';
import EmbeddedAuthorizeNetPayment from './components/EmbeddedAuthorizeNetPayment';
import FloorPlan from './components/FloorPlan';
import SessionWeekPicker from './components/SessionWeekPicker';
import { useSocket } from './useSocket';

// Detect payment-related URLs at app mount. Returns null for the normal
// booking flow, or { bookingId } when the customer has just returned from
// Authorize.Net's hosted page via the server's /payment/return or
// /payment/cancel redirect.
function detectPaymentRoute() {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  // /booking/<id>/processing  — happy-path return from Authorize.Net
  // /booking/<id>/cancelled   — customer clicked Cancel on hosted page
  // Both render the BookingProcessing component, which polls /api/bookings/:id/status
  // and renders the right UI based on the actual booking state.
  const m = path.match(/^\/booking\/([^/]+)\/(processing|cancelled)\/?$/);
  if (m) return { bookingId: decodeURIComponent(m[1]) };
  return null;
}

function generateHolderId() {
  const stored = sessionStorage.getItem('bingo_holder_id');
  if (stored) return stored;
  const id = 'holder_' + Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem('bingo_holder_id', id);
  return id;
}

const emptyAttendee = () => ({ firstName: '', lastName: '', addons: [] });

export default function App() {
  // Payment-return short-circuit: if the customer just came back from
  // Authorize.Net, skip the entire booking flow and render the processing
  // page (which polls for the booking status set by the webhook).
  // Detected ONCE at mount via useState initializer — the URL doesn't change
  // mid-session, so re-detection isn't needed.
  const [paymentRoute] = useState(detectPaymentRoute);
  if (paymentRoute) {
    return <BookingProcessing bookingId={paymentRoute.bookingId} />;
  }

  const holderId = useRef(generateHolderId()).current;
  const socketRef = useSocket();

  const [sessions, setSessions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [phdInventory, setPhdInventory] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [partySize, setPartySize] = useState(0);
  const [attendees, setAttendees] = useState([]);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [holdExpiry, setHoldExpiry] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentSession, setPaymentSession] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [openTable, setOpenTable] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [namesFilledBeforeChairs, setNamesFilledBeforeChairs] = useState(false);
  const [bookingStep, setBookingStep] = useState(0);

  useEffect(() => {
    fetchTheme().then(theme => {
      if (!theme) return;

      const root = document.documentElement;
      if (theme.primaryColor) root.style.setProperty('--color-primary', theme.primaryColor);
      if (theme.accentColor) root.style.setProperty('--color-accent', theme.accentColor);
      if (theme.headerBg) root.style.setProperty('--color-header-bg', theme.headerBg);
      if (theme.buttonColor) root.style.setProperty('--color-button', theme.buttonColor);
      if (theme.seatVacant) root.style.setProperty('--color-seat-vacant', theme.seatVacant);
      if (theme.seatHeld) root.style.setProperty('--color-seat-held', theme.seatHeld);
      if (theme.seatSold) root.style.setProperty('--color-seat-sold', theme.seatSold);
      if (theme.seatSelected) root.style.setProperty('--color-seat-selected', theme.seatSelected);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions().then(data => {
      setSessions(data);
      if (data.length > 0) {
        setSelectedSession(data[0]);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedSession) return undefined;

    fetchSeats(selectedSession.id).then(setSeats);
    fetchSessionPackages(selectedSession.id).then(setPackages);
    fetchPhdInventory().then(setPhdInventory);
    setOpenTable(null);

    const socket = socketRef.current;
    if (!socket) return undefined;

    const handleLocked = (data) => {
      setSeats(prev => prev.map(seat =>
        seat.id === data.seatId ? { ...seat, status: 'held', held_by: data.holderId, held_until: data.holdUntil } : seat
      ));
    };
    const handleUnlocked = (data) => {
      setSeats(prev => prev.map(seat =>
        seat.id === data.seatId ? { ...seat, status: 'vacant', held_by: null, held_until: null } : seat
      ));
    };
    const handleSold = (data) => {
      setSeats(prev => prev.map(seat =>
        seat.id === data.seatId ? { ...seat, status: 'sold', held_by: null, held_until: null } : seat
      ));
    };
    const handleRefresh = () => fetchSeats(selectedSession.id).then(setSeats);

    socket.emit('join:session', selectedSession.id);
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
  }, [selectedSession, socketRef]);

  const handleChairClick = async (chair) => {
    if (chair.is_disabled || chair.status === 'sold') return;
    if (chair.status === 'held' && chair.held_by !== holderId) return;
    if (bookingStep === 2) return;

    if (selectedSeats.includes(chair.id)) {
      await unlockSeat(chair.id, holderId);
      const removedIndex = selectedSeats.indexOf(chair.id);
      const newSelected = selectedSeats.filter(id => id !== chair.id);
      setSelectedSeats(newSelected);
      setPartySize(newSelected.length);
      setAttendees(prev => prev.filter((_, index) => index !== removedIndex));
      return;
    }

    if (selectedSeats.length >= 6) {
      setError('Maximum 6 chairs per booking. Tap a selected chair to deselect.');
      setTimeout(() => setError(''), 4000);
      return;
    }

    const result = await lockSeat(chair.id, holderId);
    if (!result.success) {
      setError(result.error || 'Could not select chair');
      setTimeout(() => setError(''), 3000);
      return;
    }

    const newSelected = [...selectedSeats, chair.id];
    setSelectedSeats(newSelected);

    if (!namesFilledBeforeChairs) {
      setPartySize(newSelected.length);
      setAttendees(prev => {
        const updated = [...prev];
        while (updated.length < newSelected.length) {
          updated.push(emptyAttendee());
        }
        return updated;
      });
    }

    if (!holdExpiry || new Date(result.holdUntil) > new Date(holdExpiry)) {
      setHoldExpiry(result.holdUntil);
    }

    if (selectedSeats.length === 0 && !namesFilledBeforeChairs) {
      setPanelOpen(true);
    }
  };

  const handlePartySize = (size) => {
    setPartySize(size);
    setAttendees(Array.from({ length: size }, (_, index) => ({
      firstName: attendees[index]?.firstName || '',
      lastName: attendees[index]?.lastName || '',
      addons: attendees[index]?.addons || []
    })));

    if (size < selectedSeats.length) {
      const toRelease = selectedSeats.slice(size);
      for (const seatId of toRelease) unlockSeat(seatId, holderId);
      setSelectedSeats(selectedSeats.slice(0, size));
    }
  };

  const handleSelectSession = (session) => {
    setSelectedSession(session);
    setSelectedSeats([]);
    setHoldExpiry(null);
    setOpenTable(null);
    setBookingStep(0);

    if (session.is_special_event) {
      setPartySize(1);
      setAttendees([emptyAttendee()]);
    } else {
      setPartySize(0);
      setAttendees([]);
    }
  };

  const handleSubmit = async (customer) => {
    setLoading(true);
    setError('');

    const bookingAttendees = attendees.map((attendee, index) => ({
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      seatId: selectedSeats[index],
      addons: (attendee.addons || []).filter(addon => addon.quantity > 0)
    }));

    // /api/bookings/initiate creates the booking as 'pending' and returns a
    // short-lived Authorize.Net hosted-page token + redirect URL.
    const result = await initiateBooking(selectedSession.id, holderId, bookingAttendees, customer);

    if (!result || !result.bookingId || !result.token || !result.redirectUrl) {
      setLoading(false);
      setError(result?.error || 'Could not start payment. Please try again.');
      return;
    }

    // Render Authorize.Net's hosted card-entry form inside our branded checkout page.
    // Authorize.Net still owns the card iframe, so we never see PAN/CVV.
    setPaymentSession(result);
    setLoading(false);
  };

  const requiredPkg = packages.find(pkg => pkg.type === 'required');
  const optionalPkgs = packages.filter(pkg => pkg.type === 'optional');
  const allNamesValid = attendees.length > 0 && attendees.every(attendee => attendee.firstName.trim() && attendee.lastName.trim());
  const allSeatsSelected = selectedSeats.length === partySize && partySize > 0;

  useEffect(() => {
    if (namesFilledBeforeChairs && allSeatsSelected && allNamesValid && !panelOpen) {
      setPanelOpen(true);
      setNamesFilledBeforeChairs(false);
    }
  }, [namesFilledBeforeChairs, allSeatsSelected, allNamesValid, panelOpen]);

  if (paymentSession) {
    return (
      <EmbeddedAuthorizeNetPayment
        payment={paymentSession}
        onCancel={() => {
          window.location.href = `/payment/cancel?bookingId=${encodeURIComponent(paymentSession.bookingId)}`;
        }}
      />
    );
  }

  if (booking) {
    return (
      <Confirmation
        booking={booking}
        session={selectedSession}
        attendees={attendees}
        seats={seats}
        selectedSeats={selectedSeats}
        requiredPkg={requiredPkg}
        optionalPkgs={optionalPkgs}
      />
    );
  }

  const tableMap = seats.reduce((map, seat) => {
    map[seat.table_number] = map[seat.table_number] || [];
    map[seat.table_number].push(seat);
    return map;
  }, {});

  const vacantCount = seats.filter(seat => seat.status === 'vacant' && !seat.is_disabled).length;
  const soldCount = seats.filter(seat => seat.status === 'sold').length;
  const heldCount = seats.filter(seat => seat.status === 'held').length;

  const getTableStatus = (tableNum) => {
    const chairs = tableMap[tableNum] || [];
    if (chairs.length === 0) return 'empty';

    const hasMyChairs = chairs.some(chair => selectedSeats.includes(chair.id));
    const allSold = chairs.every(chair => chair.status === 'sold' || chair.is_disabled);
    const allVacant = chairs.every(chair => chair.status === 'vacant' && !chair.is_disabled);
    const vacantChairs = chairs.filter(chair => chair.status === 'vacant' && !chair.is_disabled).length;

    return { hasMyChairs, allSold, allVacant, vacantChairs, total: chairs.length };
  };

  const total = partySize * (requiredPkg?.price || 0) + attendees.reduce((sum, attendee) => {
    return sum + (attendee.addons || []).reduce((addonSum, addon) => {
      const pkg = optionalPkgs.find(item => item.id === addon.packageId);
      return pkg ? addonSum + pkg.price * addon.quantity : addonSum;
    }, 0);
  }, 0);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-blue-dark border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-gold flex items-center justify-center">
            <span className="text-white text-lg font-bold">B</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-base md:text-lg leading-tight">Saint Mary's Entertainment Centre</h1>
            <p className="text-brand-gold text-xs font-medium">Bingo - Nightly Jackpots up to $5,000</p>
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

      <div className="bg-brand-blue border-b border-white/10 px-4 py-2 flex-shrink-0">
        <SessionWeekPicker
          sessions={sessions}
          selectedSession={selectedSession}
          weekOffset={weekOffset}
          onWeekOffsetChange={setWeekOffset}
          onSelectSession={handleSelectSession}
        />
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <AnnouncementBanner socket={socketRef.current} />

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-4 text-sm">
            <LegendItem color={selectedSession?.is_special_event ? 'bg-green-600/70 ring-1 ring-amber-700' : 'bg-green-500/80'} label="Available" />
            <LegendItem color={selectedSession?.is_special_event ? 'bg-amber-700/60 ring-1 ring-amber-700' : 'bg-amber-500/80'} label="Partial" />
            <LegendItem color="bg-blue-500/80" label="Your Pick" />
            <LegendItem color="bg-gray-500/80" label="Full" />
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

        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-xl text-center text-sm font-medium">
            {error}
          </div>
        )}

        {selectedSeats.length === 0 && !openTable && (
          <div className="text-center mb-4">
            <p className="text-white/40 text-sm">Tap a table to see available chairs</p>
          </div>
        )}

        <FloorPlan
          tableMap={tableMap}
          getTableStatus={getTableStatus}
          selectedSeats={selectedSeats}
          holderId={holderId}
          openTable={openTable}
          onOpenTable={setOpenTable}
          onChairClick={handleChairClick}
          selectedSession={selectedSession}
        />

        {selectedSeats.length === 0 && !openTable && (
          <div className="text-center mt-8">
            <button type="button" className="px-6 py-3 bg-brand-gold hover:bg-brand-gold-light text-white font-semibold rounded-xl shadow-lg transition-all glow-gold-sm">
              Tap a Table Above to Pick Your Chairs
            </button>
            <p className="text-white/40 text-sm mt-2">
              Your party size will be set automatically based on chairs selected
            </p>
          </div>
        )}
      </div>

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
        total={total}
        allNamesValid={allNamesValid}
        allSeatsSelected={allSeatsSelected}
        loading={loading}
        onSubmit={handleSubmit}
        holdExpiry={holdExpiry}
        step={bookingStep}
        onStepChange={setBookingStep}
        phdInventory={phdInventory}
      />

      <footer className="bg-brand-blue-dark border-t border-white/10 px-4 py-3 text-center flex-shrink-0">
        <p className="text-white/30 text-xs">
          Saint Mary's Entertainment Centre - Fredericton, NB - Booking cut-off daily at 12:00 PM
        </p>
      </footer>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-4 h-4 rounded ${color}`} />
      <span className="text-white/70">{label}</span>
    </div>
  );
}
