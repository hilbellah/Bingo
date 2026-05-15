import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  fetchAdminDashboard, fetchAdminSessions, createAdminSession,
  updateAdminSession, deleteAdminSession, fetchAdminPackages, createAdminPackage, updateAdminPackage, deleteAdminPackage,
  fetchAdminBookings, cancelAdminBooking, clearAdminTestBookings, refundAdminBooking, getExportUrl, adminHeaders,
  fetchAdminAnnouncements, createAdminAnnouncement, updateAdminAnnouncement, deleteAdminAnnouncement,
  fetchAdminSessionPackages, setAdminSessionPackages,
  fetchAdminBulkTickets,
  fetchDeletedSessions, restoreSession, fetchSessionBookings, fetchAuditLog,
  fetchBookingSales, fetchDailySales,
  fetchAdminCustomers, getCustomersExportUrl,
  fetchSettings, saveSettings,
  uploadImage,
  fetchAdminPhdInventory, updateAdminPhdInventory,
  toggleAdminSeat
} from '../api';
import { fetchSeats } from '../api';
import AdminDashboardContent from './AdminDashboardContent';
import AdminShell from './AdminShell';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
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
  const [newSession, setNewSession] = useState({ date: '', time: '18:30', cutoff_time: '12:00', is_special_event: true, event_title: '', event_description: '', packages: [] });
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', message: '', type: 'info', start_date: '', end_date: '', image_url: '' });
  const [newPackage, setNewPackage] = useState({ name: '', price: '', type: 'optional', max_quantity: 1, sort_order: 0, is_phd: false });
  const [editingPackage, setEditingPackage] = useState(null); // { id, name, price, type, max_quantity, sort_order, is_phd } — null when not editing
  const [editingSessionPkgs, setEditingSessionPkgs] = useState(null); // session id being edited
  const [sessionPkgList, setSessionPkgList] = useState([]);
  const [editingSession, setEditingSession] = useState(null); // session object being edited
  const [editForm, setEditForm] = useState({ date: '', time: '', cutoff_time: '', is_special_event: false, event_title: '', event_description: '' });
  const [bulkDateFrom, setBulkDateFrom] = useState('');
  const [bulkDateTo, setBulkDateTo] = useState('');
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
    paperWidth: '80mm'
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
  const loadCustomers = (search) => fetchAdminCustomers(token, search ?? customerSearch).then(setCustomers);

  useEffect(() => {
    if (tab === 'sessions') loadSessions();
    if (tab === 'packages') loadPackages();
    if (tab === 'bookings') { loadBookingSales(); loadDailySales(dailySalesDate); }
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
    const cfg = receiptConfigRef.current;
    const w = window.open('', '_blank', 'width=350,height=600');
    if (!w) return;
    const lines = [
      `<div class="header">${cfg.businessName}</div>`,
      `<div class="sub-header">${cfg.businessSubtitle}</div>`,
      '<div class="line"></div>',
      `<div class="center bold">${cfg.receiptTitle}</div>`,
      `<div class="center">${booking.sessionDate} at ${booking.sessionTime}</div>`,
      '<div class="line"></div>',
    ];
    if (cfg.showRefNumber) {
      lines.push(`<div class="row"><span>Ref:</span><span class="bold">${booking.referenceNumber}</span></div>`);
      lines.push('<div class="line"></div>');
    }
    lines.push('<div class="bold">Attendees:</div>');
    for (const item of booking.items) {
      lines.push(`<div style="padding:2px 0">${item.firstName} ${item.lastName}</div>`);
      if (item.referenceNumber) {
        lines.push(`<div style="font-size:10px;color:#555;padding-left:8px">Ticket: ${item.referenceNumber}</div>`);
      }
      if (cfg.showTableChair) {
        lines.push(`<div class="item-row"><span class="item-desc" style="font-size:10px;color:#555">  T${item.tableNumber}/C${item.chairNumber} · ${item.packageName}</span>${cfg.showPackagePrice ? `<span class="item-amt">${item.packagePriceFormatted || ''}</span>` : ''}</div>`);
      }
      if (cfg.showAddons && item.addons && item.addons.length > 0) {
        for (const addon of item.addons) {
          lines.push(`<div class="item-row"><span class="item-desc" style="font-size:10px;color:#555">  + ${addon.packageName} x${addon.quantity}</span><span class="item-amt">${addon.priceFormatted}</span></div>`);
        }
      }
    }
    lines.push('<div class="dbl-line"></div>');
    lines.push(`<div class="total-row"><span>TOTAL</span><span>${booking.totalFormatted}</span></div>`);
    if (cfg.footerText) {
      lines.push('<div class="line"></div>');
      lines.push(`<div class="center" style="font-size:10px;margin-top:4px">${cfg.footerText}</div>`);
    }
    if (cfg.showTimestamp) {
      lines.push(`<div class="center" style="font-size:10px;margin-top:4px">${new Date(booking.createdAt).toLocaleString()}</div>`);
    }

    const bodyWidth = cfg.paperWidth === '58mm' ? '50mm' : '72mm';
    w.document.write(`<html><head><title>Receipt</title>
      <style>
        @page { size: ${cfg.paperWidth} auto; margin: 0; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: ${bodyWidth}; margin: 4mm auto; padding: 0; color: #000; line-height: 1.4; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 4px 0; }
        .dbl-line { border-top: 2px solid #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        .header { font-size: 14px; font-weight: bold; text-align: center; margin-bottom: 4px; }
        .sub-header { font-size: 10px; text-align: center; color: #333; margin-bottom: 8px; }
        .item-row { display: flex; justify-content: space-between; padding: 1px 0; }
        .item-desc { flex: 1; padding: 0 4px; }
        .item-amt { width: 60px; text-align: right; }
        .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; padding: 2px 0; }
        @media print { body { width: ${bodyWidth}; margin: 0 auto; } }
      </style></head><body>`);
    w.document.write(lines.join(''));
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  }, []);

  // Socket.IO connection for auto-print receipts
  useEffect(() => {
    if (!token) return;
    const socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:admin-receipts');
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
    const el = document.getElementById('sold-modal-content');
    if (!el) return;
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(`<html><head><title>Ticket Purchasers - ${soldModal.session.date}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#333}
      h2{margin:0 0 4px}p.sub{color:#666;font-size:14px;margin:0 0 20px}
      .booking{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:16px}
      .ref{font-family:monospace;font-weight:600;color:#1a3a5c}.total{float:right}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
      th{text-align:left;color:#999;border-bottom:1px solid #ddd;padding:4px 0}
      td{padding:4px 0;border-bottom:1px solid #f0f0f0}
      @media print{body{padding:0}.booking{break-inside:avoid}}</style></head><body>`);
    w.document.write(`<h2>Ticket Purchasers</h2><p class="sub">${soldModal.session.date} at ${soldModal.session.time} — ${soldModal.session.sold} sold</p>`);
    w.document.write(el.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  const handleSavePurchasersCsv = () => {
    if (!soldModal) return;
    const rows = [['Reference', 'First Name', 'Last Name', 'Table', 'Chair', 'Package', 'Add-ons', 'Booking Total']];
    for (const b of soldModal.bookings) {
      for (const item of b.items) {
        const addons = item.addons.length > 0
          ? item.addons.map(a => `${a.packageName} x${a.quantity}`).join('; ')
          : '';
        rows.push([item.referenceNumber || b.referenceNumber, item.firstName, item.lastName, item.tableNumber, item.chairNumber, item.packageName, addons, b.totalFormatted]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchasers-${soldModal.session.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSalesDrilldown = (sale) => {
    if (sale.quantity === 0) return;
    fetchAdminBookings(token, sale.id).then(data => {
      setSalesDrilldown({ session: sale, bookings: data });
    });
  };

  const handlePrintSalesDrilldown = () => {
    const el = document.getElementById('sales-drilldown-content');
    if (!el || !salesDrilldown) return;
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(`<html><head><title>Bookings - ${salesDrilldown.session.description}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#333}
      h2{margin:0 0 4px}p.sub{color:#666;font-size:14px;margin:0 0 20px}
      .booking{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:16px}
      .ref{font-family:monospace;font-weight:600;color:#1a3a5c}.total{float:right}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
      th{text-align:left;color:#999;border-bottom:1px solid #ddd;padding:4px 0}
      td{padding:4px 0;border-bottom:1px solid #f0f0f0}
      @media print{body{padding:0}.booking{break-inside:avoid}}</style></head><body>`);
    w.document.write(`<h2>Bookings — ${salesDrilldown.session.description}</h2><p class="sub">${salesDrilldown.session.date} at ${salesDrilldown.session.time} — ${salesDrilldown.session.quantity} booking(s) — ${salesDrilldown.session.totalFormatted}</p>`);
    w.document.write(el.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  const handleSaveSalesDrilldownCsv = () => {
    if (!salesDrilldown) return;
    const rows = [['Ticket', 'Batch', 'First Name', 'Last Name', 'Table', 'Chair', 'Package', 'Add-ons', 'Booking Total', 'Status']];
    for (const b of salesDrilldown.bookings) {
      for (const item of b.items) {
        const addons = item.addons.length > 0
          ? item.addons.map(a => `${a.packageName} x${a.quantity}`).join('; ')
          : '';
        rows.push([item.referenceNumber || '—', b.referenceNumber, item.firstName, item.lastName, item.tableNumber, item.chairNumber, item.packageName, addons, b.totalFormatted, b.paymentStatus]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${salesDrilldown.session.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Thermal receipt print helper (80mm width, monospace)
  const printReceipt = (title, lines) => {
    const w = window.open('', '_blank', 'width=350,height=600');
    w.document.write(`<html><head><title>Receipt</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 4mm auto; padding: 0; color: #000; line-height: 1.4; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 4px 0; }
        .dbl-line { border-top: 2px solid #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        .row span:last-child { text-align: right; }
        .header { font-size: 14px; font-weight: bold; text-align: center; margin-bottom: 4px; }
        .sub-header { font-size: 10px; text-align: center; color: #333; margin-bottom: 8px; }
        .item-row { display: flex; justify-content: space-between; padding: 1px 0; }
        .item-qty { width: 30px; text-align: center; }
        .item-desc { flex: 1; padding: 0 4px; }
        .item-amt { width: 60px; text-align: right; }
        .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; padding: 2px 0; }
        @media print { body { width: 72mm; margin: 0 auto; } }
      </style></head><body>`);
    w.document.write(lines.join(''));
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  const handlePrintDailySalesReceipt = () => {
    if (!dailySales || dailySales.items.length === 0) return;
    const lines = [
      '<div class="header">SMEC BINGO</div>',
      '<div class="sub-header">Saint Mary\'s Entertainment Centre</div>',
      '<div class="line"></div>',
      '<div class="center bold">DAILY SALES REPORT</div>',
      `<div class="center">${dailySales.date}</div>`,
      '<div class="line"></div>',
      '<div class="item-row"><span class="item-qty bold">#</span><span class="item-desc bold">Name / Ticket</span><span class="item-amt bold">Price</span></div>',
      '<div class="line"></div>',
    ];
    for (const item of dailySales.items) {
      const addonTotal = item.addons ? item.addons.reduce((s, a) => s + a.price, 0) : 0;
      const totalPrice = '$' + ((item.itemPrice + addonTotal) / 100).toFixed(2);
      lines.push(`<div class="item-row"><span class="item-qty">${item.rowNum}</span><span class="item-desc">${item.firstName} ${item.lastName}</span><span class="item-amt">${totalPrice}</span></div>`);
      lines.push(`<div style="font-size:10px;color:#555;padding-left:34px">${item.referenceNumber} · T${item.tableNumber}/C${item.chairNumber} · ${item.packageName || ''}</div>`);
      if (item.addons && item.addons.length > 0) {
        for (const addon of item.addons) {
          lines.push(`<div style="font-size:10px;color:#555;padding-left:34px">+ ${addon.packageName} x${addon.quantity} (${addon.priceFormatted})</div>`);
        }
      }
    }
    lines.push('<div class="dbl-line"></div>');
    if (dailySales.addonSubtotal > 0) {
      lines.push(`<div class="item-row"><span class="item-desc">Packages</span><span class="item-amt">${dailySales.packageSubtotalFormatted}</span></div>`);
      lines.push(`<div class="item-row"><span class="item-desc">Add-ons</span><span class="item-amt">${dailySales.addonSubtotalFormatted}</span></div>`);
      lines.push('<div class="line"></div>');
    }
    lines.push(`<div class="total-row"><span>TOTAL (${dailySales.totalTickets} tickets, ${dailySales.totalBookings} bookings)</span><span>${dailySales.grandTotalFormatted}</span></div>`);
    lines.push('<div class="line"></div>');
    lines.push(`<div class="center" style="font-size:10px;margin-top:8px">${new Date().toLocaleString()}</div>`);
    printReceipt('Daily Sales', lines);
  };

  const handlePrintBookingReceipt = (booking) => {
    const lines = [
      '<div class="header">SMEC BINGO</div>',
      '<div class="sub-header">Saint Mary\'s Entertainment Centre</div>',
      '<div class="line"></div>',
      '<div class="center bold">BOOKING RECEIPT</div>',
      `<div class="center">${booking.sessionDate} at ${booking.sessionTime}</div>`,
      '<div class="line"></div>',
      `<div class="row"><span>Ref:</span><span class="bold">${booking.referenceNumber}</span></div>`,
      `<div class="row"><span>Status:</span><span>${booking.paymentStatus.toUpperCase()}</span></div>`,
      '<div class="line"></div>',
      '<div class="bold">Attendees:</div>',
    ];
    for (const item of booking.items) {
      lines.push(`<div style="padding:2px 0">${item.firstName} ${item.lastName}</div>`);
      if (item.referenceNumber) {
        lines.push(`<div style="font-size:10px;color:#555;padding-left:8px">Ticket: ${item.referenceNumber}</div>`);
      }
      lines.push(`<div class="item-row"><span class="item-desc" style="font-size:10px;color:#555">  T${item.tableNumber}/C${item.chairNumber} · ${item.packageName}</span><span class="item-amt">${item.packagePriceFormatted || ''}</span></div>`);
      if (item.addons.length > 0) {
        for (const addon of item.addons) {
          lines.push(`<div class="item-row"><span class="item-desc" style="font-size:10px;color:#555">  + ${addon.packageName} x${addon.quantity}</span><span class="item-amt">${addon.priceFormatted}</span></div>`);
        }
      }
    }
    lines.push('<div class="dbl-line"></div>');
    lines.push(`<div class="total-row"><span>TOTAL</span><span>${booking.totalFormatted}</span></div>`);
    lines.push('<div class="line"></div>');
    lines.push(`<div class="center" style="font-size:10px;margin-top:8px">${new Date(booking.createdAt).toLocaleString()}</div>`);
    printReceipt('Booking Receipt', lines);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_display_name');
    sessionStorage.removeItem('admin_is_super_user');
    navigate('/admin');
  };

  const handleCreateSession = async () => {
    if (!newSession.date) return;
    const payload = { ...newSession };
    if (!payload.is_special_event) {
      delete payload.event_title;
      delete payload.event_description;
      delete payload.packages;
    }
    try {
      await createAdminSession(token, payload);
      setNewSession({ date: '', time: '18:30', cutoff_time: '12:00', is_special_event: true, event_title: '', event_description: '', packages: [] });
      loadSessions();
    } catch (err) {
      alert('Failed to create session: ' + (err?.message || 'Unknown error. Please try again.'));
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement.message) return;
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
    await updateAdminAnnouncement(token, id, { is_active: !currentActive });
    loadAnnouncements();
  };

  const handleDeleteAnnouncement = async (id) => {
    await deleteAdminAnnouncement(token, id);
    loadAnnouncements();
  };

  const handleEditSessionPkgs = async (sessionId) => {
    setEditingSessionPkgs(sessionId);
    const pkgs = await fetchAdminSessionPackages(token, sessionId);
    setSessionPkgList(pkgs.length > 0 ? pkgs : [
      { name: '', price: 0, type: 'required', max_quantity: 1, sort_order: 0, is_phd: false }
    ]);
  };

  const handleSaveSessionPkgs = async () => {
    const valid = sessionPkgList.filter(p => p.name && p.price > 0);
    await setAdminSessionPackages(token, editingSessionPkgs, valid);
    setEditingSessionPkgs(null);
    setSessionPkgList([]);
  };

  const handleLoadBulkTickets = async () => {
    if (!bulkDateFrom) return;
    setBulkLoading(true);
    setBulkData(null);
    try {
      const data = await fetchAdminBulkTickets(token, bulkDateFrom, bulkDateTo || bulkDateFrom);
      setBulkData(data);
    } catch (err) {
      setBulkData({ error: err.message || 'Failed to load tickets' });
    }
    setBulkLoading(false);
  };

  const handleToggleSession = async (id, currentAvail) => {
    await updateAdminSession(token, id, { is_available: !currentAvail });
    loadSessions();
  };

  const handleDeleteSession = async (id, date, time) => {
    if (!window.confirm(`Delete session on ${date} at ${time}? This will soft-delete it (can be restored later).`)) return;
    await deleteAdminSession(token, id);
    loadSessions();
  };

  const handleStartEdit = (session) => {
    setEditingSession(session);
    setEditForm({
      date: session.date || '',
      time: session.time || '',
      cutoff_time: session.cutoff_time || '12:00',
      is_special_event: !!session.is_special_event,
      event_title: session.event_title || '',
      event_description: session.event_description || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSession || !editForm.date) return;
    const payload = { ...editForm };
    if (!payload.is_special_event) {
      payload.event_title = '';
      payload.event_description = '';
    }
    try {
      await updateAdminSession(token, editingSession.id, payload);
      setEditingSession(null);
      loadSessions();
    } catch (err) {
      alert('Failed to update session: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleTogglePackage = async (id, currentActive) => {
    await updateAdminPackage(token, id, { is_active: !currentActive });
    loadPackages();
  };

  const handleCreatePackage = async () => {
    if (!newPackage.name || !newPackage.price) return;
    await createAdminPackage(token, {
      name: newPackage.name,
      price: Math.round(parseFloat(newPackage.price) * 100),
      type: newPackage.type,
      max_quantity: parseInt(newPackage.max_quantity) || 1,
      sort_order: parseInt(newPackage.sort_order) || 0,
      is_phd: newPackage.is_phd
    });
    setNewPackage({ name: '', price: '', type: 'optional', max_quantity: 1, sort_order: 0, is_phd: false });
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
    try {
      await updateAdminPackage(token, editingPackage.id, {
        name: editingPackage.name,
        price: priceCents,
        type: editingPackage.type,
        max_quantity: parseInt(editingPackage.max_quantity) || 1,
        sort_order: parseInt(editingPackage.sort_order) || 0,
        is_phd: editingPackage.is_phd,
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
    const confirmMsg =
      `Delete package "${pkg.name}"?\n\nThis will permanently remove it. ` +
      `If this package has ever been used in a booking, the system will block the delete and ` +
      `you'll be told to disable it instead.\n\nThis cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
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
    if (!window.confirm('Restore this deleted session?')) return;
    await restoreSession(token, id);
    loadDeletedSessions();
    loadAuditLogs();
  };

  const handleViewArchiveBookings = async (session) => {
    const bookings = await fetchSessionBookings(token, session.id);
    setArchiveBookings({ session, bookings });
  };

  const handleCancelBooking = async (id) => {
    if (!confirm('Cancel this booking and release seats?')) return;
    await cancelAdminBooking(token, id);
    loadBookings(reportSession);
  };

  const handleClearTestBookings = async () => {
    const proceed = window.confirm(
      'Clear ALL sandbox booking test data?\n\n' +
      'This deletes booking records, ticket rows, add-ons, and payment event logs, then releases all seats. ' +
      'It keeps sessions, packages, admin users, settings, theme, announcements, and PHD inventory.\n\n' +
      'This action is blocked once Authorize.Net is set to production. Continue?'
    );
    if (!proceed) return;

    const result = await clearAdminTestBookings(token);
    if (!result.ok) {
      window.alert(result.message || result.error || 'Could not clear test bookings.');
      return;
    }

    window.alert(
      `Cleared ${result.deletedBookings || 0} booking(s), released ${result.releasedSeats || 0} seat(s).`
    );
    loadBookingSales();
    loadDailySales(dailySalesDate, dailySalesSearch);
    loadBookings(reportSession);
    loadDashboard(dashboardDateFrom, dashboardDateTo);
    loadPhdInventory();
  };

  // Refund a paid booking through Authorize.Net. Server auto-decides void vs
  // refund and releases seats. /cancel is for legacy/admin bookings with no
  // payment processor; /refund is for real Authorize.Net transactions.
  const handleRefundBooking = async (id, refNumber) => {
    const proceed = window.confirm(
      `Refund booking ${refNumber || id}?\n\n` +
      `This will return the customer's money via Authorize.Net and release the seats. ` +
      `Cannot be undone. Proceed?`
    );
    if (!proceed) return;

    const result = await refundAdminBooking(token, id);
    if (result.ok) {
      window.alert(
        `Refund successful (${result.action || 'completed'}).` +
        (result.seatsReleased ? ` ${result.seatsReleased} seat(s) released.` : '')
      );
      loadBookings(reportSession);
    } else {
      window.alert('Refund failed: ' + (result.error || 'Unknown error'));
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
            <p className="text-xs text-gray-400">Saint Mary's Entertainment Centre</p>
            <span className="text-xs font-medium text-brand-blue">{adminDisplayName}</span>
    </div>
  );


  const dashboardContext = {
    tab,
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
    sessionPkgList,
    setSessionPkgList,
    handleSaveSessionPkgs,
    packages,
    newPackage,
    setNewPackage,
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
    handlePrintDailySalesReceipt,
    bookingSearch,
    setBookingSearch,
    reportSession,
    setReportSession,
    bookings,
    loadBookings,
    handleCancelBooking,
    handleClearTestBookings,
    handleRefundBooking,
    handleExport,
    bulkDateFrom,
    setBulkDateFrom,
    bulkDateTo,
    setBulkDateTo,
    bulkLoading,
    handleLoadBulkTickets,
    bulkData,
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
