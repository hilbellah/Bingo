import React, { useEffect, useMemo, useRef, useState } from 'react';
import { markAdminBulkTicketsPrinted, saveSettings } from '../api';
import { printBulkBookingReceipts } from './adminPrintUtils';
import { useAdminDashboard } from './AdminDashboardContext';
import { confirmAdminAction } from './adminConfirm';
import { DEPARTMENT_OPTIONS, writeSpecialPaperPrintDocument, buildSpecialPaperPrintBody } from './bulkPrintDocuments';
import WalkInTicketsPanel from './WalkInTicketsPanel';
import BulkTicketTable from './BulkTicketTable';
import { BULK_PRINT_PAGE_CSS } from './bulkPrintPageStyles';

export default function BulkPrintTab() {
  const {
    tab,
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
    receiptConfig,
    setReceiptConfig,
    token,
  } = useAdminDashboard();

  const [printFilter, setPrintFilter] = useState('unprinted');
  const [selectedTicketIds, setSelectedTicketIds] = useState(new Set());
  const [printParts, setPrintParts] = useState({ nameCopy: true, seatCopy: true, singleCopy: false });
  const [printSort, setPrintSort] = useState('seat');
  const [markingPrinted, setMarkingPrinted] = useState(false);
  const [printStatusMessage, setPrintStatusMessage] = useState('');
  const [receiptSettingsSaving, setReceiptSettingsSaving] = useState(false);
  const bulkPrintTopRef = useRef(null);
  const scrollAfterBulkLoadRef = useRef(false);
  const previousTabRef = useRef(tab);

  const scrollBulkPrintControlsIntoView = () => {
    bulkPrintTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectedDepartments = useMemo(() => {
    if (!bulkDepartment || bulkDepartment === 'all') return DEPARTMENT_OPTIONS.map(option => option.value);
    const selected = String(bulkDepartment).split(',').filter(Boolean);
    return selected.length > 0 ? selected : DEPARTMENT_OPTIONS.map(option => option.value);
  }, [bulkDepartment]);

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
          sessionType: session.sessionType,
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
  const selectedTicketsForPrint = useMemo(() => {
    const tickets = [...selectedTickets];
    const compareSession = (a, b) => {
      const date = String(a.sessionDate || '').localeCompare(String(b.sessionDate || ''));
      if (date !== 0) return date;
      return String(a.sessionTime || '').localeCompare(String(b.sessionTime || ''));
    };
    if (printSort !== 'name') {
      // The API returns tickets grouped by booking reference, so "Table / seat
      // order" must sort explicitly or staff re-sort the printed stack by hand.
      return tickets.sort((a, b) => compareSession(a, b)
        || (Number(a.tableNumber) - Number(b.tableNumber))
        || (Number(a.chairNumber) - Number(b.chairNumber))
        || String(a.referenceNumber || '').localeCompare(String(b.referenceNumber || ''), undefined, { sensitivity: 'base' }));
    }
    return tickets.sort((a, b) => {
      const last = String(a.lastName || '').localeCompare(String(b.lastName || ''), undefined, { sensitivity: 'base' });
      if (last !== 0) return last;
      const first = String(a.firstName || '').localeCompare(String(b.firstName || ''), undefined, { sensitivity: 'base' });
      if (first !== 0) return first;
      const session = String(a.sessionDate || '').localeCompare(String(b.sessionDate || ''));
      if (session !== 0) return session;
      return String(a.referenceNumber || '').localeCompare(String(b.referenceNumber || ''), undefined, { sensitivity: 'base' });
    });
  }, [selectedTickets, printSort]);
  const hasPrintableSelectedTickets = selectedTickets.some(ticket =>
    ticket.sessionType === 'event' || printParts.nameCopy || printParts.seatCopy || printParts.singleCopy
  );
  const selectedReceiptBookings = useMemo(() => {
    // Derive from the filter-visible selection (selectedTickets), not the raw
    // id set — after a filter change the raw set can still contain hidden
    // tickets, printing receipts the admin can't see selected anywhere.
    const visibleSelectedIds = new Set(selectedTickets.map(ticket => ticket.id));
    if (!bulkData?.sessions || visibleSelectedIds.size === 0) return [];
    const formatMoney = (cents) => 'CA$' + (Math.max(0, Number(cents) || 0) / 100).toFixed(2);
    const receiptBookings = [];

    for (const session of bulkData.sessions) {
      for (const booking of session.bookings || []) {
        const selectedItems = (booking.tickets || []).filter(ticket => visibleSelectedIds.has(ticket.id));
        if (selectedItems.length === 0) continue;

        const allItemsSubtotal = (booking.tickets || []).reduce((sum, ticket) => {
          const addonTotal = (ticket.addons || []).reduce((addonSum, addon) => addonSum + (Number(addon.price) || 0), 0);
          return sum + (Number(ticket.packagePrice) || 0) + addonTotal;
        }, 0);
        // Distribute the service charge exactly: floor per ticket, remainder
        // cents on the first tickets, so the receipts sum to what was charged.
        const ticketCount = booking.tickets?.length || 0;
        const totalFee = Math.max(0, (Number(booking.totalAmount) || 0) - allItemsSubtotal);
        const baseFee = ticketCount ? Math.floor(totalFee / ticketCount) : 0;
        const feeRemainder = ticketCount ? totalFee - baseFee * ticketCount : 0;
        const feeForTicket = (ticket) => {
          const index = (booking.tickets || []).findIndex(item => item.id === ticket.id);
          return baseFee + (index >= 0 && index < feeRemainder ? 1 : 0);
        };
        const ticketTotalAmount = (ticket) => {
          const addonTotal = (ticket.addons || []).reduce((addonSum, addon) => addonSum + (Number(addon.price) || 0), 0);
          return (Number(ticket.packagePrice) || 0) + addonTotal + feeForTicket(ticket);
        };
        const sessionType = session.sessionType || (session.isSpecialEvent ? 'special_bingo' : 'regular_bingo');
        const sessionTitle = session.eventTitle
          || (sessionType === 'event' ? 'Live Event / Venue' : sessionType === 'special_bingo' ? 'Special Bingo' : 'Regular Bingo');
        const toReceiptItem = (ticket) => ({
          id: ticket.id,
          firstName: ticket.firstName,
          lastName: ticket.lastName,
          tableNumber: ticket.tableNumber,
          chairNumber: ticket.chairNumber,
          referenceNumber: ticket.referenceNumber,
          packageName: ticket.packageName,
          packagePrice: ticket.packagePrice,
          packagePriceFormatted: ticket.packagePriceFormatted,
          addons: ticket.addons || [],
        });
        const buildReceiptBooking = (items, totalAmount, idSuffix = '') => ({
          id: `${booking.id}${idSuffix}`,
          referenceNumber: booking.referenceNumber,
          totalAmount,
          totalFormatted: formatMoney(totalAmount),
          paymentStatus: 'paid',
          createdAt: booking.createdAt || new Date().toISOString(),
          sessionDate: session.sessionDate,
          sessionTime: session.sessionTime,
          sessionTitle,
          sessionType,
          items,
        });

        if (sessionType === 'regular_bingo') {
          for (const ticket of selectedItems) {
            receiptBookings.push(buildReceiptBooking(
              [toReceiptItem(ticket)],
              ticketTotalAmount(ticket),
              `:${ticket.id}`
            ));
          }
        } else {
          const totalAmount = selectedItems.reduce((sum, ticket) => sum + ticketTotalAmount(ticket), 0);
          receiptBookings.push(buildReceiptBooking(selectedItems.map(toReceiptItem), totalAmount));
        }
      }
    }

    return receiptBookings;
  }, [bulkData, selectedTickets]);

  const printedCount = allTickets.filter(ticket => ticket.printedAt).length;
  const unprintedCount = allTickets.length - printedCount;
  const departmentLabel = selectedDepartments.length === DEPARTMENT_OPTIONS.length
    ? 'All Departments'
    : DEPARTMENT_OPTIONS
      .filter(option => selectedDepartments.includes(option.value))
      .map(option => option.label)
      .join(', ');

  // A new ticket list (new search or reload) re-selects everything still unprinted.
  const [selectionSource, setSelectionSource] = useState(null);
  if (allTickets !== selectionSource) {
    setSelectionSource(allTickets);
    setSelectedTicketIds(new Set(allTickets.filter(ticket => !ticket.printedAt).map(ticket => ticket.id)));
    setPrintFilter('unprinted');
  }

  useEffect(() => {
    if (tab === 'bulkprint' && previousTabRef.current !== 'bulkprint') {
      setTimeout(scrollBulkPrintControlsIntoView, 0);
    }
    previousTabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    if (!scrollAfterBulkLoadRef.current || bulkLoading) return;
    scrollAfterBulkLoadRef.current = false;
    setTimeout(scrollBulkPrintControlsIntoView, 0);
  }, [bulkLoading, bulkData]);

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

  const toggleDepartment = (department) => {
    const next = selectedDepartments.includes(department)
      ? selectedDepartments.filter(value => value !== department)
      : [...selectedDepartments, department];
    setBulkDepartment(next.length === DEPARTMENT_OPTIONS.length ? 'all' : next.join(',') || 'all');
    setBulkData(null);
  };

  const printCopyMode = printParts.singleCopy ? 'single' : 'both';

  const updatePrintCopyMode = (mode) => {
    setPrintParts({
      nameCopy: mode === 'both',
      seatCopy: mode === 'both',
      singleCopy: mode === 'single',
    });
  };

  const updateReceiptConfig = (patch) => {
    setReceiptConfig({ ...receiptConfig, ...patch });
  };
  const receiptCutPercent = Number(receiptConfig.receiptCutPercent ?? (receiptConfig.partialCutBetweenReceipts ? 70 : 0));
  const receiptCutEnabled = receiptCutPercent > 0;
  const receiptCutSliderValue = receiptCutEnabled ? receiptCutPercent : 70;
  const updateReceiptCut = (nextPercent) => {
    const value = Math.min(99, Math.max(1, Math.round(Number(nextPercent) || 70)));
    updateReceiptConfig({ receiptCutPercent: value, partialCutBetweenReceipts: true });
  };
  const toggleReceiptCut = () => {
    const nextEnabled = !receiptCutEnabled;
    updateReceiptConfig({
      receiptCutPercent: nextEnabled ? receiptCutSliderValue : 0,
      partialCutBetweenReceipts: nextEnabled,
    });
  };

  const handleSaveReceiptSettings = async () => {
    setReceiptSettingsSaving(true);
    await saveSettings(token, 'receipt_config', receiptConfig);
    setReceiptSettingsSaving(false);
  };

  const recordPrintedTickets = async (ticketIds) => {
    const uniqueTicketIds = [...new Set(ticketIds)];
    if (uniqueTicketIds.length === 0) return;
    setMarkingPrinted(true);
    setPrintStatusMessage(`Recording ${uniqueTicketIds.length} printed ticket(s)...`);
    const result = await markAdminBulkTicketsPrinted(token, uniqueTicketIds);
    setMarkingPrinted(false);
    if (!result.ok) {
      setPrintStatusMessage('Print opened, but its printed status could not be saved. Use “Mark Selected Printed” to retry.');
      return;
    }
    setPrintStatusMessage(`${uniqueTicketIds.length} ticket(s) recorded as printed.`);
    await handleLoadBulkTickets();
  };

  const handlePrintThermalReceipts = () => {
    if (selectedReceiptBookings.length === 0) return;
    const printedTicketIds = selectedTickets.map(ticket => ticket.id);
    // The browser can't tell Print from Cancel, so confirm before recording —
    // otherwise a cancelled dialog silently marked every ticket as printed.
    printBulkBookingReceipts(selectedReceiptBookings, receiptConfig, () => {
      if (window.confirm(`Mark ${printedTicketIds.length} ticket(s) as printed?\n\nChoose Cancel if you cancelled the print dialog.`)) {
        recordPrintedTickets(printedTicketIds);
      }
    });
  };

  const handleLoadBulkTicketsAndScroll = async () => {
    scrollAfterBulkLoadRef.current = true;
    await handleLoadBulkTickets();
  };

  const handlePrintSpecialPaper = () => {
    if (!bulkData?.sessions || !hasPrintableSelectedTickets) return;
    const body = buildSpecialPaperPrintBody(bulkData.sessions, selectedTicketsForPrint, printParts);
    if (!body) return;
    const printedTicketIds = selectedTicketsForPrint.map(ticket => ticket.id);
    writeSpecialPaperPrintDocument(body, () => {
      if (window.confirm(`Mark ${printedTicketIds.length} ticket(s) as printed?\n\nChoose Cancel if you cancelled the print dialog.`)) {
        recordPrintedTickets(printedTicketIds);
      }
    });
  };

  const handleMarkPrinted = async () => {
    if (selectedTickets.length === 0) return;
    if (!confirmAdminAction({
      action: 'Mark selected tickets as printed',
      details: [`Tickets selected: ${selectedTickets.length}`],
      warning: 'These tickets will be recorded as printed in the admin system.',
    })) return;
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
            <div ref={bulkPrintTopRef} className="bg-white rounded-xl p-5 shadow-sm mb-4 no-print scroll-mt-4">
              <h3 className="font-semibold text-brand-blue mb-3">Bulk Print Tickets</h3>
              <p className="text-sm text-gray-500 mb-4">
                Step 1: pick the departments and dates, then load the paid tickets. Step 2: choose Special Paper or Thermal Copy below and print.
                Regular and special bingo print 3 per sheet; live events / venues print 6 per sheet.
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="min-w-[260px]">
                  <label className="block text-xs text-gray-400 mb-1">Departments</label>
                  <div className="flex flex-wrap gap-2">
                    {DEPARTMENT_OPTIONS.map(option => (
                      <label key={option.value} className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm bg-white">
                        <input
                          type="checkbox"
                          checked={selectedDepartments.includes(option.value)}
                          onChange={() => toggleDepartment(option.value)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
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
                <button onClick={handleLoadBulkTicketsAndScroll} disabled={!bulkDateFrom || bulkLoading}
                  className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40">
                  {bulkLoading ? 'Loading...' : 'Load Tickets'}
                </button>
              </div>
            </div>

            {bulkData && bulkData.error && (
              <div className="bg-red-50 text-red-700 rounded-xl p-4 mb-4">
                <p className="text-sm font-medium">{bulkData.error}</p>
              </div>
            )}

            {bulkData && !bulkData.error && bulkData.totalTickets === 0 && (
              <div className="bg-white rounded-xl p-8 shadow-sm text-center">
                <p className="text-gray-400">No paid {departmentLabel.toLowerCase()} tickets found for the selected date range.</p>
              </div>
            )}

            {bulkData && !bulkData.error && bulkData.totalTickets > 0 && (
              <div>
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 no-print">
                  <div className="flex flex-wrap justify-between gap-3 items-start">
                    <div>
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold text-brand-blue">{bulkData.totalTickets}</span> ticket(s) across{' '}
                        <span className="font-semibold">{bulkData.sessions.length}</span> session(s) from{' '}
                        <span className="font-medium">{bulkData.dateFrom}</span> to <span className="font-medium">{bulkData.dateTo}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {departmentLabel}. {unprintedCount} unprinted / {printedCount} printed. Selected: {selectedTickets.length}.
                      </p>
                      {printStatusMessage && (
                        <p className={`text-xs mt-1 ${printStatusMessage.includes('could not') ? 'text-red-600' : 'text-green-700'}`}>
                          {printStatusMessage}
                        </p>
                      )}
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

                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 no-print">
                  <div className="flex flex-wrap justify-between gap-3 items-start">
                    <div>
                      <p className="text-sm font-semibold text-brand-blue mb-1">Special Paper Print</p>
                      <p className="text-xs text-gray-500">
                        Prints the selected tickets on the pre-printed special paper: 3 per sheet with 2 copies, 6 per sheet with 1 copy. Copies per Ticket and Print Order apply to this print only.
                      </p>
                    </div>
                    <button
                      onClick={handlePrintSpecialPaper}
                      disabled={!hasPrintableSelectedTickets}
                      className="px-3 py-1.5 text-xs bg-brand-blue text-white rounded-lg hover:bg-brand-blue/90 disabled:opacity-40"
                    >
                      Print Special Paper ({selectedTickets.length})
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 items-end">
                    <label className="text-sm text-gray-700">
                      <span className="block text-xs text-gray-400 mb-1">Copies per Ticket</span>
                      <select
                        value={printCopyMode}
                        onChange={e => updatePrintCopyMode(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="both">2 copies — Name + Seat (usual)</option>
                        <option value="single">1 copy — Complete ticket (6 per sheet)</option>
                      </select>
                    </label>
                    <label className="text-sm text-gray-700">
                      <span className="block text-xs text-gray-400 mb-1">Print Order</span>
                      <select
                        value={printSort}
                        onChange={e => setPrintSort(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="seat">Table / seat order</option>
                        <option value="name">Alphabetical by name</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 no-print">
                  <div className="flex flex-wrap justify-between gap-3 items-start">
                    <div>
                      <p className="text-sm font-semibold text-brand-blue mb-1">Thermal Copy Print</p>
                      <p className="text-xs text-gray-500">
                        Thermal copy uses the selected tickets. Regular bingo prints one cut-ready receipt per person.
                      </p>
                    </div>
                    <button
                      onClick={handlePrintThermalReceipts}
                      disabled={selectedReceiptBookings.length === 0}
                      className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-40"
                    >
                      Print Thermal Copy ({selectedReceiptBookings.length})
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 items-center">
                    <label className="text-sm text-gray-700">
                      <span className="block text-xs text-gray-400 mb-1">Paper Width</span>
                      <select
                        value={receiptConfig.paperWidth}
                        onChange={e => updateReceiptConfig({ paperWidth: e.target.value })}
                        className="px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="58mm">58mm</option>
                        <option value="80mm">80mm</option>
                      </select>
                    </label>
                    {[
                      { key: 'showRefNumber', label: 'References' },
                      { key: 'showTableChair', label: 'Table / Seat' },
                      { key: 'showPackagePrice', label: 'Prices' },
                      { key: 'showAddons', label: 'Add-ons' },
                      { key: 'showTimestamp', label: 'Timestamp' },
                    ].map(option => (
                      <label key={option.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={receiptConfig[option.key]}
                          onChange={e => updateReceiptConfig({ [option.key]: e.target.checked })}
                        />
                        {option.label}
                      </label>
                    ))}
                    <div className="flex min-w-[260px] flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-gray-400">Cut After Each Receipt</span>
                        <button
                          type="button"
                          onClick={toggleReceiptCut}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${receiptCutEnabled ? 'bg-brand-blue text-white border-brand-blue' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'}`}
                        >
                          {receiptCutEnabled ? 'Cut On' : 'Cut Off'}
                        </button>
                      </div>
                      <div className={`flex items-center gap-3 ${receiptCutEnabled ? '' : 'opacity-45'}`}>
                        <input
                          type="range"
                          min="1"
                          max="99"
                          step="1"
                          value={receiptCutSliderValue}
                          disabled={!receiptCutEnabled}
                          onChange={e => updateReceiptCut(e.target.value)}
                          className="w-full accent-brand-blue"
                        />
                        <span className="w-12 text-right text-sm font-semibold text-gray-700">{receiptCutSliderValue}%</span>
                      </div>
                    </div>
                    <button
                      onClick={handleSaveReceiptSettings}
                      disabled={receiptSettingsSaving}
                      className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40"
                    >
                      {receiptSettingsSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                </div>

                <BulkTicketTable visibleTickets={visibleTickets} selectedTicketIds={selectedTicketIds} toggleTicket={toggleTicket} />

              </div>
            )}

            <WalkInTicketsPanel />

            <style>{BULK_PRINT_PAGE_CSS}</style>
          </div>
        )}

    </>
  );
}
