import React, { useEffect, useRef, useState } from 'react';
import {
  fetchBookingConfig,
  fetchPhdInventory,
  fetchSeats,
  fetchSessionPackages,
  fetchSessions,
  fetchTheme,
} from './api';
import AnnouncementBanner from './components/AnnouncementBanner';
import BookingPanel from './components/BookingPanel';
import BookingProcessing from './components/BookingProcessing';
import CountdownTimer from './components/CountdownTimer';
import EmbeddedAuthorizeNetPayment from './components/EmbeddedAuthorizeNetPayment';
import EventCheckoutPanel from './components/EventCheckoutPanel';
import FloorPlan from './components/FloorPlan';
import VenueClock from './components/VenueClock';
import LegendItem from './components/LegendItem';
import LiveEventBookingSurface from './components/LiveEventBookingSurface';
import { useSocket } from './useSocket';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import SessionPickerBar from './components/SessionPickerBar';
import { useSeatSelection } from './useSeatSelection';
import { useCheckout } from './useCheckout';
import {
  CHECKOUT_SERVICE_FEE_CENTS,
  EVENT_HST_RATE,
  detectPaymentRoute,
  emptyAttendee,
  generateHolderId,
  getClientBookingStatus,
  getRequestedSession,
  getSessionType,
} from './bookingHelpers';

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
  return <BookingApp />;
}

// The full booking flow. Its own component so the payment-return short-circuit
// in App is not an early return ahead of these hooks (rules-of-hooks); App's
// paymentRoute never changes after mount, so BookingApp mounts exactly once.
function BookingApp() {
  const [holderId] = useState(generateHolderId);
  const socket = useSocket();

  const [sessions, setSessions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [bookingConfig, setBookingConfig] = useState({
    maxOptionalPackagesPerPlayer: 3,
    serviceFeePerPersonAmount: CHECKOUT_SERVICE_FEE_CENTS,
  });
  const [phdInventory, setPhdInventory] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [partySize, setPartySize] = useState(0);
  const [attendees, setAttendees] = useState([]);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  // Ref mirror of selectedSeats for async click handlers: two rapid chair
  // taps both await lockSeat, and the second's closure would otherwise not
  // see the first's update — dropping a locked seat from the selection.
  const selectedSeatsRef = useRef([]);
  useEffect(() => { selectedSeatsRef.current = selectedSeats; }, [selectedSeats]);
  const applySelectedSeats = (next) => {
    selectedSeatsRef.current = next;
    setSelectedSeats(next);
  };
  // Seats with a lock/unlock request currently in flight — a double-tap on
  // one chair must not fire two lock requests that both append the seat.
  const pendingSeatClicksRef = useRef(new Set());
  const [holdExpiry, setHoldExpiry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentSession, setPaymentSession] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [openTable, setOpenTable] = useState(null);
  // Picking a session starts with no table popup open and no stale PHD count
  // (the session effect below then loads the new session's data).
  const [viewedSession, setViewedSession] = useState(null);
  if (selectedSession && selectedSession !== viewedSession) {
    setViewedSession(selectedSession);
    setPhdInventory(null);
    setOpenTable(null);
  }
  const [weekOffset, setWeekOffset] = useState(0);
  const [namesFilledBeforeChairs, setNamesFilledBeforeChairs] = useState(false);
  const [bookingStep, setBookingStep] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const selectedSessionType = getSessionType(selectedSession);
  const isSelectedSpecialBingo = selectedSessionType === 'special_bingo';
  const isSelectedEvent = selectedSessionType === 'event';

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
      if (config) {
        setBookingConfig({
          maxOptionalPackagesPerPlayer: config.maxOptionalPackagesPerPlayer ?? 3,
          serviceFeePerPersonAmount: config.serviceFeePerPersonAmount ?? CHECKOUT_SERVICE_FEE_CENTS,
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions().then(data => {
      setSessions(data);
      const requested = getRequestedSession(data, window.location.search);

      if (requested.isRequested) {
        if (!requested.session) {
          setSelectedSession(null);
          setError('That exact bingo session is not currently available for online booking. Please choose another listed session.');
          return;
        }

        setSelectedSession(requested.session);
        if (getSessionType(requested.session) === 'special_bingo') {
          setPartySize(1);
          setAttendees([emptyAttendee()]);
        }
        return;
      }

      if (data.length > 0) {
        setSelectedSession(data.find(session => getSessionType(session) !== 'event') || data[0]);
      }
    }).catch(err => {
      console.error('Failed to load sessions:', err);
      setError('Could not load sessions. Please check your connection and refresh the page.');
    });
  }, []);

  useEffect(() => {
    if (!selectedSession) return undefined;

    fetchSeats(selectedSession.id, holderId).then(setSeats).catch(err => {
      console.error('Failed to load seats:', err);
      setError('Could not load the seat map. Please refresh the page.');
    });
    fetchSessionPackages(selectedSession.id).then(setPackages).catch(() => {});
    fetchPhdInventory(selectedSession.id).then(setPhdInventory).catch(() => {});

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

    // Socket.io drops room membership on reconnect (server restart, network
    // blip) — re-join and refetch or seat updates silently stop arriving.
    const handleReconnect = () => {
      socket.emit('join:session', selectedSession.id);
      fetchSeats(selectedSession.id, holderId).then(setSeats).catch(() => {});
    };

    socket.emit('join:session', selectedSession.id);
    socket.on('connect', handleReconnect);
    socket.on('seat:locked', handleLocked);
    socket.on('seat:unlocked', handleUnlocked);
    socket.on('seat:sold', handleSold);
    socket.on('seats:refresh', handleRefresh);

    return () => {
      socket.emit('leave:session', selectedSession.id);
      socket.off('connect', handleReconnect);
      socket.off('seat:locked', handleLocked);
      socket.off('seat:unlocked', handleUnlocked);
      socket.off('seat:sold', handleSold);
      socket.off('seats:refresh', handleRefresh);
    };
  }, [selectedSession, socket, holderId]);

  // Reconcile the local selection against seat reality: when a hold expires
  // or a seat is taken, drop it from the selection instead of showing "Your
  // Pick" on a seat that will be rejected at checkout.
  useEffect(() => {
    if (paymentSession || loading || seats.length === 0) return;
    const current = selectedSeatsRef.current;
    if (current.length === 0) return;
    const byId = new Map(seats.map(seat => [seat.id, seat]));
    const holdExpired = holdExpiry ? new Date(holdExpiry).getTime() <= Date.now() : false;
    const stillMine = current.filter(id => {
      const seat = byId.get(id);
      if (!seat) return false;
      if (seat.status === 'held') return seat.isMyHold;
      if (seat.status === 'sold') return false;
      // 'vacant' can be a momentarily stale snapshot right after locking —
      // only treat it as lost once our own tracked hold window has lapsed.
      return !holdExpired;
    });
    if (stillMine.length === current.length) return;
    applySelectedSeats(stillMine);
    if (!namesFilledBeforeChairs) {
      setPartySize(stillMine.length);
      setAttendees(prev => prev.slice(0, Math.max(stillMine.length, isSelectedSpecialBingo ? 1 : 0)));
    }
    if (stillMine.length === 0) {
      setHoldExpiry(null);
      setBookingStep(0);
      setError('Your chair hold expired, so your selection was cleared. Please pick your chairs again.');
      setTimeout(() => setError(''), 6000);
    }
  }, [seats, holdExpiry, paymentSession, loading, namesFilledBeforeChairs, isSelectedSpecialBingo]);

  const requiredPkgs = packages.filter(pkg => pkg.type === 'required');
  const requiredPkg = requiredPkgs[0];
  const optionalPkgs = packages.filter(pkg => pkg.type === 'optional');
  const allNamesValid = attendees.length > 0 && attendees.every(attendee => attendee.firstName.trim() && attendee.lastName.trim());
  const allSeatsSelected = selectedSeats.length === partySize && partySize > 0;

  if (namesFilledBeforeChairs && allSeatsSelected && allNamesValid && !panelOpen) {
    setPanelOpen(true);
    setNamesFilledBeforeChairs(false);
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
  const configuredTicketLimit = Number(selectedSession?.ticket_limit || 0);
  const capacityRemaining = configuredTicketLimit > 0
    ? Math.max(0, configuredTicketLimit - soldCount - heldCount)
    : vacantCount;
  const eventAvailableTickets = isSelectedEvent ? Math.min(vacantCount, capacityRemaining) : vacantCount;
  const soldOut = isSelectedEvent && configuredTicketLimit > 0
    ? capacityRemaining <= 0 && selectedSeats.length === 0
    : sellableSeatCount > 0 && seats.every(seat => seat.is_disabled || seat.status === 'sold');
  const selectedBookingStatus = getClientBookingStatus(selectedSession, {
    soldOut,
    nowMs: nowTick,
  });
  const bookingClosed = selectedBookingStatus.isClosed;
  const bingoSessions = sessions.filter(session => getSessionType(session) !== 'event');
  const featuredEventSessions = sessions
    .filter(session => ['special_bingo', 'event'].includes(getSessionType(session)))
    .sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`));
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
  const orderSubtotal = attendees.reduce((sum, attendee) => {
    if (isSelectedEvent) {
      const eventPkg = requiredPkgs.find(pkg => pkg.id === (attendee.ticketPackageId || requiredPkgs[0]?.id));
      return sum + (eventPkg?.price || 0);
    }
    return sum + (attendee.addons || []).reduce((addonSum, addon) => {
      const pkg = optionalPkgs.find(item => item.id === addon.packageId);
      return pkg ? addonSum + pkg.price * addon.quantity : addonSum;
    }, 0);
  }, isSelectedEvent ? 0 : partySize * requiredTotal);
  const serviceFeeUnitAmount = (isSelectedSpecialBingo || isSelectedEvent) ? 0 : bookingConfig.serviceFeePerPersonAmount;
  const serviceFeeAmount = partySize > 0 ? serviceFeeUnitAmount * partySize : 0;
  const salesTaxAmount = isSelectedEvent ? Math.round(orderSubtotal * EVENT_HST_RATE) : 0;
  const total = orderSubtotal + serviceFeeAmount + salesTaxAmount;
  const {
    handleChairClick,
    reserveEventTickets,
    handlePartySize,
    handleSelectSession,
  } = useSeatSelection({
    holderId,
    selectedSession,
    setSelectedSession,
    setPartySize,
    attendees,
    setAttendees,
    seats,
    setSeats,
    selectedSeats,
    setSelectedSeats,
    holdExpiry,
    setHoldExpiry,
    error,
    setError,
    setPanelOpen,
    setOpenTable,
    namesFilledBeforeChairs,
    bookingStep,
    setBookingStep,
    selectedSeatsRef,
    applySelectedSeats,
    pendingSeatClicksRef,
    isSelectedEvent,
    requiredPkgs,
    selectedBookingStatus,
    bookingClosed,
  });
  const {
    handleSubmit,
    handleBackToEditCheckout,
  } = useCheckout({
    holderId,
    packages,
    selectedSession,
    partySize,
    attendees,
    seats,
    setSeats,
    selectedSeats,
    setHoldExpiry,
    setLoading,
    error,
    setError,
    paymentSession,
    setPaymentSession,
    setPanelOpen,
    setBookingStep,
    isSelectedEvent,
    requiredPkgs,
    optionalPkgs,
    selectedBookingStatus,
    bookingClosed,
    serviceFeeUnitAmount,
    serviceFeeAmount,
    salesTaxAmount,
    reserveEventTickets,
  });

  if (paymentSession) {
    return (
      <EmbeddedAuthorizeNetPayment
        payment={paymentSession}
        onBack={handleBackToEditCheckout}
        onCancel={() => {
          window.location.href = `/payment/cancel?bookingId=${encodeURIComponent(paymentSession.bookingId)}`;
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader>
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
      </SiteHeader>

      <SessionPickerBar
        featuredEventSessions={featuredEventSessions}
        selectedSession={selectedSession}
        handleSelectSession={handleSelectSession}
        isSelectedEvent={isSelectedEvent}
        bingoSessions={bingoSessions}
        weekOffset={weekOffset}
        setWeekOffset={setWeekOffset}
      />

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {!isSelectedEvent && <AnnouncementBanner socket={socket} />}

        {!isSelectedEvent && (
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
        )}

        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-xl text-center text-sm font-medium">
            {error}
          </div>
        )}

        {isSelectedEvent ? (
          <LiveEventBookingSurface
            event={selectedSession}
            packages={packages}
            availableTickets={eventAvailableTickets}
            soldTickets={soldCount}
            heldTickets={heldCount}
            bookingClosed={bookingClosed}
            bookingStatus={selectedBookingStatus}
            onStart={() => setPanelOpen(true)}
          />
        ) : (
          <>
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
          </>
        )}
      </div>

      {isSelectedEvent ? (
        <EventCheckoutPanel
          isOpen={panelOpen}
          onClose={() => setPanelOpen(false)}
          session={selectedSession}
          attendees={attendees}
          onAttendees={setAttendees}
          onTicketSelection={ticketPackageIds => handlePartySize(ticketPackageIds.length, ticketPackageIds)}
          requiredPkgs={requiredPkgs}
          availableTickets={eventAvailableTickets}
          holdExpiry={holdExpiry}
          salesTaxAmount={salesTaxAmount}
          total={total}
          loading={loading}
          onSubmit={handleSubmit}
          step={bookingStep}
          onStepChange={setBookingStep}
        />
      ) : (
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
          serviceFeeUnitAmount={serviceFeeUnitAmount}
          serviceFeeAmount={serviceFeeAmount}
          salesTaxAmount={salesTaxAmount}
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
      )}

      <SiteFooter />
    </div>
  );
}
