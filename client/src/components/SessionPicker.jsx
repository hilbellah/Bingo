import React, { useState } from 'react';

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return {
    dayShort: days[d.getDay()].substring(0, 3).toUpperCase(),
    dayFull: days[d.getDay()],
    month: months[d.getMonth()],
    monthShort: months[d.getMonth()].substring(0, 3),
    date: d.getDate(),
    monthIndex: d.getMonth(),
    year: d.getFullYear(),
  };
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getMonthKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key) {
  const [year, month] = key.split('-');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

export default function SessionPicker({ sessions, selected, onSelect }) {
  const [activeMonth, setActiveMonth] = useState(null);

  // Group sessions by month
  const monthGroups = {};
  sessions.forEach(s => {
    const key = getMonthKey(s.date);
    if (!monthGroups[key]) monthGroups[key] = [];
    monthGroups[key].push(s);
  });
  const monthKeys = Object.keys(monthGroups).sort();

  // Default to first month
  const currentMonth = activeMonth && monthKeys.includes(activeMonth) ? activeMonth : monthKeys[0];
  const visibleSessions = currentMonth ? monthGroups[currentMonth] : [];

  return (
    <section className="card-warm rounded-3xl p-6 md:p-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="section-badge">1</div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-brand-blue">Choose Your Bingo Night</h2>
          <p className="text-gray-500 text-sm md:text-base">Pick a date that works for you</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-pulse text-lg">Loading available sessions...</div>
        </div>
      ) : (
        <>
          {/* Month tabs */}
          {monthKeys.length > 1 && (
            <div className="flex items-center gap-2 mt-4 mb-2 overflow-x-auto pb-1">
              {monthKeys.map(key => (
                <button
                  key={key}
                  onClick={() => setActiveMonth(key)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    key === currentMonth
                      ? 'bg-brand-blue text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {getMonthLabel(key)}
                  <span className={`ml-1.5 text-xs ${key === currentMonth ? 'text-blue-200' : 'text-gray-400'}`}>
                    ({monthGroups[key].length})
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
            {visibleSessions.map(session => {
              const d = formatDate(session.date);
              const isSelected = selected?.id === session.id;
              const isSpecial = session.is_special_event;
              return (
                <button
                  key={session.id}
                  onClick={() => onSelect(session)}
                  className={`
                    relative p-5 rounded-2xl text-left transition-all duration-200
                    ${isSelected
                      ? isSpecial
                        ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-200 scale-[1.03]'
                        : 'bg-gradient-to-br from-brand-blue to-brand-blue-mid text-white glow-gold scale-[1.03]'
                      : isSpecial
                        ? 'bg-amber-50 hover:bg-amber-100 border-2 border-amber-300 hover:border-amber-400 hover:shadow-lg'
                        : 'bg-white hover:bg-brand-cream border-2 border-gray-100 hover:border-brand-gold/50 hover:shadow-lg'
                    }
                  `}
                >
                  {isSpecial && !isSelected && (
                    <div className="absolute top-2 right-2">
                      <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        Special
                      </span>
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute top-3 right-3">
                      <svg className="w-6 h-6 text-brand-gold" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}

                  <div className={`text-xs font-bold uppercase tracking-widest ${isSelected ? 'text-brand-gold' : isSpecial ? 'text-amber-600' : 'text-brand-gold'}`}>
                    {d.dayShort}
                  </div>
                  <div className={`text-3xl font-bold mt-1 ${isSelected ? 'text-white' : isSpecial ? 'text-amber-700' : 'text-brand-blue'}`}>
                    {d.monthShort} {d.date}, {d.year}
                  </div>
                  {isSpecial && session.event_title && (
                    <div className={`text-xs font-bold mt-1 truncate ${isSelected ? 'text-amber-100' : 'text-amber-600'}`}>
                      {session.event_title}
                    </div>
                  )}
                  <div className={`text-base font-medium mt-1 ${isSelected ? 'text-blue-200' : 'text-gray-500'}`}>
                    {formatTime(session.time)}
                  </div>
                  <div className={`mt-3 text-sm font-semibold flex items-center gap-1 ${
                    isSelected ? 'text-green-300' :
                    session.available_seats > 30 ? 'text-green-600' :
                    session.available_seats > 10 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      session.available_seats > 30 ? 'bg-green-500' :
                      session.available_seats > 10 ? 'bg-amber-500' : 'bg-red-500'
                    }`}></span>
                    {session.available_seats} seats open
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
