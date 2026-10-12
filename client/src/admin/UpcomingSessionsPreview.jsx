import React from 'react';
import { formatDateLabel } from './recurringScheduleHelpers';

// "Next upcoming auto-generated sessions" card on Manage Schedule. Moved
// verbatim from RecurringScheduleTab.
export default function UpcomingSessionsPreview({ upcomingPreview, summary }) {
  if (upcomingPreview.length === 0) return null;
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <h4 className="font-semibold text-brand-blue mb-3">Next Upcoming Auto-Generated Sessions</h4>
      <div className="text-xs text-gray-500 mb-2">
        Showing the first 10 of {summary?.upcomingAutoSessions || 0} in the look-ahead window.
        Manage or cancel individual sessions on the Bingo Sessions tab.
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 uppercase">
          <tr className="border-b">
            <th className="text-left py-2">Date</th>
            <th className="text-left py-2">Time</th>
            <th className="text-left py-2">Cutoff</th>
            <th className="text-left py-2">Type</th>
            <th className="text-left py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {upcomingPreview.map((s, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="py-2">{formatDateLabel(s.date)}</td>
              <td className="py-2">{s.time}</td>
              <td className="py-2 text-gray-500">{s.cutoff_time}</td>
              <td className="py-2">{s.session_type === 'special_bingo' ? 'Special' : 'Regular'}</td>
              <td className="py-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                  {s.is_available ? 'Open' : 'Closed'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
