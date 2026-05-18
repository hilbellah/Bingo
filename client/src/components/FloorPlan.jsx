import React from 'react';
import { SECTIONS } from '../seatLayout';
import { formatDateShort, formatTime } from '../utils/formatters';

const sectionsById = SECTIONS.reduce((acc, section) => {
  acc[section.id] = section;
  return acc;
}, {});

export default function FloorPlan({
  tableMap,
  getTableStatus,
  selectedSeats,
  holderId,
  openTable,
  onOpenTable,
  onChairClick,
  selectedSession
}) {
  const isSpecial = !!selectedSession?.is_special_event;
  const tableProps = {
    tableMap,
    getTableStatus,
    selectedSeats,
    holderId,
    onChairClick,
    openTable,
    onOpenTable,
    isSpecial
  };

  return (
    <div className="seat-map-container" onClick={() => onOpenTable(null)}>
      <div className="floorplan-room" onClick={e => e.stopPropagation()}>
        {selectedSession && (
          <SessionDateBanner selectedSession={selectedSession} isSpecial={isSpecial} placement="top" />
        )}

        <div className="floorplan-front-wall">
          <div className="floorplan-stage-label">
            <svg className="w-4 h-4 text-brand-gold/60 inline-block mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
            Front of Room - Stage
          </div>
        </div>

        <div className="floorplan-interior">
          <div className="floorplan-grid floorplan-grid-upper">
            <div className="floorplan-stage-cell" style={{ gridColumn: '7 / span 3', gridRow: '1 / span 2' }}>
              <span className="text-white/40 font-bold text-base tracking-wide">Stage</span>
            </div>

            {sectionsById['upper-left'].seats.flatMap((row, rowIndex) =>
              row.map((num, colIndex) => num === null ? null : (
                <TableCell key={`ul-${num}`} tableNum={num} gridColumn={colIndex + 1} gridRow={rowIndex + 1} {...tableProps} />
              ))
            )}

            <TableCell tableNum={45} gridColumn={9} gridRow={3} {...tableProps} />

            {sectionsById['upper-right'].seats.flatMap((row, rowIndex) =>
              row.map((num, colIndex) => (
                <TableCell key={`ur-${num}`} tableNum={num} gridColumn={colIndex + 10} gridRow={rowIndex + 1} {...tableProps} />
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
                <TableCell
                  key={`ll-${num}`}
                  tableNum={num}
                  gridColumn={colIndex + 1}
                  gridRow={rowIndex + 2}
                  marginTop="-80px"
                  {...tableProps}
                />
              ))
            )}

            {sectionsById['lower-right'].seats.flatMap((row, rowIndex) =>
              row.map((num, colIndex) => (
                <TableCell
                  key={`lr-${num}`}
                  tableNum={num}
                  gridColumn={colIndex + 9}
                  gridRow={rowIndex + 1}
                  marginTop="-40px"
                  {...tableProps}
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

        {selectedSession && (
          <SessionDateBanner selectedSession={selectedSession} isSpecial={isSpecial} placement="bottom" />
        )}
      </div>
    </div>
  );
}

function SessionDateBanner({ selectedSession, isSpecial, placement }) {
  const isTop = placement === 'top';

  return (
    <div className={`${isTop ? 'mx-3 mt-3 mb-2 px-4 py-3' : 'mt-4 px-4 py-2.5'} rounded-lg flex flex-wrap items-center justify-center gap-2.5 ${
      isSpecial
        ? 'bg-amber-900/30 border border-amber-600/50'
        : isTop
          ? 'bg-brand-gold/15 border border-brand-gold/45'
          : 'bg-white/5 border border-white/10'
    }`}>
      <svg className={`${isTop ? 'w-5 h-5' : 'w-4 h-4'} text-brand-gold/80 flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
      {isTop && (
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold/90">
          Bingo Game
        </span>
      )}
      <span className={`text-white font-bold ${isTop ? 'text-base sm:text-lg' : 'text-sm'}`}>
        {formatDateShort(selectedSession.date)} - {formatTime(selectedSession.time)}
      </span>
      {isSpecial && selectedSession.event_title ? (
        <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full max-w-full">
          &#9733; {selectedSession.event_title}
        </span>
      ) : (
        <span className={`${isTop ? 'text-white/60' : 'text-white/40'} text-xs font-medium`}>
          Regular Bingo Night
        </span>
      )}
    </div>
  );
}

function TableCell({ tableNum, gridColumn, gridRow, marginTop, tableMap, getTableStatus, selectedSeats, holderId, onChairClick, openTable, onOpenTable, isSpecial }) {
  return (
    <div style={{ gridColumn, gridRow, ...(marginTop ? { marginTop } : {}) }}>
      <TableButton
        tableNum={tableNum}
        status={getTableStatus(tableNum)}
        chairs={tableMap[tableNum] || []}
        selectedSeats={selectedSeats}
        holderId={holderId}
        onChairClick={onChairClick}
        isOpen={openTable === tableNum}
        onClick={onOpenTable}
        isSpecial={isSpecial}
      />
    </div>
  );
}

function InlineChair({ chair, holderId, selectedSeats, onChairClick }) {
  const isSelected = selectedSeats.includes(chair.id);
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

function TableButton({ tableNum, status, isOpen, onClick, chairs, selectedSeats, holderId, onChairClick, isSpecial }) {
  if (status === 'empty' || !status) {
    return <div className="floorplan-cell-empty shrink-0" />;
  }

  const { hasMyChairs, allSold, allVacant, vacantChairs } = status;

  let bgClass, borderClass, textClass, extraClass = '';
  if (isOpen) {
    bgClass = 'bg-brand-gold'; borderClass = 'border-brand-gold-light'; textClass = 'text-white';
  } else if (hasMyChairs) {
    bgClass = 'bg-blue-500/80'; borderClass = 'border-blue-400'; textClass = 'text-white';
  } else if (allSold) {
    bgClass = 'bg-gray-600/60'; borderClass = 'border-gray-500/50'; textClass = 'text-gray-400';
  } else if (isSpecial && allVacant) {
    bgClass = 'bg-green-600/70'; borderClass = 'border-amber-400'; textClass = 'text-white';
    extraClass = 'table-btn-special shadow-md shadow-amber-500/20';
  } else if (isSpecial) {
    bgClass = 'bg-amber-700/50'; borderClass = 'border-amber-400/70'; textClass = 'text-white';
    extraClass = 'table-btn-special shadow-sm shadow-amber-500/20';
  } else if (allVacant) {
    bgClass = 'bg-green-600/70'; borderClass = 'border-green-500/50'; textClass = 'text-white';
  } else {
    bgClass = 'bg-amber-700/50'; borderClass = 'border-amber-600/50'; textClass = 'text-white';
  }

  const chairMap = {};
  for (const chair of chairs) chairMap[chair.chair_number] = chair;
  const leftNums = [5, 3, 1];   // top → bottom on the left flank
  const rightNums = [6, 4, 2];  // top → bottom on the right flank

  const chairCommon = { selectedSeats, holderId, onChairClick };

  return (
    <div className="relative shrink-0 floorplan-table-unit">
      {/* Left chair column (5 / 3 / 1) — always visible, individually clickable */}
      <div className="floorplan-chair-col">
        {leftNums.map(num => (
          <FloorChair key={num} chair={chairMap[num]} {...chairCommon} />
        ))}
      </div>

      {/* Center table button — clicking opens the zoom chair-picker popup */}
      <button
        onClick={() => onClick && onClick(allSold ? null : (isOpen ? null : tableNum))}
        disabled={allSold}
        className={`table-btn ${bgClass} border-2 ${borderClass} ${textClass} ${extraClass} ${isOpen ? 'ring-2 ring-brand-gold/50 scale-110 z-10' : ''}`}
        aria-label={`Table ${tableNum} - ${vacantChairs} chairs available`}
        title={`Table ${tableNum} - ${vacantChairs}/6 available`}
      >
        <span className="text-sm font-bold leading-none">{tableNum}</span>
        {!allSold && !isOpen && (
          <span className="text-[9px] leading-none opacity-70">{vacantChairs}/6</span>
        )}
      </button>

      {/* Right chair column (6 / 4 / 2) — always visible, individually clickable */}
      <div className="floorplan-chair-col">
        {rightNums.map(num => (
          <FloorChair key={num} chair={chairMap[num]} {...chairCommon} />
        ))}
      </div>

      {/* Click-to-zoom popup (preserved) — bigger chairs for easier picking */}
      {isOpen && (
        <div
          className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1.5 bg-slate-800/95 border border-white/20 rounded-xl p-3 shadow-2xl backdrop-blur-sm"
          onClick={e => e.stopPropagation()}
          style={{ minWidth: '180px' }}
        >
          <div className="text-[11px] font-bold text-white/60 uppercase tracking-wider mb-2 text-center">
            Table {tableNum} - Pick chairs
          </div>
          <div className="flex items-center justify-center gap-2">
            <ChairColumn chairMap={chairMap} chairNumbers={[5, 3, 1]} selectedSeats={selectedSeats} holderId={holderId} onChairClick={onChairClick} />
            <div className="w-8 h-[130px] rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
              <span className="text-white/15 text-[8px] font-bold [writing-mode:vertical-rl]">Table {tableNum}</span>
            </div>
            <ChairColumn chairMap={chairMap} chairNumbers={[6, 4, 2]} selectedSeats={selectedSeats} holderId={holderId} onChairClick={onChairClick} />
          </div>
        </div>
      )}
    </div>
  );
}

// Tiny chair button drawn directly on the floor plan, flanking each table.
// Color-coded by status; clicking selects/unselects without opening the popup.
function FloorChair({ chair, selectedSeats, holderId, onChairClick }) {
  if (!chair) {
    // No chair record yet (e.g., table data still loading) — render a transparent
    // placeholder so the flanking column still reserves its slot.
    return <div className="chair-mini chair-mini-empty" aria-hidden="true" />;
  }

  const isSelected = selectedSeats.includes(chair.id);
  const isMyHold = chair.status === 'held' && chair.held_by === holderId;
  const isOtherHold = chair.status === 'held' && chair.held_by !== holderId;
  const isSold = chair.status === 'sold';
  const isDisabled = chair.is_disabled;

  let stateClass;
  if (isDisabled) stateClass = 'chair-mini-disabled';
  else if (isSold) stateClass = 'chair-mini-sold';
  else if (isSelected || isMyHold) stateClass = 'chair-mini-mine';
  else if (isOtherHold) stateClass = 'chair-mini-other';
  else stateClass = 'chair-mini-vacant';

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChairClick(chair); }}
      disabled={isDisabled || isSold || isOtherHold}
      className={`chair-mini ${stateClass}`}
      aria-label={`Chair ${chair.chair_number}`}
      title={`Chair ${chair.chair_number}`}
    >
      {chair.chair_number}
    </button>
  );
}

function ChairColumn({ chairMap, chairNumbers, selectedSeats, holderId, onChairClick }) {
  return (
    <div className="flex flex-col gap-1.5">
      {chairNumbers.map(num => chairMap[num] ? (
        <InlineChair
          key={num}
          chair={chairMap[num]}
          selectedSeats={selectedSeats}
          holderId={holderId}
          onChairClick={onChairClick}
        />
      ) : (
        <div key={num} className="w-10 h-10" />
      ))}
    </div>
  );
}
