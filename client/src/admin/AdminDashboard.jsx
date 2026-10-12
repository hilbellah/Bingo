import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  fetchAdminDashboard,
  fetchAdminBookings, fetchAdminBookingReceipt, cancelAdminBooking, fetchRefundRequests, fetchPaymentReviews, getExportUrl, adminHeaders,
  fetchAdminBulkTickets,
  fetchDeletedSessions, restoreSession, fetchSessionBookings, fetchAuditLog,
  resetAdminSalesReporting,
  fetchSettings, saveSettings,
  fetchAdminPhdInventory,
} from '../api';
import AdminDashboardContent from './AdminDashboardContent';
import AdminShell from './AdminShell';
import NotificationsBell from './NotificationsBell';
import {
  printAutoBookingReceipt,
  printRefundReceipt,
} from './adminPrintUtils';
import { confirmAdminAction } from './adminConfirm';
import { askAdmin, tellAdmin } from './adminDialogs';
import { venueToday } from '../utils/formatters';
import {
  formatPrice,
  DEFAULT_SPECIAL_BINGO_CONFIG,
  DEFAULT_BOOKING_CONFIG,
  normalizeSpecialBingoConfig,
  defaultSpecialEventPackages,
} from './adminDashboardHelpers';
import { useBookingActions } from './useBookingActions';
import { useSalesReports } from './useSalesReports';
import { useSessionsAdmin } from './useSessionsAdmin';
import { usePackagesAdmin } from './usePackagesAdmin';
import { useAnnouncementsAdmin } from './useAnnouncementsAdmin';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem('admin_token');
  const adminDisplayName = sessionStorage.getItem('admin_display_name') || 'Admin';
  const isSuperUser = sessionStorage.getItem('admin_is_super_user') === 'true';
  const adminRole = isSuperUser ? 'super_user' : (sessionStorage.getItem('admin_role') || 'admin');
  const isPrintStaff = adminRole === 'print_staff';
  const isViewer = adminRole === 'viewer';

  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [refundRequests, setRefundRequests] = useState([]);
  const [paymentReviews, setPaymentReviews] = useState({ reviews: [], duplicates: [] });
  const [bookings, setBookings] = useState([]);
  const [reportSession, setReportSession] = useState('');
  const [specialBingoConfig, setSpecialBingoConfig] = useState(DEFAULT_SPECIAL_BINGO_CONFIG);
  const [bookingConfig, setBookingConfig] = useState(DEFAULT_BOOKING_CONFIG);
  const [bookingConfigSaved, setBookingConfigSaved] = useState(false);
  // Website flyer picked in the "Publish to website" panel, before upload.
  const [bulkDateFrom, setBulkDateFrom] = useState('');
  const [bulkDateTo, setBulkDateTo] = useState('');
  const [bulkDepartment, setBulkDepartment] = useState('all');
  const [bulkData, setBulkData] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deletedSessions, setDeletedSessions] = useState([]);
  const [archiveBookings, setArchiveBookings] = useState(null); // { session, bookings }
  const [auditLogs, setAuditLogs] = useState([]);
  const [bookingSearch, setBookingSearch] = useState('');
  const [dashboardDateFrom, setDashboardDateFrom] = useState(venueToday());
  const [dashboardDateTo, setDashboardDateTo] = useState(venueToday());
  const [dashboardRange, setDashboardRange] = useState('daily');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [autoPrint, setAutoPrint] = useState(false);
  const [recentReceipts, setRecentReceipts] = useState([]);
  const [receiptConfig, setReceiptConfig] = useState({
    businessName: 'SMEC BINGO',
    businessSubtitle: "Saint Mary's Entertainment Centre",
    receiptTitle: 'BOOKING RECEIPT',
    footerText: 'Thank you for your purchase!',
    showRefNumber: true,
    showTableChair: true,
    showPackagePrice: true,
    showAddons: true,
    showTimestamp: true,
    autoPrintEnabled: false,
    paperWidth: '80mm',
    partialCutBetweenReceipts: false,
    receiptCutPercent: 0
  });
  const [receiptSaved, setReceiptSaved] = useState(false);
  const [phdInventory, setPhdInventory] = useState(null);
  const [phdEditForm, setPhdEditForm] = useState({ totalStock: 200, perPlayerLimit: 2 });
  const [phdSaving, setPhdSaving] = useState(false);
  const [chairMgmtSession, setChairMgmtSession] = useState('');
  const [chairMgmtSeats, setChairMgmtSeats] = useState([]);
  const [chairMgmtLoading, setChairMgmtLoading] = useState(false);
  const [chairMgmtFilter, setChairMgmtFilter] = useState('all'); // 'all', 'disabled', 'available', 'sold'
  const socketRef = useRef(null);
  const autoPrintRef = useRef(false);
  const receiptConfigRef = useRef(receiptConfig);
  const {
    bookingSales,
    bookingSalesRange,
    datedBookingSales,
    customers,
    customerSearch,
    setCustomerSearch,
    salesDrilldown,
    setSalesDrilldown,
    dailySales,
    dailySalesDate,
    setDailySalesDate,
    dailySalesDateTo,
    setDailySalesDateTo,
    dailySalesRange,
    setDailySalesRange,
    dailySalesSearch,
    setDailySalesSearch,
    transactions,
    transactionFilters,
    setTransactionFilters,
    loadDatedBookingSales,
    loadBookingSales,
    loadDailySales,
    loadTransactions,
    loadCustomers,
    handleSalesDrilldown,
    handlePrintSalesDrilldown,
    handleSaveSalesDrilldownCsv,
    handlePrintDailySalesReceipt,
    handleExportCustomers,
  } = useSalesReports({ token, receiptConfigRef });
  const {
    announcements,
    newAnnouncement,
    setNewAnnouncement,
    announcementImageFile,
    setAnnouncementImageFile,
    announcementImagePreview,
    setAnnouncementImagePreview,
    uploadingImage,
    loadAnnouncements,
    handleCreateAnnouncement,
    handleToggleAnnouncement,
    handleDeleteAnnouncement,
  } = useAnnouncementsAdmin({
    token,
  });
  const {
    packages,
    newPackage,
    setNewPackage,
    editingPackage,
    setEditingPackage,
    loadPackages,
    handleTogglePackage,
    handleCreatePackage,
    handleStartEditPackage,
    handleCancelEditPackage,
    handleSaveEditPackage,
    handleDeletePackage,
  } = usePackagesAdmin({
    token,
  });
  const {
    sessions,
    newSession,
    setNewSession,
    newEvent,
    setNewEvent,
    editingSessionPkgs,
    setEditingSessionPkgs,
    sessionPkgList,
    setSessionPkgList,
    editingSession,
    setEditingSession,
    sessionFlyerFile,
    sessionFlyerPreview,
    editFlyerFile,
    editFlyerPreview,
    editForm,
    setEditForm,
    sessionImageFile,
    setSessionImageFile,
    sessionImagePreview,
    setSessionImagePreview,
    eventImageFile,
    setEventImageFile,
    eventImagePreview,
    setEventImagePreview,
    editImageFile,
    setEditImageFile,
    editImagePreview,
    setEditImagePreview,
    uploadingEventImage,
    loadSessions,
    handleSessionFlyerFileChange,
    handleEditFlyerFileChange,
    handleCreateSession,
    handleEditSessionPkgs,
    handleSaveSessionPkgs,
    handleToggleSession,
    handleDeleteSession,
    handleStartEdit,
    handleSaveEdit,
    handleCreateEvent,
  } = useSessionsAdmin({
    specialBingoConfig,
    token,
    loadBookingSales,
  });

  useEffect(() => {
    if (!token) { navigate('/admin'); return; }
    if (isPrintStaff && !['bulkprint', 'settings'].includes(tab)) {
      setTab('bulkprint');
    }
    if (!isPrintStaff) loadDashboard();
    // Load receipt config from server
    fetchSettings(token, 'receipt_config').then(config => {
      if (config) {
        setReceiptConfig(config);
        receiptConfigRef.current = config;
        if (config.autoPrintEnabled) {
          setAutoPrint(true);
          autoPrintRef.current = true;
        }
      }
    });
    if (!isPrintStaff) {
      fetchSettings(token, 'special_bingo_config').then(config => {
        if (!config) return;
        const merged = normalizeSpecialBingoConfig(config);
        setSpecialBingoConfig(merged);
        setNewSession(prev => ({
          ...prev,
          packages: defaultSpecialEventPackages(merged),
        }));
      }).catch(() => {});
      fetchSettings(token, 'booking_config').then(config => {
        if (!config) return;
        setBookingConfig({ ...DEFAULT_BOOKING_CONFIG, ...config });
      }).catch(() => {});
    }
  }, []);

  const loadRefundRequests = () => fetchRefundRequests(token).then(setRefundRequests).catch(() => setRefundRequests([]));
  const loadPaymentReviews = () => fetchPaymentReviews(token)
    .then(data => setPaymentReviews({ reviews: data?.reviews || [], duplicates: data?.duplicates || [] }))
    .catch(() => setPaymentReviews({ reviews: [], duplicates: [] }));
  const loadDashboard = (from, to) => Promise.all([
    fetchAdminDashboard(token, from || dashboardDateFrom, to || dashboardDateTo).then(setDashboard),
    loadRefundRequests(),
    loadPaymentReviews(),
  ]);
  // Latest-render loadDashboard for the socket effect: its deps are [token],
  // so without the ref a 'booking:new' event refetches with the MOUNT-time
  // date range and silently overwrites whatever range the admin selected.
  const loadDashboardRef = useRef(loadDashboard);
  loadDashboardRef.current = loadDashboard;
  const loadBookings = (sid) => fetchAdminBookings(token, sid).then(setBookings);
  const loadDeletedSessions = () => fetchDeletedSessions(token).then(setDeletedSessions);
  const loadAuditLogs = () => fetchAuditLog(token, { limit: 50 }).then(setAuditLogs);
  useEffect(() => {
    if (isPrintStaff && !['bulkprint', 'settings'].includes(tab)) {
      setTab('bulkprint');
      return;
    }
    if (tab === 'sessions') loadSessions();
    if (tab === 'events') { loadSessions(); loadBookingSales(); }
    if (tab === 'packages') loadPackages();
    if (tab === 'bookings') { loadBookingSales(); loadDailySales(); loadTransactions(transactionFilters); }
    if (tab === 'customers') loadCustomers();
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'announcements') loadAnnouncements();
    if (tab === 'archive') { loadDeletedSessions(); loadAuditLogs(); }
    if (tab === 'inventory') { fetchAdminPhdInventory(token).then(data => { setPhdInventory(data); setPhdEditForm({ totalStock: data.totalStock, perPlayerLimit: data.perPlayerLimit }); }); }
    if (tab === 'chairs') loadSessions();
    if (tab === 'bulkprint') loadSessions();
    if (tab === 'users' && !isSuperUser) setTab('dashboard');
    if (isViewer && !['dashboard', 'bookings', 'customers', 'archive'].includes(tab)) setTab('dashboard');
  }, [tab]);

  // Auto-print: keep refs in sync with state
  useEffect(() => { autoPrintRef.current = autoPrint; }, [autoPrint]);
  useEffect(() => { receiptConfigRef.current = receiptConfig; }, [receiptConfig]);

  // Auto-print receipt function (uses receipt config)
  const printBookingReceipt = useCallback((booking) => {
    printAutoBookingReceipt(booking, receiptConfigRef.current);
  }, []);

  // Socket.IO connection for auto-print receipts
  useEffect(() => {
    if (!token) return;
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      auth: { adminToken: token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:admin-receipts', { token });
    });

    socket.on('admin:receipts:unauthorized', () => {
      socket.disconnect();
    });

    socket.on('booking:new', (receiptData) => {
      // Always add to recent receipts list
      setRecentReceipts(prev => [receiptData, ...prev].slice(0, 20));
      // Auto-print if enabled
      if (autoPrintRef.current) {
        printBookingReceipt(receiptData);
      }
      // Refresh dashboard if this role can view it.
      if (!isPrintStaff) loadDashboardRef.current();
    });

    socket.on('phd:updated', (phdData) => {
      // Update PHD inventory in real-time when a booking with PHD add-ons is created
      setPhdInventory(prev => prev ? { ...prev, ...phdData } : phdData);
      setDashboard(prev => prev ? { ...prev, phdInventory: phdData } : prev);
    });

    socket.on('refund_request:created', loadRefundRequests);
    socket.on('refund_request:updated', loadRefundRequests);
    // A payment that could not be attached to its seat, or a duplicate
    // charge. Reload the attention panel so it appears without a refresh.
    socket.on('booking:payment_review', loadPaymentReviews);
    socket.on('booking:payment_review_resolved', loadPaymentReviews);

    return () => {
      socket.emit('leave:admin-receipts');
      socket.off('admin:receipts:unauthorized');
      socket.off('refund_request:created', loadRefundRequests);
      socket.off('refund_request:updated', loadRefundRequests);
      socket.off('booking:payment_review', loadPaymentReviews);
      socket.off('booking:payment_review_resolved', loadPaymentReviews);
      socket.disconnect();
    };
  }, [token]);

  const handlePrintBookingReceipt = (booking) => {
    if (['partially_refunded', 'refunded', 'voided'].includes(booking?.paymentStatus)) {
      printRefundReceipt(booking, receiptConfigRef.current);
      return;
    }
    printBookingReceipt(booking);
  };

  const handleReprintTransactionReceipt = async (bookingId) => {
    const booking = await fetchAdminBookingReceipt(token, bookingId);
    handlePrintBookingReceipt(booking);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_display_name');
    sessionStorage.removeItem('admin_is_super_user');
    sessionStorage.removeItem('admin_role');
    navigate('/admin');
  };

  const handleLoadBulkTickets = async () => {
    if (!bulkDateFrom) return;
    setBulkLoading(true);
    setBulkData(null);
    try {
      const data = await fetchAdminBulkTickets(token, bulkDateFrom, bulkDateTo || bulkDateFrom, bulkDepartment);
      setBulkData(data);
    } catch (err) {
      setBulkData({ error: err.message || 'Failed to load tickets' });
    }
    setBulkLoading(false);
  };

  const handleRestoreSession = async (id) => {
    if (!confirmAdminAction({
      action: 'Restore this deleted session',
      warning: 'The restored session will appear in admin session lists again.',
    })) return;
    await restoreSession(token, id);
    loadDeletedSessions();
    loadAuditLogs();
  };

  const handleViewArchiveBookings = async (session) => {
    const bookings = await fetchSessionBookings(token, session.id);
    setArchiveBookings({ session, bookings });
  };

  const handleCancelBooking = async (id) => {
    if (!await askAdmin({
      title: 'Cancel this unpaid booking?',
      details: ['Releases its temporary seat hold.'],
      warning: 'Paid bookings cannot be cancelled here. If a payment exists, you must use Refund/Void so Authorize.Net reverses the charge before the seat is released.',
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep booking',
      tone: 'danger',
    })) return;
    const result = await cancelAdminBooking(token, id);
    if (!result?.ok) {
      await tellAdmin(result?.message || result?.error || 'Could not cancel this booking.', { title: 'Not cancelled', tone: 'error' });
    }
    loadBookings(reportSession);
  };

  const handleSaveBookingConfig = async () => {
    const next = {
      maxOptionalPackagesPerPlayer: Math.max(0, parseInt(bookingConfig.maxOptionalPackagesPerPlayer, 10) || 0),
    };
    if (!confirmAdminAction({
      action: 'Save booking package limit',
      details: [`Max optional packages per player: ${next.maxOptionalPackagesPerPlayer}`],
      warning: 'This affects the customer booking form immediately.',
    })) return;
    await saveSettings(token, 'booking_config', next);
    setBookingConfig(next);
    setBookingConfigSaved(true);
    setTimeout(() => setBookingConfigSaved(false), 3000);
  };

  const handleResetSalesReporting = async () => {
    if (!await askAdmin({
      title: 'Reset sales report totals?',
      warning: 'This keeps Authorize.Net payment records and audit history, but hides older test sales/refunds from Daily Sales, Booking Sales, Transactions, and dashboard totals. New sales after this reset will count normally.',
      fields: [{
        name: 'confirmText',
        label: 'Type RESET to confirm',
        required: true,
        validate: value => (value === 'RESET' ? '' : 'Type RESET in capitals to confirm.'),
      }],
      confirmLabel: 'Reset totals',
      tone: 'danger',
    })) return;

    const result = await resetAdminSalesReporting(token);
    if (!result.ok) {
      await tellAdmin(result.message || result.error || 'Could not reset sales reporting totals.', { title: 'Sales totals', tone: 'error' });
      return;
    }

    await tellAdmin(result.message || 'Sales reporting totals were reset.', { title: 'Sales totals', tone: 'success' });
    loadBookingSales();
    loadDailySales(dailySalesDate, dailySalesSearch);
    loadTransactions(transactionFilters);
    loadDashboard(dashboardDateFrom, dashboardDateTo);
  };

  const {
    handleRefundBooking,
    handleRefundBookingItem,
    handleApproveRefundRequest,
    handleRejectRefundRequest,
    handleConfirmPaymentReview,
    handleDismissPaymentReview,
    handleResolveDuplicateCharge,
    handleRemoveAssignedTicket,
    handleIssueNoShowCredit,
    handleMoveBookingItemSeat,
  } = useBookingActions({
    token,
    reportSession,
    transactionFilters,
    dailySalesDate,
    dailySalesSearch,
    salesDrilldown,
    dashboardDateFrom,
    dashboardDateTo,
    loadRefundRequests,
    loadBookings,
    loadTransactions,
    loadBookingSales,
    loadDailySales,
    handleSalesDrilldown,
    loadDashboard,
    loadPaymentReviews,
    loadSessions,
  });

  const handleExport = () => {
    const url = getExportUrl(token, reportSession);
    // Need to add auth header for download — open in iframe or use fetch+blob
    fetch(url, { headers: adminHeaders(token) })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bookings-report.csv`;
        a.click();
      });
  };

  const handleDashboardDateFromChange = (e) => {
    const newDate = e.target.value;
    setDashboardRange('multi-day');
    setDashboardDateFrom(newDate);
    if (newDate > dashboardDateTo) setDashboardDateTo(newDate);
    loadDashboard(newDate, newDate > dashboardDateTo ? newDate : dashboardDateTo);
  };
  const handleDashboardDateToChange = (e) => {
    const newDate = e.target.value;
    setDashboardRange('multi-day');
    setDashboardDateTo(newDate);
    loadDashboard(dashboardDateFrom, newDate);
  };

  const adminHeaderActions = (
    <div className="flex items-center gap-4">
            {!isPrintStaff && (
              <NotificationsBell
                items={paymentReviews}
                canManage={!isViewer}
                onConfirm={handleConfirmPaymentReview}
                onDismiss={handleDismissPaymentReview}
                onResolveDuplicate={handleResolveDuplicateCharge}
              />
            )}
            {!isViewer && <button
              onClick={() => {
                const next = !autoPrint;
                if (!confirmAdminAction({
                  action: `${next ? 'Enable' : 'Disable'} auto-print`,
                  warning: next
                    ? 'New paid bookings will automatically print a receipt in this browser.'
                    : 'New paid bookings will no longer automatically print in this browser.',
                })) return;
                setAutoPrint(next);
                const updated = { ...receiptConfig, autoPrintEnabled: next };
                setReceiptConfig(updated);
                saveSettings(token, 'receipt_config', updated);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${autoPrint ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}
            >
              <span>{autoPrint ? '\uD83D\uDFE2' : '\u26AA'}</span>
              Auto-Print {autoPrint ? 'ON' : 'OFF'}
            </button>}
            <span className="text-xs font-medium text-brand-blue">{adminDisplayName}</span>
    </div>
  );


  const dashboardContext = {
    tab,
    setTab,
    isSuperUser,
    adminRole,
    isPrintStaff,
    dashboard,
    refundRequests,
    handleApproveRefundRequest: isViewer ? null : handleApproveRefundRequest,
    handleRejectRefundRequest: isViewer ? null : handleRejectRefundRequest,
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
    sessions,
    newSession,
    setNewSession,
    sessionImageFile,
    setSessionImageFile,
    sessionImagePreview,
    setSessionImagePreview,
    handleCreateSession,
    sessionFlyerFile,
    sessionFlyerPreview,
    handleSessionFlyerFileChange,
    editFlyerFile,
    editFlyerPreview,
    handleEditFlyerFileChange,
    newEvent,
    setNewEvent,
    eventImageFile,
    setEventImageFile,
    eventImagePreview,
    setEventImagePreview,
    handleCreateEvent,
    editingSession,
    setEditingSession,
    editForm,
    setEditForm,
    editImageFile,
    setEditImageFile,
    editImagePreview,
    setEditImagePreview,
    uploadingEventImage,
    handleStartEdit,
    handleSaveEdit,
    handleToggleSession,
    handleEditSessionPkgs,
    handleDeleteSession,
    editingSessionPkgs,
    setEditingSessionPkgs,
    sessionPkgList,
    setSessionPkgList,
    handleSaveSessionPkgs,
    packages,
    newPackage,
    setNewPackage,
    bookingConfig,
    setBookingConfig,
    bookingConfigSaved,
    handleSaveBookingConfig,
    handleCreatePackage,
    handleTogglePackage,
    editingPackage,
    setEditingPackage,
    handleStartEditPackage,
    handleCancelEditPackage,
    handleSaveEditPackage,
    handleDeletePackage,
    formatPrice,
    announcements,
    newAnnouncement,
    setNewAnnouncement,
    announcementImageFile,
    setAnnouncementImageFile,
    announcementImagePreview,
    setAnnouncementImagePreview,
    uploadingImage,
    handleCreateAnnouncement,
    handleToggleAnnouncement,
    handleDeleteAnnouncement,
    bookingSales,
    bookingSalesRange,
    datedBookingSales,
    loadDatedBookingSales,
    customers,
    customerSearch,
    setCustomerSearch,
    loadCustomers,
    handleExportCustomers,
    handleSalesDrilldown,
    dailySalesSearch,
    setDailySalesSearch,
    loadDailySales,
    dailySalesDate,
    setDailySalesDate,
    dailySalesDateTo,
    setDailySalesDateTo,
    dailySalesRange,
    setDailySalesRange,
    dailySales,
    transactions,
    transactionFilters,
    setTransactionFilters,
    loadTransactions,
    handlePrintDailySalesReceipt,
    handleReprintTransactionReceipt,
    bookingSearch,
    setBookingSearch,
    reportSession,
    setReportSession,
    bookings,
    loadBookings,
    handleCancelBooking: isViewer ? null : handleCancelBooking,
    handleResetSalesReporting: isViewer ? null : handleResetSalesReporting,
    handleRefundBooking: isViewer ? null : handleRefundBooking,
    handleRefundBookingItem: isViewer ? null : handleRefundBookingItem,
    handleRemoveAssignedTicket: isViewer ? null : handleRemoveAssignedTicket,
    handleIssueNoShowCredit: isViewer ? null : handleIssueNoShowCredit,
    handleExport,
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
    handlePrintBookingReceipt,
    deletedSessions,
    handleViewArchiveBookings,
    handleRestoreSession: isViewer ? null : handleRestoreSession,
    archiveBookings,
    setArchiveBookings,
    auditLogs,
    chairMgmtSession,
    setChairMgmtSession,
    setChairMgmtLoading,
    setChairMgmtSeats,
    chairMgmtLoading,
    chairMgmtSeats,
    chairMgmtFilter,
    setChairMgmtFilter,
    token,
    phdInventory,
    phdEditForm,
    setPhdEditForm,
    phdSaving,
    setPhdSaving,
    setPhdInventory,
    receiptConfig,
    setReceiptConfig,
    receiptSaved,
    setReceiptSaved,
    autoPrint,
    setAutoPrint,
    salesDrilldown,
    setSalesDrilldown,
    handlePrintSalesDrilldown,
    handleSaveSalesDrilldownCsv,
    handleMoveBookingItemSeat: isViewer ? null : handleMoveBookingItemSeat,
  };

  return (
    <AdminShell
      activeTab={tab}
      onTabChange={setTab}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
      adminDisplayName={adminDisplayName}
      isSuperUser={isSuperUser}
      adminRole={adminRole}
      onLogout={handleLogout}
      rightActions={adminHeaderActions}
    >

        <AdminDashboardContent value={dashboardContext} />
    </AdminShell>
  );
}
