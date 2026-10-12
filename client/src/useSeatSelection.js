import { fetchSeats, lockSeat, unlockSeat } from './api';
import { emptyAttendee, getSessionType } from './bookingHelpers';

// Customer seat and party selection: chair clicks (lock/unlock holds),
// party size, live-event ticket reservation and switching sessions. Moved
// verbatim out of App.jsx; the caller passes state and setters explicitly.
export function useSeatSelection({
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
}) {

  const handleChairClick = async (chair) => {
    if (bookingClosed) {
      setError(selectedBookingStatus.message);
      setTimeout(() => setError(''), 4000);
      return;
    }
    // One in-flight request per seat: a double-tap must not run two
    // lock/unlock round-trips that both mutate the selection.
    if (pendingSeatClicksRef.current.has(chair.id)) return;
    pendingSeatClicksRef.current.add(chair.id);
    try {
    if (selectedSeatsRef.current.includes(chair.id)) {
      await unlockSeat(chair.id, holderId);
      const current = selectedSeatsRef.current;
      const removedIndex = current.indexOf(chair.id);
      const newSelected = current.filter(id => id !== chair.id);
      applySelectedSeats(newSelected);
      if (!namesFilledBeforeChairs) {
        setPartySize(newSelected.length);
        setAttendees(prev => prev.filter((_, index) => index !== removedIndex));
      }
      if (newSelected.length === 0) setHoldExpiry(null);
      setBookingStep(prev => newSelected.length === 0 ? 0 : (prev === 2 ? 1 : prev));
      return;
    }

    if (chair.is_disabled || chair.status === 'sold') return;
    if (chair.status === 'held' && !chair.isMyHold) return;
    if (bookingStep === 2) return;

    if (selectedSeatsRef.current.length >= 6) {
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

    // Re-check after the await: never append the same seat twice, and never
    // exceed the 6-chair limit (two clicks on DIFFERENT chairs can both pass
    // the pre-request check at 5 selected). Release the lock we just took.
    if (selectedSeatsRef.current.includes(chair.id)) return;
    if (selectedSeatsRef.current.length >= 6) {
      unlockSeat(chair.id, holderId).catch(() => {});
      setError('Maximum 6 chairs per booking. Tap a selected chair to deselect.');
      setTimeout(() => setError(''), 4000);
      return;
    }
    const wasEmpty = selectedSeatsRef.current.length === 0;
    const newSelected = [...selectedSeatsRef.current, chair.id];
    applySelectedSeats(newSelected);

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

    // Each seat carries its own 20-minute hold; the countdown must show the
    // EARLIEST expiry or seats picked first expire while the timer still runs.
    setHoldExpiry(prev => (!prev || new Date(result.holdUntil) < new Date(prev)) ? result.holdUntil : prev);

    if (wasEmpty && !namesFilledBeforeChairs) {
      setPanelOpen(true);
    }
    } finally {
      pendingSeatClicksRef.current.delete(chair.id);
    }
  };

  const reserveEventTickets = async (size) => {
    if (!selectedSession) return false;

    const latestSeats = await fetchSeats(selectedSession.id, holderId);
    const latestById = new Map(latestSeats.map(seat => [seat.id, seat]));
    const trackedHeldSeats = selectedSeats.filter(seatId => latestById.get(seatId)?.status === 'held');
    const myHeldSeats = latestSeats
      .filter(seat => seat.status === 'held' && seat.isMyHold)
      .map(seat => seat.id);
    const heldSeatCandidates = [...new Set([...trackedHeldSeats, ...myHeldSeats])];
    const keptSeats = heldSeatCandidates.slice(0, size);
    const keptSet = new Set(keptSeats);
    const seatsToRelease = heldSeatCandidates.filter(seatId => !keptSet.has(seatId));

    for (const seatId of seatsToRelease) {
      await unlockSeat(seatId, holderId);
    }

    const newlyLocked = [];
    let nextHoldExpiry = holdExpiry;
    for (const seat of latestSeats) {
      if (keptSeats.length + newlyLocked.length >= size) break;
      if (keptSet.has(seat.id)) continue;
      if (seat.is_disabled || seat.status === 'sold') continue;
      if (seat.status === 'held' && !seat.isMyHold) continue;

      if (seat.status === 'held' && seat.isMyHold) {
        newlyLocked.push(seat.id);
        continue;
      }

      const result = await lockSeat(seat.id, holderId);
      if (result.success) {
        newlyLocked.push(seat.id);
        if (!nextHoldExpiry || new Date(result.holdUntil) < new Date(nextHoldExpiry)) {
          nextHoldExpiry = result.holdUntil;
        }
      }
    }

    const nextSelectedSeats = [...keptSeats, ...newlyLocked].slice(0, size);
    if (nextSelectedSeats.length < size) {
      for (const seatId of newlyLocked) {
        if (!keptSet.has(seatId)) await unlockSeat(seatId, holderId);
      }
      setError('Not enough live event tickets are available for that party size.');
      setTimeout(() => setError(''), 4000);
      setSeats(await fetchSeats(selectedSession.id, holderId));
      return null;
    }

    setSelectedSeats(nextSelectedSeats);
    setHoldExpiry(nextHoldExpiry);
    setSeats(await fetchSeats(selectedSession.id, holderId));
    return nextSelectedSeats;
  };

  const handlePartySize = async (size, eventTicketPackageIds = []) => {
    if (isSelectedEvent) {
      const reserved = await reserveEventTickets(size);
      if (!reserved) return false;
    }

    const eventAttendeePools = isSelectedEvent
      ? attendees.reduce((pools, attendee) => {
          const packageId = attendee.ticketPackageId || requiredPkgs[0]?.id || '';
          const packagePool = pools.get(packageId) || [];
          packagePool.push(attendee);
          pools.set(packageId, packagePool);
          return pools;
        }, new Map())
      : null;

    setPartySize(size);
    setAttendees(Array.from({ length: size }, (_, index) => {
      const packageId = eventTicketPackageIds[index] || attendees[index]?.ticketPackageId || requiredPkgs[0]?.id || '';
      const matchedEventAttendee = isSelectedEvent
        ? eventAttendeePools.get(packageId)?.shift()
        : null;
      const previousAttendee = matchedEventAttendee || attendees[index];

      return {
        firstName: previousAttendee?.firstName || '',
        lastName: previousAttendee?.lastName || '',
        ticketPackageId: isSelectedEvent ? packageId : '',
        addons: previousAttendee?.addons || []
      };
    }));

    if (!isSelectedEvent && size < selectedSeats.length) {
      const toRelease = selectedSeats.slice(size);
      for (const seatId of toRelease) unlockSeat(seatId, holderId);
      setSelectedSeats(selectedSeats.slice(0, size));
    }
    return true;
  };

  const handleSelectSession = (session) => {
    setSelectedSession(session);
    setSelectedSeats([]);
    setHoldExpiry(null);
    setOpenTable(null);
    setBookingStep(0);

    if (getSessionType(session) === 'special_bingo') {
      setPartySize(1);
      setAttendees([emptyAttendee()]);
    } else {
      setPartySize(0);
      setAttendees([]);
    }
  };

  return {
    handleChairClick,
    reserveEventTickets,
    handlePartySize,
    handleSelectSession,
  };
}
