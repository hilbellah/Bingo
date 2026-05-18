import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

export default function ArchiveAuditTab() {
  const {
    tab,
    sessions,
    formatPrice,
    bookings,
    deletedSessions,
    handleViewArchiveBookings,
    handleRestoreSession,
    archiveBookings,
    setArchiveBookings,
    auditLogs,
  } = useAdminDashboard();

  return (
    <>
        {/* ARCHIVE & AUDIT TAB */}
        {tab === 'archive' && (
          <div>
            {/* Deleted Sessions */}
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
              <h3 className="font-semibold text-brand-blue mb-3">Deleted Sessions</h3>
              {deletedSessions.length === 0 ? (
                <p className="text-gray-400 text-sm">No deleted sessions.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 text-xs uppercase">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Live Event / Venue</th>
                      <th className="pb-2">Paid Bookings</th>
                      <th className="pb-2">Revenue</th>
                      <th className="pb-2">Deleted At</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletedSessions.map(s => (
                      <tr key={s.id} className="border-t">
                        <td className="py-2">{s.date}</td>
                        <td className="py-2">{s.time}</td>
                        <td className="py-2">{s.is_special_event && s.event_title ? s.event_title : '-'}</td>
                        <td className="py-2">{s.paid_bookings || 0}</td>
                        <td className="py-2">{formatPrice(s.total_revenue || 0)}</td>
                        <td className="py-2 text-xs text-gray-400">{new Date(s.deleted_at).toLocaleString()}</td>
                        <td className="py-2 space-x-2">
                          <button onClick={() => handleViewArchiveBookings(s)}
                            className="text-xs bg-brand-blue text-white px-2 py-1 rounded hover:bg-blue-800">
                            View Bookings
                          </button>
                          <button onClick={() => handleRestoreSession(s.id)}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Archive Bookings Modal Inline */}
            {archiveBookings && (
              <div className="bg-white rounded-xl p-5 shadow-sm mb-4 border-2 border-brand-gold">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-brand-blue">
                    Bookings for {archiveBookings.session.date} at {archiveBookings.session.time}
                    {archiveBookings.session.event_title && <span className="ml-2 text-sm text-amber-600">({archiveBookings.session.event_title})</span>}
                  </h3>
                  <button onClick={() => setArchiveBookings(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                {archiveBookings.bookings.length === 0 ? (
                  <p className="text-gray-400 text-sm">No bookings for this session.</p>
                ) : (
                  archiveBookings.bookings.map(b => (
                    <div key={b.id} className="border rounded-lg p-3 mb-2">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-mono text-sm font-bold text-brand-blue">{b.referenceNumber}</span>
                        <span className="text-sm">
                          {b.totalFormatted}
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${b.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : b.paymentStatus === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                            {b.paymentStatus}
                          </span>
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 text-left">
                            <th className="pb-1">Ticket</th>
                            <th className="pb-1">Name</th>
                            <th className="pb-1">Table</th>
                            <th className="pb-1">Chair</th>
                            <th className="pb-1">Package</th>
                            <th className="pb-1">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.attendees.map((a, i) => (
                            <tr key={i}>
                              <td className="py-0.5 font-mono text-brand-blue font-semibold">{a.referenceNumber || b.referenceNumber}</td>
                              <td className="py-0.5">{a.firstName} {a.lastName}</td>
                              <td className="py-0.5">{a.tableNumber}</td>
                              <td className="py-0.5">{a.chairNumber}</td>
                              <td className="py-0.5">{a.packageName}</td>
                              <td className="py-0.5">{a.itemPriceFormatted}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Audit Log */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">Audit Log (Last 50)</h3>
              {auditLogs.length === 0 ? (
                <p className="text-gray-400 text-sm">No audit entries yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 text-xs uppercase">
                        <th className="pb-2">Time</th>
                        <th className="pb-2">Action</th>
                        <th className="pb-2">Entity</th>
                        <th className="pb-2">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id} className="border-t">
                          <td className="py-2 text-xs text-gray-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              log.action.includes('delete') ? 'bg-red-100 text-red-700' :
                              log.action.includes('restore') ? 'bg-green-100 text-green-700' :
                              log.action.includes('cancel') ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2 text-xs">{log.entity_type} <span className="text-gray-400 font-mono">{log.entity_id.slice(0, 8)}</span></td>
                          <td className="py-2 text-xs text-gray-500 max-w-xs truncate">
                            {log.details ? (typeof log.details === 'object' ? (log.details.date || log.details.ref || JSON.stringify(log.details).slice(0, 80)) : String(log.details).slice(0, 80)) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

    </>
  );
}


