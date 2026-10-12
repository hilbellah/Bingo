import React, { useCallback, useEffect, useState } from 'react';
import { useAdminDashboard } from './AdminDashboardContext';
import { createAssignedTicket, fetchAdminSeats, moveAdminBookingItemSeat, toggleAdminSeat, toggleAdminTableSeats, toggleAdminSeatsBulk } from '../api';
import SessionWeekPicker from '../components/SessionWeekPicker';
import { confirmAdminAction } from './adminConfirm';
import { SpecialBingoChairPicker, ChairManagementWorkspace } from './ChairFloorPlan';

export default function ChairManagementTab() {
  const {
    tab,
    sessions,
    chairMgmtSession,
    setChairMgmtSession,
    setChairMgmtLoading,
    setChairMgmtSeats,
    chairMgmtLoading,
    chairMgmtSeats,
    chairMgmtFilter,
    setChairMgmtFilter,
    token,
  } = useAdminDashboard();

  const [weekOffset, setWeekOffset] = useState(0);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedSeatIds, setSelectedSeatIds] = useState(() => new Set());
  const selectedSession = sessions.find(session => session.id === chairMgmtSession);
  const specialBingoSessions = sessions
    .filter(session => (session.session_type || (session.is_special_event ? 'special_bingo' : 'regular_bingo')) === 'special_bingo')
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const loadSessionSeats = useCallback(async (sessionId) => {
    if (!sessionId) {
      setChairMgmtSeats([]);
      return;
    }

    setChairMgmtLoading(true);
    try {
      const seats = await fetchAdminSeats(token, sessionId);
      setChairMgmtSeats(seats);
    } finally {
      setChairMgmtLoading(false);
    }
  }, [token, setChairMgmtSeats, setChairMgmtLoading]);

  useEffect(() => {
    if (tab !== 'chairs') return;
    loadSessionSeats(chairMgmtSession);
  }, [tab, chairMgmtSession, loadSessionSeats]);

  // Switching session or tab clears any bulk selection.
  const selectionKey = `${chairMgmtSession}|${tab}`;
  const [selectionFor, setSelectionFor] = useState(selectionKey);
  if (selectionKey !== selectionFor) {
    setSelectionFor(selectionKey);
    setSelectedSeatIds(new Set());
  }

  const handleToggleChair = async (chair) => {
    if (chair.status === 'sold') return;

    if (chair.status === 'vacant' && !chair.is_disabled) {
      const choice = window.prompt(
        `Table ${chair.table_number}, Chair ${chair.chair_number}\n\nType D to disable this chair.\nType P to assign a promo ticket.\nType N to assign a donation ticket.`,
        'D'
      );
      if (choice === null) return;
      const action = choice.trim().toUpperCase();
      if (action === 'P' || action === 'N') {
        await handleCreateAssignedTicket(chair, action === 'N' ? 'donation' : 'promo');
        return;
      }
      if (action !== 'D') {
        window.alert('No change made.');
        return;
      }
    }

    const nextDisabled = !chair.is_disabled;
    if (!confirmAdminAction({
      action: `${nextDisabled ? 'Disable' : 'Enable'} this chair`,
      details: [
        `Table: ${chair.table_number}`,
        `Chair: ${chair.chair_number}`,
        selectedSession ? `Session: ${selectedSession.date} at ${selectedSession.time}` : '',
      ],
      warning: nextDisabled
        ? 'Customers will not be able to book this chair.'
        : 'Customers will be able to book this chair again if it is available.',
    })) return;

    const result = await toggleAdminSeat(token, chair.id, nextDisabled);
    if (result?.error) {
      window.alert(result.error);
      return;
    }

    setChairMgmtSeats(prev => prev.map(seat =>
      seat.id === chair.id ? { ...seat, is_disabled: nextDisabled ? 1 : 0 } : seat
    ));
  };

  const handleCreateAssignedTicket = async (chair, type) => {
    const firstName = window.prompt(`${type === 'donation' ? 'Donation' : 'Promo'} assigned ticket\nFirst name:`);
    if (firstName === null) return;
    const lastName = window.prompt('Last name:');
    if (lastName === null) return;
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    if (!cleanFirstName || !cleanLastName) {
      window.alert('First and last name are required.');
      return;
    }
    const note = window.prompt('Note (optional):', type === 'donation' ? 'Donation seat' : 'Promo seat');
    if (note === null) return;

    if (!confirmAdminAction({
      action: `Create ${type} assigned ticket`,
      details: [
        selectedSession ? `Session: ${selectedSession.date} at ${selectedSession.time}` : '',
        `Seat: T${chair.table_number}-C${chair.chair_number}`,
        `Assigned to: ${cleanFirstName} ${cleanLastName}`,
      ].filter(Boolean),
      warning: 'This creates a zero-dollar paid ticket, marks the chair sold, and includes the name in bulk printing.',
    })) return;

    const result = await createAssignedTicket(token, {
      sessionId: chairMgmtSession,
      tableNumber: chair.table_number,
      chairNumber: chair.chair_number,
      firstName: cleanFirstName,
      lastName: cleanLastName,
      type,
      note,
    });
    if (!result.ok) {
      window.alert(result.error || 'Could not create assigned ticket.');
      return;
    }
    window.alert(`Assigned ticket created: ${result.ticketReference || result.bookingReference}`);
    await loadSessionSeats(chairMgmtSession);
  };

  const handleMoveSoldChair = async (chair) => {
    if (chair.status !== 'sold' || !chair.booking_item_id) {
      window.alert('Only sold chairs with an active ticket can be moved.');
      return;
    }

    const holderName = chair.booked_name || 'ticket holder';
    const currentSeat = `T${chair.table_number}-C${chair.chair_number}`;
    const tableValue = window.prompt(
      `Move ${chair.ticket_reference_number || 'this ticket'} for ${holderName}\nCurrent chair: ${currentSeat}\n\nTarget table number:`
    );
    if (tableValue === null) return;
    const chairValue = window.prompt('Target chair number:');
    if (chairValue === null) return;
    const tableNumber = Number(tableValue);
    const chairNumber = Number(chairValue);
    if (!Number.isInteger(tableNumber) || !Number.isInteger(chairNumber) || tableNumber <= 0 || chairNumber <= 0) {
      window.alert('Enter a valid table number and chair number.');
      return;
    }

    if (!confirmAdminAction({
      action: `Move chair ${currentSeat} to T${tableNumber}-C${chairNumber}`,
      details: [
        selectedSession ? `Session: ${selectedSession.date} at ${selectedSession.time}` : '',
        `Ticket: ${chair.ticket_reference_number || '(none)'}`,
        `Booking: ${chair.booking_reference_number || '(none)'}`,
        `Holder: ${holderName}`,
      ],
      warning: 'This keeps the booking paid and only changes the assigned chair. The target chair must be vacant.',
    })) return;

    const result = await moveAdminBookingItemSeat(token, chair.booking_item_id, { tableNumber, chairNumber });
    if (!result.ok) {
      window.alert(result.error || 'Could not move chair.');
      return;
    }

    window.alert(`Chair moved to T${result.toSeat?.tableNumber || tableNumber}-C${result.toSeat?.chairNumber || chairNumber}.`);
    await loadSessionSeats(chairMgmtSession);
  };

  const handleToggleTable = async (tableNumber, chairs) => {
    const editableChairs = chairs.filter(chair => chair.status !== 'sold');
    if (editableChairs.length === 0) {
      window.alert('All seats at this table are sold and cannot be changed.');
      return;
    }

    const nextDisabled = editableChairs.some(chair => !chair.is_disabled);
    const skippedSoldCount = chairs.length - editableChairs.length;
    if (!confirmAdminAction({
      action: `${nextDisabled ? 'Disable' : 'Enable'} table ${tableNumber}`,
      details: [
        selectedSession ? `Session: ${selectedSession.date} at ${selectedSession.time}` : '',
        `Table: ${tableNumber}`,
        `Seats to ${nextDisabled ? 'disable' : 'enable'}: ${editableChairs.length}`,
        skippedSoldCount ? `Sold seats skipped: ${skippedSoldCount}` : '',
      ],
      warning: nextDisabled
        ? 'Customers will not be able to book any enabled seats at this table.'
        : 'Customers will be able to book these seats again if they are available.',
    })) return;

    try {
      const result = await toggleAdminTableSeats(token, chairMgmtSession, tableNumber, nextDisabled);
      if (result?.error) {
        window.alert(result.error);
        return;
      }

      const updatedSeatMap = new Map((result.seats || []).map(seat => [seat.id, seat]));
      setChairMgmtSeats(prev => prev.map(seat =>
        updatedSeatMap.has(seat.id) ? { ...seat, ...updatedSeatMap.get(seat.id) } : seat
      ));

      if (result.skippedSoldSeats) {
        window.alert(`Updated ${result.changedSeats} seat(s). ${result.skippedSoldSeats} sold seat(s) were skipped.`);
      }
    } catch (error) {
      window.alert(error.message || 'Failed to update table seats.');
    }
  };

  const handleToggleSeatSelection = (chair) => {
    if (!bulkSelectMode || chair.status === 'sold') return;
    setSelectedSeatIds(prev => {
      const next = new Set(prev);
      if (next.has(chair.id)) next.delete(chair.id);
      else next.add(chair.id);
      return next;
    });
  };

  const handleToggleTableSelection = (tableNumber, chairs) => {
    if (!bulkSelectMode) return;
    const selectableIds = chairs.filter(chair => chair.status !== 'sold').map(chair => chair.id);
    if (selectableIds.length === 0) return;
    setSelectedSeatIds(prev => {
      const next = new Set(prev);
      const allSelected = selectableIds.every(id => next.has(id));
      for (const id of selectableIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const handleToggleSectionSelection = (tableNumbers) => {
    const tableSet = new Set(tableNumbers);
    const selectableIds = chairMgmtSeats
      .filter(seat => tableSet.has(seat.table_number) && seat.status !== 'sold')
      .map(seat => seat.id);
    if (selectableIds.length === 0) return;
    setSelectedSeatIds(prev => {
      const next = new Set(prev);
      const allSelected = selectableIds.every(id => next.has(id));
      for (const id of selectableIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const handleApplyBulkSelection = async (nextDisabled) => {
    const selectedSeats = chairMgmtSeats.filter(seat => selectedSeatIds.has(seat.id));
    const editableSeats = selectedSeats.filter(seat => seat.status !== 'sold');
    if (editableSeats.length === 0) {
      window.alert('Select at least one non-sold chair first.');
      return;
    }

    const tableCount = new Set(editableSeats.map(seat => seat.table_number)).size;
    if (!confirmAdminAction({
      action: `${nextDisabled ? 'Disable' : 'Enable'} selected chairs`,
      details: [
        selectedSession ? `Session: ${selectedSession.date} at ${selectedSession.time}` : '',
        `Chairs selected: ${editableSeats.length}`,
        `Tables affected: ${tableCount}`,
      ],
      warning: nextDisabled
        ? 'Customers will not be able to book these selected chairs.'
        : 'Customers will be able to book these selected chairs again if they are available.',
    })) return;

    try {
      const result = await toggleAdminSeatsBulk(
        token,
        chairMgmtSession,
        editableSeats.map(seat => seat.id),
        nextDisabled
      );
      const updatedSeatMap = new Map((result.seats || []).map(seat => [seat.id, seat]));
      setChairMgmtSeats(prev => prev.map(seat =>
        updatedSeatMap.has(seat.id) ? { ...seat, ...updatedSeatMap.get(seat.id) } : seat
      ));
      setSelectedSeatIds(new Set());

      if (result.skippedSoldSeats) {
        window.alert(`Updated ${result.changedSeats} chair(s). ${result.skippedSoldSeats} sold chair(s) were skipped.`);
      }
    } catch (error) {
      window.alert(error.message || 'Failed to update selected chairs.');
    }
  };

  const selectedSeatCount = selectedSeatIds.size;

  return (
    <>
      {tab === 'chairs' && (
        <div className="max-w-7xl">
          <h3 className="text-xl font-bold text-brand-blue mb-2">Chair Management</h3>
          <p className="text-sm text-gray-500 mb-4">
            Disable broken or unavailable chairs directly on the venue floor plan.
          </p>

          <div className="bg-brand-blue rounded-xl shadow-sm p-3 mb-6 overflow-hidden">
            {specialBingoSessions.length > 0 && (
              <SpecialBingoChairPicker
                sessions={specialBingoSessions}
                selectedSession={selectedSession}
                onSelectSession={(session) => setChairMgmtSession(session.id)}
              />
            )}
            {sessions.length > 0 ? (
              <SessionWeekPicker
                sessions={sessions}
                selectedSession={selectedSession}
                weekOffset={weekOffset}
                onWeekOffsetChange={setWeekOffset}
                onSelectSession={(session) => setChairMgmtSession(session.id)}
              />
            ) : (
              <div className="text-sm text-white/60 px-2 py-1">No sessions available.</div>
            )}
          </div>

          {chairMgmtLoading && (
            <div className="text-center py-8 text-gray-400">Loading chairs...</div>
          )}

          {chairMgmtSession && !chairMgmtLoading && chairMgmtSeats.length > 0 && (
            <ChairManagementWorkspace
              seats={chairMgmtSeats}
              filter={chairMgmtFilter}
              onFilter={setChairMgmtFilter}
              onToggleChair={handleToggleChair}
              onMoveSoldChair={handleMoveSoldChair}
              onToggleTable={handleToggleTable}
              bulkSelectMode={bulkSelectMode}
              selectedSeatIds={selectedSeatIds}
              selectedSeatCount={selectedSeatCount}
              onBulkSelectModeChange={setBulkSelectMode}
              onToggleSeatSelection={handleToggleSeatSelection}
              onToggleTableSelection={handleToggleTableSelection}
              onToggleSectionSelection={handleToggleSectionSelection}
              onApplyBulkSelection={handleApplyBulkSelection}
              onClearBulkSelection={() => setSelectedSeatIds(new Set())}
              selectedSession={selectedSession}
            />
          )}

          {chairMgmtSession && !chairMgmtLoading && chairMgmtSeats.length === 0 && (
            <div className="text-center py-8 text-gray-400">No chairs found for this session.</div>
          )}
        </div>
      )}
    </>
  );
}
