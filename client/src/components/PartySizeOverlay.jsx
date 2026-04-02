import React from 'react';

export default function PartySizeOverlay({ value, onChange, selectedCount, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-auto max-w-xs" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white/10 border border-white/20 rounded-2xl p-5 relative">
          <button onClick={onClose}
            className="absolute top-3 right-3 text-white/40 hover:text-white/80 text-xl leading-none"
            aria-label="Close">&times;</button>

          <div className="text-center mb-4">
            <span className="text-brand-gold font-bold text-lg">How Many Players?</span>
            <p className="text-white/50 text-xs mt-0.5">
              {selectedCount} chair{selectedCount !== 1 ? 's' : ''} selected — adjust if needed
            </p>
          </div>

          {/* Square grid of party size buttons */}
          <div className="grid grid-cols-3 gap-2 justify-items-center">
            {[1, 2, 3, 4, 5, 6].map(n => {
              const isSelected = value === n;
              let bgClass, borderClass, textClass;
              if (isSelected) {
                bgClass = 'bg-blue-500/70';
                borderClass = 'border-blue-400';
                textClass = 'text-white';
              } else {
                bgClass = 'bg-green-600/60 hover:bg-green-500/60';
                borderClass = 'border-green-500/50 hover:border-green-400/60';
                textClass = 'text-white';
              }

              return (
                <button
                  key={n}
                  onClick={() => onChange(n)}
                  className={`${bgClass} border-2 ${borderClass} ${textClass} rounded-xl w-16 h-16 flex flex-col items-center justify-center shrink-0 transition-all hover:scale-110`}
                >
                  {/* Person icons */}
                  <div className="flex flex-wrap justify-center gap-0.5 mb-0.5">
                    {Array.from({ length: n }, (_, i) => (
                      <svg key={i} className={`w-3 h-3 ${isSelected ? 'text-brand-gold' : 'text-brand-gold/70'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-sm font-bold leading-none">{n}</span>
                </button>
              );
            })}
          </div>

          {/* Confirm button */}
          <button
            onClick={onConfirm}
            disabled={value === 0}
            className="w-full mt-4 bg-brand-gold hover:bg-brand-gold-light text-white py-3 rounded-xl font-semibold text-base transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue with {value} {value === 1 ? 'Player' : 'Players'}
          </button>

          <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-white/40">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500/70 inline-block"></span> Selected</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-600/60 inline-block"></span> Available</span>
          </div>
        </div>
      </div>
    </div>
  );
}
