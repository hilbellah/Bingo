import React from 'react';
import { SECTIONS } from '../seatLayout';

// Chair Management floor plan: session picker, workspace, summary cards,
// legend, tables and chairs. Presentational; all actions come in as props
// from ChairManagementTab. Moved verbatim from that file.
const sectionsById = SECTIONS.reduce((acc, section) => {
  acc[section.id] = section;
  return acc;
}, {});

const SECTION_LABELS = {
  'upper-left': 'Front Left',
  'upper-right': 'Front Right',
  'stage-bridge': 'Stage Bridge',
  'lower-left': 'Back Left',
  'lower-right': 'Back Right',
};

const sectionTableNumbers = SECTIONS.map(section => ({
  id: section.id,
  label: SECTION_LABELS[section.id] || section.id,
  tableNumbers: section.seats.flat().filter(num => num !== null),
}));

export function SpecialBingoChairPicker({ sessions, selectedSession, onSelectSession }) {
  return (
    <section className="mb-3 border-b border-white/10 pb-3" aria-label="Special bingo chair management sessions">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-brand-gold">Special Bingo</h4>
        <span className="text-xs text-white/45">{sessions.length} event{sessions.length === 1 ? '' : 's'}</span>
      </div>
      <div className="rail-scroll flex items-start gap-2 overflow-x-auto">
        {sessions.map(session => {
          const isSelected = selectedSession?.id === session.id;
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelectSession(session)}
              className={`min-w-[190px] rounded-lg px-3 py-2 text-left text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-amber-900 text-amber-100 shadow-md ring-2 ring-amber-700'
                  : 'bg-amber-900/30 text-amber-300 hover:bg-amber-900/40 ring-1 ring-amber-700/50'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200/80">Special Bingo</div>
              <div className="font-bold">{session.date} @ {session.time}</div>
              {session.event_title && (
                <div className="truncate text-xs font-semibold text-amber-100/90">{session.event_title}</div>
              )}
              <div className="mt-1 text-xs text-white/60">{session.available_seats ?? 0} chairs</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ChairManagementWorkspace({
  seats,
  filter,
  onFilter,
  onToggleChair,
  onMoveSoldChair,
  onToggleTable,
  bulkSelectMode,
  selectedSeatIds,
  selectedSeatCount,
  onBulkSelectModeChange,
  onToggleSeatSelection,
  onToggleTableSelection,
  onToggleSectionSelection,
  onApplyBulkSelection,
  onClearBulkSelection,
  selectedSession,
}) {
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

      <div className={`rounded-xl shadow-sm p-4 mb-4 border ${
        bulkSelectMode ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-brand-blue">Bulk Chair Selection</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              {bulkSelectMode
                ? 'Click chairs, tables, or sections to build one selection.'
                : 'Turn this on to select many chairs and confirm once.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onBulkSelectModeChange(!bulkSelectMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                bulkSelectMode
                  ? 'bg-brand-blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {bulkSelectMode ? 'Selection ON' : 'Bulk Select'}
            </button>
            <span className="text-xs font-medium text-gray-500">{selectedSeatCount} selected</span>
            <button
              type="button"
              onClick={() => onApplyBulkSelection(true)}
              disabled={!bulkSelectMode || selectedSeatCount === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Disable Selected
            </button>
            <button
              type="button"
              onClick={() => onApplyBulkSelection(false)}
              disabled={!bulkSelectMode || selectedSeatCount === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Enable Selected
            </button>
            <button
              type="button"
              onClick={onClearBulkSelection}
              disabled={!bulkSelectMode || selectedSeatCount === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>
        </div>

        {bulkSelectMode && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sectionTableNumbers.map(section => {
              const sectionSelectableIds = seats
                .filter(seat => section.tableNumbers.includes(seat.table_number) && seat.status !== 'sold')
                .map(seat => seat.id);
              const selectedInSection = sectionSelectableIds.filter(id => selectedSeatIds.has(id)).length;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onToggleSectionSelection(section.tableNumbers)}
                  disabled={sectionSelectableIds.length === 0}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    selectedInSection > 0
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-200'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {section.label}
                  {selectedInSection > 0 ? ` (${selectedInSection})` : ''}
                </button>
              );
            })}
          </div>
        )}
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
            onMoveSoldChair={onMoveSoldChair}
            onToggleTable={onToggleTable}
            bulkSelectMode={bulkSelectMode}
            selectedSeatIds={selectedSeatIds}
            onToggleSeatSelection={onToggleSeatSelection}
            onToggleTableSelection={onToggleTableSelection}
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {bulkSelectMode
          ? 'Bulk selection is active. Click chairs, table numbers, or section buttons to highlight chairs, then use Disable Selected or Enable Selected.'
          : 'Click a chair to toggle one seat, or click the table number to toggle every non-sold seat at that table. Sold chairs are locked and cannot be changed here.'}
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

function AdminFloorPlan({
  tableMap,
  filter,
  onToggleChair,
  onMoveSoldChair,
  onToggleTable,
  bulkSelectMode,
  selectedSeatIds,
  onToggleSeatSelection,
  onToggleTableSelection,
}) {
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
                  onMoveSoldChair={onMoveSoldChair}
                  onToggleTable={onToggleTable}
                  bulkSelectMode={bulkSelectMode}
                  selectedSeatIds={selectedSeatIds}
                  onToggleSeatSelection={onToggleSeatSelection}
                  onToggleTableSelection={onToggleTableSelection}
                />
              ))
            )}

            <AdminTableCell tableNum={41} gridColumn={7} gridRow={2} tableMap={tableMap} filter={filter} onToggleChair={onToggleChair} onMoveSoldChair={onMoveSoldChair} onToggleTable={onToggleTable} bulkSelectMode={bulkSelectMode} selectedSeatIds={selectedSeatIds} onToggleSeatSelection={onToggleSeatSelection} onToggleTableSelection={onToggleTableSelection} />
            <AdminTableCell tableNum={47} gridColumn={9} gridRow={2} tableMap={tableMap} filter={filter} onToggleChair={onToggleChair} onMoveSoldChair={onMoveSoldChair} onToggleTable={onToggleTable} bulkSelectMode={bulkSelectMode} selectedSeatIds={selectedSeatIds} onToggleSeatSelection={onToggleSeatSelection} onToggleTableSelection={onToggleTableSelection} />
            <AdminTableCell tableNum={46} gridColumn={9} gridRow={3} tableMap={tableMap} filter={filter} onToggleChair={onToggleChair} onMoveSoldChair={onMoveSoldChair} onToggleTable={onToggleTable} bulkSelectMode={bulkSelectMode} selectedSeatIds={selectedSeatIds} onToggleSeatSelection={onToggleSeatSelection} onToggleTableSelection={onToggleTableSelection} />

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
                  onMoveSoldChair={onMoveSoldChair}
                  onToggleTable={onToggleTable}
                  bulkSelectMode={bulkSelectMode}
                  selectedSeatIds={selectedSeatIds}
                  onToggleSeatSelection={onToggleSeatSelection}
                  onToggleTableSelection={onToggleTableSelection}
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
                  onMoveSoldChair={onMoveSoldChair}
                  onToggleTable={onToggleTable}
                  bulkSelectMode={bulkSelectMode}
                  selectedSeatIds={selectedSeatIds}
                  onToggleSeatSelection={onToggleSeatSelection}
                  onToggleTableSelection={onToggleTableSelection}
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
                  onMoveSoldChair={onMoveSoldChair}
                  onToggleTable={onToggleTable}
                  bulkSelectMode={bulkSelectMode}
                  selectedSeatIds={selectedSeatIds}
                  onToggleSeatSelection={onToggleSeatSelection}
                  onToggleTableSelection={onToggleTableSelection}
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

function AdminTableCell({
  tableNum,
  gridColumn,
  gridRow,
  marginTop,
  tableMap,
  filter,
  onToggleChair,
  onMoveSoldChair,
  onToggleTable,
  bulkSelectMode,
  selectedSeatIds,
  onToggleSeatSelection,
  onToggleTableSelection,
}) {
  const chairs = (tableMap[tableNum] || []).slice().sort((a, b) => a.chair_number - b.chair_number);
  const matchesFilter = tableMatchesFilter(chairs, filter);

  return (
    <div
      className={matchesFilter ? '' : 'opacity-25 grayscale'}
      style={{ gridColumn, gridRow, ...(marginTop ? { marginTop } : {}) }}
    >
      <AdminTableUnit
        tableNum={tableNum}
        chairs={chairs}
        onToggleChair={onToggleChair}
        onMoveSoldChair={onMoveSoldChair}
        onToggleTable={onToggleTable}
        bulkSelectMode={bulkSelectMode}
        selectedSeatIds={selectedSeatIds}
        onToggleSeatSelection={onToggleSeatSelection}
        onToggleTableSelection={onToggleTableSelection}
      />
    </div>
  );
}

function AdminTableUnit({
  tableNum,
  chairs,
  onToggleChair,
  onMoveSoldChair,
  onToggleTable,
  bulkSelectMode,
  selectedSeatIds,
  onToggleSeatSelection,
  onToggleTableSelection,
}) {
  const chairMap = {};
  for (const chair of chairs) chairMap[chair.chair_number] = chair;

  const disabledCount = chairs.filter(chair => chair.is_disabled).length;
  const soldCount = chairs.filter(chair => chair.status === 'sold').length;
  const heldCount = chairs.filter(chair => chair.status === 'held').length;
  const availableCount = chairs.filter(chair => chair.status === 'vacant' && !chair.is_disabled).length;
  const selectableCount = chairs.filter(chair => chair.status !== 'sold').length;
  const selectedCount = chairs.filter(chair => selectedSeatIds?.has(chair.id)).length;

  let tableClass = 'bg-green-700/70 border-green-400/70 text-white';
  if (disabledCount > 0) tableClass = 'bg-red-700/80 border-red-300 text-white';
  else if (soldCount === chairs.length && chairs.length > 0) tableClass = 'bg-gray-700/70 border-gray-500/60 text-gray-200';
  else if (heldCount > 0 || soldCount > 0) tableClass = 'bg-amber-700/70 border-amber-400/70 text-white';
  if (bulkSelectMode && selectedCount > 0) tableClass += ' ring-2 ring-blue-300 shadow-lg shadow-blue-500/30';

  const leftNums = [5, 3, 1];
  const rightNums = [6, 4, 2];

  return (
    <div className="relative shrink-0 floorplan-table-unit">
      <div className="floorplan-chair-col">
        {leftNums.map(num => (
          <AdminChair
            key={num}
            chair={chairMap[num]}
            onToggleChair={onToggleChair}
            onMoveSoldChair={onMoveSoldChair}
            bulkSelectMode={bulkSelectMode}
            selected={!!chairMap[num] && selectedSeatIds?.has(chairMap[num].id)}
            onToggleSeatSelection={onToggleSeatSelection}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => bulkSelectMode ? onToggleTableSelection(tableNum, chairs) : onToggleTable(tableNum, chairs)}
        disabled={chairs.length === 0 || soldCount === chairs.length}
        className={`table-btn border-2 ${tableClass}`}
        title={bulkSelectMode
          ? `Table ${tableNum}: ${selectedCount}/${selectableCount} selected - click to toggle table selection`
          : `Table ${tableNum}: ${availableCount} available, ${disabledCount} disabled, ${soldCount} sold, ${heldCount} held - click to ${availableCount > 0 || heldCount > 0 ? 'disable' : 'enable'} all non-sold seats`}
        aria-label={bulkSelectMode
          ? `Table ${tableNum}: ${selectedCount} of ${selectableCount} selectable chairs selected. Click to toggle table selection.`
          : `Table ${tableNum}: ${availableCount} available, ${disabledCount} disabled, ${soldCount} sold, ${heldCount} held. Click to ${availableCount > 0 || heldCount > 0 ? 'disable' : 'enable'} all non-sold seats.`}
      >
        <span className="text-sm font-bold leading-none">{tableNum}</span>
        <span className="text-[9px] leading-none opacity-80">
          {bulkSelectMode && selectedCount > 0 ? `${selectedCount} sel` : disabledCount > 0 ? `${disabledCount} off` : `${availableCount}/6`}
        </span>
      </button>

      <div className="floorplan-chair-col">
        {rightNums.map(num => (
          <AdminChair
            key={num}
            chair={chairMap[num]}
            onToggleChair={onToggleChair}
            onMoveSoldChair={onMoveSoldChair}
            bulkSelectMode={bulkSelectMode}
            selected={!!chairMap[num] && selectedSeatIds?.has(chairMap[num].id)}
            onToggleSeatSelection={onToggleSeatSelection}
          />
        ))}
      </div>
    </div>
  );
}

function AdminChair({ chair, onToggleChair, onMoveSoldChair, bulkSelectMode, selected, onToggleSeatSelection }) {
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
    stateClass = 'bg-gray-600 border-gray-500 text-gray-100 hover:scale-150';
    const sourceLabel = chair.booking_source === 'promo'
      ? 'Promo'
      : chair.booking_source === 'donation'
        ? 'Donation'
        : 'Sold';
    statusText = chair.booked_name ? `${sourceLabel} to ${chair.booked_name}` : sourceLabel;
  } else if (isHeld) {
    stateClass = 'bg-amber-500 border-amber-200 text-white hover:scale-150';
    statusText = 'Held';
  }
  if (bulkSelectMode && selected) {
    stateClass += ' ring-2 ring-blue-200 outline outline-2 outline-white scale-125';
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (bulkSelectMode) return onToggleSeatSelection(chair);
        if (isSold) return onMoveSoldChair(chair);
        return onToggleChair(chair);
      }}
      className={`chair-mini ${stateClass}`}
      aria-label={`Table ${chair.table_number} chair ${chair.chair_number}: ${statusText}`}
      title={bulkSelectMode
        ? `Table ${chair.table_number}, Chair ${chair.chair_number}: ${statusText}${isSold ? '' : selected ? ' - selected' : ' - click to select'}`
        : `Table ${chair.table_number}, Chair ${chair.chair_number}: ${statusText}${isSold ? ' - click to move this booking' : ` - click to ${isDisabled ? 'enable' : 'disable'}`}`}
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
