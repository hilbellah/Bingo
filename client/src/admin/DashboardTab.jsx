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
    dashboardRange,
    setDashboardRange,
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
    setChairMgmtSession,
  } = useAdminDashboard();

  const openBookingSalesTab = () => {
    if (setTab) setTab('bookings');
  };

  const openSessionsTab = () => {
    if (setTab) setTab('sessions');
  };

  const openChairManagement = (sessionId = '') => {
    if (setChairMgmtSession) setChairMgmtSession(sessionId);
    if (setTab) setTab('chairs');
  };

  const openInventoryTab = () => {
    if (setTab) setTab('inventory');
  };

  const formatDate = (date) => date.toISOString().split('T')[0];
  const addDays = (dateText, days) => {
    const date = new Date(`${dateText}T00:00:00`);
    date.setDate(date.getDate() + days);
    return formatDate(date);
  };
  const startOfWeek = (dateText) => {
    const date = new Date(`${dateText}T00:00:00`);
    const daysSinceMonday = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - daysSinceMonday);
    return formatDate(date);
  };
  const endOfMonth = (dateText) => {
    const date = new Date(`${dateText}T00:00:00`);
    return formatDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  };
  const startOfMonth = (dateText) => {
    const date = new Date(`${dateText}T00:00:00`);
    return formatDate(new Date(date.getFullYear(), date.getMonth(), 1));
  };
  const applyDashboardRange = (range) => {
    const anchor = dashboardDateFrom || formatDate(new Date());
    let from = anchor;
    let to = anchor;
    if (range === 'multi-day') {
      to = dashboardDateTo && dashboardDateTo >= anchor ? dashboardDateTo : addDays(anchor, 6);
    } else if (range === 'weekly') {
      from = startOfWeek(anchor);
      to = addDays(from, 6);
    } else if (range === 'monthly') {
      from = startOfMonth(anchor);
      to = endOfMonth(anchor);
    }
    setDashboardRange(range);
    setDashboardDateFrom(from);
    setDashboardDateTo(to);
    loadDashboard(from, to);
  };
  const dashboardRangeLabel = dashboardDateFrom === dashboardDateTo
    ? dashboardDateFrom
    : `${dashboardDateFrom} to ${dashboardDateTo}`;

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

  const openUpcomingSession = (session) => {
    if (!session?.id) return openSessionsTab();
    openChairManagement(session.id);
  };

  return (
    <>
        {/* DASHBOARD TAB */}
        {tab === 'dashboard' && dashboard && (
          <div>
            {/* Date Range Filter */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
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
                    onClick={() => applyDashboardRange(range)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      dashboardRange === range
                        ? 'bg-brand-blue text-white shadow-sm'
                        : 'text-gray-600 hover:bg-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
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
                onClick={() => { const t = formatDate(new Date()); setDashboardRange('daily'); setDashboardDateFrom(t); setDashboardDateTo(t); loadDashboard(t, t); }}
                className="text-xs text-brand-blue hover:underline"
              >
                Today
              </button>
              <span className="text-sm text-gray-500">
                Showing {dashboardRangeLabel}
              </span>
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
              <button
                type="button"
                onClick={openSessionsTab}
                className="rounded-xl p-5 shadow-sm text-white text-left hover:ring-4 hover:ring-purple-200 focus:outline-none focus:ring-4 focus:ring-purple-200"
                style={{ background: '#7c3aed' }}
              >
                <p className="text-sm opacity-80">Upcoming Sessions</p>
                <p className="text-4xl font-bold mt-1">{dashboard.upcomingSessions?.length || 0}</p>
                <p className="text-xs opacity-80 mt-1">Open Bingo Sessions</p>
              </button>
            </div>

            {/* Metric Cards Row 2 - Table & Chair Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <button
                type="button"
                onClick={() => openChairManagement()}
                className="rounded-xl p-5 shadow-sm text-white text-left hover:ring-4 hover:ring-emerald-200 focus:outline-none focus:ring-4 focus:ring-emerald-200"
                style={{ background: '#059669' }}
              >
                <p className="text-sm opacity-80">Available Tables</p>
                <p className="text-4xl font-bold mt-1">{dashboard.availableTables || 0}</p>
                <p className="text-xs opacity-80 mt-1">Open Chair Management</p>
              </button>
              <button
                type="button"
                onClick={() => openChairManagement()}
                className="rounded-xl p-5 shadow-sm text-white text-left hover:ring-4 hover:ring-amber-200 focus:outline-none focus:ring-4 focus:ring-amber-200"
                style={{ background: '#d97706' }}
              >
                <p className="text-sm opacity-80">Partial Tables</p>
                <p className="text-4xl font-bold mt-1">{dashboard.partialTables || 0}</p>
                <p className="text-xs opacity-80 mt-1">Open Chair Management</p>
              </button>
              <button
                type="button"
                onClick={() => openChairManagement()}
                className="rounded-xl p-5 shadow-sm text-white text-left hover:ring-4 hover:ring-red-200 focus:outline-none focus:ring-4 focus:ring-red-200"
                style={{ background: '#dc2626' }}
              >
                <p className="text-sm opacity-80">Full Tables</p>
                <p className="text-4xl font-bold mt-1">{dashboard.fullTables || 0}</p>
                <p className="text-xs opacity-80 mt-1">Open Chair Management</p>
              </button>
              <button
                type="button"
                onClick={() => openChairManagement()}
                className="rounded-xl p-5 shadow-sm text-white text-left hover:ring-4 hover:ring-indigo-200 focus:outline-none focus:ring-4 focus:ring-indigo-200"
                style={{ background: '#4f46e5' }}
              >
                <p className="text-sm opacity-80">Chairs Available</p>
                <p className="text-4xl font-bold mt-1">{dashboard.availableChairs || 0}</p>
                <p className="text-xs opacity-80 mt-1">Open Chair Management</p>
              </button>
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
              <button
                type="button"
                onClick={() => openChairManagement()}
                className="bg-white rounded-xl p-5 shadow-sm flex items-center justify-between text-left hover:ring-4 hover:ring-amber-100 focus:outline-none focus:ring-4 focus:ring-amber-100"
              >
                <div>
                  <p className="text-sm text-gray-400">Chairs Held</p>
                  <p className="text-3xl font-bold text-amber-500">{dashboard.heldChairs || 0}</p>
                  <p className="text-xs text-gray-400 mt-1">Open Chair Management</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-2xl">
                  {'\u{23F3}'}
                </div>
              </button>
            </div>

            {/* PHD Inventory Monitor */}
            {dashboard.phdInventory && (
              <button
                type="button"
                onClick={openInventoryTab}
                className="block w-full bg-white rounded-xl p-5 shadow-sm mb-6 text-left hover:ring-4 hover:ring-purple-100 focus:outline-none focus:ring-4 focus:ring-purple-100"
              >
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
              </button>
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
                      <tr
                        key={s.id}
                        onClick={() => openUpcomingSession(s)}
                        className="border-b border-gray-50 cursor-pointer hover:bg-blue-50/60 focus-within:bg-blue-50/60"
                        title="Open this session in Chair Management"
                      >
                        <td className="py-2 font-medium text-brand-blue underline decoration-transparent hover:decoration-current">{s.date}</td>
                        <td className="py-2">{s.time}</td>
                        <td className="py-2 text-green-600">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openUpcomingSession(s);
                            }}
                            className="font-medium hover:underline"
                          >
                            {s.available}
                          </button>
                        </td>
                        <td className="py-2">
                          {s.sold > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSessionSales(s);
                              }}
                              className="text-brand-blue underline hover:text-blue-800 font-medium cursor-pointer"
                            >
                              {s.sold}
                            </button>
                          ) : (
                            <span className="text-gray-500">0</span>
                          )}
                        </td>
                        <td className="py-2 text-amber-500">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openUpcomingSession(s);
                            }}
                            className="font-medium hover:underline"
                          >
                            {s.held}
                          </button>
                        </td>
                        <td className="py-2 text-gray-600">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openUpcomingSession(s);
                            }}
                            className="hover:underline"
                          >
                            {s.total}
                          </button>
                        </td>
                        <td className="py-2 text-right">
                          {s.sold > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSessionSales(s);
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

