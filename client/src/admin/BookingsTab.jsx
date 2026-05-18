import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

export default function BookingsTab() {
  const {
    tab,
    sessions,
    formatPrice,
    bookingSales,
    handleSalesDrilldown,
    dailySalesSearch,
    setDailySalesSearch,
    loadDailySales,
    dailySalesDate,
    setDailySalesDate,
    dailySales,
    handlePrintDailySalesReceipt,
    handleClearTestBookings,
    bookings,
  } = useAdminDashboard();
  const bingoSales = bookingSales.filter(sale => sale.sessionType !== 'event');

  return (
    <>
        {/* BOOKINGS TAB — Booking Sales Summary */}
        {tab === 'bookings' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-semibold text-brand-blue">Booking Sales</h3>
                <button
                  type="button"
                  onClick={handleClearTestBookings}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Clear Test Bookings
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
                        </tr>
                      </thead>
                      <tbody>
                        {bingoSales.map((sale, idx) => (
                          <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50/50">
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
                                  onClick={() => handleSalesDrilldown(sale)}
                                  className="text-brand-blue underline hover:text-blue-800 font-semibold cursor-pointer min-w-[32px] inline-block"
                                >
                                  {sale.quantity}
                                </button>
                              ) : (
                                <span className="text-gray-400">0</span>
                              )}
                            </td>
                            <td className="py-2.5 text-right pr-2 font-medium text-gray-800">{sale.totalFormatted}</td>
                          </tr>
                        ))}
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
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Daily Sales Report */}
            <div className="bg-white rounded-xl p-5 shadow-sm mt-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-semibold text-brand-blue">Daily Sales</h3>
                <div className="flex items-center gap-3 flex-wrap">
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
            </div>
          </div>
        )}
    </>
  );
}


