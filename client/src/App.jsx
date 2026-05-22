import React, { useEffect, useRef, useState } from 'react';
import {
  fetchBookingConfig,
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
import VenueClock from './components/VenueClock';
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

function getSessionType(session) {
  return session?.session_type || (session?.is_special_event ? 'special_bingo' : 'regular_bingo');
}

function getCutoffClosedMessage(session) {
  if (getSessionType(session) === 'regular_bingo') {
    return "Online booking for today's regular bingo closed at 12:00 PM. Staff are now printing orders, assembling packages, and placing them on the booked seats.";
  }
  return 'Booking closed. Online sales cutoff has passed.';
}

function getClientBookingStatus(session, { soldOut = false, nowMs = Date.now() } = {}) {
  if (!session) return { isClosed: false, reason: 'open', message: '' };

  const startsAtMs = session.starts_at ? Date.parse(session.starts_at) : NaN;
  const cutoffAtMs = session.cutoff_at ? Date.parse(session.cutoff_at) : NaN;

  if (Number.isFinite(startsAtMs) && nowMs >= startsAtMs) {
    return { isClosed: true, reason: 'ongoing', message: 'Booking closed. Event is on-going.' };
  }

  if (soldOut) {
    return { isClosed: true, reason: 'sold_out', message: 'Booking closed. This event is sold out.' };
  }

  if (Number.isFinite(cutoffAtMs) && nowMs >= cutoffAtMs) {
    return { isClosed: true, reason: 'cutoff', message: getCutoffClosedMessage(session) };
  }

  if (session.booking_closed) {
    return {
      isClosed: true,
      reason: session.booking_closed_reason || 'closed',
      message: session.booking_closed_message || 'Booking closed.',
    };
  }

  return { isClosed: false, reason: 'open', message: '' };
}

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
  const [bookingConfig, setBookingConfig] = useState({ maxOptionalPackagesPerPlayer: 3 });
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
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

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

    fetchBookingConfig().then(config => {
      if (config) setBookingConfig({ maxOptionalPackagesPerPlayer: config.maxOptionalPackagesPerPlayer ?? 3 });
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

    fetchSeats(selectedSession.id, holderId).then(setSeats);
    fetchSessionPackages(selectedSession.id).then(setPackages);
    setPhdInventory(null);
    fetchPhdInventory(selectedSession.id).then(setPhdInventory);
    setOpenTable(null);

    const socket = socketRef.current;
    if (!socket) return undefined;

    const handleLocked = (data) => {
      setSeats(prev => prev.map(seat =>
        seat.id === data.seatId ? { ...seat, status: 'held', isMyHold: data.holderId === holderId } : seat
      ));
    };
    const handleUnlocked = (data) => {
      setSeats(prev => prev.map(seat =>
        seat.id === data.seatId ? { ...seat, status: 'vacant', isMyHold: false } : seat
      ));
    };
    const handleSold = (data) => {
      setSeats(prev => prev.map(seat =>
        seat.id === data.seatId ? { ...seat, status: 'sold', isMyHold: false } : seat
      ));
    };
    const handleRefresh = () => fetchSeats(selectedSession.id, holderId).then(setSeats);

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
  }, [selectedSession, socketRef, holderId]);

  const handleChairClick = async (chair) => {
    if (bookingClosed) {
      setError(selectedBookingStatus.message);
      setTimeout(() => setError(''), 4000);
      return;
    }
    if (chair.is_disabled || chair.status === 'sold') return;
    if (chair.status === 'held' && !chair.isMyHold) return;
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
    if (bookingClosed) {
      setError(selectedBookingStatus.message);
      setLoading(false);
      return;
    }
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

  const requiredPkgs = packages.filter(pkg => pkg.type === 'required');
  const requiredPkg = requiredPkgs[0];
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
        requiredPkgs={requiredPkgs}
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
  const sellableSeatCount = seats.filter(seat => !seat.is_disabled).length;
  const soldOut = sellableSeatCount > 0 && seats.every(seat => seat.is_disabled || seat.status === 'sold');
  const selectedBookingStatus = getClientBookingStatus(selectedSession, {
    soldOut,
    nowMs: nowTick,
  });
  const bookingClosed = selectedBookingStatus.isClosed;
  const selectedSessionType = selectedSession?.session_type || (selectedSession?.is_special_event ? 'special_bingo' : 'regular_bingo');
  const isSelectedSpecialBingo = selectedSessionType === 'special_bingo';
  const isSelectedEvent = selectedSessionType === 'event';
  const availableLegendColor = isSelectedEvent
    ? 'bg-blue-600/80 ring-1 ring-blue-300/80'
    : isSelectedSpecialBingo
      ? 'bg-brand-gold/90 ring-1 ring-amber-200'
      : 'bg-green-500/80';
  const partialLegendColor = isSelectedEvent
    ? 'bg-blue-900/70 ring-1 ring-blue-400/80'
    : isSelectedSpecialBingo
      ? 'bg-amber-700/70 ring-1 ring-amber-300/80'
      : 'bg-amber-500/80';

  const getTableStatus = (tableNum) => {
    const chairs = tableMap[tableNum] || [];
    if (chairs.length === 0) return 'empty';

    const hasMyChairs = chairs.some(chair => selectedSeats.includes(chair.id));
    const allSold = chairs.every(chair => chair.status === 'sold' || chair.is_disabled);
    const allVacant = chairs.every(chair => chair.status === 'vacant' && !chair.is_disabled);
    const vacantChairs = chairs.filter(chair => chair.status === 'vacant' && !chair.is_disabled).length;

    return { hasMyChairs, allSold, allVacant, vacantChairs, total: chairs.length };
  };

  const requiredTotal = requiredPkgs.reduce((sum, pkg) => sum + (pkg?.price || 0), 0);
  const total = partySize * requiredTotal + attendees.reduce((sum, attendee) => {
    return sum + (attendee.addons || []).reduce((addonSum, addon) => {
      const pkg = optionalPkgs.find(item => item.id === addon.packageId);
      return pkg ? addonSum + pkg.price * addon.quantity : addonSum;
    }, 0);
  }, 0);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header — visually matches the Wolastoq Casino main site (purple gradient,
          white wordmark logo). The functional booking controls on the right are
          preserved unchanged so the seat-selection / booking flow keeps working. */}
      <header className="bg-gradient-to-r from-casino-purple-light via-casino-purple to-casino-purple-dark border-b border-white/10 px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between flex-shrink-0">
        {/* Wolastoq Casino wordmark — links back to the main casino site so
            customers can navigate away from the booking flow if they want. */}
        <a
          href="https://www.wolastoqcasino.ca"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center shrink-0"
          aria-label="Wolastoq Casino home"
        >
          <img
            src="/wolastoq-logo.png"
            alt="Wolastoq Casino"
            className="h-9 md:h-11 w-auto"
          />
        </a>

        {/* Main site nav — hidden on small screens (the booking button takes
            priority on mobile). Shown at lg+ where there's horizontal room.
            "Bingo" is rendered as the current/active link. */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium" aria-label="Main site">
          <a href="https://www.wolastoqcasino.ca" target="_blank" rel="noopener noreferrer" className="text-white hover:text-casino-cream transition-colors">Casino</a>
          <a href="https://www.wolastoqcasino.ca/events/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-casino-cream transition-colors">Events</a>
          <a href="https://www.wolastoqcasino.ca/promotions/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-casino-cream transition-colors">Promotions</a>
          <a href="https://booking.wolastoqcasino.ca/bingo" className="text-casino-cream font-semibold border-b-2 border-casino-cream pb-1" aria-current="page">Bingo</a>
          <a href="https://www.wolastoqcasino.ca/contact-us/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-casino-cream transition-colors">Contact Us</a>
        </nav>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end md:w-auto md:gap-3">
          <VenueClock className="w-full sm:w-auto" />

          {holdExpiry && selectedSeats.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5 text-sm">
              <svg className="w-4 h-4 text-brand-gold" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <CountdownTimer expiry={holdExpiry} />
            </div>
          )}

          <button
            onClick={() => {
              if (bookingClosed) {
                setError(selectedBookingStatus.message);
                setTimeout(() => setError(''), 4000);
                return;
              }
              setPanelOpen(true);
            }}
            disabled={bookingClosed}
            className={`relative px-4 py-2 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
              bookingClosed
                ? 'bg-white/10 text-white/40 border border-white/10 cursor-not-allowed'
                : allSeatsSelected && allNamesValid
                ? 'bg-brand-gold text-white glow-gold-sm hover:bg-brand-gold-light'
                : partySize > 0
                ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
                : 'bg-brand-gold text-white hover:bg-brand-gold-light'
            }`}
          >
            {bookingClosed ? 'Booking Closed' : allSeatsSelected && allNamesValid ? 'Complete Booking' : selectedSeats.length > 0 ? `Booking (${selectedSeats.length})` : 'Start Booking'}
            {selectedSeats.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {selectedSeats.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Session week picker bar — sits between the header and the FloorPlan.
          Colored to blend with the dark casino body background so the FloorPlan
          itself remains the focal point. */}
      <div className="bg-casino-dark-soft border-b border-white/10 px-4 py-2 flex-shrink-0">
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
            <LegendItem color={availableLegendColor} label="Available" />
            <LegendItem color={partialLegendColor} label="Partial" />
            <LegendItem color="bg-blue-500/80" label="Your Pick" />
            <LegendItem color="bg-gray-500/80" label="Full" />
          </div>

          <div className="text-sm text-white/50">
            {bookingClosed ? selectedBookingStatus.message : `${vacantCount} chairs available`} &middot; {soldCount} sold
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

        {selectedSeats.length === 0 && !openTable && !bookingClosed && (
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
          bookingStatus={selectedBookingStatus}
        />

        {selectedSeats.length === 0 && !openTable && (
          <div className="text-center mt-8">
            <button type="button" disabled={bookingClosed} className={`px-6 py-3 font-semibold rounded-xl shadow-lg transition-all ${
              bookingClosed
                ? 'bg-white/10 text-white/40 cursor-not-allowed border border-white/10'
                : 'bg-brand-gold hover:bg-brand-gold-light text-white glow-gold-sm'
            }`}>
              {bookingClosed ? 'Booking Closed' : 'Tap a Table Above to Pick Your Chairs'}
            </button>
            <p className="text-white/40 text-sm mt-2">
              {bookingClosed ? selectedBookingStatus.message : 'Your party size will be set automatically based on chairs selected'}
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
        requiredPkgs={requiredPkgs}
        optionalPkgs={optionalPkgs}
        maxOptionalPackagesPerPlayer={bookingConfig.maxOptionalPackagesPerPlayer}
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

      {/* Footer — matches the Wolastoq Casino main site footer (purple gradient,
          stacked logo, contact info, social icons, responsible gambling links).
          All external nav goes back to wolastoqcasino.ca pages. */}
      <footer className="bg-gradient-to-br from-casino-purple-light via-casino-purple to-casino-purple-dark border-t border-white/10 flex-shrink-0">
        <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Stacked Wolastoq Casino logo — same asset the main site uses */}
          <div className="flex md:justify-start justify-center">
            <a
              href="https://www.wolastoqcasino.ca"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Wolastoq Casino home"
            >
              <img
                src="/wolastoq-logo-stacked.png"
                alt="Wolastoq Casino"
                className="h-24 w-auto"
              />
            </a>
          </div>

          {/* Contact info — address, hours, phone numbers, chat link.
              Pulled from https://www.wolastoqcasino.ca/ footer. */}
          <ul className="text-white text-sm space-y-2 md:text-left text-center">
            <li className="flex items-start gap-2 md:justify-start justify-center">
              <svg className="w-4 h-4 mt-0.5 text-casino-cream shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span>185 Gabriel Drive, Fredericton, NB E3A 5V9</span>
            </li>
            <li className="flex items-start gap-2 md:justify-start justify-center">
              <svg className="w-4 h-4 mt-0.5 text-casino-cream shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <span>Open 7 Days a Week, 10:00 AM - 2:00 AM</span>
            </li>
            <li className="flex items-center gap-2 md:justify-start justify-center">
              <svg className="w-4 h-4 text-casino-cream shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              <a href="tel:+18889924646" className="hover:text-casino-cream transition-colors">888-992-4646</a>
            </li>
            <li className="flex items-center gap-2 md:justify-start justify-center">
              <svg className="w-4 h-4 text-casino-cream shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              <a href="tel:+15064629300" className="hover:text-casino-cream transition-colors">506-462-9300</a>
            </li>
          </ul>

          {/* Social icons. Links currently point at the main site's footer
              targets — update when official Facebook/YouTube URLs are known. */}
          <div className="flex flex-col gap-3 md:items-end items-center">
            <p className="text-white text-sm font-semibold">Follow US :</p>
            <div className="flex items-center gap-3">
              <a
                href="https://www.wolastoqcasino.ca"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="text-white hover:text-casino-cream transition-colors"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              <a
                href="https://www.wolastoqcasino.ca"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="text-white hover:text-casino-cream transition-colors"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar — copyright + compliance links. Matches the main site
            footer's secondary row. */}
        <div className="border-t border-white/20">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row md:justify-between items-center gap-2 text-xs text-white/80">
            <p>© {new Date().getFullYear()} Wolastoq Casino. All Rights Reserved.</p>
            <div className="flex items-center gap-4">
              <a href="https://www.wolastoqcasino.ca" target="_blank" rel="noopener noreferrer" className="hover:text-casino-cream transition-colors">Responsible Gambling</a>
              <a href="https://www.wolastoqcasino.ca" target="_blank" rel="noopener noreferrer" className="hover:text-casino-cream transition-colors">Policies/Terms and Conditions</a>
            </div>
          </div>
        </div>
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
