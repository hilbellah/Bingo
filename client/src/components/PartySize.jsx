import React from 'react';

const personIcons = {
  1: 'Just Me',
  2: 'Pair',
  3: 'Trio',
  4: 'Group of 4',
  5: 'Group of 5',
  6: 'Full Table',
};

export default function PartySize({ value, onChange }) {
  return (
    <section className="card-warm rounded-3xl p-6 md:p-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="section-badge">2</div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-brand-blue">How Many Players?</h2>
          <p className="text-gray-500 text-sm md:text-base">Select the number of people in your group</p>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-6">
        {[1, 2, 3, 4, 5, 6].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`
              flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200
              ${value === n
                ? 'bg-gradient-to-br from-brand-blue to-brand-blue-mid text-white glow-gold scale-105'
                : 'bg-white border-2 border-gray-100 hover:border-brand-gold/50 hover:shadow-lg text-brand-blue'
              }
            `}
          >
            {/* Person icons */}
            <div className="flex flex-wrap justify-center gap-0.5">
              {Array.from({ length: n }, (_, i) => (
                <svg key={i} className={`w-5 h-5 ${value === n ? 'text-brand-gold' : 'text-brand-gold/70'}`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              ))}
            </div>
            <span className="text-2xl font-bold">{n}</span>
            <span className={`text-xs font-medium ${value === n ? 'text-blue-200' : 'text-gray-400'}`}>
              {personIcons[n]}
            </span>
          </button>
        ))}
      </div>

      {value > 0 && (
        <div className="mt-4 bg-brand-gold/10 border border-brand-gold/20 rounded-xl px-5 py-3 text-center">
          <p className="text-base font-medium text-brand-blue">
            Booking for <strong className="text-brand-gold text-lg">{value}</strong> {value === 1 ? 'player' : 'players'}
          </p>
        </div>
      )}
    </section>
  );
}
