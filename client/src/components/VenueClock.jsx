import React, { useEffect, useMemo, useState } from 'react';

const VENUE_TIME_ZONE = 'America/Moncton';

function getVenueDateTime() {
  return new Date();
}

export default function VenueClock({ tone = 'dark', className = '', prominent = false }) {
  const [now, setNow] = useState(getVenueDateTime);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(getVenueDateTime()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formatted = useMemo(() => {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: VENUE_TIME_ZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(now);
    const time = new Intl.DateTimeFormat('en-CA', {
      timeZone: VENUE_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(now);
    return { date, time };
  }, [now]);

  const styles = tone === 'light'
    ? 'bg-white border border-gray-200 text-brand-blue shadow-sm'
    : 'bg-white/10 border border-white/15 text-white';
  const muted = tone === 'light' ? 'text-gray-500' : 'text-white/60';
  const accent = tone === 'light' ? 'text-brand-gold' : 'text-brand-gold';
  const padding = prominent ? 'px-5 py-4' : 'px-3 py-2';
  const labelSize = prominent ? 'text-xs' : 'text-[10px]';
  const timeSize = prominent ? 'text-2xl' : 'text-sm';
  const dateSize = prominent ? 'text-sm' : 'text-xs';

  return (
    <div className={`rounded-xl ${padding} ${styles} ${className}`} aria-label={`Venue time: ${formatted.date}, ${formatted.time}`}>
      <div className={`${labelSize} font-bold uppercase ${muted}`}>Venue Time - Fredericton, NB</div>
      <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${prominent ? 'justify-center' : ''}`}>
        <span className={`${timeSize} font-bold tabular-nums ${accent}`}>{formatted.time}</span>
        <span className={`${dateSize} font-semibold ${muted}`}>{formatted.date}</span>
      </div>
    </div>
  );
}
