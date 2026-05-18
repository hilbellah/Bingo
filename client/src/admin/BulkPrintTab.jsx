import React, { useEffect, useMemo, useState } from 'react';
import { markAdminBulkTicketsPrinted } from '../api';
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
    bulkDepartment,
    setBulkDepartment,
    bulkLoading,
    handleLoadBulkTickets,
    bulkData,
    setBulkData,
    token,
  } = useAdminDashboard();

  const [printFilter, setPrintFilter] = useState('unprinted');
  const [selectedTicketIds, setSelectedTicketIds] = useState(new Set());
  const [markingPrinted, setMarkingPrinted] = useState(false);

  const allTickets = useMemo(() => {
    if (!bulkData?.sessions) return [];
    return bulkData.sessions.flatMap(session =>
      session.bookings.flatMap(booking =>
        booking.tickets.map(ticket => ({
          ...ticket,
          sessionId: session.sessionId,
          sessionDate: session.sessionDate,
          sessionTime: session.sessionTime,
          isSpecialEvent: session.isSpecialEvent,
          eventTitle: session.eventTitle,
          bookingReferenceNumber: booking.referenceNumber,
          referenceNumber: ticket.referenceNumber || booking.referenceNumber,
        }))
      )
    );
  }, [bulkData]);

  const visibleTickets = useMemo(() => {
    if (printFilter === 'printed') return allTickets.filter(ticket => ticket.printedAt);
    if (printFilter === 'unprinted') return allTickets.filter(ticket => !ticket.printedAt);
    return allTickets;
  }, [allTickets, printFilter]);

  const selectedTickets = useMemo(
    () => visibleTickets.filter(ticket => selectedTicketIds.has(ticket.id)),
    [visibleTickets, selectedTicketIds]
  );

  const printedCount = allTickets.filter(ticket => ticket.printedAt).length;
  const unprintedCount = allTickets.length - printedCount;
  const isEventPrint = bulkDepartment === 'event';
  const departmentLabel = isEventPrint ? 'Live Event / Venue' : 'Special Bingo';

  useEffect(() => {
    const defaultTickets = allTickets.filter(ticket => !ticket.printedAt);
    setSelectedTicketIds(new Set(defaultTickets.map(ticket => ticket.id)));
    setPrintFilter('unprinted');
  }, [allTickets]);

  const toggleTicket = (ticketId) => {
    setSelectedTicketIds(prev => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const selectVisibleTickets = () => {
    setSelectedTicketIds(new Set(visibleTickets.map(ticket => ticket.id)));
  };

  const clearVisibleTickets = () => {
    setSelectedTicketIds(prev => {
      const next = new Set(prev);
      visibleTickets.forEach(ticket => next.delete(ticket.id));
      return next;
    });
  };

  const handleMarkPrinted = async () => {
    if (selectedTickets.length === 0) return;
    setMarkingPrinted(true);
    const result = await markAdminBulkTicketsPrinted(token, selectedTickets.map(ticket => ticket.id));
    setMarkingPrinted(false);
    if (!result.ok) {
      alert(result.error || 'Could not mark tickets as printed.');
      return;
    }
    await handleLoadBulkTickets();
  };

  return (
    <>
        {/* BULK PRINT TAB */}
        {tab === 'bulkprint' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4 no-print">
              <h3 className="font-semibold text-brand-blue mb-3">{departmentLabel} Template Tickets</h3>
              <p className="text-sm text-gray-500 mb-4">
                Select a date or date range to load template tickets. Special bingo prints 3 per sheet; live events / venues print 6 per sheet. Regular bingo orders print on receipt paper and are not included here.
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Department</label>
                  <select
                    value={bulkDepartment}
                    onChange={e => {
                      setBulkDepartment(e.target.value);
                      setBulkData(null);
                    }}
                    className="px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="special_bingo">Special Bingo</option>
                    <option value="event">Live Event / Venue</option>
                  </select>
                </div>
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
                    disabled={selectedTickets.length === 0}
                    className="bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-blue/90">
                    Print Selected ({selectedTickets.length})
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
                <p className="text-gray-400">No paid {departmentLabel.toLowerCase()} template tickets found for the selected date range.</p>
              </div>
            )}

            {bulkData && !bulkData.error && bulkData.totalTickets > 0 && (
              <div>
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 no-print">
                  <div className="flex flex-wrap justify-between gap-3 items-start">
                    <div>
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold text-brand-blue">{bulkData.totalTickets}</span> template ticket(s) across{' '}
                        <span className="font-semibold">{bulkData.sessions.length}</span> session(s) from{' '}
                        <span className="font-medium">{bulkData.dateFrom}</span> to <span className="font-medium">{bulkData.dateTo}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {unprintedCount} unprinted / {printedCount} printed. Selected: {selectedTickets.length}.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <select
                        value={printFilter}
                        onChange={e => setPrintFilter(e.target.value)}
                        className="px-3 py-1.5 border rounded-lg text-sm"
                      >
                        <option value="unprinted">Unprinted only</option>
                        <option value="all">All tickets</option>
                        <option value="printed">Printed only</option>
                      </select>
                      <button onClick={selectVisibleTickets} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                        Select visible
                      </button>
                      <button onClick={clearVisibleTickets} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                        Clear visible
                      </button>
                      <button
                        onClick={handleMarkPrinted}
                        disabled={selectedTickets.length === 0 || markingPrinted}
                        className="px-3 py-1.5 text-xs bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-40"
                      >
                        {markingPrinted ? 'Marking...' : 'Mark Selected Printed'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 no-print overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b">
                        <th className="pb-2 w-10"></th>
                        <th className="pb-2">Ticket</th>
                        <th className="pb-2">Name</th>
                        <th className="pb-2">Session</th>
                        <th className="pb-2 text-center">Table</th>
                        <th className="pb-2 text-center">Seat</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTickets.length === 0 ? (
                        <tr>
                          <td className="py-5 text-center text-gray-400" colSpan={7}>No tickets match this filter.</td>
                        </tr>
                      ) : visibleTickets.map(ticket => (
                        <tr key={ticket.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2">
                            <input
                              type="checkbox"
                              checked={selectedTicketIds.has(ticket.id)}
                              onChange={() => toggleTicket(ticket.id)}
                            />
                          </td>
                          <td className="py-2 font-mono text-brand-blue">{ticket.referenceNumber}</td>
                          <td className="py-2 font-medium text-gray-800">{ticket.firstName} {ticket.lastName}</td>
                          <td className="py-2 text-gray-600">
                            {ticket.sessionDate} {ticket.sessionTime}
                            {ticket.eventTitle ? <span className="ml-1 text-amber-700">- {ticket.eventTitle}</span> : null}
                          </td>
                          <td className="py-2 text-center">{ticket.tableNumber}</td>
                          <td className="py-2 text-center">{ticket.chairNumber}</td>
                          <td className="py-2">
                            {ticket.printedAt ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                                Printed {new Date(ticket.printedAt).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Unprinted</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Printable ticket pages */}
                {bulkData.sessions.map(session => {
                  const sessionTickets = selectedTickets.filter(ticket => ticket.sessionId === session.sessionId);
                  if (sessionTickets.length === 0) return null;

                  const ticketsPerPage = isEventPrint ? 6 : 3;
                  const pages = [];
                  for (let i = 0; i < sessionTickets.length; i += ticketsPerPage) {
                    pages.push(sessionTickets.slice(i, i + ticketsPerPage));
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
                          <span className="ml-2 text-gray-400 font-normal">({sessionTickets.length} selected)</span>
                        </p>
                      </div>

                      {pages.map((pageTickets, pageIdx) => (
                        <div className={isEventPrint ? 'event-ticket-page' : 'bulk-ticket-page'} key={`${session.sessionId}-${pageIdx}`}>
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
                            isEventPrint ? (
                            <div className="event-ticket-card" key={i}>
                              <div className="event-ticket-title">{displayTitle}</div>
                              <div className="event-ticket-name">{ticket.firstName} {ticket.lastName}</div>
                              <div className="event-ticket-row">
                                <span>Table {ticket.tableNumber}</span>
                                <span>Seat {ticket.chairNumber}</span>
                              </div>
                              <div className="event-ticket-meta">{fmtDate} - {fmtTime}</div>
                              <div className="event-ticket-ref">{ticket.referenceNumber}</div>
                            </div>
                            ) : (
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
                            )
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
                .bulk-ticket-page, .event-ticket-page {
                  max-width: 8.5in;
                  margin: 10px auto;
                  padding: 0.25in;
                  background: white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
              }

              .event-ticket-page {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                grid-template-rows: repeat(3, 1fr);
                gap: 0.12in;
                width: 8in;
                height: 10.5in;
                page-break-after: always;
              }

              .event-ticket-card {
                border: 1.5px dashed #1a3a5c;
                border-radius: 6px;
                box-sizing: border-box;
                padding: 0.18in;
                background: #fffdf8;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                color: #1a3a5c;
                overflow: hidden;
              }

              .event-ticket-title {
                font-family: Georgia, serif;
                font-size: 18px;
                font-weight: 700;
                line-height: 1.15;
                margin-bottom: 0.12in;
              }

              .event-ticket-name {
                font-size: 20px;
                font-weight: 700;
                line-height: 1.2;
                word-break: break-word;
                max-width: 100%;
                margin-bottom: 0.1in;
              }

              .event-ticket-row {
                display: flex;
                gap: 0.18in;
                justify-content: center;
                font-size: 16px;
                font-weight: 700;
                margin-bottom: 0.08in;
              }

              .event-ticket-meta {
                font-size: 12px;
                color: #555;
                font-weight: 600;
                margin-bottom: 0.08in;
              }

              .event-ticket-ref {
                font-family: monospace;
                font-size: 13px;
                font-weight: 700;
                color: #0f2d48;
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


