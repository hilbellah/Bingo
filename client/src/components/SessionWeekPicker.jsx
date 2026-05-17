import React from 'react';
import { formatDateShort, formatTime, formatWeekRange, getWeekStart } from '../utils/formatters';

export default function SessionWeekPicker({
  sessions,
  selectedSession,
  weekOffset,
  onWeekOffsetChange,
  onSelectSession
}) {
  const weeks = sessions.reduce((groups, session) => {
    const week = getWeekStart(session.date);
    groups[week] = groups[week] || [];
    groups[week].push(session);
    return groups;
  }, {});

  const weekKeys = Object.keys(weeks).sort();
  const clampedOffset = Math.max(0, Math.min(weekOffset, weekKeys.length - 1));
  const currentWeekKey = weekKeys[clampedOffset];
  const visibleSessions = currentWeekKey ? weeks[currentWeekKey] : [];
  const weekLabel = formatWeekRange(currentWeekKey);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onWeekOffsetChange(Math.max(0, weekOffset - 1))}
        disabled={clampedOffset === 0}
        className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Previous week"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <span className="text-white/60 text-xs font-semibold uppercase tracking-wider flex-shrink-0 min-w-[120px] text-center">
        {weekLabel}
      </span>

      <button
        onClick={() => onWeekOffsetChange(Math.min(weekKeys.length - 1, weekOffset + 1))}
        disabled={clampedOffset >= weekKeys.length - 1}
        className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next week"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 ml-2">
        {visibleSessions.map(session => {
          const isSelected = selectedSession?.id === session.id;
          const sessionType = session.session_type || (session.is_special_event ? 'special_bingo' : 'regular_bingo');
          const isEvent = sessionType === 'event';
          const isSpecial = sessionType === 'special_bingo' || isEvent;
          const label = isEvent ? 'Event' : 'Special Bingo';

          return (
            <div key={session.id} className="flex-shrink-0 flex flex-col items-center">
              {isSpecial && (
                <div className="bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-t-lg w-full text-center">
                  &#9733; {label}
                </div>
              )}
              <button
                onClick={() => onSelectSession(session)}
                className={`w-full px-3 py-1.5 text-sm font-medium transition-all ${
                  isSpecial ? 'rounded-b-lg' : 'rounded-lg'
                } ${
                  isSelected
                    ? isSpecial ? 'bg-amber-900 text-amber-100 shadow-md ring-2 ring-amber-700' : 'bg-brand-gold text-white shadow-md'
                    : isSpecial ? 'bg-amber-900/30 text-amber-300 hover:bg-amber-900/40 ring-1 ring-amber-700/50' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                {formatDateShort(session.date)} - {formatTime(session.time)}
                {isSpecial && session.event_title && (
                  <div className={`text-xs font-semibold ${isSelected ? 'text-amber-100' : 'text-amber-300'}`}>
                    {session.event_title}
                  </div>
                )}
                <span className={`ml-1.5 text-xs ${
                  isSelected ? 'text-white/80' : session.available_seats > 100 ? 'text-green-400' : session.available_seats > 30 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  ({session.available_seats})
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
