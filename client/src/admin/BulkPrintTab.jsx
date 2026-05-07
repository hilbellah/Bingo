import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

export default function BulkPrintTab() {
  const {
    tab,
    sessions,
    bookings,
    bulkDateFrom,
    setBulkDateFrom,
    bulkDateTo,
    setBulkDateTo,
    bulkLoading,
    handleLoadBulkTickets,
    bulkData,
  } = useAdminDashboard();

  return (
    <>
        {/* BULK PRINT TAB */}
        {tab === 'bulkprint' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4 no-print">
              <h3 className="font-semibold text-brand-blue mb-3">Bulk Print Tickets</h3>
              <p className="text-sm text-gray-500 mb-4">Select a date or date range to load and print all tickets at once.</p>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">From Date</label>
                  <input type="date" value={bulkDateFrom} onChange={e => setBulkDateFrom(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">To Date (optional)</label>
                  <input type="date" value={bulkDateTo} onChange={e => setBulkDateTo(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm" />
                </div>
                <button onClick={handleLoadBulkTickets} disabled={!bulkDateFrom || bulkLoading}
                  className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40">
                  {bulkLoading ? 'Loading...' : 'Load Tickets'}
                </button>
                {bulkData && bulkData.totalTickets > 0 && (
                  <button onClick={() => window.print()}
                    className="bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-blue/90">
                    Print All ({bulkData.totalTickets} tickets)
                  </button>
                )}
              </div>
            </div>

            {bulkData && bulkData.error && (
              <div className="bg-red-50 text-red-700 rounded-xl p-4 mb-4">
                <p className="text-sm font-medium">{bulkData.error}</p>
              </div>
            )}

            {bulkData && !bulkData.error && bulkData.totalTickets === 0 && (
              <div className="bg-white rounded-xl p-8 shadow-sm text-center">
                <p className="text-gray-400">No paid tickets found for the selected date range.</p>
              </div>
            )}

            {bulkData && !bulkData.error && bulkData.totalTickets > 0 && (
              <div>
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 no-print">
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold text-brand-blue">{bulkData.totalTickets}</span> ticket(s) across{' '}
                    <span className="font-semibold">{bulkData.sessions.length}</span> session(s) from{' '}
                    <span className="font-medium">{bulkData.dateFrom}</span> to <span className="font-medium">{bulkData.dateTo}</span>
                  </p>
                </div>

                {/* Printable ticket pages */}
                {bulkData.sessions.map(session => {
                  // Flatten all tickets for this session
                  const allTickets = [];
                  session.bookings.forEach(booking => {
                    booking.tickets.forEach(ticket => {
                      allTickets.push({ ...ticket, referenceNumber: ticket.referenceNumber || booking.referenceNumber });
                    });
                  });

                  // Split into pages of 3
                  const pages = [];
                  for (let i = 0; i < allTickets.length; i += 3) {
                    pages.push(allTickets.slice(i, i + 3));
                  }

                  return (
                    <div key={session.sessionId}>
                      <div className="no-print bg-gray-100 rounded-lg px-4 py-2 mb-2">
                        <p className="text-sm font-semibold text-brand-blue">
                          {session.sessionDate} at {session.sessionTime}
                          {session.isSpecialEvent && session.eventTitle && (
                            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                              {session.eventTitle}
                            </span>
                          )}
                          <span className="ml-2 text-gray-400 font-normal">({allTickets.length} tickets)</span>
                        </p>
                      </div>

                      {pages.map((pageTickets, pageIdx) => (
                        <div className="bulk-ticket-page" key={`${session.sessionId}-${pageIdx}`}>
                          {pageTickets.map((ticket, i) => {
                            const displayTitle = (session.isSpecialEvent && session.eventTitle) ? session.eventTitle : 'Mega Bucks Bingo';
                            const fmtDate = (() => {
                              const d = new Date(session.sessionDate + 'T12:00:00');
                              const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                              const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                              return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                            })();
                            const fmtTime = (() => {
                              const [h, m] = session.sessionTime.split(':').map(Number);
                              const ampm = h >= 12 ? 'PM' : 'AM';
                              const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
                              return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
                            })();
                            return (
                            <div className="ticket-card" key={i}>
                              <div className="ticket-inner">
                                {/* Left half: Client copy — name prominent */}
                                <div className="ticket-half ticket-half-left">
                                  <div className="ticket-name-prominent">
                                    {ticket.firstName} {ticket.lastName}
                                  </div>
                                  <h2 className="ticket-title">{displayTitle}</h2>
                                  <div className="ticket-logo">
                                    <img src="/logo.png" alt="SMEC" className="ticket-logo-img" />
                                  </div>
                                  <div className="ticket-half-row">
                                    <div className="ticket-detail-compact">
                                      <span className="ticket-label-sm">Table</span>
                                      <span className="ticket-value-md">{ticket.tableNumber}</span>
                                    </div>
                                    <div className="ticket-detail-compact">
                                      <span className="ticket-label-sm">Seat</span>
                                      <span className="ticket-value-md">{ticket.chairNumber}</span>
                                    </div>
                                  </div>
                                  <p className="ticket-price">${(ticket.packagePrice / 100).toFixed(2)}</p>
                                  <p className="ticket-pkg">{ticket.packageName}</p>
                                  <div className="ticket-half-row ticket-meta">
                                    <span className="ticket-meta-text">{fmtDate}</span>
                                    <span className="ticket-meta-text">{fmtTime}</span>
                                  </div>
                                  <div className="ticket-ref-block">
                                    <span className="ticket-ref-value">{ticket.referenceNumber}</span>
                                  </div>
                                </div>
                                {/* Right half: Customer copy — table/seat prominent */}
                                <div className="ticket-half ticket-half-right">
                                  <h2 className="ticket-title">{displayTitle}</h2>
                                  <div className="ticket-logo">
                                    <img src="/logo.png" alt="SMEC" className="ticket-logo-img" />
                                  </div>
                                  <div className="ticket-half-row">
                                    <div className="ticket-detail">
                                      <span className="ticket-label">Table</span>
                                      <span className="ticket-value">{ticket.tableNumber}</span>
                                    </div>
                                    <div className="ticket-detail">
                                      <span className="ticket-label">Seat</span>
                                      <span className="ticket-value">{ticket.chairNumber}</span>
                                    </div>
                                  </div>
                                  <div className="ticket-name-secondary">
                                    {ticket.firstName} {ticket.lastName}
                                  </div>
                                  <p className="ticket-price-sm">${(ticket.packagePrice / 100).toFixed(2)} — {ticket.packageName}</p>
                                  <div className="ticket-half-row ticket-meta">
                                    <span className="ticket-meta-text">{fmtDate}</span>
                                    <span className="ticket-meta-text">{fmtTime}</span>
                                  </div>
                                  <div className="ticket-ref-block">
                                    <span className="ticket-ref-value">{ticket.referenceNumber}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            <style>{`
              @media print {
                .no-print, header, .bg-white.border-b { display: none !important; }
                body { margin: 0; padding: 0; }
                @page { size: letter; margin: 0.25in; }
                .max-w-6xl { max-width: none !important; padding: 0 !important; }
                .min-h-screen { min-height: auto !important; }
              }

              @media screen {
                .bulk-ticket-page {
                  max-width: 8.5in;
                  margin: 10px auto;
                  padding: 0.25in;
                  background: white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
              }

              .bulk-ticket-page {
                display: flex;
                flex-direction: column;
                width: 8in;
                height: 10.5in;
                page-break-after: always;
                justify-content: space-between;
              }

              .bulk-ticket-page .ticket-card {
                width: 100%;
                height: 3.4in;
                border: 1.5px dashed #c5a55a;
                border-radius: 8px;
                box-sizing: border-box;
                background: linear-gradient(135deg, #fdf6e3 0%, #fcecd6 50%, #f8e0c0 100%);
                position: relative;
                overflow: hidden;
              }

              .bulk-ticket-page .ticket-inner {
                display: flex;
                height: 100%;
                padding: 0.25in 0.3in;
                gap: 0;
              }

              .bulk-ticket-page .ticket-half {
                flex: 1;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                text-align: center; box-sizing: border-box;
                padding: 0 0.2in; gap: 2px;
              }
              .bulk-ticket-page .ticket-half-left {
                border-right: 2px dashed #c5a55a;
              }
              .bulk-ticket-page .ticket-half-row {
                display: flex; gap: 16px;
                justify-content: center; align-items: center;
              }
              .bulk-ticket-page .ticket-title {
                font-family: 'Georgia', serif;
                font-size: 16px; font-weight: bold;
                color: #1a3a5c; margin: 0 0 4px 0; line-height: 1.2;
              }
              .bulk-ticket-page .ticket-logo {
                width: 50px; height: 35px;
                display: flex; align-items: center; justify-content: center;
                margin-bottom: 4px;
              }
              .bulk-ticket-page .ticket-logo-img {
                max-width: 100%; max-height: 100%;
                object-fit: contain; opacity: 0.7;
              }
              .bulk-ticket-page .ticket-name-prominent {
                font-size: 22px; font-weight: 700;
                color: #1a3a5c; margin: 0 0 2px 0;
                line-height: 1.2; word-break: break-word; max-width: 100%;
              }
              .bulk-ticket-page .ticket-name-secondary {
                font-size: 16px; font-weight: 700;
                color: #1a3a5c; line-height: 1.2;
                word-break: break-word; margin: 2px 0;
              }
              .bulk-ticket-page .ticket-price {
                font-family: 'Georgia', serif;
                font-size: 20px; font-weight: bold;
                color: #c5a55a; margin: 2px 0 0 0;
              }
              .bulk-ticket-page .ticket-price-sm {
                font-size: 12px; font-weight: 600;
                color: #c5a55a; margin: 2px 0;
              }
              .bulk-ticket-page .ticket-pkg {
                font-size: 11px; color: #888; margin: 0;
              }
              .bulk-ticket-page .ticket-detail-compact { text-align: center; }
              .bulk-ticket-page .ticket-value-md {
                display: block; font-size: 22px; font-weight: bold;
                color: #1a3a5c; line-height: 1.1;
              }
              .bulk-ticket-page .ticket-detail { text-align: center; }
              .bulk-ticket-page .ticket-label {
                display: block; font-size: 11px; color: #888;
                text-transform: uppercase; letter-spacing: 1px;
              }
              .bulk-ticket-page .ticket-value {
                display: block; font-size: 36px; font-weight: bold;
                color: #1a3a5c; line-height: 1.1;
              }
              .bulk-ticket-page .ticket-label-sm {
                display: block; font-size: 9px; color: #aaa;
                text-transform: uppercase; letter-spacing: 0.5px;
              }
              .bulk-ticket-page .ticket-meta { margin-top: 2px; }
              .bulk-ticket-page .ticket-meta-text {
                font-size: 11px; font-weight: 600; color: #555;
              }
              .bulk-ticket-page .ticket-ref-block {
                margin-top: 2px; text-align: center;
              }
              .bulk-ticket-page .ticket-ref-value {
                display: block; font-size: 13px; font-weight: 700;
                color: #1a3a5c; font-family: monospace; letter-spacing: 0.5px;
              }
              .bulk-ticket-page .ticket-name-right {
                display: block; font-size: 18px; font-weight: 700;
                color: #1a3a5c; line-height: 1.2; word-break: break-word;
              }
            `}</style>
          </div>
        )}

    </>
  );
}


