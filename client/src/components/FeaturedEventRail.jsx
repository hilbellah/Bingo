// The "Featured events" strip above the weekly schedule.
// Moved verbatim out of client/src/App.jsx on 2026-09-05 (Phase 3, step 5a).
import React from 'react';
import { formatDateShort, formatTime } from '../utils/formatters';
import { getSessionType } from '../bookingHelpers';

export default function FeaturedEventRail({ events, selectedSession, onSelectSession }) {
  if (events.length === 0) return null;

  return (
    <section className="mb-3 border-b border-white/10 pb-3" aria-label="Upcoming special bingo and live events">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand-gold">Featured Events</h2>
        <span className="text-xs text-white/40">{events.length} active</span>
      </div>

      <div className="rail-scroll flex items-start gap-2 overflow-x-auto">
        {events.map(event => {
          const sessionType = getSessionType(event);
          const isLiveEvent = sessionType === 'event';
          const isSelected = selectedSession?.id === event.id;
          const isClosed = !!event.booking_closed;
          const label = isLiveEvent ? 'Live Event / Venue' : 'Special Bingo';
          const actionLabel = isLiveEvent ? 'Buy Tickets' : 'Book Seats';
          const theme = isLiveEvent
            ? {
                badge: 'bg-sky-500 text-white',
                selectedButton: 'bg-sky-950 text-sky-50 shadow-md ring-2 ring-sky-500',
                button: 'bg-sky-950/35 text-sky-200 hover:bg-sky-950/50 ring-1 ring-sky-500/60',
                titleSelected: 'text-sky-50',
                title: 'text-sky-200',
              }
            : {
                badge: 'bg-amber-500 text-white',
                selectedButton: 'bg-amber-900 text-amber-100 shadow-md ring-2 ring-amber-700',
                button: 'bg-amber-900/30 text-amber-300 hover:bg-amber-900/40 ring-1 ring-amber-700/50',
                titleSelected: 'text-amber-100',
                title: 'text-amber-300',
              };
          return (
            <div key={event.id} className="flex-shrink-0 flex min-w-[190px] max-w-[260px] flex-col items-center">
              <div className={`${isClosed ? 'bg-red-500/20 text-red-100' : theme.badge} text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-t-lg w-full text-center`}>
                &#9733; {isClosed ? 'Closed' : label}
              </div>
              <button
                type="button"
                onClick={() => onSelectSession(event)}
                className={`w-full rounded-b-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  isClosed
                    ? 'bg-red-950/50 text-red-100 ring-1 ring-red-500/50'
                    : isSelected
                      ? theme.selectedButton
                      : theme.button
                }`}
                title={isClosed ? event.booking_closed_message : undefined}
              >
                {formatDateShort(event.date)} - {formatTime(event.time)}
                <div className={`truncate text-xs font-semibold ${isSelected ? theme.titleSelected : theme.title}`}>
                  {event.event_title || actionLabel}
                </div>
                {isClosed && (
                  <div className="text-[10px] font-bold uppercase tracking-wide text-red-200">
                    {event.booking_closed_reason === 'ongoing' ? 'On-going' : 'Closed'}
                  </div>
                )}
                <span className={`ml-1.5 text-xs ${
                  isClosed ? 'text-red-200' : isSelected ? 'text-white/80' : Number(event.available_seats) > 100 ? 'text-green-400' : Number(event.available_seats) > 30 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  ({event.available_seats})
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
