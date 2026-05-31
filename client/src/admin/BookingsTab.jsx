import React, { useState } from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

function SalesPanel({ title, description, children }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-brand-blue">{title}</h3>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>
      <div className="px-5 pb-5">
        {children}
      </div>
    </section>
  );
}

export default function BookingsTab() {
  const {
    tab,
    formatPrice,
    bookingSales,
    handleSalesDrilldown,
    dailySalesSearch,
    setDailySalesSearch,
    loadDailySales,
    dailySalesDate,
    setDailySalesDate,
    dailySales,
    transactions,
    transactionFilters,
    setTransactionFilters,
    loadTransactions,
    handlePrintDailySalesReceipt,
    handleReprintTransactionReceipt,
    handleClearTestBookings,
    handleResetSalesReporting,
  } = useAdminDashboard();
  const [activeBoard, setActiveBoard] = useState('dailySales');
  const bingoSales = bookingSales.filter(sale => sale.sessionType !== 'event');
  const transactionRows = transactions?.items || [];
  const transactionSummary = transactions?.summary || {};
  const salesBoards = [
    {
      id: 'dailySales',
      label: 'Daily Sales',
      description: dailySales ? `${dailySales.totalTickets || 0} ticket(s) today` : 'Daily report',
    },
    {
      id: 'bookingSales',
      label: 'Booking Sales',
      description: `${bingoSales.reduce((sum, sale) => sum + sale.quantity, 0)} ticket(s)`,
    },
    {
      id: 'transactions',
      label: 'Transactions',
      description: `${transactionSummary.totalTransactions || 0} transaction(s)`,
    },
  ];
  const updateTransactionFilter = (key, value) => {
    const next = { ...transactionFilters, [key]: value };
    setTransactionFilters(next);
    loadTransactions(next);
  };
  const resetTransactionFilters = () => {
    const next = { dateFrom: '', dateTo: '', status: 'all', search: '' };
    setTransactionFilters(next);
    loadTransactions(next);
  };
  const formatTransactionDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  };
  const statusClass = (status) => {
    if (status === 'paid') return 'bg-green-100 text-green-700';
    if (status === 'refunded' || status === 'voided') return 'bg-red-100 text-red-700';
    if (status === 'partially_refunded') return 'bg-amber-100 text-amber-700';
    if (status === 'pending') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  };
  const canPrintTransactionReceipt = (status) => ['paid', 'partially_refunded', 'refunded', 'voided'].includes(status);
  return (
    <>
        {/* BOOKINGS TAB - Sales & Transactions */}
        {tab === 'bookings' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2" role="tablist" aria-label="Sales and transactions views">
                {salesBoards.map(board => {
                  const active = activeBoard === board.id;
                  return (
                    <button
                      key={board.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveBoard(board.id)}
                      className={`text-left rounded-lg px-4 py-3 border transition-colors ${
                        active
                          ? 'bg-brand-blue text-white border-brand-blue shadow-sm'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span className="block font-semibold text-sm">{board.label}</span>
                      <span className={`block text-xs mt-1 ${active ? 'text-white/80' : 'text-gray-500'}`}>{board.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {activeBoard === 'bookingSales' && (
            <SalesPanel
              title="Booking Sales"
              description="Session-by-session sales totals for bingo bookings, with ticket counts you can click to drill into purchasers."
            >
              <div className="flex items-center justify-end gap-3 mb-4 pt-4">
                <button
                  type="button"
                  onClick={handleClearTestBookings}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Go-Live Cleanup
                </button>
              </div>
              {bingoSales.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No sessions found</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 border-b">
                          <th className="pb-2 pl-2">#</th>
                          <th className="pb-2">Description</th>
                          <th className="pb-2 text-center">Quantity</th>
                          <th className="pb-2 text-right pr-2">Amount</th>
                          <th className="pb-2 text-right pr-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bingoSales.map((sale, idx) => {
                          const canOpen = sale.quantity > 0;
                          return (
                          <tr
                            key={sale.id}
                            onClick={() => canOpen && handleSalesDrilldown(sale)}
                            onKeyDown={e => {
                              if (canOpen && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                handleSalesDrilldown(sale);
                              }
                            }}
                            role={canOpen ? 'button' : undefined}
                            tabIndex={canOpen ? 0 : undefined}
                            className={`border-b border-gray-50 hover:bg-gray-50/50 ${canOpen ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-blue/30' : ''}`}
                          >
                            <td className="py-2.5 pl-2 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="py-2.5">
                              <span className="font-medium text-gray-800">{sale.description}</span>
                              {sale.isSpecialEvent && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-medium">Live Event / Venue</span>
                              )}
                            </td>
                            <td className="py-2.5 text-center">
                              {sale.quantity > 0 ? (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleSalesDrilldown(sale);
                                  }}
                                  className="text-brand-blue underline hover:text-blue-800 font-semibold cursor-pointer min-w-[32px] inline-block"
                                >
                                  {sale.quantity}
                                </button>
                              ) : (
                                <span className="text-gray-400">0</span>
                              )}
                            </td>
                            <td className="py-2.5 text-right pr-2 font-medium text-gray-800">{sale.totalFormatted}</td>
                            <td className="py-2.5 text-right pr-2">
                              {canOpen ? (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleSalesDrilldown(sale);
                                  }}
                                  className="px-3 py-1.5 text-xs bg-brand-blue text-white rounded-lg hover:bg-blue-800 font-semibold"
                                >
                                  View / Refund
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200">
                          <td className="py-3 pl-2" colSpan={2}>
                            <span className="font-semibold text-brand-blue">Total</span>
                          </td>
                          <td className="py-3 text-center font-bold text-brand-blue">
                            {bingoSales.reduce((sum, s) => sum + s.quantity, 0)}
                          </td>
                          <td className="py-3 text-right pr-2 font-bold text-brand-gold">
                            {formatPrice(bingoSales.reduce((sum, s) => sum + s.totalAmount, 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </SalesPanel>
            )}

            {/* Transactions Summary */}
            {activeBoard === 'transactions' && (
            <SalesPanel
              title="Transactions & Refund Summary"
              description="All payment activity in one place, including paid bookings, refunds, voids, pending payments, failed payments, gross sales, and net total."
            >
              <div className="border border-blue-100 bg-blue-50 text-blue-900 rounded-lg px-3 py-2 text-xs leading-relaxed mb-4">
                <span className="font-semibold">Definition:</span> Transactions are payment records listed by payment activity date. They can include bookings for today or future sessions. Archive is separate: a booking appears there only after its session date has passed and that session is archived.
              </div>
              <div className="flex items-center gap-2 flex-wrap mb-4 pt-4">
                  <input
                    type="text"
                    placeholder="Search ref, name, email..."
                    value={transactionFilters.search}
                    onChange={e => updateTransactionFilter('search', e.target.value)}
                    className="px-3 py-1.5 border rounded-lg text-sm w-56"
                  />
                  <input
                    type="date"
                    value={transactionFilters.dateFrom}
                    onChange={e => updateTransactionFilter('dateFrom', e.target.value)}
                    className="px-3 py-1.5 border rounded-lg text-sm"
                    title="From date"
                  />
                  <input
                    type="date"
                    value={transactionFilters.dateTo}
                    onChange={e => updateTransactionFilter('dateTo', e.target.value)}
                    className="px-3 py-1.5 border rounded-lg text-sm"
                    title="To date"
                  />
                  <select
                    value={transactionFilters.status}
                    onChange={e => updateTransactionFilter('status', e.target.value)}
                    className="px-3 py-1.5 border rounded-lg text-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="paid">Paid</option>
                    <option value="refunds">Refunds / Voids</option>
                    <option value="refunded">Refunded</option>
                    <option value="voided">Voided</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button
                    type="button"
                    onClick={resetTransactionFilters}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSalesReporting}
                    className="ml-auto px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Reset Sales Totals
                  </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-gray-500">Gross Sales</p>
                  <p className="font-bold text-gray-900">{transactionSummary.grossSalesFormatted || '$0.00'}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-gray-500">Refunds / Voids</p>
                  <p className="font-bold text-red-600">{transactionSummary.refundsFormatted || '$0.00'}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-gray-500">Net Total</p>
                  <p className="font-bold text-brand-gold">{transactionSummary.netTotalFormatted || '$0.00'}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-gray-500">Transactions</p>
                  <p className="font-bold text-brand-blue">{transactionSummary.totalTransactions || 0}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-gray-500">Pending / Failed</p>
                  <p className="font-bold text-gray-700">{(transactionSummary.pendingCount || 0) + (transactionSummary.failedCount || 0)}</p>
                </div>
              </div>

              {transactionRows.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No transactions found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b">
                        <th className="pb-2 pl-2">Date</th>
                        <th className="pb-2">Reference</th>
                        <th className="pb-2">Customer</th>
                        <th className="pb-2">Session</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Transaction ID</th>
                        <th className="pb-2 text-right pr-2">Amount</th>
                        <th className="pb-2 text-right pr-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactionRows.map(item => (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-2.5 pl-2 text-gray-500 text-xs whitespace-nowrap">{formatTransactionDate(item.transactionAt)}</td>
                          <td className="py-2.5 font-mono text-sm font-medium text-brand-blue">{item.referenceNumber}</td>
                          <td className="py-2.5">
                            <div className="font-medium text-gray-800">{item.customerName}</div>
                            <div className="text-xs text-gray-400">{item.email}</div>
                          </td>
                          <td className="py-2.5 text-gray-600 text-xs">
                            <div className="font-medium text-gray-700">{item.description}</div>
                            <div>{item.sessionDate} {item.sessionTime}</div>
                          </td>
                          <td className="py-2.5">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusClass(item.status)}`}>
                              {item.transactionType}
                            </span>
                          </td>
                          <td className="py-2.5 font-mono text-xs text-gray-500">{item.transactionId || '-'}</td>
                          <td className={`py-2.5 text-right pr-2 font-semibold ${item.amountEffect < 0 ? 'text-red-600' : item.amountEffect > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                            {item.amountEffectFormatted}
                          </td>
                          <td className="py-2.5 text-right pr-2">
                            {canPrintTransactionReceipt(item.status) ? (
                              <button
                                type="button"
                                onClick={() => handleReprintTransactionReceipt(item.id)}
                                className="px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-800"
                                title="Reprint thermal receipt"
                              >
                                Reprint Receipt
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SalesPanel>
            )}

            {/* Daily Sales Report */}
            {activeBoard === 'dailySales' && (
            <SalesPanel
              title="Daily Sales"
              description="A ticket-level report for one selected day, including attendee names, seats, packages, add-ons, export, print, and receipt tools."
            >
              <div className="flex items-center gap-3 flex-wrap mb-4 pt-4">
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={dailySalesSearch}
                    onChange={e => { setDailySalesSearch(e.target.value); loadDailySales(dailySalesDate, e.target.value); }}
                    className="px-3 py-1.5 border rounded-lg text-sm w-48"
                  />
                  <input
                    type="date"
                    value={dailySalesDate}
                    onChange={e => { setDailySalesDate(e.target.value); loadDailySales(e.target.value, dailySalesSearch); }}
                    className="px-3 py-1.5 border rounded-lg text-sm"
                  />
                  {dailySales && dailySales.items.length > 0 && (
                    <button
                      onClick={() => {
                        const rows = [['#', 'Reference', 'Name', 'Table', 'Chair', 'Package', 'Add-ons', 'Session', 'Price', 'Time']];
                        for (const item of dailySales.items) {
                          const addonText = item.addons && item.addons.length > 0 ? item.addons.map(a => `${a.packageName} x${a.quantity} (${a.priceFormatted})`).join('; ') : '';
                          const addonTotal = item.addons ? item.addons.reduce((s, a) => s + a.price, 0) : 0;
                          const totalPrice = '$' + ((item.itemPrice + addonTotal) / 100).toFixed(2);
                          rows.push([item.rowNum, item.referenceNumber, `${item.firstName} ${item.lastName}`, item.tableNumber, item.chairNumber, item.packageName || '', addonText, item.description, totalPrice, new Date(item.createdAt).toLocaleTimeString()]);
                        }
                        if (dailySales.addonSubtotal > 0) {
                          rows.push(['', '', '', '', '', '', 'Package Subtotal', dailySales.packageSubtotalFormatted, '']);
                          rows.push(['', '', '', '', '', '', 'Add-ons Subtotal', dailySales.addonSubtotalFormatted, '']);
                        }
                        rows.push(['', '', '', '', '', '', 'GRAND TOTAL', dailySales.grandTotalFormatted, `${dailySales.totalTickets} tickets / ${dailySales.totalBookings} bookings`]);
                        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `daily-sales-${dailySales.date}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Export CSV
                    </button>
                  )}
                  {dailySales && dailySales.items.length > 0 && (
                    <button
                      onClick={() => {
                        const w = window.open('', '_blank', 'width=900,height=600');
                        w.document.write(`<html><head><title>Daily Sales - ${dailySales.date}</title>
                          <style>body{font-family:Arial,sans-serif;padding:20px;color:#333}
                          h2{margin:0 0 4px}p.sub{color:#666;font-size:14px;margin:0 0 16px}
                          table{width:100%;border-collapse:collapse;font-size:13px}
                          th{text-align:left;color:#666;border-bottom:2px solid #ddd;padding:8px 4px;font-weight:600}
                          td{padding:6px 4px;border-bottom:1px solid #f0f0f0}
                          .right{text-align:right}.center{text-align:center}
                          tfoot td{border-top:2px solid #333;font-weight:bold;padding-top:10px}
                          @media print{body{padding:0}}</style></head><body>`);
                        w.document.write(`<h2>Daily Sales Report</h2><p class="sub">${dailySales.date} — ${dailySales.totalTickets} ticket(s) / ${dailySales.totalBookings} booking(s) — ${dailySales.grandTotalFormatted}</p>`);
                        w.document.write('<table><thead><tr><th>#</th><th>Reference</th><th>Name</th><th>Table</th><th>Chair</th><th>Package</th><th>Add-ons</th><th>Session</th><th class="right">Price</th><th>Time</th></tr></thead><tbody>');
                        for (const item of dailySales.items) {
                          const addonText = item.addons && item.addons.length > 0 ? item.addons.map(a => `${a.packageName} x${a.quantity} (${a.priceFormatted})`).join(', ') : '';
                          const addonTotal = item.addons ? item.addons.reduce((s, a) => s + a.price, 0) : 0;
                          const totalPrice = '$' + ((item.itemPrice + addonTotal) / 100).toFixed(2);
                          w.document.write(`<tr><td>${item.rowNum}</td><td style="font-family:monospace">${item.referenceNumber}</td><td>${item.firstName} ${item.lastName}</td><td class="center">${item.tableNumber}</td><td class="center">${item.chairNumber}</td><td>${item.packageName || ''}</td><td style="font-size:11px">${addonText}</td><td>${item.description}</td><td class="right">${totalPrice}</td><td>${new Date(item.createdAt).toLocaleTimeString()}</td></tr>`);
                        }
                        let footerHtml = '</tbody><tfoot>';
                        if (dailySales.addonSubtotal > 0) {
                          footerHtml += `<tr><td colspan="8" style="border-top:1px solid #ddd;font-weight:normal;color:#555">Package Subtotal</td><td class="right" style="border-top:1px solid #ddd;color:#555">${dailySales.packageSubtotalFormatted}</td><td style="border-top:1px solid #ddd"></td></tr>`;
                          footerHtml += `<tr><td colspan="8" style="border-top:none;font-weight:normal;color:#555">Add-ons Subtotal</td><td class="right" style="border-top:none;color:#555">${dailySales.addonSubtotalFormatted}</td><td></td></tr>`;
                        }
                        footerHtml += `<tr><td colspan="8">GRAND TOTAL</td><td class="right">${dailySales.grandTotalFormatted}</td><td>${dailySales.totalTickets} tickets</td></tr></tfoot></table>`;
                        w.document.write(footerHtml);
                        w.document.write('</body></html>');
                        w.document.close();
                        w.print();
                      }}
                      className="px-3 py-1.5 text-sm bg-brand-blue text-white rounded-lg hover:bg-blue-800"
                    >
                      Print
                    </button>
                  )}
                  {dailySales && dailySales.items.length > 0 && (
                    <button
                      onClick={handlePrintDailySalesReceipt}
                      className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800"
                      title="Print as thermal receipt"
                    >
                      Receipt
                    </button>
                  )}
              </div>

              {!dailySales ? (
                <p className="text-gray-400 text-center py-8">Loading...</p>
              ) : dailySales.items.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No sales for {dailySales.date}{dailySalesSearch ? ` matching "${dailySalesSearch}"` : ''}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b">
                        <th className="pb-2 pl-2">#</th>
                        <th className="pb-2">Reference</th>
                        <th className="pb-2">Name</th>
                        <th className="pb-2 text-center">Table</th>
                        <th className="pb-2 text-center">Chair</th>
                        <th className="pb-2">Package</th>
                        <th className="pb-2">Add-ons</th>
                        <th className="pb-2">Session</th>
                        <th className="pb-2 text-right">Price</th>
                        <th className="pb-2 text-right pr-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailySales.items.map(item => {
                        const addonTotal = item.addons ? item.addons.reduce((s, a) => s + a.price, 0) : 0;
                        const totalPrice = '$' + ((item.itemPrice + addonTotal) / 100).toFixed(2);
                        return (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-2.5 pl-2 text-gray-400 text-xs">{item.rowNum}</td>
                          <td className="py-2.5 font-mono text-sm font-medium text-brand-blue">{item.referenceNumber}</td>
                          <td className="py-2.5 text-gray-800 font-medium">{item.firstName} {item.lastName}</td>
                          <td className="py-2.5 text-center">{item.tableNumber}</td>
                          <td className="py-2.5 text-center">{item.chairNumber}</td>
                          <td className="py-2.5 text-gray-600 text-xs">{item.packageName || ''}</td>
                          <td className="py-2.5 text-gray-600 text-xs">
                            {item.addons && item.addons.length > 0 ? item.addons.map((a, i) => (
                              <div key={i}>{a.packageName} x{a.quantity} ({a.priceFormatted})</div>
                            )) : ''}
                          </td>
                          <td className="py-2.5 text-gray-600 text-xs">{item.description}</td>
                          <td className="py-2.5 text-right font-medium text-gray-800">{totalPrice}</td>
                          <td className="py-2.5 text-right pr-2 text-gray-500 text-xs">{new Date(item.createdAt).toLocaleTimeString()}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {dailySales.addonSubtotal > 0 && (
                        <>
                          <tr className="border-t border-gray-200">
                            <td className="py-2 pl-2" colSpan={8}>
                              <span className="text-sm text-gray-600">Package Subtotal</span>
                            </td>
                            <td className="py-2 text-right text-sm font-medium text-gray-700">{dailySales.packageSubtotalFormatted}</td>
                            <td></td>
                          </tr>
                          <tr>
                            <td className="py-2 pl-2" colSpan={8}>
                              <span className="text-sm text-gray-600">Add-ons Subtotal</span>
                            </td>
                            <td className="py-2 text-right text-sm font-medium text-gray-700">{dailySales.addonSubtotalFormatted}</td>
                            <td></td>
                          </tr>
                        </>
                      )}
                      <tr className={dailySales.addonSubtotal > 0 ? "border-t border-gray-300" : "border-t-2 border-gray-200"}>
                        <td className="py-3 pl-2" colSpan={8}>
                          <span className="font-semibold text-brand-blue">Grand Total</span>
                          <span className="text-xs text-gray-500 ml-2">({dailySales.totalTickets} tickets / {dailySales.totalBookings} bookings)</span>
                        </td>
                        <td className="py-3 text-right font-bold text-brand-gold">{dailySales.grandTotalFormatted}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </SalesPanel>
            )}
          </div>
        )}
    </>
  );
}
