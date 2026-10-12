import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';
import { formatLocalDateStr } from '../utils/formatters';
import SalesPanel from './SalesPanel';

// Daily Sales board on Sales & Transactions: day / multi-day / week / month
// report with search, totals and the printable receipt. Moved verbatim from
// BookingsTab.
export default function DailySalesBoard() {
  const {
    dailySales,
    dailySalesSearch,
    setDailySalesSearch,
    loadDailySales,
    dailySalesDate,
    setDailySalesDate,
    dailySalesDateTo,
    setDailySalesDateTo,
    dailySalesRange,
    setDailySalesRange,
    handlePrintDailySalesReceipt,
  } = useAdminDashboard();
  const dailySubtotalWithoutServiceCharges = dailySales?.subtotalWithoutServiceChargesFormatted || dailySales?.grandTotalFormatted || 'CA$0.00';
  const dailyServiceChargeSubtotal = dailySales?.serviceChargeSubtotalFormatted || 'CA$0.00';
  const dailyTotalWithServiceCharges = dailySales?.totalWithServiceChargesFormatted || dailySales?.grandTotalFormatted || 'CA$0.00';
  const addDays = (dateText, days) => {
    const date = new Date(`${dateText}T00:00:00`);
    date.setDate(date.getDate() + days);
    return formatLocalDateStr(date);
  };
  const dailySalesRangeLabel = dailySales?.rangeLabel || dailySalesDate;
  const dailySalesReportTitle = dailySales?.reportTitle || 'Daily Sales Report';
  const getDailySalesFilters = (overrides = {}) => {
    const range = overrides.range || dailySalesRange;
    const date = overrides.date || dailySalesDate;
    const dateFrom = overrides.dateFrom || date;
    const dateTo = overrides.dateTo || dailySalesDateTo || dateFrom;
    const search = overrides.search ?? dailySalesSearch;
    if (range === 'multi-day') return { range, dateFrom, dateTo, search };
    return { range, date, search };
  };
  const refreshDailySales = (overrides = {}) => loadDailySales(getDailySalesFilters(overrides));
  const updateDailySalesRange = (range) => {
    setDailySalesRange(range);
    const overrides = { range };
    if (range === 'multi-day' && dailySalesDateTo < dailySalesDate) {
      const nextDateTo = addDays(dailySalesDate, 6);
      setDailySalesDateTo(nextDateTo);
      overrides.dateTo = nextDateTo;
    }
    refreshDailySales(overrides);
  };

  return (
    <SalesPanel
      title="Daily Sales"
      description="Ticket-level reports by day, custom date range, week, or month, including attendee names, seats, packages, add-ons, export, print, and receipt tools."
    >
      <div className="flex items-center gap-3 flex-wrap mb-4 pt-4">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            {[
              ['daily', 'Daily'],
              ['multi-day', 'Multi-day'],
              ['weekly', 'Weekly'],
              ['monthly', 'Monthly'],
            ].map(([range, label]) => (
              <button
                key={range}
                type="button"
                onClick={() => updateDailySalesRange(range)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  dailySalesRange === range
                    ? 'bg-brand-blue text-white shadow-sm'
                    : 'text-gray-600 hover:bg-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search by name..."
            value={dailySalesSearch}
            onChange={e => { setDailySalesSearch(e.target.value); refreshDailySales({ search: e.target.value }); }}
            className="px-3 py-1.5 border rounded-lg text-sm w-48"
          />
          <input
            type="date"
            value={dailySalesDate}
            onChange={e => {
              setDailySalesDate(e.target.value);
              const overrides = { date: e.target.value, dateFrom: e.target.value };
              if (dailySalesRange === 'multi-day' && dailySalesDateTo < e.target.value) {
                const nextDateTo = e.target.value;
                setDailySalesDateTo(nextDateTo);
                overrides.dateTo = nextDateTo;
              }
              refreshDailySales(overrides);
            }}
            className="px-3 py-1.5 border rounded-lg text-sm"
          />
          {dailySalesRange === 'multi-day' && (
            <>
              <span className="text-sm text-gray-500">to</span>
              <input
                type="date"
                value={dailySalesDateTo}
                min={dailySalesDate}
                onChange={e => { setDailySalesDateTo(e.target.value); refreshDailySales({ dateTo: e.target.value }); }}
                className="px-3 py-1.5 border rounded-lg text-sm"
              />
            </>
          )}
          {dailySales && (
            <span className="text-sm text-gray-500">
              Showing {dailySalesRangeLabel}
            </span>
          )}
          {dailySales && dailySales.items.length > 0 && (
            <button
              onClick={() => {
                const rows = [['#', 'Reference', 'Name', 'Table', 'Chair', 'Package', 'Add-ons', 'Session', 'Price', 'Time']];
                const subtotalWithoutServiceCharges = dailySales.subtotalWithoutServiceChargesFormatted || dailySales.grandTotalFormatted;
                const serviceChargeSubtotal = dailySales.serviceChargeSubtotalFormatted || 'CA$0.00';
                const totalWithServiceCharges = dailySales.totalWithServiceChargesFormatted || dailySales.grandTotalFormatted;
                for (const item of dailySales.items) {
                  const addonText = item.addons && item.addons.length > 0 ? item.addons.map(a => `${a.packageName} x${a.quantity} (${a.priceFormatted})`).join('; ') : '';
                  const addonTotal = item.addons ? item.addons.reduce((s, a) => s + a.price, 0) : 0;
                  const totalPrice = 'CA$' + ((item.itemPrice + addonTotal) / 100).toFixed(2);
                  rows.push([item.rowNum, item.referenceNumber, `${item.firstName} ${item.lastName}`, item.tableNumber, item.chairNumber, item.packageName || '', addonText, item.description, totalPrice, new Date(item.createdAt).toLocaleTimeString()]);
                }
                if (dailySales.addonSubtotal > 0) {
                  rows.push(['', '', '', '', '', '', '', 'Package Subtotal', dailySales.packageSubtotalFormatted, '']);
                  rows.push(['', '', '', '', '', '', '', 'Add-ons Subtotal', dailySales.addonSubtotalFormatted, '']);
                }
                rows.push(['', '', '', '', '', '', '', 'Subtotal without service charges', subtotalWithoutServiceCharges, '']);
                rows.push(['', '', '', '', '', '', '', 'Service charges', serviceChargeSubtotal, '']);
                rows.push(['', '', '', '', '', '', '', 'Total with service charges', totalWithServiceCharges, `${dailySales.totalTickets} tickets / ${dailySales.totalBookings} bookings`]);
                const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `sales-report-${dailySales.rangeLabel || dailySales.date}.csv`;
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
                const subtotalWithoutServiceCharges = dailySales.subtotalWithoutServiceChargesFormatted || dailySales.grandTotalFormatted;
                const serviceChargeSubtotal = dailySales.serviceChargeSubtotalFormatted || 'CA$0.00';
                const totalWithServiceCharges = dailySales.totalWithServiceChargesFormatted || dailySales.grandTotalFormatted;
                w.document.write(`<html><head><title>${dailySalesReportTitle} - ${dailySalesRangeLabel}</title>
                  <style>body{font-family:Arial,sans-serif;padding:20px;color:#333}
                  h2{margin:0 0 4px}p.sub{color:#666;font-size:14px;margin:0 0 16px}
                  table{width:100%;border-collapse:collapse;font-size:13px}
                  th{text-align:left;color:#666;border-bottom:2px solid #ddd;padding:8px 4px;font-weight:600}
                  td{padding:6px 4px;border-bottom:1px solid #f0f0f0}
                  .right{text-align:right}.center{text-align:center}
                  tfoot td{border-top:2px solid #333;font-weight:bold;padding-top:10px}
                  @media print{body{padding:0;color:#000;background:#fff}*,*::before,*::after{color:#000!important;background:#fff!important;border-color:#000!important;box-shadow:none!important;text-shadow:none!important}}</style></head><body>`);
                w.document.write(`<h2>${dailySalesReportTitle}</h2><p class="sub">${dailySalesRangeLabel} — ${dailySales.totalTickets} ticket(s) / ${dailySales.totalBookings} booking(s) — ${totalWithServiceCharges}</p>`);
                w.document.write('<table><thead><tr><th>#</th><th>Reference</th><th>Name</th><th>Table</th><th>Chair</th><th>Package</th><th>Add-ons</th><th>Session</th><th class="right">Price</th><th>Time</th></tr></thead><tbody>');
                for (const item of dailySales.items) {
                  const addonText = item.addons && item.addons.length > 0 ? item.addons.map(a => `${a.packageName} x${a.quantity} (${a.priceFormatted})`).join(', ') : '';
                  const addonTotal = item.addons ? item.addons.reduce((s, a) => s + a.price, 0) : 0;
                  const totalPrice = 'CA$' + ((item.itemPrice + addonTotal) / 100).toFixed(2);
                  w.document.write(`<tr><td>${item.rowNum}</td><td style="font-family:monospace">${item.referenceNumber}</td><td>${item.firstName} ${item.lastName}</td><td class="center">${item.tableNumber}</td><td class="center">${item.chairNumber}</td><td>${item.packageName || ''}</td><td style="font-size:11px">${addonText}</td><td>${item.description}</td><td class="right">${totalPrice}</td><td>${new Date(item.createdAt).toLocaleTimeString()}</td></tr>`);
                }
                let footerHtml = '</tbody><tfoot>';
                if (dailySales.addonSubtotal > 0) {
                  footerHtml += `<tr><td colspan="8" style="border-top:1px solid #ddd;font-weight:normal;color:#555">Package Subtotal</td><td class="right" style="border-top:1px solid #ddd;color:#555">${dailySales.packageSubtotalFormatted}</td><td style="border-top:1px solid #ddd"></td></tr>`;
                  footerHtml += `<tr><td colspan="8" style="border-top:none;font-weight:normal;color:#555">Add-ons Subtotal</td><td class="right" style="border-top:none;color:#555">${dailySales.addonSubtotalFormatted}</td><td></td></tr>`;
                }
                footerHtml += `<tr><td colspan="8" style="border-top:1px solid #ddd;font-weight:normal;color:#555">Subtotal without service charges</td><td class="right" style="border-top:1px solid #ddd;color:#555">${subtotalWithoutServiceCharges}</td><td style="border-top:1px solid #ddd"></td></tr>`;
                footerHtml += `<tr><td colspan="8" style="border-top:none;font-weight:normal;color:#555">Service charges</td><td class="right" style="border-top:none;color:#555">${serviceChargeSubtotal}</td><td></td></tr>`;
                footerHtml += `<tr><td colspan="8">TOTAL WITH SERVICE CHARGES</td><td class="right">${totalWithServiceCharges}</td><td>${dailySales.totalTickets} tickets</td></tr></tfoot></table>`;
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
              title="Print the selected day's sales as a thermal report"
            >
              Print Daily Report
            </button>
          )}
      </div>

      {dailySales && dailySales.items.length > 0 && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="px-4 py-3 border-b sm:border-r sm:border-b-0 border-gray-200">
            <p className="text-xs font-medium uppercase text-gray-400">Packages</p>
            <p className="mt-1 text-lg font-semibold text-gray-800">{dailySales.packageSubtotalFormatted}</p>
          </div>
          <div className="px-4 py-3 border-b lg:border-r lg:border-b-0 border-gray-200">
            <p className="text-xs font-medium uppercase text-gray-400">Add-ons</p>
            <p className="mt-1 text-lg font-semibold text-gray-800">{dailySales.addonSubtotalFormatted}</p>
          </div>
          <div className="px-4 py-3 border-b sm:border-r sm:border-b-0 border-gray-200">
            <p className="text-xs font-medium uppercase text-gray-400">Subtotal no service</p>
            <p className="mt-1 text-lg font-semibold text-gray-800">{dailySubtotalWithoutServiceCharges}</p>
          </div>
          <div className="px-4 py-3 border-b lg:border-r lg:border-b-0 border-gray-200 bg-amber-50">
            <p className="text-xs font-medium uppercase text-amber-700">Service charges</p>
            <p className="mt-1 text-lg font-semibold text-amber-800">{dailyServiceChargeSubtotal}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs font-medium uppercase text-gray-400">Total with service</p>
            <p className="mt-1 text-lg font-semibold text-brand-gold">{dailyTotalWithServiceCharges}</p>
          </div>
        </div>
      )}

      {!dailySales ? (
        <p className="text-gray-400 text-center py-8">Loading...</p>
      ) : dailySales.items.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No sales for {dailySalesRangeLabel}{dailySalesSearch ? ` matching "${dailySalesSearch}"` : ''}</p>
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
                const totalPrice = 'CA$' + ((item.itemPrice + addonTotal) / 100).toFixed(2);
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
              <tr className="border-t border-gray-200">
                <td className="py-2 pl-2" colSpan={8}>
                  <span className="text-sm text-gray-600">Subtotal without service charges</span>
                </td>
                <td className="py-2 text-right text-sm font-medium text-gray-700">{dailySales.subtotalWithoutServiceChargesFormatted || dailySales.grandTotalFormatted}</td>
                <td></td>
              </tr>
              <tr>
                <td className="py-2 pl-2" colSpan={8}>
                  <span className="text-sm text-gray-600">Service charges</span>
                </td>
                <td className="py-2 text-right text-sm font-medium text-gray-700">{dailySales.serviceChargeSubtotalFormatted || '$0.00'}</td>
                <td></td>
              </tr>
              <tr className={dailySales.addonSubtotal > 0 ? "border-t border-gray-300" : "border-t-2 border-gray-200"}>
                <td className="py-3 pl-2" colSpan={8}>
                  <span className="font-semibold text-brand-blue">Total with service charges</span>
                  <span className="text-xs text-gray-500 ml-2">({dailySales.totalTickets} tickets / {dailySales.totalBookings} bookings)</span>
                </td>
                <td className="py-3 text-right font-bold text-brand-gold">{dailySales.totalWithServiceChargesFormatted || dailySales.grandTotalFormatted}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </SalesPanel>
  );
}
