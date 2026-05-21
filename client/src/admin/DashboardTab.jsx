import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

function getReceiptBadge(receipt) {
  if (receipt.sessionType === 'event' || receipt.notificationType === 'live_event_ticket') {
    return { label: 'Live Event', className: 'bg-blue-100 text-blue-800 border-blue-200' };
  }
  if (receipt.sessionType === 'special_bingo' || receipt.notificationType === 'special_bingo_ticket') {
    return { label: 'Special Bingo', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
  }
  return { label: 'Bingo', className: 'bg-gray-100 text-gray-700 border-gray-200' };
}

export default function DashboardTab() {
  const {
    tab,
    setTab,
    dashboard,
    dashboardDateFrom,
    dashboardDateTo,
    handleDashboardDateFromChange,
    handleDashboardDateToChange,
    setDashboardDateFrom,
    setDashboardDateTo,
    loadDashboard,
    recentReceipts,
    setRecentReceipts,
    printBookingReceipt,
    handleSalesDrilldown,
    bookings,
    phdInventory,
  } = useAdminDashboard();

  const openBookingSalesTab = () => {
    if (setTab) setTab('bookings');
  };

  const openSessionSales = (session) => {
    const quantity = Number(session.sold || session.quantity || 0);
    if (!quantity || !handleSalesDrilldown) return;
    handleSalesDrilldown({
      ...session,
      quantity,
      bookingCount: session.bookingCount || session.booking_count || quantity,
      totalAmount: session.totalAmount || session.total_amount || 0,
      totalFormatted: session.totalFormatted || '',
      description: session.description || session.event_title || `${session.date} - ${session.time}`,
      sessionType: session.session_type,
      isSpecialEvent: !!session.is_special_event,
    });
  };

  return (
    <>
        {/* DASHBOARD TAB */}
        {tab === 'dashboard' && dashboard && (
          <div>
            {/* Date Range Filter */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium text-gray-600">From:</label>
                <input
                  type="date"
                  value={dashboardDateFrom}
                  onChange={handleDashboardDateFromChange}
                  className="border rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium text-gray-600">To:</label>
                <input
                  type="date"
                  value={dashboardDateTo}
                  onChange={handleDashboardDateToChange}
                  min={dashboardDateFrom}
                  className="border rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
              <button
                onClick={() => { const t = new Date().toISOString().split('T')[0]; setDashboardDateFrom(t); setDashboardDateTo(t); loadDashboard(t, t); }}
                className="text-xs text-brand-blue hover:underline"
              >
                Today
              </button>
            </div>

            {/* Metric Cards Row 1 - Key Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <button
                type="button"
                onClick={openBookingSalesTab}
                className="rounded-xl p-5 shadow-sm text-white text-left hover:ring-4 hover:ring-blue-200 focus:outline-none focus:ring-4 focus:ring-blue-200"
                style={{ background: '#2563eb' }}
              >
                <p className="text-sm opacity-80">Total Bookings</p>
                <p className="text-4xl font-bold mt-1">{dashboard.todayBookings}</p>
                <p className="text-xs opacity-80 mt-1">Open Booking Sales</p>
              </button>
              <button
                type="button"
                onClick={openBookingSalesTab}
                className="rounded-xl p-5 shadow-sm text-white text-left hover:ring-4 hover:ring-green-200 focus:outline-none focus:ring-4 focus:ring-green-200"
                style={{ background: '#16a34a' }}
              >
                <p className="text-sm opacity-80">Revenue</p>
                <p className="text-4xl font-bold mt-1">{dashboard.todayRevenueFormatted}</p>
                <p className="text-xs opacity-80 mt-1">Open Booking Sales</p>
              </button>
              <button
                type="button"
                onClick={openBookingSalesTab}
                className="rounded-xl p-5 shadow-sm text-white text-left hover:ring-4 hover:ring-teal-200 focus:outline-none focus:ring-4 focus:ring-teal-200"
                style={{ background: '#0d9488' }}
              >
                <p className="text-sm opacity-80">Total Persons</p>
                <p className="text-4xl font-bold mt-1">{dashboard.totalPersons || 0}</p>
                <p className="text-xs opacity-80 mt-1">Open Booking Sales</p>
              </button>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#7c3aed' }}>
                <p className="text-sm opacity-80">Upcoming Sessions</p>
                <p className="text-4xl font-bold mt-1">{dashboard.upcomingSessions?.length || 0}</p>
                <p className="text-xs opacity-60 mt-1">next 7 days</p>
              </div>
            </div>

            {/* Metric Cards Row 2 - Table & Chair Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#059669' }}>
                <p className="text-sm opacity-80">Available Tables</p>
                <p className="text-4xl font-bold mt-1">{dashboard.availableTables || 0}</p>
                <p className="text-xs opacity-60 mt-1">of {dashboard.totalTables || 0} total</p>
              </div>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#d97706' }}>
                <p className="text-sm opacity-80">Partial Tables</p>
                <p className="text-4xl font-bold mt-1">{dashboard.partialTables || 0}</p>
                <p className="text-xs opacity-60 mt-1">partially occupied</p>
              </div>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#dc2626' }}>
                <p className="text-sm opacity-80">Full Tables</p>
                <p className="text-4xl font-bold mt-1">{dashboard.fullTables || 0}</p>
                <p className="text-xs opacity-60 mt-1">fully occupied</p>
              </div>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#4f46e5' }}>
                <p className="text-sm opacity-80">Chairs Available</p>
                <p className="text-4xl font-bold mt-1">{dashboard.availableChairs || 0}</p>
                <p className="text-xs opacity-60 mt-1">of {dashboard.totalChairs || 0} total</p>
              </div>
            </div>

            {/* Sold / Held Chair Summary */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                type="button"
                onClick={openBookingSalesTab}
                className="bg-white rounded-xl p-5 shadow-sm flex items-center justify-between text-left hover:ring-4 hover:ring-red-100 focus:outline-none focus:ring-4 focus:ring-red-100"
              >
                <div>
                  <p className="text-sm text-gray-400">Chairs Sold</p>
                  <p className="text-3xl font-bold text-red-600">{dashboard.soldChairs || 0}</p>
                  <p className="text-xs text-gray-400 mt-1">Open Booking Sales</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-2xl">
                  {'\u{1F4BA}'}
                </div>
              </button>
              <div className="bg-white rounded-xl p-5 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Chairs Held</p>
                  <p className="text-3xl font-bold text-amber-500">{dashboard.heldChairs || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-2xl">
                  {'\u{23F3}'}
                </div>
              </div>
            </div>

            {/* PHD Inventory Monitor */}
            {dashboard.phdInventory && (
              <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-brand-blue">PHD Inventory (Next Session)</h3>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    dashboard.phdInventory.remaining <= 20 ? 'bg-red-100 text-red-700' :
                    dashboard.phdInventory.remaining <= 50 ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {dashboard.phdInventory.remaining} remaining
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className={`rounded-lg p-3 text-center ${dashboard.phdInventory.remaining <= 20 ? 'bg-red-50' : 'bg-green-50'}`}>
                    <p className={`text-2xl font-bold ${dashboard.phdInventory.remaining <= 20 ? 'text-red-600' : 'text-green-600'}`}>{dashboard.phdInventory.remaining}</p>
                    <p className={`text-xs ${dashboard.phdInventory.remaining <= 20 ? 'text-red-500' : 'text-green-500'}`}>Available</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{dashboard.phdInventory.totalUsed}</p>
                    <p className="text-xs text-red-500">Booked</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{dashboard.phdInventory.totalStock}</p>
                    <p className="text-xs text-blue-500">Per Session</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-purple-600">{dashboard.phdInventory.perPlayerLimit}</p>
                    <p className="text-xs text-purple-500">Per Player Max</p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        dashboard.phdInventory.remaining <= 20 ? 'bg-red-500' :
                        dashboard.phdInventory.remaining <= 50 ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(100, (dashboard.phdInventory.totalUsed / dashboard.phdInventory.totalStock) * 100)}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">
                    {Math.round((dashboard.phdInventory.totalUsed / dashboard.phdInventory.totalStock) * 100)}% allocated
                  </p>
                </div>
              </div>
            )}

            {/* Recent Orders (Live Feed) */}
            {recentReceipts.length > 0 && (
              <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-brand-blue flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Recent Orders (Live)
                  </h3>
                  <button onClick={() => setRecentReceipts([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recentReceipts.map((r, i) => {
                    const badge = getReceiptBadge(r);
                    return (
                    <div key={r.referenceNumber + '-' + i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.className}`}>{badge.label}</span>
                          <span className="font-mono font-semibold text-sm text-brand-blue">{r.referenceNumber}</span>
                          <span className="text-xs text-gray-500">{r.sessionDate} at {r.sessionTime}</span>
                          <span className="text-xs text-gray-400">{r.items.length} person(s)</span>
                        </div>
                        {r.sessionTitle && (
                          <div className="text-xs text-gray-600 mt-1 truncate">{r.sessionTitle}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-green-700">{r.totalFormatted}</span>
                        <button
                          onClick={() => printBookingReceipt(r)}
                          className="text-xs bg-brand-blue text-white px-2 py-1 rounded hover:bg-blue-800"
                        >
                          Print
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upcoming Sessions Table */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">Upcoming Sessions</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Available</th>
                      <th className="pb-2">Sold</th>
                      <th className="pb-2">Held</th>
                      <th className="pb-2">Total</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.upcomingSessions?.map(s => (
                      <tr key={s.id} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{s.date}</td>
                        <td className="py-2">{s.time}</td>
                        <td className="py-2 text-green-600">{s.available}</td>
                        <td className="py-2">
                          {s.sold > 0 ? (
                            <button onClick={() => openSessionSales(s)} className="text-brand-blue underline hover:text-blue-800 font-medium cursor-pointer">{s.sold}</button>
                          ) : (
                            <span className="text-gray-500">0</span>
                          )}
                        </td>
                        <td className="py-2 text-amber-500">{s.held}</td>
                        <td className="py-2 text-gray-600">{s.total}</td>
                        <td className="py-2 text-right">
                          {s.sold > 0 ? (
                            <button
                              type="button"
                              onClick={() => openSessionSales(s)}
                              className="px-3 py-1.5 text-xs bg-brand-blue text-white rounded-lg hover:bg-blue-800 font-semibold"
                            >
                              View / Refund
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
            </div>
          </div>
        )}
    </>
  );
}


