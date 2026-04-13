import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  fetchAdminDashboard, fetchAdminSessions, createAdminSession,
  updateAdminSession, deleteAdminSession, fetchAdminPackages, createAdminPackage, updateAdminPackage,
  fetchAdminBookings, cancelAdminBooking, getExportUrl, adminHeaders,
  fetchAdminAnnouncements, createAdminAnnouncement, updateAdminAnnouncement, deleteAdminAnnouncement,
  fetchAdminSessionPackages, setAdminSessionPackages,
  fetchAdminBulkTickets,
  fetchDeletedSessions, restoreSession, fetchSessionBookings, fetchAuditLog,
  fetchBookingSales, fetchDailySales,
  fetchSettings, saveSettings,
  uploadImage,
  fetchAdminPhdInventory, updateAdminPhdInventory
} from '../api';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem('admin_token');

  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [reportSession, setReportSession] = useState('');
  const [newSession, setNewSession] = useState({ date: '', time: '18:30', cutoff_time: '12:00', is_special_event: false, event_title: '', event_description: '', packages: [] });
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', message: '', type: 'info', start_date: '', end_date: '', image_url: '' });
  const [newPackage, setNewPackage] = useState({ name: '', price: '', type: 'optional', max_quantity: 1, sort_order: 0, is_phd: false });
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

  useEffect(() => {
    if (tab === 'sessions') loadSessions();
    if (tab === 'packages') loadPackages();
    if (tab === 'bookings') { loadBookingSales(); loadDailySales(dailySalesDate); }
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'announcements') loadAnnouncements();
    if (tab === 'archive') { loadDeletedSessions(); loadAuditLogs(); }
    if (tab === 'inventory') { fetchAdminPhdInventory(token).then(data => { setPhdInventory(data); setPhdEditForm({ totalStock: data.totalStock, perPlayerLimit: data.perPlayerLimit }); }); }
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
      setNewSession({ date: '', time: '18:30', cutoff_time: '12:00', is_special_event: false, event_title: '', event_description: '', packages: [] });
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

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '\u{1F4CA}' },
    { id: 'sessions', label: 'Sessions', icon: '\u{1F4C5}' },
    { id: 'packages', label: 'Packages', icon: '\u{1F4E6}' },
    { id: 'announcements', label: 'Announcements', icon: '\u{1F4E2}' },
    { id: 'bookings', label: 'Bookings & Reports', icon: '\u{1F4B0}' },
    { id: 'bulkprint', label: 'Bulk Print', icon: '\u{1F5A8}' },
    { id: 'archive', label: 'Archive & Audit', icon: '\u{1F5C3}' },
    { id: 'inventory', label: 'PHD Inventory', icon: '\u{1F4F1}' },
    { id: 'settings', label: 'Printing Settings', icon: '\u{1F5A8}' },
  ];

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

  return (
    <div className="min-h-screen bg-brand-light flex">
      {/* Sidebar Navigation */}
      <aside className={`bg-brand-blue text-white flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-56'} min-h-screen`}>
        <div className="p-4 border-b border-white/10">
          {!sidebarCollapsed && (
            <>
              <h1 className="text-lg font-bold leading-tight">SMEC</h1>
              <p className="text-xs text-gray-300 mt-0.5">Admin Panel</p>
            </>
          )}
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="mt-2 text-xs text-gray-300 hover:text-white">
            {sidebarCollapsed ? '\u{25B6}' : '\u{25C0}'}
          </button>
        </div>
        <nav className="flex-1 py-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                tab === t.id
                  ? 'bg-white/20 text-white font-semibold border-r-4 border-brand-gold'
                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
              }`}
              title={sidebarCollapsed ? t.label : undefined}
            >
              <span className="text-lg">{t.icon}</span>
              {!sidebarCollapsed && <span>{t.label}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10 space-y-2">
          {!sidebarCollapsed && (
            <>
              <a href="/tickets" className="block text-xs text-gray-300 hover:text-white">Reprint Tickets</a>
              <a href="/" className="block text-xs text-gray-300 hover:text-white">View Booking Page</a>
            </>
          )}
          <button onClick={handleLogout} className={`w-full text-xs bg-white/10 py-2 rounded hover:bg-white/20 ${sidebarCollapsed ? 'px-1' : 'px-3'}`}>
            {sidebarCollapsed ? '\u{1F6AA}' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-auto">
        {/* Top Bar */}
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-blue">{tabs.find(t => t.id === tab)?.label || 'Dashboard'}</h2>
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
          </div>
        </header>

        <div className="flex-1 px-6 py-6">
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
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#2563eb' }}>
                <p className="text-sm opacity-80">Total Bookings</p>
                <p className="text-4xl font-bold mt-1">{dashboard.todayBookings}</p>
                <p className="text-xs opacity-60 mt-1">paid bookings</p>
              </div>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#16a34a' }}>
                <p className="text-sm opacity-80">Revenue</p>
                <p className="text-4xl font-bold mt-1">{dashboard.todayRevenueFormatted}</p>
                <p className="text-xs opacity-60 mt-1">total earned</p>
              </div>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#0d9488' }}>
                <p className="text-sm opacity-80">Total Persons</p>
                <p className="text-4xl font-bold mt-1">{dashboard.totalPersons || 0}</p>
                <p className="text-xs opacity-60 mt-1">attendees</p>
              </div>
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
              <div className="bg-white rounded-xl p-5 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Chairs Sold</p>
                  <p className="text-3xl font-bold text-red-600">{dashboard.soldChairs || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-2xl">
                  {'\u{1F4BA}'}
                </div>
              </div>
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
                  <h3 className="font-semibold text-brand-blue">PHD Inventory (Handheld Devices)</h3>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    dashboard.phdInventory.remaining <= 20 ? 'bg-red-100 text-red-700' :
                    dashboard.phdInventory.remaining <= 50 ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {dashboard.phdInventory.remaining} remaining
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{dashboard.phdInventory.totalStock}</p>
                    <p className="text-xs text-blue-500">Total Stock</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{dashboard.phdInventory.totalUsed}</p>
                    <p className="text-xs text-red-500">In Use</p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${dashboard.phdInventory.remaining <= 20 ? 'bg-red-50' : 'bg-green-50'}`}>
                    <p className={`text-2xl font-bold ${dashboard.phdInventory.remaining <= 20 ? 'text-red-600' : 'text-green-600'}`}>{dashboard.phdInventory.remaining}</p>
                    <p className={`text-xs ${dashboard.phdInventory.remaining <= 20 ? 'text-red-500' : 'text-green-500'}`}>Available</p>
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
                  {recentReceipts.map((r, i) => (
                    <div key={r.referenceNumber + '-' + i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <span className="font-mono font-semibold text-sm text-brand-blue">{r.referenceNumber}</span>
                        <span className="text-xs text-gray-500 ml-2">{r.sessionDate} at {r.sessionTime}</span>
                        <span className="text-xs text-gray-400 ml-2">{r.items.length} person(s)</span>
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
                  ))}
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
                            <button onClick={() => handleSoldClick(s)} className="text-brand-blue underline hover:text-blue-800 font-medium cursor-pointer">{s.sold}</button>
                          ) : (
                            <span className="text-gray-500">0</span>
                          )}
                        </td>
                        <td className="py-2 text-amber-500">{s.held}</td>
                        <td className="py-2 text-gray-600">{s.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SESSIONS TAB */}
        {tab === 'sessions' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
              <h3 className="font-semibold text-brand-blue mb-3">Create New Session</h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date</label>
                  <div className="flex gap-1 items-center">
                    <select value={newSession.date ? new Date(newSession.date + 'T12:00:00').getMonth() : ''} onChange={e => {
                      const m = parseInt(e.target.value);
                      const prev = newSession.date ? new Date(newSession.date + 'T12:00:00') : new Date();
                      prev.setMonth(m);
                      const y = prev.getFullYear();
                      const d = Math.min(prev.getDate(), new Date(y, m + 1, 0).getDate());
                      setNewSession({...newSession, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                    }} className="px-2 py-2 border rounded-lg text-sm">
                      <option value="" disabled>Month</option>
                      {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                      ))}
                    </select>
                    <select value={newSession.date ? new Date(newSession.date + 'T12:00:00').getDate() : ''} onChange={e => {
                      const d = parseInt(e.target.value);
                      const prev = newSession.date ? new Date(newSession.date + 'T12:00:00') : new Date();
                      const y = prev.getFullYear();
                      const m = prev.getMonth();
                      setNewSession({...newSession, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                    }} className="px-2 py-2 border rounded-lg text-sm">
                      <option value="" disabled>Day</option>
                      {Array.from({length: 31}, (_, i) => (
                        <option key={i+1} value={i+1}>{i+1}</option>
                      ))}
                    </select>
                    <select value={newSession.date ? new Date(newSession.date + 'T12:00:00').getFullYear() : ''} onChange={e => {
                      const y = parseInt(e.target.value);
                      const prev = newSession.date ? new Date(newSession.date + 'T12:00:00') : new Date();
                      const m = prev.getMonth();
                      const d = Math.min(prev.getDate(), new Date(y, m + 1, 0).getDate());
                      setNewSession({...newSession, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                    }} className="px-2 py-2 border rounded-lg text-sm">
                      <option value="" disabled>Year</option>
                      {[2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Time</label>
                  <input type="time" value={newSession.time} onChange={e => setNewSession({...newSession, time: e.target.value})}
                    className="px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Cutoff</label>
                  <input type="time" value={newSession.cutoff_time} onChange={e => setNewSession({...newSession, cutoff_time: e.target.value})}
                    className="px-3 py-2 border rounded-lg text-sm" />
                </div>
                <button onClick={handleCreateSession}
                  className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90">
                  {newSession.is_special_event ? 'Add Special Event' : 'Add Session'}
                </button>
              </div>

              {/* Special Event Toggle */}
              <div className="mt-4 border-t pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newSession.is_special_event}
                    onChange={e => setNewSession({...newSession, is_special_event: e.target.checked})}
                    className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                  <span className="text-sm font-medium text-gray-700">Special Event</span>
                </label>

                {newSession.is_special_event && (
                  <div className="mt-3 space-y-3 bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Event Title</label>
                      <input value={newSession.event_title} onChange={e => setNewSession({...newSession, event_title: e.target.value})}
                        className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Special Bingo Event 1" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                      <textarea value={newSession.event_description} onChange={e => setNewSession({...newSession, event_description: e.target.value})}
                        className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Event details..." />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-2">Event Packages</label>
                      {newSession.packages.map((pkg, i) => (
                        <div key={i} className="flex gap-2 items-center mb-2">
                          <input value={pkg.name} onChange={e => {
                            const pkgs = [...newSession.packages];
                            pkgs[i] = {...pkgs[i], name: e.target.value};
                            setNewSession({...newSession, packages: pkgs});
                          }} className="flex-1 px-2 py-1.5 border rounded text-sm" placeholder="Package name" />
                          <div className="relative w-24">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">USD</span>
                            <input type="text" inputMode="decimal" value={(pkg.price / 100).toFixed(2)} onChange={e => {
                              const val = e.target.value.replace(/[^0-9.]/g, '');
                              const pkgs = [...newSession.packages];
                              pkgs[i] = {...pkgs[i], price: Math.round(parseFloat(val || 0) * 100)};
                              setNewSession({...newSession, packages: pkgs});
                            }} className="w-full pl-9 pr-2 py-1.5 border rounded text-sm" placeholder="0.00" />
                          </div>
                          <select value={pkg.type} onChange={e => {
                            const pkgs = [...newSession.packages];
                            pkgs[i] = {...pkgs[i], type: e.target.value};
                            setNewSession({...newSession, packages: pkgs});
                          }} className="px-2 py-1.5 border rounded text-sm">
                            <option value="required">Required</option>
                            <option value="optional">Add-on</option>
                          </select>
                          <input type="number" value={pkg.max_quantity} onChange={e => {
                            const pkgs = [...newSession.packages];
                            pkgs[i] = {...pkgs[i], max_quantity: parseInt(e.target.value) || 1};
                            setNewSession({...newSession, packages: pkgs});
                          }} className="w-16 px-2 py-1.5 border rounded text-sm" placeholder="Max" min="1" />
                          <label className="flex items-center gap-1 text-xs text-purple-600" title="PHD (Handheld Device)">
                            <input type="checkbox" checked={!!pkg.is_phd} onChange={e => {
                              const pkgs = [...newSession.packages];
                              pkgs[i] = {...pkgs[i], is_phd: e.target.checked};
                              setNewSession({...newSession, packages: pkgs});
                            }} className="rounded" />
                            PHD
                          </label>
                          <button onClick={() => {
                            const pkgs = newSession.packages.filter((_, j) => j !== i);
                            setNewSession({...newSession, packages: pkgs});
                          }} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                        </div>
                      ))}
                      <button onClick={() => setNewSession({...newSession, packages: [...newSession.packages, { name: '', price: 0, type: 'required', max_quantity: 1, sort_order: newSession.packages.length, is_phd: false }]})}
                        className="text-xs text-amber-600 hover:text-amber-800 font-medium">
                        + Add Package
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">All Sessions</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Cutoff</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.id} className={`border-b border-gray-50 ${s.is_special_event ? 'bg-amber-50/50' : ''}`}>
                        <td className="py-2 font-medium">{s.date}</td>
                        <td className="py-2">{s.time}</td>
                        <td className="py-2">{s.cutoff_time}</td>
                        <td className="py-2">
                          {s.is_special_event ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 font-medium">
                              {s.event_title || 'Special Event'}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Regular</span>
                          )}
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${s.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {s.is_available ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-2 flex gap-2">
                          <button onClick={() => handleStartEdit(s)}
                            className="text-xs text-brand-blue hover:underline font-medium">
                            Edit
                          </button>
                          <button onClick={() => handleToggleSession(s.id, s.is_available)}
                            className="text-xs text-brand-blue hover:underline">
                            {s.is_available ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => handleEditSessionPkgs(s.id)}
                            className="text-xs text-amber-600 hover:underline">
                            Packages
                          </button>
                          <button onClick={() => handleDeleteSession(s.id, s.date, s.time)}
                            className="text-xs text-red-500 hover:underline font-medium">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Edit Session Modal */}
            {editingSession && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
                  <h3 className="font-semibold text-brand-blue mb-4">Edit Session</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Date</label>
                        <div className="flex gap-1">
                          <select value={editForm.date ? new Date(editForm.date + 'T12:00:00').getMonth() : ''} onChange={e => {
                            const m = parseInt(e.target.value);
                            const prev = editForm.date ? new Date(editForm.date + 'T12:00:00') : new Date();
                            prev.setMonth(m);
                            const y = prev.getFullYear();
                            const d = Math.min(prev.getDate(), new Date(y, m + 1, 0).getDate());
                            setEditForm({...editForm, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                          }} className="px-1 py-2 border rounded-lg text-sm">
                            <option value="" disabled>Mon</option>
                            {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                              <option key={i} value={i}>{m}</option>
                            ))}
                          </select>
                          <select value={editForm.date ? new Date(editForm.date + 'T12:00:00').getDate() : ''} onChange={e => {
                            const d = parseInt(e.target.value);
                            const prev = editForm.date ? new Date(editForm.date + 'T12:00:00') : new Date();
                            const y = prev.getFullYear();
                            const m = prev.getMonth();
                            setEditForm({...editForm, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                          }} className="px-1 py-2 border rounded-lg text-sm">
                            <option value="" disabled>Day</option>
                            {Array.from({length: 31}, (_, i) => (
                              <option key={i+1} value={i+1}>{i+1}</option>
                            ))}
                          </select>
                          <select value={editForm.date ? new Date(editForm.date + 'T12:00:00').getFullYear() : ''} onChange={e => {
                            const y = parseInt(e.target.value);
                            const prev = editForm.date ? new Date(editForm.date + 'T12:00:00') : new Date();
                            const m = prev.getMonth();
                            const d = Math.min(prev.getDate(), new Date(y, m + 1, 0).getDate());
                            setEditForm({...editForm, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                          }} className="px-1 py-2 border rounded-lg text-sm">
                            <option value="" disabled>Year</option>
                            {[2025, 2026, 2027, 2028].map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Time</label>
                        <input type="time" value={editForm.time} onChange={e => setEditForm({...editForm, time: e.target.value})}
                          className="w-full px-3 py-2 border rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Cutoff</label>
                        <input type="time" value={editForm.cutoff_time} onChange={e => setEditForm({...editForm, cutoff_time: e.target.value})}
                          className="w-full px-3 py-2 border rounded-lg text-sm" />
                      </div>
                    </div>

                    <div className="border-t pt-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editForm.is_special_event}
                          onChange={e => setEditForm({...editForm, is_special_event: e.target.checked})}
                          className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                        <span className="text-sm font-medium text-gray-700">Special Event</span>
                      </label>

                      {editForm.is_special_event && (
                        <div className="mt-3 space-y-3 bg-amber-50 rounded-lg p-4 border border-amber-200">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Event Title</label>
                            <input value={editForm.event_title} onChange={e => setEditForm({...editForm, event_title: e.target.value})}
                              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Special Bingo Event 1" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                            <textarea value={editForm.event_description} onChange={e => setEditForm({...editForm, event_description: e.target.value})}
                              className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Event details..." />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button onClick={handleSaveEdit}
                        className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90">
                        Save Changes
                      </button>
                      <button onClick={() => setEditingSession(null)}
                        className="text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Session Packages Editor Modal */}
            {editingSessionPkgs && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
                  <h3 className="font-semibold text-brand-blue mb-4">Edit Session Packages</h3>
                  {sessionPkgList.map((pkg, i) => (
                    <div key={i} className="flex gap-2 items-center mb-2">
                      <input value={pkg.name} onChange={e => {
                        const list = [...sessionPkgList];
                        list[i] = {...list[i], name: e.target.value};
                        setSessionPkgList(list);
                      }} className="flex-1 px-2 py-1.5 border rounded text-sm" placeholder="Package name" />
                      <input type="text" inputMode="decimal" value={pkg.price / 100} onChange={e => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        const list = [...sessionPkgList];
                        list[i] = {...list[i], price: Math.round(parseFloat(val || 0) * 100)};
                        setSessionPkgList(list);
                      }} className="w-20 px-2 py-1.5 border rounded text-sm" placeholder="$" />
                      <select value={pkg.type} onChange={e => {
                        const list = [...sessionPkgList];
                        list[i] = {...list[i], type: e.target.value};
                        setSessionPkgList(list);
                      }} className="px-2 py-1.5 border rounded text-sm">
                        <option value="required">Required</option>
                        <option value="optional">Add-on</option>
                      </select>
                      <input type="number" value={pkg.max_quantity} onChange={e => {
                        const list = [...sessionPkgList];
                        list[i] = {...list[i], max_quantity: parseInt(e.target.value) || 1};
                        setSessionPkgList(list);
                      }} className="w-16 px-2 py-1.5 border rounded text-sm" min="1" />
                      <label className="flex items-center gap-1 text-xs text-purple-600" title="PHD (Handheld Device)">
                        <input type="checkbox" checked={!!pkg.is_phd} onChange={e => {
                          const list = [...sessionPkgList];
                          list[i] = {...list[i], is_phd: e.target.checked};
                          setSessionPkgList(list);
                        }} className="rounded" />
                        PHD
                      </label>
                      <button onClick={() => setSessionPkgList(sessionPkgList.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 text-sm">X</button>
                    </div>
                  ))}
                  <button onClick={() => setSessionPkgList([...sessionPkgList, { name: '', price: 0, type: 'required', max_quantity: 1, sort_order: sessionPkgList.length, is_phd: false }])}
                    className="text-xs text-brand-blue hover:underline mb-4 block">
                    + Add Package
                  </button>
                  <div className="flex gap-3">
                    <button onClick={handleSaveSessionPkgs}
                      className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90">
                      Save Packages
                    </button>
                    <button onClick={() => { setEditingSessionPkgs(null); setSessionPkgList([]); }}
                      className="text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PACKAGES TAB */}
        {tab === 'packages' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
              <h3 className="font-semibold text-brand-blue mb-3">Add Ticket Package</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Name</label>
                    <input value={newPackage.name} onChange={e => setNewPackage({...newPackage, name: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. 6-up Admission Book" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Price ($)</label>
                    <input type="text" inputMode="decimal" value={newPackage.price} onChange={e => setNewPackage({...newPackage, price: e.target.value.replace(/[^0-9.]/g, '')})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="5.00" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Type</label>
                    <select value={newPackage.type} onChange={e => setNewPackage({...newPackage, type: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm">
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Max Qty</label>
                    <input type="number" min="1" value={newPackage.max_quantity} onChange={e => setNewPackage({...newPackage, max_quantity: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Sort Order</label>
                    <input type="number" min="0" value={newPackage.sort_order} onChange={e => setNewPackage({...newPackage, sort_order: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newPackage.is_phd} onChange={e => setNewPackage({...newPackage, is_phd: e.target.checked})}
                    className="rounded" />
                  <span className="text-gray-600">This is a PHD (Personal Handheld Device)</span>
                </label>
                <button onClick={handleCreatePackage}
                  disabled={!newPackage.name || !newPackage.price}
                  className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40">
                  Add Package
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">Ticket Packages</h3>
              <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Price</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Max Qty</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packages.map(p => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="py-2 font-medium">
                      {p.name}
                      {p.is_phd ? <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">PHD</span> : null}
                    </td>
                    <td className="py-2">{formatPrice(p.price)}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.type === 'required' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {p.type}
                      </span>
                    </td>
                    <td className="py-2">{p.max_quantity}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {p.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-2">
                      <button onClick={() => handleTogglePackage(p.id, p.is_active)}
                        className="text-xs text-brand-blue hover:underline">
                        {p.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* ANNOUNCEMENTS TAB */}
        {tab === 'announcements' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
              <h3 className="font-semibold text-brand-blue mb-3">Create Announcement</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Title (optional)</label>
                    <input value={newAnnouncement.title} onChange={e => setNewAnnouncement({...newAnnouncement, title: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Announcement title" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Type</label>
                    <select value={newAnnouncement.type} onChange={e => setNewAnnouncement({...newAnnouncement, type: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm">
                      <option value="info">Info (Blue)</option>
                      <option value="warning">Warning (Amber)</option>
                      <option value="success">Success (Green)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Message</label>
                  <textarea value={newAnnouncement.message} onChange={e => setNewAnnouncement({...newAnnouncement, message: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Announcement message..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Start Date (optional)</label>
                    <input type="date" value={newAnnouncement.start_date} onChange={e => setNewAnnouncement({...newAnnouncement, start_date: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">End Date (optional)</label>
                    <input type="date" value={newAnnouncement.end_date} onChange={e => setNewAnnouncement({...newAnnouncement, end_date: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Image (optional)</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm border transition-colors">
                      {announcementImageFile ? 'Change Image' : 'Upload Image'}
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files[0];
                        if (file) {
                          setAnnouncementImageFile(file);
                          setAnnouncementImagePreview(URL.createObjectURL(file));
                          setNewAnnouncement({...newAnnouncement, image_url: ''});
                        }
                      }} />
                    </label>
                    <span className="text-gray-300">or</span>
                    <input value={newAnnouncement.image_url} onChange={e => {
                      setNewAnnouncement({...newAnnouncement, image_url: e.target.value});
                      setAnnouncementImageFile(null);
                      setAnnouncementImagePreview(null);
                    }}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Paste image URL..." />
                  </div>
                  {(announcementImagePreview || newAnnouncement.image_url) && (
                    <div className="mt-2 relative inline-block">
                      <img src={announcementImagePreview || newAnnouncement.image_url} alt="Preview"
                        className="h-20 rounded-lg object-cover border" />
                      <button onClick={() => {
                        setAnnouncementImageFile(null);
                        setAnnouncementImagePreview(null);
                        setNewAnnouncement({...newAnnouncement, image_url: ''});
                      }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">&times;</button>
                    </div>
                  )}
                </div>
                <button onClick={handleCreateAnnouncement} disabled={!newAnnouncement.message || uploadingImage}
                  className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40">
                  {uploadingImage ? 'Uploading...' : 'Create Announcement'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">All Announcements</h3>
              {announcements.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No announcements yet</p>
              ) : (
                <div className="space-y-3">
                  {announcements.map(a => (
                    <div key={a.id} className={`border rounded-lg p-4 ${a.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              a.type === 'info' ? 'bg-blue-100 text-blue-700' :
                              a.type === 'warning' ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>{a.type}</span>
                            {a.title && <span className="font-semibold text-sm">{a.title}</span>}
                            <span className={`px-2 py-0.5 rounded-full text-xs ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {a.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{a.message}</p>
                          {a.image_url && (
                            <img src={a.image_url} alt="Announcement" className="mt-2 h-16 rounded object-cover border" />
                          )}
                          {(a.start_date || a.end_date) && (
                            <p className="text-xs text-gray-400 mt-1">
                              {a.start_date && `From: ${a.start_date}`} {a.end_date && `Until: ${a.end_date}`}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => handleToggleAnnouncement(a.id, a.is_active)}
                            className="text-xs text-brand-blue hover:underline">
                            {a.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button onClick={() => handleDeleteAnnouncement(a.id)}
                            className="text-xs text-red-500 hover:underline">
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* BOOKINGS TAB — Booking Sales Summary */}
        {tab === 'bookings' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-4">Booking Sales</h3>
              {bookingSales.length === 0 ? (
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
                        {bookingSales.map((sale, idx) => (
                          <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="py-2.5 pl-2 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="py-2.5">
                              <span className="font-medium text-gray-800">{sale.description}</span>
                              {sale.isSpecialEvent && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-medium">Event</span>
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
                            {bookingSales.reduce((sum, s) => sum + s.quantity, 0)}
                          </td>
                          <td className="py-3 text-right pr-2 font-bold text-brand-gold">
                            {formatPrice(bookingSales.reduce((sum, s) => sum + s.totalAmount, 0))}
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
        {/* BULK PRINT TAB */}
        {tab === 'bulkprint' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4 no-print">
              <h3 className="font-semibold text-brand-blue mb-3">Bulk Print Tickets</h3>
              <p className="text-sm text-gray-500 mb-4">Select a date or date range to load and print all tickets at once.</p>
              <div className="flex flex-wrap gap-3 items-end">
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
                <button onClick={handleLoadBulkTickets} disabled={!bulkDateFrom || bulkLoading}
                  className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40">
                  {bulkLoading ? 'Loading...' : 'Load Tickets'}
                </button>
                {bulkData && bulkData.totalTickets > 0 && (
                  <button onClick={() => window.print()}
                    className="bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-blue/90">
                    Print All ({bulkData.totalTickets} tickets)
                  </button>
                )}
              </div>
            </div>

            {bulkData && bulkData.error && (
              <div className="bg-red-50 text-red-700 rounded-xl p-4 mb-4">
                <p className="text-sm font-medium">{bulkData.error}</p>
              </div>
            )}

            {bulkData && !bulkData.error && bulkData.totalTickets === 0 && (
              <div className="bg-white rounded-xl p-8 shadow-sm text-center">
                <p className="text-gray-400">No paid tickets found for the selected date range.</p>
              </div>
            )}

            {bulkData && !bulkData.error && bulkData.totalTickets > 0 && (
              <div>
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 no-print">
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold text-brand-blue">{bulkData.totalTickets}</span> ticket(s) across{' '}
                    <span className="font-semibold">{bulkData.sessions.length}</span> session(s) from{' '}
                    <span className="font-medium">{bulkData.dateFrom}</span> to <span className="font-medium">{bulkData.dateTo}</span>
                  </p>
                </div>

                {/* Printable ticket pages */}
                {bulkData.sessions.map(session => {
                  // Flatten all tickets for this session
                  const allTickets = [];
                  session.bookings.forEach(booking => {
                    booking.tickets.forEach(ticket => {
                      allTickets.push({ ...ticket, referenceNumber: ticket.referenceNumber || booking.referenceNumber });
                    });
                  });

                  // Split into pages of 3
                  const pages = [];
                  for (let i = 0; i < allTickets.length; i += 3) {
                    pages.push(allTickets.slice(i, i + 3));
                  }

                  return (
                    <div key={session.sessionId}>
                      <div className="no-print bg-gray-100 rounded-lg px-4 py-2 mb-2">
                        <p className="text-sm font-semibold text-brand-blue">
                          {session.sessionDate} at {session.sessionTime}
                          {session.isSpecialEvent && session.eventTitle && (
                            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                              {session.eventTitle}
                            </span>
                          )}
                          <span className="ml-2 text-gray-400 font-normal">({allTickets.length} tickets)</span>
                        </p>
                      </div>

                      {pages.map((pageTickets, pageIdx) => (
                        <div className="bulk-ticket-page" key={`${session.sessionId}-${pageIdx}`}>
                          {pageTickets.map((ticket, i) => {
                            const displayTitle = (session.isSpecialEvent && session.eventTitle) ? session.eventTitle : 'Mega Bucks Bingo';
                            const fmtDate = (() => {
                              const d = new Date(session.sessionDate + 'T12:00:00');
                              const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                              const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                              return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                            })();
                            const fmtTime = (() => {
                              const [h, m] = session.sessionTime.split(':').map(Number);
                              const ampm = h >= 12 ? 'PM' : 'AM';
                              const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
                              return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
                            })();
                            return (
                            <div className="ticket-card" key={i}>
                              <div className="ticket-inner">
                                {/* Left half: Client copy — name prominent */}
                                <div className="ticket-half ticket-half-left">
                                  <div className="ticket-name-prominent">
                                    {ticket.firstName} {ticket.lastName}
                                  </div>
                                  <h2 className="ticket-title">{displayTitle}</h2>
                                  <div className="ticket-logo">
                                    <img src="/logo.png" alt="SMEC" className="ticket-logo-img" />
                                  </div>
                                  <div className="ticket-half-row">
                                    <div className="ticket-detail-compact">
                                      <span className="ticket-label-sm">Table</span>
                                      <span className="ticket-value-md">{ticket.tableNumber}</span>
                                    </div>
                                    <div className="ticket-detail-compact">
                                      <span className="ticket-label-sm">Seat</span>
                                      <span className="ticket-value-md">{ticket.chairNumber}</span>
                                    </div>
                                  </div>
                                  <p className="ticket-price">${(ticket.packagePrice / 100).toFixed(2)}</p>
                                  <p className="ticket-pkg">{ticket.packageName}</p>
                                  <div className="ticket-half-row ticket-meta">
                                    <span className="ticket-meta-text">{fmtDate}</span>
                                    <span className="ticket-meta-text">{fmtTime}</span>
                                  </div>
                                  <div className="ticket-ref-block">
                                    <span className="ticket-ref-value">{ticket.referenceNumber}</span>
                                  </div>
                                </div>
                                {/* Right half: Customer copy — table/seat prominent */}
                                <div className="ticket-half ticket-half-right">
                                  <h2 className="ticket-title">{displayTitle}</h2>
                                  <div className="ticket-logo">
                                    <img src="/logo.png" alt="SMEC" className="ticket-logo-img" />
                                  </div>
                                  <div className="ticket-half-row">
                                    <div className="ticket-detail">
                                      <span className="ticket-label">Table</span>
                                      <span className="ticket-value">{ticket.tableNumber}</span>
                                    </div>
                                    <div className="ticket-detail">
                                      <span className="ticket-label">Seat</span>
                                      <span className="ticket-value">{ticket.chairNumber}</span>
                                    </div>
                                  </div>
                                  <div className="ticket-name-secondary">
                                    {ticket.firstName} {ticket.lastName}
                                  </div>
                                  <p className="ticket-price-sm">${(ticket.packagePrice / 100).toFixed(2)} — {ticket.packageName}</p>
                                  <div className="ticket-half-row ticket-meta">
                                    <span className="ticket-meta-text">{fmtDate}</span>
                                    <span className="ticket-meta-text">{fmtTime}</span>
                                  </div>
                                  <div className="ticket-ref-block">
                                    <span className="ticket-ref-value">{ticket.referenceNumber}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            <style>{`
              @media print {
                .no-print, header, .bg-white.border-b { display: none !important; }
                body { margin: 0; padding: 0; }
                @page { size: letter; margin: 0.25in; }
                .max-w-6xl { max-width: none !important; padding: 0 !important; }
                .min-h-screen { min-height: auto !important; }
              }

              @media screen {
                .bulk-ticket-page {
                  max-width: 8.5in;
                  margin: 10px auto;
                  padding: 0.25in;
                  background: white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
              }

              .bulk-ticket-page {
                display: flex;
                flex-direction: column;
                width: 8in;
                height: 10.5in;
                page-break-after: always;
                justify-content: space-between;
              }

              .bulk-ticket-page .ticket-card {
                width: 100%;
                height: 3.4in;
                border: 1.5px dashed #c5a55a;
                border-radius: 8px;
                box-sizing: border-box;
                background: linear-gradient(135deg, #fdf6e3 0%, #fcecd6 50%, #f8e0c0 100%);
                position: relative;
                overflow: hidden;
              }

              .bulk-ticket-page .ticket-inner {
                display: flex;
                height: 100%;
                padding: 0.25in 0.3in;
                gap: 0;
              }

              .bulk-ticket-page .ticket-half {
                flex: 1;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                text-align: center; box-sizing: border-box;
                padding: 0 0.2in; gap: 2px;
              }
              .bulk-ticket-page .ticket-half-left {
                border-right: 2px dashed #c5a55a;
              }
              .bulk-ticket-page .ticket-half-row {
                display: flex; gap: 16px;
                justify-content: center; align-items: center;
              }
              .bulk-ticket-page .ticket-title {
                font-family: 'Georgia', serif;
                font-size: 16px; font-weight: bold;
                color: #1a3a5c; margin: 0 0 4px 0; line-height: 1.2;
              }
              .bulk-ticket-page .ticket-logo {
                width: 50px; height: 35px;
                display: flex; align-items: center; justify-content: center;
                margin-bottom: 4px;
              }
              .bulk-ticket-page .ticket-logo-img {
                max-width: 100%; max-height: 100%;
                object-fit: contain; opacity: 0.7;
              }
              .bulk-ticket-page .ticket-name-prominent {
                font-size: 22px; font-weight: 700;
                color: #1a3a5c; margin: 0 0 2px 0;
                line-height: 1.2; word-break: break-word; max-width: 100%;
              }
              .bulk-ticket-page .ticket-name-secondary {
                font-size: 16px; font-weight: 700;
                color: #1a3a5c; line-height: 1.2;
                word-break: break-word; margin: 2px 0;
              }
              .bulk-ticket-page .ticket-price {
                font-family: 'Georgia', serif;
                font-size: 20px; font-weight: bold;
                color: #c5a55a; margin: 2px 0 0 0;
              }
              .bulk-ticket-page .ticket-price-sm {
                font-size: 12px; font-weight: 600;
                color: #c5a55a; margin: 2px 0;
              }
              .bulk-ticket-page .ticket-pkg {
                font-size: 11px; color: #888; margin: 0;
              }
              .bulk-ticket-page .ticket-detail-compact { text-align: center; }
              .bulk-ticket-page .ticket-value-md {
                display: block; font-size: 22px; font-weight: bold;
                color: #1a3a5c; line-height: 1.1;
              }
              .bulk-ticket-page .ticket-detail { text-align: center; }
              .bulk-ticket-page .ticket-label {
                display: block; font-size: 11px; color: #888;
                text-transform: uppercase; letter-spacing: 1px;
              }
              .bulk-ticket-page .ticket-value {
                display: block; font-size: 36px; font-weight: bold;
                color: #1a3a5c; line-height: 1.1;
              }
              .bulk-ticket-page .ticket-label-sm {
                display: block; font-size: 9px; color: #aaa;
                text-transform: uppercase; letter-spacing: 0.5px;
              }
              .bulk-ticket-page .ticket-meta { margin-top: 2px; }
              .bulk-ticket-page .ticket-meta-text {
                font-size: 11px; font-weight: 600; color: #555;
              }
              .bulk-ticket-page .ticket-ref-block {
                margin-top: 2px; text-align: center;
              }
              .bulk-ticket-page .ticket-ref-value {
                display: block; font-size: 13px; font-weight: 700;
                color: #1a3a5c; font-family: monospace; letter-spacing: 0.5px;
              }
              .bulk-ticket-page .ticket-name-right {
                display: block; font-size: 18px; font-weight: 700;
                color: #1a3a5c; line-height: 1.2; word-break: break-word;
              }
            `}</style>
          </div>
        )}

        {/* ARCHIVE & AUDIT TAB */}
        {tab === 'archive' && (
          <div>
            {/* Deleted Sessions */}
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
              <h3 className="font-semibold text-brand-blue mb-3">Deleted Sessions</h3>
              {deletedSessions.length === 0 ? (
                <p className="text-gray-400 text-sm">No deleted sessions.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 text-xs uppercase">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Event</th>
                      <th className="pb-2">Paid Bookings</th>
                      <th className="pb-2">Revenue</th>
                      <th className="pb-2">Deleted At</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletedSessions.map(s => (
                      <tr key={s.id} className="border-t">
                        <td className="py-2">{s.date}</td>
                        <td className="py-2">{s.time}</td>
                        <td className="py-2">{s.is_special_event && s.event_title ? s.event_title : '-'}</td>
                        <td className="py-2">{s.paid_bookings || 0}</td>
                        <td className="py-2">{formatPrice(s.total_revenue || 0)}</td>
                        <td className="py-2 text-xs text-gray-400">{new Date(s.deleted_at).toLocaleString()}</td>
                        <td className="py-2 space-x-2">
                          <button onClick={() => handleViewArchiveBookings(s)}
                            className="text-xs bg-brand-blue text-white px-2 py-1 rounded hover:bg-blue-800">
                            View Bookings
                          </button>
                          <button onClick={() => handleRestoreSession(s.id)}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Archive Bookings Modal Inline */}
            {archiveBookings && (
              <div className="bg-white rounded-xl p-5 shadow-sm mb-4 border-2 border-brand-gold">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-brand-blue">
                    Bookings for {archiveBookings.session.date} at {archiveBookings.session.time}
                    {archiveBookings.session.event_title && <span className="ml-2 text-sm text-amber-600">({archiveBookings.session.event_title})</span>}
                  </h3>
                  <button onClick={() => setArchiveBookings(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>
                {archiveBookings.bookings.length === 0 ? (
                  <p className="text-gray-400 text-sm">No bookings for this session.</p>
                ) : (
                  archiveBookings.bookings.map(b => (
                    <div key={b.id} className="border rounded-lg p-3 mb-2">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-mono text-sm font-bold text-brand-blue">{b.referenceNumber}</span>
                        <span className="text-sm">
                          {b.totalFormatted}
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${b.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : b.paymentStatus === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                            {b.paymentStatus}
                          </span>
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 text-left">
                            <th className="pb-1">Ticket</th>
                            <th className="pb-1">Name</th>
                            <th className="pb-1">Table</th>
                            <th className="pb-1">Chair</th>
                            <th className="pb-1">Package</th>
                            <th className="pb-1">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.attendees.map((a, i) => (
                            <tr key={i}>
                              <td className="py-0.5 font-mono text-brand-blue font-semibold">{a.referenceNumber || b.referenceNumber}</td>
                              <td className="py-0.5">{a.firstName} {a.lastName}</td>
                              <td className="py-0.5">{a.tableNumber}</td>
                              <td className="py-0.5">{a.chairNumber}</td>
                              <td className="py-0.5">{a.packageName}</td>
                              <td className="py-0.5">{a.itemPriceFormatted}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Audit Log */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">Audit Log (Last 50)</h3>
              {auditLogs.length === 0 ? (
                <p className="text-gray-400 text-sm">No audit entries yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 text-xs uppercase">
                        <th className="pb-2">Time</th>
                        <th className="pb-2">Action</th>
                        <th className="pb-2">Entity</th>
                        <th className="pb-2">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id} className="border-t">
                          <td className="py-2 text-xs text-gray-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              log.action.includes('delete') ? 'bg-red-100 text-red-700' :
                              log.action.includes('restore') ? 'bg-green-100 text-green-700' :
                              log.action.includes('cancel') ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2 text-xs">{log.entity_type} <span className="text-gray-400 font-mono">{log.entity_id.slice(0, 8)}</span></td>
                          <td className="py-2 text-xs text-gray-500 max-w-xs truncate">
                            {log.details ? (typeof log.details === 'object' ? (log.details.date || log.details.ref || JSON.stringify(log.details).slice(0, 80)) : String(log.details).slice(0, 80)) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PHD INVENTORY TAB */}
        {tab === 'inventory' && phdInventory && (
          <div className="max-w-4xl">
            <h3 className="text-xl font-bold text-brand-blue mb-6">PHD (Personal Handheld Device) Inventory</h3>

            {/* Inventory Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#2563eb' }}>
                <p className="text-sm opacity-80">Total Stock</p>
                <p className="text-4xl font-bold mt-1">{phdInventory.totalStock}</p>
                <p className="text-xs opacity-60 mt-1">devices owned</p>
              </div>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#dc2626' }}>
                <p className="text-sm opacity-80">In Use</p>
                <p className="text-4xl font-bold mt-1">{phdInventory.totalUsed}</p>
                <p className="text-xs opacity-60 mt-1">currently booked</p>
              </div>
              <div className={`rounded-xl p-5 shadow-sm text-white`} style={{ background: phdInventory.remaining <= 20 ? '#dc2626' : phdInventory.remaining <= 50 ? '#d97706' : '#16a34a' }}>
                <p className="text-sm opacity-80">Available</p>
                <p className="text-4xl font-bold mt-1">{phdInventory.remaining}</p>
                <p className="text-xs opacity-60 mt-1">ready to assign</p>
              </div>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#7c3aed' }}>
                <p className="text-sm opacity-80">Per Player Limit</p>
                <p className="text-4xl font-bold mt-1">{phdInventory.perPlayerLimit}</p>
                <p className="text-xs opacity-60 mt-1">max per person</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600">Stock Utilization</span>
                <span className="text-sm font-bold text-gray-800">{Math.round((phdInventory.totalUsed / phdInventory.totalStock) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all ${
                    phdInventory.remaining <= 20 ? 'bg-red-500' :
                    phdInventory.remaining <= 50 ? 'bg-amber-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(100, (phdInventory.totalUsed / phdInventory.totalStock) * 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Settings Form */}
            <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
              <h4 className="font-semibold text-brand-blue mb-4">Inventory Settings</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Total Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={phdEditForm.totalStock}
                    onChange={e => setPhdEditForm(f => ({ ...f, totalStock: parseInt(e.target.value) || 0 }))}
                    className="w-full border-2 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Max Per Player</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={phdEditForm.perPlayerLimit}
                    onChange={e => setPhdEditForm(f => ({ ...f, perPlayerLimit: parseInt(e.target.value) || 1 }))}
                    className="w-full border-2 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none"
                  />
                </div>
              </div>
              <button
                onClick={async () => {
                  setPhdSaving(true);
                  await updateAdminPhdInventory(token, phdEditForm);
                  const data = await fetchAdminPhdInventory(token);
                  setPhdInventory(data);
                  setPhdSaving(false);
                }}
                disabled={phdSaving}
                className="mt-4 bg-brand-blue text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50"
              >
                {phdSaving ? 'Saving...' : 'Update Settings'}
              </button>
            </div>

            {/* Per-Session Breakdown */}
            {phdInventory.perSession && phdInventory.perSession.length > 0 && (
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <h4 className="font-semibold text-brand-blue mb-4">PHD Usage by Session</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-100">
                        <th className="text-left py-2 px-3 text-gray-500">Date</th>
                        <th className="text-left py-2 px-3 text-gray-500">Time</th>
                        <th className="text-left py-2 px-3 text-gray-500">Event</th>
                        <th className="text-right py-2 px-3 text-gray-500">PHDs Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phdInventory.perSession.map(s => (
                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">{s.date}</td>
                          <td className="py-2 px-3">{s.time}</td>
                          <td className="py-2 px-3">{s.is_special_event && s.event_title ? s.event_title : '-'}</td>
                          <td className="py-2 px-3 text-right font-bold text-brand-blue">{s.phd_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <div className="max-w-3xl">
            {/* PRINTING & RECEIPTS SETTINGS */}
              <div>
                {receiptSaved && (
                  <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2 mb-4 text-sm">
                    Receipt settings saved!
                  </div>
                )}

                <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
                  <h4 className="font-semibold text-gray-700 mb-3">Receipt Information</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Business Name on Receipt</label>
                      <input type="text" value={receiptConfig.businessName}
                        onChange={e => setReceiptConfig({ ...receiptConfig, businessName: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Subtitle / Tagline</label>
                      <input type="text" value={receiptConfig.businessSubtitle}
                        onChange={e => setReceiptConfig({ ...receiptConfig, businessSubtitle: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Receipt Title</label>
                      <input type="text" value={receiptConfig.receiptTitle}
                        onChange={e => setReceiptConfig({ ...receiptConfig, receiptTitle: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Footer Message</label>
                      <input type="text" value={receiptConfig.footerText}
                        onChange={e => setReceiptConfig({ ...receiptConfig, footerText: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
                  <h4 className="font-semibold text-gray-700 mb-3">Display Options</h4>
                  <div className="space-y-3">
                    {[
                      { key: 'showRefNumber', label: 'Show Reference Number' },
                      { key: 'showTableChair', label: 'Show Table & Chair Numbers' },
                      { key: 'showPackagePrice', label: 'Show Package Prices' },
                      { key: 'showAddons', label: 'Show Add-ons' },
                      { key: 'showTimestamp', label: 'Show Timestamp' },
                    ].map(opt => (
                      <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={receiptConfig[opt.key]}
                          onChange={e => setReceiptConfig({ ...receiptConfig, [opt.key]: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue" />
                        <span className="text-sm text-gray-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
                  <h4 className="font-semibold text-gray-700 mb-3">Printer Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Paper Width</label>
                      <select value={receiptConfig.paperWidth}
                        onChange={e => setReceiptConfig({ ...receiptConfig, paperWidth: e.target.value })}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue">
                        <option value="58mm">58mm (Small Thermal)</option>
                        <option value="80mm">80mm (Standard Thermal)</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={receiptConfig.autoPrintEnabled}
                        onChange={e => {
                          const val = e.target.checked;
                          setReceiptConfig({ ...receiptConfig, autoPrintEnabled: val });
                          setAutoPrint(val);
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue" />
                      <span className="text-sm text-gray-700">Auto-Print on New Orders</span>
                    </label>
                    <p className="text-xs text-gray-400 ml-7">When enabled, a receipt will automatically print every time a new booking is placed. Set your thermal printer as the default browser printer for silent printing.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => {
                    saveSettings(token, 'receipt_config', receiptConfig).then(() => {
                      setReceiptSaved(true);
                      setTimeout(() => setReceiptSaved(false), 3000);
                    });
                  }} className="bg-brand-blue text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-800 transition-colors">
                    Save Receipt Settings
                  </button>
                  <button onClick={() => {
                    printBookingReceipt({
                      referenceNumber: 'SAMPLE-001',
                      sessionDate: new Date().toISOString().split('T')[0],
                      sessionTime: '18:30',
                      totalFormatted: '$25.00',
                      createdAt: new Date().toISOString(),
                      items: [
                        { firstName: 'John', lastName: 'Doe', tableNumber: 1, chairNumber: 3, packageName: 'Regular Bingo', packagePriceFormatted: '$20.00', addons: [{ packageName: 'Extra Card', quantity: 1, priceFormatted: '$5.00' }] }
                      ]
                    });
                  }} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors border">
                    Print Preview
                  </button>
                </div>
              </div>
          </div>
        )}

      </div>
      </div>

      {/* Sales Drilldown Modal */}
      {salesDrilldown && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSalesDrilldown(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-brand-blue text-lg">Booking Details</h3>
                <p className="text-sm text-gray-500">
                  {salesDrilldown.session.description} &mdash; {salesDrilldown.bookings.reduce((sum, b) => sum + b.items.length, 0)} ticket(s) in {salesDrilldown.session.quantity} batch(es) &mdash; {salesDrilldown.session.totalFormatted}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrintSalesDrilldown} className="px-3 py-1.5 text-sm bg-brand-blue text-white rounded-lg hover:bg-blue-800" title="Print">Print</button>
                <button onClick={handleSaveSalesDrilldownCsv} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700" title="Save CSV">Save CSV</button>
                <button onClick={() => setSalesDrilldown(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-2">&times;</button>
              </div>
            </div>
            <div id="sales-drilldown-content" className="overflow-y-auto p-5" style={{ maxHeight: 'calc(85vh - 80px)' }}>
              {salesDrilldown.bookings.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No bookings found.</p>
              ) : (
                salesDrilldown.bookings.map(b => (
                  <div key={b.id} className="mb-4 border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-xs text-gray-400">Batch:</span>
                        <span className="font-mono text-sm font-semibold text-brand-blue ml-1">{b.referenceNumber}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                          b.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                          b.paymentStatus === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{b.paymentStatus}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{b.totalFormatted}</span>
                        <button
                          onClick={() => handlePrintBookingReceipt({...b, sessionDate: salesDrilldown.session.date, sessionTime: salesDrilldown.session.time})}
                          className="px-2 py-0.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800"
                          title="Print thermal receipt"
                        >
                          Receipt
                        </button>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 border-b">
                          <th className="pb-1">Ticket</th>
                          <th className="pb-1">Name</th>
                          <th className="pb-1">Table</th>
                          <th className="pb-1">Chair</th>
                          <th className="pb-1">Package</th>
                          <th className="pb-1">Add-ons</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.items.map((item, i) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="py-1 font-mono text-xs text-brand-blue font-semibold">{item.referenceNumber || '—'}</td>
                            <td className="py-1 font-medium">{item.firstName} {item.lastName}</td>
                            <td className="py-1">{item.tableNumber}</td>
                            <td className="py-1">{item.chairNumber}</td>
                            <td className="py-1">{item.packageName}</td>
                            <td className="py-1 text-xs text-gray-500">
                              {item.addons.length > 0
                                ? item.addons.map(a => `${a.packageName} x${a.quantity}`).join(', ')
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sold Tickets Modal */}
      {soldModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSoldModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-brand-blue text-lg">Ticket Purchasers</h3>
                <p className="text-sm text-gray-500">{soldModal.session.date} at {soldModal.session.time} &mdash; {soldModal.session.sold} sold</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrintPurchasers} className="px-3 py-1.5 text-sm bg-brand-blue text-white rounded-lg hover:bg-blue-800" title="Print">Print</button>
                <button onClick={handleSavePurchasersCsv} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700" title="Save CSV">Save CSV</button>
                <button onClick={() => setSoldModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-2">&times;</button>
              </div>
            </div>
            <div id="sold-modal-content" className="overflow-y-auto p-5" style={{ maxHeight: 'calc(80vh - 80px)' }}>
              {soldModal.bookings.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No bookings found.</p>
              ) : (
                soldModal.bookings.map(b => (
                  <div key={b.id} className="mb-4 border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-xs text-gray-400">Batch:</span>
                        <span className="font-mono text-sm font-semibold text-brand-blue ml-1">{b.referenceNumber}</span>
                      </div>
                      <span className="text-sm font-medium">{b.totalFormatted}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 border-b">
                          <th className="pb-1">Ticket</th>
                          <th className="pb-1">Name</th>
                          <th className="pb-1">Table</th>
                          <th className="pb-1">Chair</th>
                          <th className="pb-1">Package</th>
                          <th className="pb-1">Add-ons</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.items.map((item, i) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="py-1 font-mono text-xs text-brand-blue font-semibold">{item.referenceNumber || '—'}</td>
                            <td className="py-1 font-medium">{item.firstName} {item.lastName}</td>
                            <td className="py-1">{item.tableNumber}</td>
                            <td className="py-1">{item.chairNumber}</td>
                            <td className="py-1">{item.packageName}</td>
                            <td className="py-1 text-xs text-gray-500">
                              {item.addons.length > 0
                                ? item.addons.map(a => `${a.packageName} x${a.quantity}`).join(', ')
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
