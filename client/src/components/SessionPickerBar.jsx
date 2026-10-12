import React from 'react';
import FeaturedEventRail from './FeaturedEventRail';
import SessionWeekPicker from './SessionWeekPicker';

// Featured events rail plus the weekly bingo schedule picker, shown under the
// header on the customer page. Moved verbatim from App.jsx.
export default function SessionPickerBar({ featuredEventSessions, selectedSession, handleSelectSession, isSelectedEvent, bingoSessions, weekOffset, setWeekOffset }) {
  return (
    <>
      {/* Session week picker bar — sits between the header and the FloorPlan.
          Colored to blend with the dark casino body background so the FloorPlan
          itself remains the focal point. */}
      <div className="bg-casino-dark-soft border-b border-white/10 px-4 py-2 flex-shrink-0">
        <FeaturedEventRail
          events={featuredEventSessions}
          selectedSession={selectedSession}
          onSelectSession={handleSelectSession}
        />
        {!isSelectedEvent && (
          <section aria-label="Weekly bingo schedule">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white/65">Weekly Bingo Schedule</h2>
              <span className="text-xs text-white/40">{bingoSessions.length} available</span>
            </div>
            <SessionWeekPicker
              sessions={bingoSessions}
              selectedSession={selectedSession}
              weekOffset={weekOffset}
              onWeekOffsetChange={setWeekOffset}
              onSelectSession={handleSelectSession}
            />
          </section>
        )}
      </div>
    </>
  );
}
