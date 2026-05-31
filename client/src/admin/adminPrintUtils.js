function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function writePrintDocument(title, body, style) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${style}</style></head><body>${body}</body></html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.opacity = '0';

  let printed = false;
  const cleanup = () => {
    setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 1000);
  };
  const doPrint = () => {
    if (printed) return;
    printed = true;
    const win = frame.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.focus();
    win.print();
    if ('onafterprint' in win) win.onafterprint = cleanup;
    else cleanup();
  };
  const printWhenImagesReady = () => {
    const images = Array.from(frame.contentWindow?.document?.images || []);
    if (images.length === 0) {
      setTimeout(doPrint, 100);
      return;
    }
    Promise.all(images.map(image => {
      if (image.complete) return Promise.resolve();
      return new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    })).then(() => setTimeout(doPrint, 100));
  };

  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) {
    cleanup();
    return;
  }
  frame.onload = printWhenImagesReady;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(printWhenImagesReady, 500);
}

function getBookingSessionType(booking) {
  if (booking?.sessionType) return booking.sessionType;
  if (booking?.notificationType === 'live_event_ticket') return 'event';
  if (booking?.notificationType === 'special_bingo_ticket') return 'special_bingo';
  return 'regular_bingo';
}

function getReceiptTitle(booking, fallback = 'BOOKING RECEIPT') {
  const sessionType = getBookingSessionType(booking);
  if (sessionType === 'event') return 'LIVE EVENT TICKET';
  if (sessionType === 'special_bingo') return 'SPECIAL BINGO TICKET';
  return fallback;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const modalPrintStyle = `body{font-family:Arial,sans-serif;padding:20px;color:#333}
h2{margin:0 0 4px}p.sub{color:#666;font-size:14px;margin:0 0 20px}
.booking{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:16px}
.ref{font-family:monospace;font-weight:600;color:#1a3a5c}.total{float:right}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
th{text-align:left;color:#999;border-bottom:1px solid #ddd;padding:4px 0}
td{padding:4px 0;border-bottom:1px solid #f0f0f0}
@media print{body{padding:0}.booking{break-inside:avoid}}`;

const thermalReceiptStyle = `@page { size: 80mm auto; margin: 0; }
body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 4mm auto; padding: 0; color: #000; line-height: 1.4; }
.center { text-align: center; }
.right { text-align: right; }
.bold { font-weight: bold; }
.line { border-top: 1px dashed #000; margin: 4px 0; }
.dbl-line { border-top: 2px solid #000; margin: 6px 0; }
.row { display: flex; justify-content: space-between; }
.row span:last-child { text-align: right; }
.thermal-logo { text-align: center; margin: 0 0 2px; }
.thermal-logo img { display: inline-block; max-width: 48mm; max-height: 14mm; object-fit: contain; filter: brightness(0); -webkit-filter: brightness(0); print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.header { font-size: 14px; font-weight: bold; text-align: center; margin-bottom: 4px; }
.sub-header { font-size: 10px; text-align: center; color: #333; margin-bottom: 8px; }
.item-row { display: flex; justify-content: space-between; padding: 1px 0; }
.item-qty { width: 30px; text-align: center; }
.item-desc { flex: 1; padding: 0 4px; }
.item-amt { width: 60px; text-align: right; }
.total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; padding: 2px 0; }
@media print { body { width: 72mm; margin: 0 auto; } }`;

function printThermalReceipt(title, lines) {
  writePrintDocument(title, lines.join(''), thermalReceiptStyle);
}

export function printAutoBookingReceipt(booking, cfg) {
  const paperWidth = cfg.paperWidth === '58mm' ? '58mm' : '80mm';
  const bodyWidth = paperWidth === '58mm' ? '50mm' : '72mm';
  const receiptTitle = getReceiptTitle(booking, cfg.receiptTitle);
  const formatUnitPrice = (price, quantity = 1, fallback = '') => {
    const cents = Number(price || 0);
    const qty = Number(quantity || 1);
    if (!Number.isFinite(cents) || cents <= 0 || !Number.isFinite(qty) || qty <= 0) return fallback;
    return '$' + (cents / qty / 100).toFixed(0);
  };
  const packageLabel = (priceText, name) => [priceText, name].filter(Boolean).join(' - ');
  const totalText = String(booking.totalFormatted || '').replace(/^\$/, '') || String(booking.totalAmount || '');
  const lines = [
    '<div class="receipt-logo"><img src="/wolastoq-logo.png" alt="Wolastoq Casino"></div>',
    `<div class="receipt-venue">${escapeHtml(cfg.businessSubtitle || "Saint Mary's Entertainment Centre")}</div>`,
    `<div class="receipt-title">${escapeHtml(receiptTitle)}</div>`,
    booking.sessionTitle ? `<div class="receipt-session">${escapeHtml(booking.sessionTitle)}</div>` : '',
  ].filter(Boolean);

  for (const item of booking.items || []) {
    const itemRows = [
      {
        label: packageLabel(formatUnitPrice(item.packagePrice, 1, item.packagePriceFormatted), item.packageName),
        quantity: 1,
      },
    ];
    if (cfg.showAddons && item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        itemRows.push({
          label: packageLabel(formatUnitPrice(addon.price, addon.quantity, addon.priceFormatted), addon.packageName),
          quantity: addon.quantity,
        });
      }
    }

    lines.push('<table class="legacy-receipt">');
    lines.push('<colgroup><col class="label-col"><col class="item-col"><col class="qty-col"></colgroup>');
    lines.push(`<tr><th>NAME</th><td colspan="2" class="code-blue">: ${escapeHtml(item.firstName)} ${escapeHtml(item.lastName)}</td></tr>`);
    lines.push(`<tr><th>BOOKING NO.</th><td colspan="2" class="code-red">: ${escapeHtml(booking.referenceNumber)}</td></tr>`);
    if (item.referenceNumber) {
      lines.push(`<tr><th>TICKET NO.</th><td colspan="2" class="code-red">: ${escapeHtml(item.referenceNumber)}</td></tr>`);
    }
    lines.push(`<tr><th>PLAY DATE</th><td colspan="2" class="code-blue">: ${escapeHtml(booking.sessionDate)} ${escapeHtml(booking.sessionTime || '')}</td></tr>`);
    if (cfg.showTableChair) {
      lines.push(`<tr><th>TABLE NO.</th><td colspan="2" class="code-blue">: ${escapeHtml(item.tableNumber)}</td></tr>`);
      lines.push(`<tr><th>SEAT NO.</th><td colspan="2" class="code-blue">: ${escapeHtml(item.chairNumber)}</td></tr>`);
    }
    lines.push('<tr class="items-head"><th>NO</th><th>PACKAGE ITEMS</th><th>QTY</th></tr>');
    itemRows.forEach((row, index) => {
      lines.push(`<tr><td class="no-cell">${index + 1}</td><td class="item-cell">${escapeHtml(row.label)}</td><td class="qty-cell">${escapeHtml(row.quantity)}</td></tr>`);
    });
    lines.push('</table>');
  }

  lines.push(`<div class="legacy-total"><div>TOTAL AMOUNT : $</div><strong>${escapeHtml(totalText)}</strong></div>`);
  if (cfg.footerText) {
    lines.push(`<div class="receipt-footer">${escapeHtml(cfg.footerText)}</div>`);
  }
  if (cfg.showTimestamp) {
    lines.push(`<div class="receipt-footer">${escapeHtml(new Date(booking.createdAt).toLocaleString())}</div>`);
  }

  const style = `@page { size: ${paperWidth} auto; margin: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 700; width: ${bodyWidth}; margin: 3mm auto; padding: 0; color: #000; line-height: 1.15; }
.receipt-logo { text-align: center; margin: 0 0 2px; }
.receipt-logo img { display: inline-block; max-width: 48mm; max-height: 14mm; object-fit: contain; filter: brightness(0); -webkit-filter: brightness(0); print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.receipt-venue { text-align: center; font-size: 11px; font-weight: 900; margin-bottom: 3px; }
.receipt-title, .receipt-session, .receipt-footer { text-align: center; font-size: 10px; font-weight: 800; margin-bottom: 3px; }
.legacy-receipt { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 3px 0 6px; page-break-inside: avoid; }
.legacy-receipt col.label-col { width: 30%; }
.legacy-receipt col.item-col { width: 56%; }
.legacy-receipt col.qty-col { width: 14%; }
.legacy-receipt th, .legacy-receipt td { border: 1.5px solid #000; padding: 2px 3px; vertical-align: top; font-weight: 800; box-sizing: border-box; }
.legacy-receipt th { text-align: left; white-space: normal; overflow-wrap: anywhere; }
.legacy-receipt td { text-align: left; overflow-wrap: anywhere; word-break: normal; }
.legacy-receipt .items-head th { text-align: left; }
.legacy-receipt .items-head th:first-child, .legacy-receipt .no-cell { text-align: center; }
.legacy-receipt .items-head th:last-child, .legacy-receipt .qty-cell { text-align: center; }
.legacy-receipt .item-cell { white-space: normal; overflow-wrap: anywhere; }
.code-blue { color: #165caa; }
.code-red { color: #ef2b24; }
.legacy-total { border-left: 1.5px solid #000; border-right: 1.5px solid #000; border-bottom: 1.5px solid #000; margin: -6px 0 8px; padding: 6px 4px 8px; text-align: center; color: #ef2b24; font-size: 20px; font-weight: 900; page-break-inside: avoid; }
.legacy-total strong { display: block; font-size: 24px; font-weight: 900; margin-top: 4px; }
@media print { body { width: ${bodyWidth}; margin: 0 auto; } }`;

  writePrintDocument('Receipt', lines.join(''), style);
}

export function printPurchasers(soldModal) {
  const el = document.getElementById('sold-modal-content');
  if (!el || !soldModal) return;
  const body = `<h2>Ticket Purchasers</h2><p class="sub">${soldModal.session.date} at ${soldModal.session.time} - ${soldModal.session.sold} sold</p>${el.innerHTML}`;
  writePrintDocument(`Ticket Purchasers - ${soldModal.session.date}`, body, modalPrintStyle);
}

export function savePurchasersCsv(soldModal) {
  if (!soldModal) return;
  const rows = [['Reference', 'First Name', 'Last Name', 'Table', 'Chair', 'Package', 'Add-ons', 'Booking Total']];
  for (const booking of soldModal.bookings) {
    for (const item of booking.items) {
      const addons = item.addons.length > 0
        ? item.addons.map(addon => `${addon.packageName} x${addon.quantity}`).join('; ')
        : '';
      rows.push([item.referenceNumber || booking.referenceNumber, item.firstName, item.lastName, item.tableNumber, item.chairNumber, item.packageName, addons, booking.totalFormatted]);
    }
  }
  downloadCsv(`purchasers-${soldModal.session.date}.csv`, rows);
}

export function printSalesDrilldown(salesDrilldown) {
  const el = document.getElementById('sales-drilldown-content');
  if (!el || !salesDrilldown) return;
  const body = `<h2>Bookings - ${salesDrilldown.session.description}</h2><p class="sub">${salesDrilldown.session.date} at ${salesDrilldown.session.time} - ${salesDrilldown.session.quantity} booking(s) - ${salesDrilldown.session.totalFormatted}</p>${el.innerHTML}`;
  writePrintDocument(`Bookings - ${salesDrilldown.session.description}`, body, modalPrintStyle);
}

export function saveSalesDrilldownCsv(salesDrilldown) {
  if (!salesDrilldown) return;
  const rows = [['Ticket', 'Batch', 'First Name', 'Last Name', 'Table', 'Chair', 'Package', 'Add-ons', 'Booking Total', 'Status']];
  for (const booking of salesDrilldown.bookings) {
    for (const item of booking.items) {
      const addons = item.addons.length > 0
        ? item.addons.map(addon => `${addon.packageName} x${addon.quantity}`).join('; ')
        : '';
      rows.push([item.referenceNumber || '-', booking.referenceNumber, item.firstName, item.lastName, item.tableNumber, item.chairNumber, item.packageName, addons, booking.totalFormatted, booking.paymentStatus]);
    }
  }
  downloadCsv(`bookings-${salesDrilldown.session.date}.csv`, rows);
}

export function printDailySalesReceipt(dailySales, cfg = {}) {
  if (!dailySales || dailySales.items.length === 0) return;
  const lines = [
    '<div class="thermal-logo"><img src="/wolastoq-logo.png" alt="Wolastoq Casino"></div>',
    '<div class="header">WOLASTOQ CASINO</div>',
    `<div class="sub-header">${escapeHtml(cfg.businessSubtitle || "Saint Mary's Entertainment Centre")}</div>`,
    '<div class="line"></div>',
    '<div class="center bold">DAILY SALES REPORT</div>',
    `<div class="center">${escapeHtml(dailySales.date)}</div>`,
    '<div class="line"></div>',
    '<div class="item-row"><span class="item-qty bold">#</span><span class="item-desc bold">Name / Ticket</span><span class="item-amt bold">Price</span></div>',
    '<div class="line"></div>',
  ];

  for (const item of dailySales.items) {
    const addonTotal = item.addons ? item.addons.reduce((sum, addon) => sum + addon.price, 0) : 0;
    const totalPrice = '$' + ((item.itemPrice + addonTotal) / 100).toFixed(2);
    lines.push(`<div class="item-row"><span class="item-qty">${escapeHtml(item.rowNum)}</span><span class="item-desc">${escapeHtml(item.firstName)} ${escapeHtml(item.lastName)}</span><span class="item-amt">${escapeHtml(totalPrice)}</span></div>`);
    lines.push(`<div style="font-size:10px;color:#555;padding-left:34px">${escapeHtml(item.referenceNumber)} - T${escapeHtml(item.tableNumber)}/C${escapeHtml(item.chairNumber)} - ${escapeHtml(item.packageName || '')}</div>`);
    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        lines.push(`<div style="font-size:10px;color:#555;padding-left:34px">+ ${escapeHtml(addon.packageName)} x${escapeHtml(addon.quantity)} (${escapeHtml(addon.priceFormatted)})</div>`);
      }
    }
  }

  lines.push('<div class="dbl-line"></div>');
  if (dailySales.addonSubtotal > 0) {
    lines.push(`<div class="item-row"><span class="item-desc">Packages</span><span class="item-amt">${escapeHtml(dailySales.packageSubtotalFormatted)}</span></div>`);
    lines.push(`<div class="item-row"><span class="item-desc">Add-ons</span><span class="item-amt">${escapeHtml(dailySales.addonSubtotalFormatted)}</span></div>`);
    lines.push('<div class="line"></div>');
  }
  lines.push(`<div class="total-row"><span>TOTAL (${escapeHtml(dailySales.totalTickets)} tickets, ${escapeHtml(dailySales.totalBookings)} bookings)</span><span>${escapeHtml(dailySales.grandTotalFormatted)}</span></div>`);
  lines.push('<div class="line"></div>');
  lines.push(`<div class="center" style="font-size:10px;margin-top:8px">${escapeHtml(new Date().toLocaleString())}</div>`);
  printThermalReceipt('Daily Sales', lines);
}

export function printBookingReceipt(booking) {
  const receiptTitle = getReceiptTitle(booking);
  const lines = [
    '<div class="header">SMEC BINGO</div>',
    '<div class="sub-header">Saint Mary\'s Entertainment Centre</div>',
    '<div class="line"></div>',
    `<div class="center bold">${escapeHtml(receiptTitle)}</div>`,
    booking.sessionTitle ? `<div class="center bold" style="font-size:11px">${escapeHtml(booking.sessionTitle)}</div>` : '',
    `<div class="center">${escapeHtml(booking.sessionDate)} at ${escapeHtml(booking.sessionTime)}</div>`,
    '<div class="line"></div>',
    `<div class="row"><span>Ref:</span><span class="bold">${escapeHtml(booking.referenceNumber)}</span></div>`,
    `<div class="row"><span>Status:</span><span>${escapeHtml(String(booking.paymentStatus || 'paid').toUpperCase())}</span></div>`,
    '<div class="line"></div>',
    '<div class="bold">Attendees:</div>',
  ].filter(Boolean);

  for (const item of booking.items) {
    lines.push(`<div style="padding:2px 0">${escapeHtml(item.firstName)} ${escapeHtml(item.lastName)}</div>`);
    if (item.referenceNumber) {
      lines.push(`<div style="font-size:10px;color:#555;padding-left:8px">Ticket: ${escapeHtml(item.referenceNumber)}</div>`);
    }
    lines.push(`<div class="item-row"><span class="item-desc" style="font-size:10px;color:#555">  T${escapeHtml(item.tableNumber)}/C${escapeHtml(item.chairNumber)} - ${escapeHtml(item.packageName)}</span><span class="item-amt">${escapeHtml(item.packagePriceFormatted || '')}</span></div>`);
    if ((item.addons || []).length > 0) {
      for (const addon of item.addons || []) {
        lines.push(`<div class="item-row"><span class="item-desc" style="font-size:10px;color:#555">  + ${escapeHtml(addon.packageName)} x${escapeHtml(addon.quantity)}</span><span class="item-amt">${escapeHtml(addon.priceFormatted)}</span></div>`);
      }
    }
  }

  lines.push('<div class="dbl-line"></div>');
  lines.push(`<div class="total-row"><span>TOTAL</span><span>${escapeHtml(booking.totalFormatted)}</span></div>`);
  lines.push('<div class="line"></div>');
  lines.push(`<div class="center" style="font-size:10px;margin-top:8px">${escapeHtml(new Date(booking.createdAt).toLocaleString())}</div>`);
  printThermalReceipt('Booking Receipt', lines);
}
