import React, { useEffect, useState } from 'react';

export default function CountdownTimer({ expiry }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!expiry) return;
    const update = () => {
      const diff = new Date(expiry) - new Date();
      if (diff <= 0) {
        setRemaining('EXPIRED');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  if (!expiry) return null;

  const isLow = remaining !== 'EXPIRED' && parseInt(remaining) < 3;

  return (
    <span className={`font-mono font-bold ${
      remaining === 'EXPIRED' ? 'text-red-400' : isLow ? 'text-amber-400 animate-pulse' : 'text-white'
    }`}>
      {remaining === 'EXPIRED' ? 'Expired' : remaining}
    </span>
  );
}
