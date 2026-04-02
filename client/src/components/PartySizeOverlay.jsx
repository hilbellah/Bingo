import React from 'react';

export default function PartySizeOverlay({ value, onChange, selectedCount, selectedSeats, seats, onConfirm, onClose, onAddMore }) {
  // Build seat info for display
  const seatDetails = (selectedSeats || []).map(seatId => {
    const seat = (seats || []).find(s => s.id === seatId);
    return seat ? { table: seat.table_number, chair: seat.chair_number } : { table: '?', chair: '?' };
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-auto max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white/10 border border-white/20 rounded-2xl p-5 relative">
          <button onClick={onClose}
            className="absolute top-3 right-3 text-white/40 hover:text-white/80 text-xl leading-none"
            aria-label="Close">&times;</button>

          <div className="text-center mb-4">
            <span className="text-brand-gold font-bold text-lg">Your Party</span>
            <p className="text-white/50 text-xs mt-0.5">
              {selectedCount} seat{selectedCount !== 1 ? 's' : ''} selected
            </p>
          </div>

          {/* Selected seats list */}
          {seatDetails.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {seatDetails.map((info, i) => (
                <div key={i} className="flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 rounded-lg px-3 py-2">
                  <span className="w-6 h-6 rounded-full bg-blue-500/70 text-white flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                  <span className="text-white text-sm font-medium">Player {i + 1}</span>
                  <span className="ml-auto text-xs bg-blue-400/30 text-blue-200 px-2 py-0.5 rounded-full font-medium">
                    Table {info.table} — Chair {info.chair}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Total party summary */}
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              {Array.from({ length: selectedCount }, (_, i) => (
                <svg key={i} className="w-4 h-4 text-brand-gold" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              ))}
            </div>
            <span className="text-white font-bold text-lg">{selectedCount} {selectedCount === 1 ? 'Person' : 'People'}</span>
          </div>

          {/* Add more people button */}
          {selectedCount < 6 && (
            <button
              onClick={onAddMore}
              className="w-full mb-3 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 text-white py-2.5 rounded-xl font-medium text-sm transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add More People to Party
            </button>
          )}

          {/* Confirm button */}
          <button
            onClick={onConfirm}
            disabled={selectedCount === 0}
            className="w-full bg-brand-gold hover:bg-brand-gold-light text-white py-3 rounded-xl font-semibold text-base transition disabled:opacity-40 disabled:cursor-not-allowed glow-gold-sm"
          >
            Continue with {selectedCount} {selectedCount === 1 ? 'Player' : 'Players'}
          </button>
        </div>
      </div>
    </div>
  );
}
