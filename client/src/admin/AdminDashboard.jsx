import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  fetchAdminDashboard, fetchAdminSessions, createAdminSession,
  updateAdminSession, deleteAdminSession, fetchAdminPackages, createAdminPackage, updateAdminPackage, deleteAdminPackage,
  fetchAdminBookings, fetchAdminBookingReceipt, cancelAdminBooking, fetchRefundRequests, fetchPaymentReviews, getExportUrl, adminHeaders,
  fetchAdminAnnouncements, createAdminAnnouncement, updateAdminAnnouncement, deleteAdminAnnouncement,
  fetchAdminSessionPackages, setAdminSessionPackages,
  fetchAdminBulkTickets,
  fetchDeletedSessions, restoreSession, fetchSessionBookings, fetchAuditLog,
  fetchBookingSales, fetchDailySales, fetchAdminTransactions, resetAdminSalesReporting,
  fetchAdminCustomers, getCustomersExportUrl,
  fetchSettings, saveSettings,
  uploadImage,
  fetchAdminPhdInventory,
} from '../api';
import AdminDashboardContent from './AdminDashboardContent';
import AdminShell from './AdminShell';
import NotificationsBell from './NotificationsBell';
import {
  printAutoBookingReceipt,
  printDailySalesReceipt as printDailySalesReceiptDocument,
  printRefundReceipt,
  printSalesDrilldown,
  saveSalesDrilldownCsv,
} from './adminPrintUtils';
import { confirmAdminAction } from './adminConfirm';
import { askAdmin, tellAdmin } from './adminDialogs';
import { formatDateShort, formatTime, venueToday } from '../utils/formatters';
import { emptyWebsiteListing, missingWebsiteListingFields, websiteListingFromSession } from './WebsiteListingFields';
import {
  formatPrice,
  packageSummary,
  splitSalesCutoffAt,
  buildSalesCutoffAt,
  formatSalesCutoff,
  DEFAULT_SPECIAL_BINGO_CONFIG,
  DEFAULT_BOOKING_CONFIG,
  normalizeSpecialBingoConfig,
  defaultSpecialEventPackages,
  defaultEventPackages,
} from './adminDashboardHelpers';
import { useBookingActions } from './useBookingActions';

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
  const [sessions, setSessions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [reportSession, setReportSession] = useState('');
  const [specialBingoConfig, setSpecialBingoConfig] = useState(DEFAULT_SPECIAL_BINGO_CONFIG);
  const [bookingConfig, setBookingConfig] = useState(DEFAULT_BOOKING_CONFIG);
  const [bookingConfigSaved, setBookingConfigSaved] = useState(false);
  const [newSession, setNewSession] = useState({ date: '', time: '18:30', cutoff_time: '12:00', sales_cutoff_date: '', doors_open_time: '', is_special_event: true, event_title: '', event_description: '', event_image_url: '', packages: defaultSpecialEventPackages(), ...emptyWebsiteListing() });
  const [newEvent, setNewEvent] = useState({ date: '', time: '19:00', cutoff_time: '12:00', sales_cutoff_date: '', doors_open_time: '', ticket_limit: '', session_type: 'event', is_special_event: true, event_title: '', event_description: '', event_image_url: '', packages: defaultEventPackages() });
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', message: '', type: 'info', start_date: '', end_date: '', image_url: '' });
  const [newPackage, setNewPackage] = useState({ name: '', price: '', type: 'optional', max_quantity: 1, sort_order: 0, is_phd: false, description: '' });
  const [editingPackage, setEditingPackage] = useState(null); // { id, name, price, type, max_quantity, sort_order, is_phd } — null when not editing
  const [editingSessionPkgs, setEditingSessionPkgs] = useState(null); // session id being edited
  const [sessionPkgList, setSessionPkgList] = useState([]);
  const [editingSession, setEditingSession] = useState(null); // session object being edited
  // Website flyer picked in the "Publish to website" panel, before upload.
  const [sessionFlyerFile, setSessionFlyerFile] = useState(null);
  const [sessionFlyerPreview, setSessionFlyerPreview] = useState(null);
  const [editFlyerFile, setEditFlyerFile] = useState(null);
  const [editFlyerPreview, setEditFlyerPreview] = useState(null);
  const [editForm, setEditForm] = useState({ date: '', time: '', cutoff_time: '', doors_open_time: '', is_special_event: false, event_title: '', event_description: '', event_image_url: '', ...emptyWebsiteListing() });
  const [bulkDateFrom, setBulkDateFrom] = useState('');
  const [bulkDateTo, setBulkDateTo] = useState('');
  const [bulkDepartment, setBulkDepartment] = useState('all');
  const [bulkData, setBulkData] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deletedSessions, setDeletedSessions] = useState([]);
  const [archiveBookings, setArchiveBookings] = useState(null); // { session, bookings }
  const [auditLogs, setAuditLogs] = useState([]);
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingSales, setBookingSales] = useState([]);
  // Date view for Booking Sales: { dateFrom, dateTo } when active, otherwise
  // null. Kept separate from bookingSales so Event Sales is unaffected.
  const [bookingSalesRange, setBookingSalesRange] = useState(null);
  const [datedBookingSales, setDatedBookingSales] = useState(null); // { rows, error, loading }
  const bookingSalesRangeRef = useRef(null);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [salesDrilldown, setSalesDrilldown] = useState(null); // { session, bookings }
  const [dailySales, setDailySales] = useState(null);
  const [dailySalesDate, setDailySalesDate] = useState(venueToday());
  const [dailySalesDateTo, setDailySalesDateTo] = useState(venueToday());
  const [dailySalesRange, setDailySalesRange] = useState('daily');
  const [dailySalesSearch, setDailySalesSearch] = useState('');
  const [transactions, setTransactions] = useState({ items: [], summary: null, filters: {} });
  const [transactionFilters, setTransactionFilters] = useState({ dateFrom: '', dateTo: '', status: 'all', search: '' });
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
  const [announcementImageFile, setAnnouncementImageFile] = useState(null);
  const [announcementImagePreview, setAnnouncementImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sessionImageFile, setSessionImageFile] = useState(null);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [eventImageFile, setEventImageFile] = useState(null);
  const [eventImagePreview, setEventImagePreview] = useState(null);
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState(null);
  const [uploadingEventImage, setUploadingEventImage] = useState(false);
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
  const loadSessions = () => fetchAdminSessions(token).then(setSessions);
  const loadPackages = () => fetchAdminPackages(token).then(setPackages);
  const loadBookings = (sid) => fetchAdminBookings(token, sid).then(setBookings);
  const loadAnnouncements = () => fetchAdminAnnouncements(token).then(setAnnouncements);
  const loadDeletedSessions = () => fetchDeletedSessions(token).then(setDeletedSessions);
  const loadAuditLogs = () => fetchAuditLog(token, { limit: 50 }).then(setAuditLogs);
  const loadDatedBookingSales = (range) => {
    bookingSalesRangeRef.current = range;
    setBookingSalesRange(range);
    if (!range) {
      setDatedBookingSales(null);
      return Promise.resolve();
    }
    setDatedBookingSales(prev => ({ rows: prev?.rows || [], error: '', loading: true }));
    return fetchBookingSales(token, range)
      .then(data => {
        if (bookingSalesRangeRef.current !== range) return;
        if (!Array.isArray(data)) throw new Error(data?.error || 'Could not load booking sales for those dates.');
        setDatedBookingSales({ rows: data, error: '', loading: false });
      })
      .catch(err => {
        if (bookingSalesRangeRef.current !== range) return;
        setDatedBookingSales({ rows: [], error: err?.message || 'Could not load booking sales for those dates.', loading: false });
      });
  };
  // Refunds and other booking changes call this; refresh the date view too
  // so its counts do not go stale while staff work through past sessions.
  const loadBookingSales = () => {
    if (bookingSalesRangeRef.current) loadDatedBookingSales(bookingSalesRangeRef.current);
    return fetchBookingSales(token).then(setBookingSales);
  };
  const loadDailySales = (filters = {}, legacySearch) => {
    const nextFilters = typeof filters === 'object' && filters !== null
      ? filters
      : { date: filters, search: legacySearch };
    const range = nextFilters.range || dailySalesRange;
    const date = nextFilters.date || dailySalesDate;
    const dateFrom = nextFilters.dateFrom || date;
    const dateTo = nextFilters.dateTo || dailySalesDateTo || dateFrom;
    const request = {
      range,
      search: nextFilters.search ?? dailySalesSearch,
    };
    if (range === 'multi-day') {
      request.dateFrom = dateFrom;
      request.dateTo = dateTo;
    } else {
      request.date = date;
    }
    return fetchDailySales(token, request).then(setDailySales);
  };
  const loadTransactions = (filters = transactionFilters) => fetchAdminTransactions(token, filters).then(setTransactions);
  const loadCustomers = (search) => fetchAdminCustomers(token, search ?? customerSearch).then(setCustomers);

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

  const handleSalesDrilldown = (sale) => {
    const quantity = Number(sale?.quantity || sale?.sold || 0);
    if (!sale?.id || quantity <= 0) return;

    setSalesDrilldown({ session: { ...sale, quantity }, bookings: [], loading: true, error: '' });
    fetchAdminBookings(token, sale.id)
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error(data?.message || data?.error || 'Could not load booking details.');
        }
        setSalesDrilldown({ session: { ...sale, quantity }, bookings: data, loading: false, error: '' });
      })
      .catch(err => {
        setSalesDrilldown({
          session: { ...sale, quantity },
          bookings: [],
          loading: false,
          error: err?.message || 'Could not load booking details.',
        });
      });
  };

  const handlePrintSalesDrilldown = () => {
    printSalesDrilldown(salesDrilldown);
  };

  const handleSaveSalesDrilldownCsv = () => {
    saveSalesDrilldownCsv(salesDrilldown);
  };

  const handlePrintDailySalesReceipt = () => {
    printDailySalesReceiptDocument(dailySales, receiptConfigRef.current);
  };

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

  const resolveEventImageUrl = async (currentUrl, imageFile) => {
    if (!imageFile) return currentUrl || '';
    setUploadingEventImage(true);
    try {
      const result = await uploadImage(token, imageFile);
      return result.url || '';
    } finally {
      setUploadingEventImage(false);
    }
  };

  const handleSessionFlyerFileChange = (file) => {
    setSessionFlyerFile(file);
    setSessionFlyerPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleEditFlyerFileChange = (file) => {
    setEditFlyerFile(file);
    setEditFlyerPreview(file ? URL.createObjectURL(file) : null);
  };

  // Strip the website listing off a payload that must never reach the site,
  // and block a save that would publish an incomplete listing.
  const prepareWebsiteListing = (payload, { flyerFile, publishable }) => {
    if (!publishable || !payload.website_published) {
      // Take it off the site but keep the copy. The admin form posts every
      // field on save, so blanking the rows here would silently destroy the
      // listing and force a full retype if they ever re-publish.
      payload.website_published = false;
      return { ok: true, publishing: false };
    }
    const missing = missingWebsiteListingFields(payload, { hasFlyerFile: !!flyerFile });
    if (missing.length > 0) {
      alert('Cannot publish to the website yet. Still missing:\n\n- ' + missing.join('\n- '));
      return { ok: false, publishing: true };
    }
    return { ok: true, publishing: true, flyerFile };
  };

  const handleCreateSession = async () => {
    if (!newSession.date) return;
    const payload = { ...newSession, session_type: newSession.is_special_event ? 'special_bingo' : 'regular_bingo' };
    payload.packages = (payload.packages || []).map(({ priceText, ...pkg }) => pkg);
    if (payload.session_type === 'special_bingo') {
      payload.sales_cutoff_at = buildSalesCutoffAt(payload.sales_cutoff_date || payload.date, payload.cutoff_time);
    }
    delete payload.sales_cutoff_date;
    const proceed = confirmAdminAction({
      action: payload.is_special_event ? 'Create this special bingo event' : 'Create this regular bingo session',
      details: [
        payload.is_special_event ? `Title: ${payload.event_title || 'Special Bingo'}` : 'Type: Regular Bingo',
        `Date: ${formatDateShort(payload.date)}`,
        `Time: ${formatTime(payload.time)}`,
        payload.is_special_event && payload.doors_open_time ? `Doors open: ${formatTime(payload.doors_open_time)}` : '',
        `Sales cutoff: ${payload.session_type === 'special_bingo' ? formatSalesCutoff(payload.sales_cutoff_at, payload.cutoff_time) : formatTime(payload.cutoff_time)}`,
        payload.is_special_event ? `Packages: ${packageSummary(payload.packages) || 'No packages configured'}` : '',
        payload.website_published ? 'Website: published to wolastoqcasino.ca (flyer goes live)' : '',
      ],
      warning: 'This will make the session available for booking.',
    });
    if (!proceed) return;
    if (!payload.is_special_event) {
      delete payload.event_title;
      delete payload.event_description;
      delete payload.event_image_url;
      delete payload.doors_open_time;
      delete payload.packages;
    }
    // Only special bingo events carry a website listing; a regular session has
    // no flyer to show.
    const websitePlan = prepareWebsiteListing(payload, {
      flyerFile: sessionFlyerFile,
      publishable: payload.session_type === 'special_bingo',
    });
    if (!websitePlan.ok) return;
    try {
      if (payload.session_type === 'special_bingo') {
        payload.event_image_url = await resolveEventImageUrl(payload.event_image_url, sessionImageFile);
      }
      if (websitePlan.publishing) {
        payload.website_flyer_url = await resolveEventImageUrl(payload.website_flyer_url, sessionFlyerFile);
      }
      await createAdminSession(token, payload);
      setNewSession({ date: '', time: '18:30', cutoff_time: '12:00', sales_cutoff_date: '', doors_open_time: '', is_special_event: true, event_title: '', event_description: '', event_image_url: '', packages: defaultSpecialEventPackages(specialBingoConfig), ...emptyWebsiteListing() });
      setSessionImageFile(null);
      setSessionImagePreview(null);
      setSessionFlyerFile(null);
      setSessionFlyerPreview(null);
      loadSessions();
    } catch (err) {
      alert('Failed to create session: ' + (err?.message || 'Unknown error. Please try again.'));
      setUploadingEventImage(false);
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement.message) return;
    if (!confirmAdminAction({
      action: 'Create this announcement',
      details: [
        `Title: ${newAnnouncement.title || '(no title)'}`,
        `Type: ${newAnnouncement.type}`,
        `Start: ${newAnnouncement.start_date || 'Immediately'}`,
        `End: ${newAnnouncement.end_date || 'No end date'}`,
      ],
      warning: 'This will be shown on the public site while active.',
    })) return;
    let imageUrl = newAnnouncement.image_url || '';
    // Upload image file if selected
    if (announcementImageFile) {
      setUploadingImage(true);
      try {
        const result = await uploadImage(token, announcementImageFile);
        imageUrl = result.url;
      } catch (err) {
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }
    await createAdminAnnouncement(token, { ...newAnnouncement, image_url: imageUrl || null });
    setNewAnnouncement({ title: '', message: '', type: 'info', start_date: '', end_date: '', image_url: '' });
    setAnnouncementImageFile(null);
    setAnnouncementImagePreview(null);
    loadAnnouncements();
  };

  const handleToggleAnnouncement = async (id, currentActive) => {
    if (!confirmAdminAction({
      action: `${currentActive ? 'Deactivate' : 'Activate'} this announcement`,
      warning: 'This changes whether customers can see it.',
    })) return;
    await updateAdminAnnouncement(token, id, { is_active: !currentActive });
    loadAnnouncements();
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!confirmAdminAction({
      action: 'Delete this announcement',
      warning: 'This cannot be undone.',
    })) return;
    await deleteAdminAnnouncement(token, id);
    loadAnnouncements();
  };

  const handleEditSessionPkgs = async (sessionId) => {
    setEditingSessionPkgs(sessionId);
    const pkgs = await fetchAdminSessionPackages(token, sessionId);
    const session = sessions.find(s => s.id === sessionId);
    const sessionType = session?.session_type || (session?.is_special_event ? 'special_bingo' : 'regular_bingo');
    const fallbackPkgs = sessionType === 'special_bingo'
      ? defaultSpecialEventPackages(specialBingoConfig)
      : sessionType === 'event'
        ? defaultEventPackages()
        : [];
    setSessionPkgList(pkgs.length > 0 ? pkgs : [
      ...fallbackPkgs
    ]);
  };

  const handleSaveSessionPkgs = async () => {
    const dropped = sessionPkgList.filter(p => (p.name || p.priceText) && !(p.name && p.price > 0));
    if (dropped.length > 0) {
      const names = dropped.map(p => p.name || '(unnamed)').join(', ');
      if (!window.confirm(`These packages have no name or a CA$0.00 price and will be REMOVED from this session if you continue:\n\n${names}\n\nContinue and remove them?`)) return;
    }
    const valid = sessionPkgList.filter(p => p.name && p.price > 0).map(({ priceText, ...p }) => p);
    const session = sessions.find(s => s.id === editingSessionPkgs);
    if (!confirmAdminAction({
      action: 'Save package/pricing changes for this session',
      details: [
        session ? `Session: ${formatDateShort(session.date)} at ${formatTime(session.time)}` : '',
        `Packages: ${packageSummary(valid) || 'No valid packages'}`,
      ],
      warning: 'This affects new bookings for this session.',
    })) return;
    try {
      await setAdminSessionPackages(token, editingSessionPkgs, valid);
      setEditingSessionPkgs(null);
      setSessionPkgList([]);
    } catch (err) {
      alert('Failed to save packages: ' + (err?.message || 'Unknown error'));
    }
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

  const handleToggleSession = async (id, currentAvail) => {
    const session = sessions.find(s => s.id === id);
    if (!confirmAdminAction({
      action: `${currentAvail ? 'Disable' : 'Enable'} this session`,
      details: [
        session ? `Session: ${formatDateShort(session.date)} at ${formatTime(session.time)}` : '',
        session?.event_title ? `Title: ${session.event_title}` : '',
      ],
      warning: currentAvail
        ? 'Customers will not be able to book this session while it is disabled.'
        : 'Customers will be able to book this session again.',
    })) return;
    await updateAdminSession(token, id, { is_available: !currentAvail });
    loadSessions();
  };

  const handleDeleteSession = async (id, date, time) => {
    if (!confirmAdminAction({
      action: 'Delete this session',
      details: [`Session: ${formatDateShort(date)} at ${formatTime(time)}`],
      warning: 'This will soft-delete the session so it can be restored later.',
    })) return;
    await deleteAdminSession(token, id);
    loadSessions();
  };

  const handleStartEdit = (session) => {
    const salesCutoff = splitSalesCutoffAt(session.sales_cutoff_at, session.date || '', session.cutoff_time || '12:00');
    setEditingSession(session);
    setEditForm({
      date: session.date || '',
      time: session.time || '',
      cutoff_time: salesCutoff.time,
      sales_cutoff_date: salesCutoff.date,
      notify_reschedule: true,
      is_special_event: !!session.is_special_event,
      session_type: session.session_type || (session.is_special_event ? 'special_bingo' : 'regular_bingo'),
      event_title: session.event_title || '',
      event_description: session.event_description || '',
      doors_open_time: session.doors_open_time || '',
      ticket_limit: session.ticket_limit || '',
      event_image_url: session.event_image_url || '',
      ...websiteListingFromSession(session),
    });
    setEditImageFile(null);
    setEditImagePreview(null);
    setEditFlyerFile(null);
    setEditFlyerPreview(null);
  };

  const handleSaveEdit = async () => {
    if (!editingSession || !editForm.date) return;
    const payload = { ...editForm };
    if (payload.session_type === 'event' || payload.session_type === 'special_bingo') {
      payload.is_special_event = true;
      payload.sales_cutoff_at = buildSalesCutoffAt(payload.sales_cutoff_date || payload.date, payload.cutoff_time);
    }
    delete payload.sales_cutoff_date;
    if (!payload.is_special_event && payload.session_type !== 'event') {
      payload.event_title = '';
      payload.event_description = '';
      payload.event_image_url = '';
      payload.doors_open_time = '';
      payload.sales_cutoff_at = null;
    }
    const websitePlan = prepareWebsiteListing(payload, {
      flyerFile: editFlyerFile,
      publishable: payload.session_type === 'special_bingo' || payload.session_type === 'event',
    });
    if (!websitePlan.ok) return;
    if (!confirmAdminAction({
      action: 'Save changes to this session',
      details: [
        `Date: ${formatDateShort(payload.date)}`,
        `Time: ${formatTime(payload.time)}`,
        (payload.session_type === 'event' || payload.session_type === 'special_bingo') && payload.doors_open_time ? `Doors open: ${formatTime(payload.doors_open_time)}` : '',
        `Sales cutoff: ${payload.session_type === 'event' || payload.session_type === 'special_bingo' ? formatSalesCutoff(payload.sales_cutoff_at, payload.cutoff_time) : formatTime(payload.cutoff_time)}`,
        payload.session_type === 'event' ? `Ticket limit: ${payload.ticket_limit || 'Unlimited'}` : '',
        payload.event_title ? `Title: ${payload.event_title}` : '',
        payload.website_published ? 'Website: published to wolastoqcasino.ca' : '',
      ],
      warning: payload.notify_reschedule === false
        ? 'Reschedule emails are turned off for this change.'
        : 'This can affect booking availability and customer tickets.',
    })) return;
    try {
      if (payload.session_type === 'event' || payload.session_type === 'special_bingo') {
        payload.event_image_url = await resolveEventImageUrl(payload.event_image_url, editImageFile);
      }
      if (websitePlan.publishing) {
        payload.website_flyer_url = await resolveEventImageUrl(payload.website_flyer_url, editFlyerFile);
      }
      await updateAdminSession(token, editingSession.id, payload);
      setEditingSession(null);
      setEditImageFile(null);
      setEditImagePreview(null);
      setEditFlyerFile(null);
      setEditFlyerPreview(null);
      loadSessions();
    } catch (err) {
      alert('Failed to update session: ' + (err?.message || 'Unknown error'));
      setUploadingEventImage(false);
    }
  };

  const handleTogglePackage = async (id, currentActive) => {
    const pkg = packages.find(p => p.id === id);
    if (!confirmAdminAction({
      action: `${currentActive ? 'Disable' : 'Enable'} this package`,
      details: [pkg ? `Package: ${pkg.name}` : ''],
      warning: currentActive
        ? 'Customers will not be able to add this package to new bookings.'
        : 'Customers will be able to add this package to new bookings.',
    })) return;
    await updateAdminPackage(token, id, { is_active: !currentActive });
    loadPackages();
  };

  const handleCreatePackage = async () => {
    if (!newPackage.name || !newPackage.price) return;
    if (!confirmAdminAction({
      action: 'Create this package',
      details: [
        `Name: ${newPackage.name}`,
        `Price: $${Number.parseFloat(newPackage.price || 0).toFixed(2)}`,
        `Type: ${newPackage.type}`,
        `Max quantity: ${parseInt(newPackage.max_quantity) || 1}`,
      ],
      warning: 'This package can be used for new bookings once active.',
    })) return;
    await createAdminPackage(token, {
      name: newPackage.name,
      price: Math.round(parseFloat(newPackage.price) * 100),
      type: newPackage.type,
      max_quantity: parseInt(newPackage.max_quantity) || 1,
      sort_order: parseInt(newPackage.sort_order) || 0,
      is_phd: newPackage.is_phd,
      description: newPackage.description
    });
    setNewPackage({ name: '', price: '', type: 'optional', max_quantity: 1, sort_order: 0, is_phd: false, description: '' });
    loadPackages();
  };

  // --- Package edit/delete ---
  // Edit: load the package's current values into the inline edit form (price is
  // converted from cents to a string of dollars so the admin sees what they
  // typed originally). Cancel discards. Save PATCHes the row and reloads.
  const handleStartEditPackage = (pkg) => {
    setEditingPackage({
      id: pkg.id,
      name: pkg.name || '',
      price: ((pkg.price || 0) / 100).toFixed(2),
      type: pkg.type || 'optional',
      max_quantity: pkg.max_quantity ?? 1,
      sort_order: pkg.sort_order ?? 0,
      is_phd: !!pkg.is_phd,
      description: pkg.description || '',
    });
  };

  const handleCancelEditPackage = () => setEditingPackage(null);

  const handleSaveEditPackage = async () => {
    if (!editingPackage) return;
    if (!editingPackage.name || editingPackage.price === '' || editingPackage.price == null) {
      alert('Name and price are required.');
      return;
    }
    const priceCents = Math.round(parseFloat(editingPackage.price) * 100);
    if (Number.isNaN(priceCents) || priceCents < 0) {
      alert('Price must be a non-negative number.');
      return;
    }
    if (!confirmAdminAction({
      action: 'Save package changes',
      details: [
        `Name: ${editingPackage.name}`,
        `Price: ${formatPrice(priceCents)}`,
        `Type: ${editingPackage.type}`,
        `Max quantity: ${parseInt(editingPackage.max_quantity) || 1}`,
      ],
      warning: 'This affects new bookings that use this package.',
    })) return;
    try {
      await updateAdminPackage(token, editingPackage.id, {
        name: editingPackage.name,
        price: priceCents,
        type: editingPackage.type,
        max_quantity: parseInt(editingPackage.max_quantity) || 1,
        sort_order: parseInt(editingPackage.sort_order) || 0,
        is_phd: editingPackage.is_phd,
        description: editingPackage.description,
      });
      setEditingPackage(null);
      loadPackages();
    } catch (err) {
      alert('Failed to update package: ' + (err?.message || 'Unknown error'));
    }
  };

  // Delete: confirms first. Server hard-deletes only if no booking_items or
  // booking_addons reference the package; otherwise it returns 409 with a
  // friendly message and the admin sees a guidance alert (use Disable instead).
  const handleDeletePackage = async (pkg) => {
    if (!confirmAdminAction({
      action: `Delete package "${pkg.name}"`,
      warning: `This will permanently remove it. If this package has ever been used in a booking, the system will block the delete and you'll be told to disable it instead. This cannot be undone.`,
    })) return;
    try {
      const result = await deleteAdminPackage(token, pkg.id);
      if (!result.ok) {
        // 409 → in use, 404 → already gone, anything else → generic
        if (result.error === 'package_in_use' && result.message) {
          alert(result.message);
        } else if (result.error) {
          alert('Could not delete package: ' + (result.message || result.error));
        } else {
          alert('Could not delete package (HTTP ' + result.status + ').');
        }
      }
    } catch (err) {
      alert('Failed to delete package: ' + (err?.message || 'Unknown error'));
    }
    loadPackages();
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

  const handleCreateEvent = async () => {
    if (!newEvent.date || !newEvent.event_title) return;
    const payload = {
      ...newEvent,
      session_type: 'event',
      is_special_event: true,
      sales_cutoff_at: buildSalesCutoffAt(newEvent.sales_cutoff_date || newEvent.date, newEvent.cutoff_time),
    };
    delete payload.sales_cutoff_date;
    payload.packages = (payload.packages || []).map(({ priceText, ...pkg }) => pkg);
    const proceed = confirmAdminAction({
      action: 'Create this live event / venue',
      details: [
        `Live Event / Venue: ${payload.event_title}`,
        `Date: ${formatDateShort(payload.date)}`,
        `Time: ${formatTime(payload.time)}`,
        payload.doors_open_time ? `Doors open: ${formatTime(payload.doors_open_time)}` : '',
        `Sales cutoff: ${formatSalesCutoff(payload.sales_cutoff_at, payload.cutoff_time)}`,
        `Ticket limit: ${payload.ticket_limit || 'Unlimited'}`,
        `Ticket: ${packageSummary(payload.packages) || 'No ticket price configured'}`,
      ],
      warning: 'This will make the live event / venue available for booking.',
    });
    if (!proceed) return;

    try {
      payload.event_image_url = await resolveEventImageUrl(payload.event_image_url, eventImageFile);
      await createAdminSession(token, payload);
      setNewEvent({ date: '', time: '19:00', cutoff_time: '12:00', sales_cutoff_date: '', doors_open_time: '', ticket_limit: '', session_type: 'event', is_special_event: true, event_title: '', event_description: '', event_image_url: '', packages: defaultEventPackages() });
      setEventImageFile(null);
      setEventImagePreview(null);
      loadSessions();
      loadBookingSales();
    } catch (err) {
      alert('Failed to create live event / venue: ' + (err?.message || 'Unknown error. Please try again.'));
      setUploadingEventImage(false);
    }
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

  const handleExportCustomers = () => {
    fetch(getCustomersExportUrl(customerSearch), { headers: adminHeaders(token) })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'customers-report.csv';
        a.click();
        URL.revokeObjectURL(url);
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
