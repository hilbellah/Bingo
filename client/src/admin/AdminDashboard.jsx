import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  fetchAdminDashboard, fetchAdminSessions, createAdminSession,
  updateAdminSession, deleteAdminSession, fetchAdminPackages, createAdminPackage, updateAdminPackage, deleteAdminPackage,
  fetchAdminBookings, fetchAdminBookingReceipt, cancelAdminBooking, clearAdminTestBookings, refundAdminBooking, refundAdminBookingItem, getExportUrl, adminHeaders,
  fetchAdminAnnouncements, createAdminAnnouncement, updateAdminAnnouncement, deleteAdminAnnouncement,
  fetchAdminSessionPackages, setAdminSessionPackages,
  fetchAdminBulkTickets,
  fetchDeletedSessions, restoreSession, fetchSessionBookings, fetchAuditLog,
  fetchBookingSales, fetchDailySales, fetchAdminTransactions, resetAdminSalesReporting,
  fetchAdminCustomers, getCustomersExportUrl,
  fetchSettings, saveSettings,
  uploadImage,
  fetchAdminPhdInventory, updateAdminPhdInventory,
  toggleAdminSeat
} from '../api';
import { fetchSeats } from '../api';
import AdminDashboardContent from './AdminDashboardContent';
import AdminShell from './AdminShell';
import {
  printAutoBookingReceipt,
  printDailySalesReceipt as printDailySalesReceiptDocument,
  printPurchasers,
  printSalesDrilldown,
  savePurchasersCsv,
  saveSalesDrilldownCsv,
} from './adminPrintUtils';
import { confirmAdminAction } from './adminConfirm';
import { formatDateShort, formatTime } from '../utils/formatters';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function packageSummary(packages = []) {
  return packages
    .filter(pkg => pkg?.name)
    .map(pkg => `${pkg.name} (${formatPrice(pkg.price || 0)})`)
    .join(', ');
}

const DEFAULT_SPECIAL_BINGO_CONFIG = {
  admissionName: 'Special Bingo Admission (includes 1 PHD)',
  admissionPrice: 7500,
  additionalPhdName: 'Additional PHD Unit',
  additionalPhdPrice: 5000,
  additionalPhdMaxQuantity: 1,
};

const DEFAULT_BOOKING_CONFIG = {
  maxOptionalPackagesPerPlayer: 3,
};

function defaultSpecialEventPackages(config = DEFAULT_SPECIAL_BINGO_CONFIG) {
  const resolved = { ...DEFAULT_SPECIAL_BINGO_CONFIG, ...(config || {}) };
  return [
    { name: resolved.admissionName, price: resolved.admissionPrice, type: 'required', max_quantity: 1, sort_order: 0, is_phd: true, description: 'Special bingo admission with one included handheld device.' },
    { name: resolved.additionalPhdName, price: resolved.additionalPhdPrice, type: 'optional', max_quantity: resolved.additionalPhdMaxQuantity, sort_order: 1, is_phd: true, description: 'Additional handheld device for special bingo.' },
  ];
}

function defaultEventPackages() {
  return [
    { name: 'Live Event / Venue Admission', price: 0, type: 'required', max_quantity: 1, sort_order: 0, is_phd: false, description: 'Admission ticket for the live event or venue booking.' },
  ];
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem('admin_token');
  const adminDisplayName = sessionStorage.getItem('admin_display_name') || 'Admin';
  const isSuperUser = sessionStorage.getItem('admin_is_super_user') === 'true';

  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [reportSession, setReportSession] = useState('');
  const [specialBingoConfig, setSpecialBingoConfig] = useState(DEFAULT_SPECIAL_BINGO_CONFIG);
  const [bookingConfig, setBookingConfig] = useState(DEFAULT_BOOKING_CONFIG);
  const [bookingConfigSaved, setBookingConfigSaved] = useState(false);
  const [newSession, setNewSession] = useState({ date: '', time: '18:30', cutoff_time: '12:00', is_special_event: true, event_title: '', event_description: '', packages: defaultSpecialEventPackages() });
  const [newEvent, setNewEvent] = useState({ date: '', time: '19:00', cutoff_time: '12:00', session_type: 'event', is_special_event: true, event_title: '', event_description: '', packages: defaultEventPackages() });
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', message: '', type: 'info', start_date: '', end_date: '', image_url: '' });
  const [newPackage, setNewPackage] = useState({ name: '', price: '', type: 'optional', max_quantity: 1, sort_order: 0, is_phd: false, description: '' });
  const [editingPackage, setEditingPackage] = useState(null); // { id, name, price, type, max_quantity, sort_order, is_phd } — null when not editing
  const [editingSessionPkgs, setEditingSessionPkgs] = useState(null); // session id being edited
  const [sessionPkgList, setSessionPkgList] = useState([]);
  const [editingSession, setEditingSession] = useState(null); // session object being edited
  const [editForm, setEditForm] = useState({ date: '', time: '', cutoff_time: '', is_special_event: false, event_title: '', event_description: '' });
  const [bulkDateFrom, setBulkDateFrom] = useState('');
  const [bulkDateTo, setBulkDateTo] = useState('');
  const [bulkDepartment, setBulkDepartment] = useState('all');
  const [bulkData, setBulkData] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [soldModal, setSoldModal] = useState(null); // { session, bookings } when open
  const [deletedSessions, setDeletedSessions] = useState([]);
  const [archiveBookings, setArchiveBookings] = useState(null); // { session, bookings }
  const [auditLogs, setAuditLogs] = useState([]);
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingSales, setBookingSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [salesDrilldown, setSalesDrilldown] = useState(null); // { session, bookings }
  const [dailySales, setDailySales] = useState(null);
  const [dailySalesDate, setDailySalesDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailySalesSearch, setDailySalesSearch] = useState('');
  const [transactions, setTransactions] = useState({ items: [], summary: null, filters: {} });
  const [transactionFilters, setTransactionFilters] = useState({ dateFrom: '', dateTo: '', status: 'all', search: '' });
  const [dashboardDateFrom, setDashboardDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dashboardDateTo, setDashboardDateTo] = useState(new Date().toISOString().split('T')[0]);
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
    partialCutBetweenReceipts: false
  });
  const [receiptSaved, setReceiptSaved] = useState(false);
  const [announcementImageFile, setAnnouncementImageFile] = useState(null);
  const [announcementImagePreview, setAnnouncementImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
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
    loadDashboard();
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
    fetchSettings(token, 'special_bingo_config').then(config => {
      if (!config) return;
      const merged = { ...DEFAULT_SPECIAL_BINGO_CONFIG, ...config };
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
  }, []);

  const loadDashboard = (from, to) => fetchAdminDashboard(token, from || dashboardDateFrom, to || dashboardDateTo).then(setDashboard);
  const loadSessions = () => fetchAdminSessions(token).then(setSessions);
  const loadPackages = () => fetchAdminPackages(token).then(setPackages);
  const loadBookings = (sid) => fetchAdminBookings(token, sid).then(setBookings);
  const loadAnnouncements = () => fetchAdminAnnouncements(token).then(setAnnouncements);
  const loadDeletedSessions = () => fetchDeletedSessions(token).then(setDeletedSessions);
  const loadAuditLogs = () => fetchAuditLog(token, { limit: 50 }).then(setAuditLogs);
  const loadBookingSales = () => fetchBookingSales(token).then(setBookingSales);
  const loadDailySales = (date, search) => fetchDailySales(token, date, search).then(setDailySales);
  const loadTransactions = (filters = transactionFilters) => fetchAdminTransactions(token, filters).then(setTransactions);
  const loadCustomers = (search) => fetchAdminCustomers(token, search ?? customerSearch).then(setCustomers);

  useEffect(() => {
    if (tab === 'sessions') loadSessions();
    if (tab === 'events') { loadSessions(); loadBookingSales(); }
    if (tab === 'packages') loadPackages();
    if (tab === 'bookings') { loadBookingSales(); loadDailySales(dailySalesDate); loadTransactions(transactionFilters); }
    if (tab === 'customers') loadCustomers();
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'announcements') loadAnnouncements();
    if (tab === 'archive') { loadDeletedSessions(); loadAuditLogs(); }
    if (tab === 'inventory') { fetchAdminPhdInventory(token).then(data => { setPhdInventory(data); setPhdEditForm({ totalStock: data.totalStock, perPlayerLimit: data.perPlayerLimit }); }); }
    if (tab === 'chairs') loadSessions();
    if (tab === 'users' && !isSuperUser) setTab('dashboard');
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
      // Refresh dashboard if on dashboard tab
      loadDashboard();
    });

    socket.on('phd:updated', (phdData) => {
      // Update PHD inventory in real-time when a booking with PHD add-ons is created
      setPhdInventory(prev => prev ? { ...prev, ...phdData } : phdData);
      setDashboard(prev => prev ? { ...prev, phdInventory: phdData } : prev);
    });



    return () => {
      socket.emit('leave:admin-receipts');
      socket.off('admin:receipts:unauthorized');
      socket.disconnect();
    };
  }, [token]);

  const handleSoldClick = (session) => {
    if (session.sold === 0) return;
    fetchAdminBookings(token, session.id).then(data => {
      setSoldModal({ session, bookings: data });
    });
  };

  const handlePrintPurchasers = () => {
    printPurchasers(soldModal);
  };

  const handleSavePurchasersCsv = () => {
    savePurchasersCsv(soldModal);
  };

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
    printBookingReceipt(booking);
  };

  const handleReprintTransactionReceipt = async (bookingId) => {
    const booking = await fetchAdminBookingReceipt(token, bookingId);
    printBookingReceipt(booking);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_display_name');
    sessionStorage.removeItem('admin_is_super_user');
    navigate('/admin');
  };

  const handleCreateSession = async () => {
    if (!newSession.date) return;
    const payload = { ...newSession, session_type: newSession.is_special_event ? 'special_bingo' : 'regular_bingo' };
    const proceed = confirmAdminAction({
      action: payload.is_special_event ? 'Create this special bingo event' : 'Create this regular bingo session',
      details: [
        payload.is_special_event ? `Title: ${payload.event_title || 'Special Bingo'}` : 'Type: Regular Bingo',
        `Date: ${formatDateShort(payload.date)}`,
        `Time: ${formatTime(payload.time)}`,
        `Sales cutoff: ${formatTime(payload.cutoff_time)}`,
        payload.is_special_event ? `Packages: ${packageSummary(payload.packages) || 'No packages configured'}` : '',
      ],
      warning: 'This will make the session available for booking.',
    });
    if (!proceed) return;
    if (!payload.is_special_event) {
      delete payload.event_title;
      delete payload.event_description;
      delete payload.packages;
    }
    try {
      await createAdminSession(token, payload);
      setNewSession({ date: '', time: '18:30', cutoff_time: '12:00', is_special_event: true, event_title: '', event_description: '', packages: defaultSpecialEventPackages(specialBingoConfig) });
      loadSessions();
    } catch (err) {
      alert('Failed to create session: ' + (err?.message || 'Unknown error. Please try again.'));
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
    const valid = sessionPkgList.filter(p => p.name && p.price > 0);
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
    setEditingSession(session);
    setEditForm({
      date: session.date || '',
      time: session.time || '',
      cutoff_time: session.cutoff_time || '12:00',
      notify_reschedule: true,
      is_special_event: !!session.is_special_event,
      session_type: session.session_type || (session.is_special_event ? 'special_bingo' : 'regular_bingo'),
      event_title: session.event_title || '',
      event_description: session.event_description || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSession || !editForm.date) return;
    const payload = { ...editForm };
    if (payload.session_type === 'event') {
      payload.is_special_event = true;
    }
    if (!payload.is_special_event && payload.session_type !== 'event') {
      payload.event_title = '';
      payload.event_description = '';
    }
    if (!confirmAdminAction({
      action: 'Save changes to this session',
      details: [
        `Date: ${formatDateShort(payload.date)}`,
        `Time: ${formatTime(payload.time)}`,
        `Sales cutoff: ${formatTime(payload.cutoff_time)}`,
        payload.event_title ? `Title: ${payload.event_title}` : '',
      ],
      warning: payload.notify_reschedule === false
        ? 'Reschedule emails are turned off for this change.'
        : 'This can affect booking availability and customer tickets.',
    })) return;
    try {
      await updateAdminSession(token, editingSession.id, payload);
      setEditingSession(null);
      loadSessions();
    } catch (err) {
      alert('Failed to update session: ' + (err?.message || 'Unknown error'));
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
    if (!confirmAdminAction({
      action: 'Cancel this booking and release seats',
      warning: 'This should only be used for bookings that should no longer hold seats.',
    })) return;
    await cancelAdminBooking(token, id);
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
    };
    const proceed = confirmAdminAction({
      action: 'Create this live event / venue',
      details: [
        `Live Event / Venue: ${payload.event_title}`,
        `Date: ${formatDateShort(payload.date)}`,
        `Time: ${formatTime(payload.time)}`,
        `Sales cutoff: ${formatTime(payload.cutoff_time)}`,
        `Ticket: ${packageSummary(payload.packages) || 'No ticket price configured'}`,
      ],
      warning: 'This will make the live event / venue available for booking.',
    });
    if (!proceed) return;

    try {
      await createAdminSession(token, payload);
      setNewEvent({ date: '', time: '19:00', cutoff_time: '12:00', session_type: 'event', is_special_event: true, event_title: '', event_description: '', packages: defaultEventPackages() });
      loadSessions();
      loadBookingSales();
    } catch (err) {
      alert('Failed to create live event / venue: ' + (err?.message || 'Unknown error. Please try again.'));
    }
  };

  const handleClearTestBookings = async () => {
    const proceed = confirmAdminAction({
      action: 'Run go-live test cleanup',
      warning: 'This deletes pending, failed, and cancelled test bookings, clears temporary held seats, and removes email verification codes. Paid, refunded, and voided Authorize.Net records are kept and must be handled with refund/void if needed.',
    });
    if (!proceed) return;

    const result = await clearAdminTestBookings(token);
    if (!result.ok) {
      window.alert(result.message || result.error || 'Could not clear test bookings.');
      return;
    }

    window.alert(
      result.message || `Cleared ${result.deletedBookings || 0} booking(s), released ${result.releasedSeats || 0} seat(s).`
    );
    loadBookingSales();
    loadDailySales(dailySalesDate, dailySalesSearch);
    loadTransactions(transactionFilters);
    loadBookings(reportSession);
    loadDashboard(dashboardDateFrom, dashboardDateTo);
    loadPhdInventory();
  };

  const handleResetSalesReporting = async () => {
    const proceed = confirmAdminAction({
      action: 'Reset sales report totals',
      warning: 'This keeps Authorize.Net payment records and audit history, but hides older test sales/refunds from Daily Sales, Booking Sales, Transactions, and dashboard totals. New sales after this reset will count normally.',
    });
    if (!proceed) return;

    const result = await resetAdminSalesReporting(token);
    if (!result.ok) {
      window.alert(result.message || result.error || 'Could not reset sales reporting totals.');
      return;
    }

    window.alert(result.message || 'Sales reporting totals were reset.');
    loadBookingSales();
    loadDailySales(dailySalesDate, dailySalesSearch);
    loadTransactions(transactionFilters);
    loadDashboard(dashboardDateFrom, dashboardDateTo);
  };

  // Refund a paid booking through Authorize.Net. Server auto-decides void vs
  // refund and releases seats. /cancel is for legacy/admin bookings with no
  // payment processor; /refund is for real Authorize.Net transactions.
  const handleRefundBooking = async (id, refNumber) => {
    const proceed = confirmAdminAction({
      action: `Refund booking ${refNumber || id}`,
      warning: `This will return the customer's money via Authorize.Net and release the seats. Cannot be undone.`,
    });
    if (!proceed) return;

    const result = await refundAdminBooking(token, id);
    if (result.ok) {
      window.alert(
        `Refund successful (${result.action || 'completed'}).` +
        (result.seatsReleased ? ` ${result.seatsReleased} seat(s) released.` : '')
      );
      loadBookings(reportSession);
      loadTransactions(transactionFilters);
      loadBookingSales();
      loadDailySales(dailySalesDate, dailySalesSearch);
      if (salesDrilldown?.session?.id) handleSalesDrilldown(salesDrilldown.session);
      if (soldModal?.session?.id) {
        fetchAdminBookings(token, soldModal.session.id).then(data => {
          setSoldModal({ session: soldModal.session, bookings: data });
        });
      }
    } else {
      window.alert('Refund failed: ' + (result.error || 'Unknown error'));
    }
  };

  const handleRefundBookingItem = async (item, booking) => {
    const ticketName = `${item.firstName || ''} ${item.lastName || ''}`.trim();
    const proceed = confirmAdminAction({
      action: `Refund ticket ${item.referenceNumber || ''}${ticketName ? ` for ${ticketName}` : ''}`,
      warning: `Only this ticket will be refunded and its seat will be released. The rest of booking ${booking?.referenceNumber || ''} will remain active. Cannot be undone.`,
    });
    if (!proceed) return;

    const result = await refundAdminBookingItem(token, item.id);
    if (result.ok) {
      window.alert(
        `Ticket refund successful (${result.action || 'completed'}).` +
        (result.amountFormatted ? ` Amount: ${result.amountFormatted}.` : '') +
        (result.seatsReleased ? ` ${result.seatsReleased} seat released.` : '')
      );
      loadBookings(reportSession);
      loadTransactions(transactionFilters);
      loadBookingSales();
      loadDailySales(dailySalesDate, dailySalesSearch);
      if (salesDrilldown?.session?.id) handleSalesDrilldown(salesDrilldown.session);
      if (soldModal?.session?.id) {
        fetchAdminBookings(token, soldModal.session.id).then(data => {
          setSoldModal({ session: soldModal.session, bookings: data });
        });
      }
    } else {
      window.alert('Ticket refund failed: ' + (result.error || 'Unknown error'));
    }
  };

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
    setDashboardDateFrom(newDate);
    if (newDate > dashboardDateTo) setDashboardDateTo(newDate);
    loadDashboard(newDate, newDate > dashboardDateTo ? newDate : dashboardDateTo);
  };
  const handleDashboardDateToChange = (e) => {
    const newDate = e.target.value;
    setDashboardDateTo(newDate);
    loadDashboard(dashboardDateFrom, newDate);
  };

  const adminHeaderActions = (
    <div className="flex items-center gap-4">
            <button
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
            </button>
            <span className="text-xs font-medium text-brand-blue">{adminDisplayName}</span>
    </div>
  );


  const dashboardContext = {
    tab,
    setTab,
    isSuperUser,
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
    handleSoldClick,
    sessions,
    newSession,
    setNewSession,
    handleCreateSession,
    newEvent,
    setNewEvent,
    handleCreateEvent,
    editingSession,
    setEditingSession,
    editForm,
    setEditForm,
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
    handleCancelBooking,
    handleClearTestBookings,
    handleResetSalesReporting,
    handleRefundBooking,
    handleRefundBookingItem,
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
    handleRestoreSession,
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
    soldModal,
    setSoldModal,
    handlePrintPurchasers,
    handleSavePurchasersCsv,
  };

  return (
    <AdminShell
      activeTab={tab}
      onTabChange={setTab}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
      adminDisplayName={adminDisplayName}
      isSuperUser={isSuperUser}
      onLogout={handleLogout}
      rightActions={adminHeaderActions}
    >

        <AdminDashboardContent value={dashboardContext} />
    </AdminShell>
  );
}
