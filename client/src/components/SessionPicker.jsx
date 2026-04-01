import React from 'react';

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
  };
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function SessionPicker({ sessions, selected, onSelect }) {
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-6">
          {sessions.map(session => {
            const d = formatDate(session.date);
            const isSelected = selected?.id === session.id;
            return (
              <button
                key={session.id}
                onClick={() => onSelect(session)}
                className={`
                  relative p-5 rounded-2xl text-left transition-all duration-200
                  ${isSelected
                    ? 'bg-gradient-to-br from-brand-blue to-brand-blue-mid text-white glow-gold scale-[1.03]'
                    : 'bg-white hover:bg-brand-cream border-2 border-gray-100 hover:border-brand-gold/50 hover:shadow-lg'
                  }
                `}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <svg className="w-6 h-6 text-brand-gold" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}

                <div className={`text-xs font-bold uppercase tracking-widest ${isSelected ? 'text-brand-gold' : 'text-brand-gold'}`}>
                  {d.dayShort}
                </div>
                <div className={`text-3xl font-bold mt-1 ${isSelected ? 'text-white' : 'text-brand-blue'}`}>
                  {d.monthShort} {d.date}
                </div>
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
      )}
    </section>
  );
}
