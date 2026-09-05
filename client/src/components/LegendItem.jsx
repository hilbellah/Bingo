// Colour swatch + label for the floor-plan legend.
// Moved verbatim out of client/src/App.jsx on 2026-09-05 (Phase 3, step 5a).
import React from 'react';

export default function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-4 h-4 rounded ${color}`} />
      <span className="text-white/70">{label}</span>
    </div>
  );
}
