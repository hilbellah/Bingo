import React, { useState, useEffect } from 'react';
import { fetchAnnouncements } from '../api';

const TYPE_STYLES = {
  info: 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue',
  warning: 'bg-amber-50 border-amber-300 text-amber-800',
  success: 'bg-green-50 border-green-300 text-green-800',
};

const TYPE_ICONS = {
  info: (
    <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  success: (
    <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
};

export default function AnnouncementBanner({ socket }) {
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());

  const load = () => fetchAnnouncements().then(setAnnouncements).catch(() => {});

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('announcements:refresh', load);
    return () => socket.off('announcements:refresh', load);
  }, [socket]);

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map(a => (
        <div
          key={a.id}
          className={`relative border-2 rounded-2xl px-4 py-3 flex items-start gap-3 ${TYPE_STYLES[a.type] || TYPE_STYLES.info}`}
        >
          {TYPE_ICONS[a.type] || TYPE_ICONS.info}
          <div className="flex-1 min-w-0">
            {a.title && <p className="font-bold text-sm">{a.title}</p>}
            <p className="text-sm">{a.message}</p>
            {a.image_url && (
              <img src={a.image_url} alt={a.title || 'Announcement'}
                className="mt-2 max-h-48 rounded-lg object-cover" />
            )}
          </div>
          <button
            onClick={() => setDismissed(prev => new Set([...prev, a.id]))}
            className="shrink-0 opacity-50 hover:opacity-100 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
