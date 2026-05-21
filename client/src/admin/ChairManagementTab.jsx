import React, { useState } from 'react';
import { useAdminDashboard } from './AdminDashboardContext';
import { fetchAdminSeats, toggleAdminSeat } from '../api';
import SessionWeekPicker from '../components/SessionWeekPicker';
import { SECTIONS } from '../seatLayout';

const sectionsById = SECTIONS.reduce((acc, section) => {
  acc[section.id] = section;
  return acc;
}, {});

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
  const selectedSession = sessions.find(session => session.id === chairMgmtSession);

  const loadSessionSeats = async (sessionId) => {
    setChairMgmtSession(sessionId);
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
  };

  const handleToggleChair = async (chair) => {
    if (chair.status === 'sold') return;

    const nextDisabled = !chair.is_disabled;
    const result = await toggleAdminSeat(token, chair.id, nextDisabled);
    if (result?.error) {
      window.alert(result.error);
      return;
    }

    setChairMgmtSeats(prev => prev.map(seat =>
      seat.id === chair.id ? { ...seat, is_disabled: nextDisabled ? 1 : 0 } : seat
    ));
  };

  return (
    <>
      {tab === 'chairs' && (
        <div className="max-w-7xl">
          <h3 className="text-xl font-bold text-brand-blue mb-2">Chair Management</h3>
          <p className="text-sm text-gray-500 mb-4">
            Disable broken or unavailable chairs directly on the venue floor plan.
          </p>

          <div className="bg-brand-blue rounded-xl shadow-sm p-3 mb-6 overflow-hidden">
            {sessions.length > 0 ? (
              <SessionWeekPicker
                sessions={sessions}
                selectedSession={selectedSession}
                weekOffset={weekOffset}
                onWeekOffsetChange={setWeekOffset}
                onSelectSession={(session) => loadSessionSeats(session.id)}
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

function ChairManagementWorkspace({ seats, filter, onFilter, onToggleChair, selectedSession }) {
  const disabledCount = seats.filter(seat => seat.is_disabled).length;
  const availableCount = seats.filter(seat => seat.status === 'vacant' && !seat.is_disabled).length;
  const soldCount = seats.filter(seat => seat.status === 'sold').length;
  const heldCount = seats.filter(seat => seat.status === 'held').length;

  const tableMap = seats.reduce((map, seat) => {
    map[seat.table_number] = map[seat.table_number] || [];
    map[seat.table_number].push(seat);
    return map;
  }, {});

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <SummaryCard label="Available" value={availableCount} className="bg-green-600" />
        <SummaryCard label="Sold" value={soldCount} className="bg-gray-600" />
        <SummaryCard label="Held" value={heldCount} className="bg-amber-500" />
        <SummaryCard label="Disabled" value={disabledCount} className="bg-red-600" />
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all', label: 'All Chairs' },
              { key: 'disabled', label: 'Disabled' },
              { key: 'available', label: 'Available' },
              { key: 'sold', label: 'Sold / Held' },
            ].map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => onFilter(item.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  filter === item.key
                    ? 'bg-brand-blue text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <Legend color="bg-green-600" label="Available" />
            <Legend color="bg-red-600" label="Disabled" />
            <Legend color="bg-amber-500" label="Held" />
            <Legend color="bg-gray-600" label="Sold" />
          </div>
        </div>
      </div>

      <div className="bg-slate-950 rounded-xl shadow-sm border border-slate-800 p-4 overflow-x-auto">
        <div className="min-w-[1120px]">
          {selectedSession && (
            <div className="text-center mb-3">
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                {selectedSession.date} @ {selectedSession.time}
                {selectedSession.event_title ? ` - ${selectedSession.event_title}` : ''}
              </span>
            </div>
          )}

          <AdminFloorPlan
            tableMap={tableMap}
            filter={filter}
            onToggleChair={onToggleChair}
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Click a green, amber, or red chair to toggle disabled status. Sold chairs are locked and cannot be changed here.
      </p>
    </>
  );
}

function SummaryCard({ label, value, className }) {
  return (
    <div className={`${className} rounded-xl p-4 shadow-sm text-white`}>
      <p className="text-sm opacity-80">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded ${color}`} />
      {label}
    </span>
  );
}

function AdminFloorPlan({ tableMap, filter, onToggleChair }) {
  return (
    <div className="seat-map-container">
      <div className="floorplan-room">
        <div className="floorplan-interior">
          <div className="floorplan-grid floorplan-grid-upper">
            <div className="floorplan-stage-cell" style={{ gridColumn: '7 / span 3', gridRow: 1 }}>
              <span className="text-white/40 font-bold text-base tracking-wide">Stage</span>
            </div>

            {sectionsById['upper-left'].seats.flatMap((row, rowIndex) =>
              row.map((num, colIndex) => num === null ? null : (
                <AdminTableCell
                  key={`ul-${num}`}
                  tableNum={num}
                  gridColumn={colIndex + 1}
                  gridRow={rowIndex + 1}
                  tableMap={tableMap}
                  filter={filter}
                  onToggleChair={onToggleChair}
                />
              ))
            )}

            <AdminTableCell tableNum={41} gridColumn={7} gridRow={2} tableMap={tableMap} filter={filter} onToggleChair={onToggleChair} />
            <AdminTableCell tableNum={47} gridColumn={9} gridRow={2} tableMap={tableMap} filter={filter} onToggleChair={onToggleChair} />
            <AdminTableCell tableNum={46} gridColumn={9} gridRow={3} tableMap={tableMap} filter={filter} onToggleChair={onToggleChair} />

            {sectionsById['upper-right'].seats.flatMap((row, rowIndex) =>
              row.map((num, colIndex) => (
                <AdminTableCell
                  key={`ur-${num}`}
                  tableNum={num}
                  gridColumn={colIndex + 10}
                  gridRow={rowIndex + 1}
                  tableMap={tableMap}
                  filter={filter}
                  onToggleChair={onToggleChair}
                />
              ))
            )}
          </div>

          <div className="floorplan-grid floorplan-grid-lower">
            <div
              className="floorplan-caller-marker"
              style={{ gridColumn: 8, gridRow: 2, justifySelf: 'center', alignSelf: 'center', marginTop: '-80px' }}
            />

            {sectionsById['lower-left'].seats.flatMap((row, rowIndex) =>
              row.map((num, colIndex) => (
                <AdminTableCell
                  key={`ll-${num}`}
                  tableNum={num}
                  gridColumn={colIndex + 1}
                  gridRow={rowIndex + 2}
                  marginTop="-80px"
                  tableMap={tableMap}
                  filter={filter}
                  onToggleChair={onToggleChair}
                />
              ))
            )}

            {sectionsById['lower-right'].seats.flatMap((row, rowIndex) =>
              row.map((num, colIndex) => (
                <AdminTableCell
                  key={`lr-${num}`}
                  tableNum={num}
                  gridColumn={colIndex + 9}
                  gridRow={rowIndex + 1}
                  marginTop="-40px"
                  tableMap={tableMap}
                  filter={filter}
                  onToggleChair={onToggleChair}
                />
              ))
            )}
          </div>
        </div>

        <div className="floorplan-back-wall">
          <div className="floorplan-wall-segment" />
          <div className="floorplan-entrance-gap">
            <div className="floorplan-door-swing floorplan-door-left" />
            <span className="floorplan-entrance-label">Entrance</span>
            <div className="floorplan-door-swing floorplan-door-right" />
          </div>
          <div className="floorplan-wall-segment" />
        </div>

        <div className="text-center mt-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/25">Back of Room</span>
        </div>
      </div>
    </div>
  );
}

function AdminTableCell({ tableNum, gridColumn, gridRow, marginTop, tableMap, filter, onToggleChair }) {
  const chairs = (tableMap[tableNum] || []).slice().sort((a, b) => a.chair_number - b.chair_number);
  const matchesFilter = tableMatchesFilter(chairs, filter);

  return (
    <div
      className={matchesFilter ? '' : 'opacity-25 grayscale'}
      style={{ gridColumn, gridRow, ...(marginTop ? { marginTop } : {}) }}
    >
      <AdminTableUnit tableNum={tableNum} chairs={chairs} onToggleChair={onToggleChair} />
    </div>
  );
}

function AdminTableUnit({ tableNum, chairs, onToggleChair }) {
  const chairMap = {};
  for (const chair of chairs) chairMap[chair.chair_number] = chair;

  const disabledCount = chairs.filter(chair => chair.is_disabled).length;
  const soldCount = chairs.filter(chair => chair.status === 'sold').length;
  const heldCount = chairs.filter(chair => chair.status === 'held').length;
  const availableCount = chairs.filter(chair => chair.status === 'vacant' && !chair.is_disabled).length;

  let tableClass = 'bg-green-700/70 border-green-400/70 text-white';
  if (disabledCount > 0) tableClass = 'bg-red-700/80 border-red-300 text-white';
  else if (soldCount === chairs.length && chairs.length > 0) tableClass = 'bg-gray-700/70 border-gray-500/60 text-gray-200';
  else if (heldCount > 0 || soldCount > 0) tableClass = 'bg-amber-700/70 border-amber-400/70 text-white';

  const leftNums = [5, 3, 1];
  const rightNums = [6, 4, 2];

  return (
    <div className="relative shrink-0 floorplan-table-unit">
      <div className="floorplan-chair-col">
        {leftNums.map(num => (
          <AdminChair key={num} chair={chairMap[num]} onToggleChair={onToggleChair} />
        ))}
      </div>

      <div
        className={`table-btn border-2 ${tableClass}`}
        title={`Table ${tableNum}: ${availableCount} available, ${disabledCount} disabled, ${soldCount} sold, ${heldCount} held`}
      >
        <span className="text-sm font-bold leading-none">{tableNum}</span>
        <span className="text-[9px] leading-none opacity-80">
          {disabledCount > 0 ? `${disabledCount} off` : `${availableCount}/6`}
        </span>
      </div>

      <div className="floorplan-chair-col">
        {rightNums.map(num => (
          <AdminChair key={num} chair={chairMap[num]} onToggleChair={onToggleChair} />
        ))}
      </div>
    </div>
  );
}

function AdminChair({ chair, onToggleChair }) {
  if (!chair) {
    return <div className="chair-mini chair-mini-empty" aria-hidden="true" />;
  }

  const isDisabled = !!chair.is_disabled;
  const isSold = chair.status === 'sold';
  const isHeld = chair.status === 'held';

  let stateClass = 'bg-green-600 border-green-300 text-white hover:scale-150';
  let statusText = 'Available';
  if (isDisabled) {
    stateClass = 'bg-red-600 border-red-200 text-white ring-2 ring-red-300 hover:scale-150';
    statusText = 'Disabled';
  } else if (isSold) {
    stateClass = 'bg-gray-600 border-gray-500 text-gray-300 cursor-not-allowed opacity-70';
    statusText = chair.booked_name ? `Sold to ${chair.booked_name}` : 'Sold';
  } else if (isHeld) {
    stateClass = 'bg-amber-500 border-amber-200 text-white hover:scale-150';
    statusText = 'Held';
  }

  return (
    <button
      type="button"
      onClick={() => onToggleChair(chair)}
      disabled={isSold}
      className={`chair-mini ${stateClass}`}
      aria-label={`Table ${chair.table_number} chair ${chair.chair_number}: ${statusText}`}
      title={`Table ${chair.table_number}, Chair ${chair.chair_number}: ${statusText}${isSold ? '' : ` - click to ${isDisabled ? 'enable' : 'disable'}`}`}
    >
      {chair.chair_number}
    </button>
  );
}

function tableMatchesFilter(chairs, filter) {
  if (filter === 'all') return true;
  if (filter === 'disabled') return chairs.some(chair => chair.is_disabled);
  if (filter === 'available') return chairs.some(chair => chair.status === 'vacant' && !chair.is_disabled);
  if (filter === 'sold') return chairs.some(chair => chair.status === 'sold' || chair.status === 'held');
  return true;
}
