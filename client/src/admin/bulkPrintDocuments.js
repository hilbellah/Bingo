// Print documents for Bulk Print: the special-paper ticket layouts (bingo
// half/strip copies and live-event tickets) and the print window that holds
// them. Pure string builders - no React. Moved verbatim from BulkPrintTab.

export const DEPARTMENT_OPTIONS = [
  { value: 'regular_bingo', label: 'Regular Bingo' },
  { value: 'special_bingo', label: 'Special Bingo' },
  { value: 'event', label: 'Live Event / Venue' },
];

function escapePrintHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrintDate(sessionDate) {
  const d = new Date(`${sessionDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return sessionDate || '';
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatPrintTime(sessionTime = '') {
  const [rawHour, rawMinute] = String(sessionTime || '').split(':').map(Number);
  if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute)) return sessionTime || '';
  const ampm = rawHour >= 12 ? 'PM' : 'AM';
  const hour = rawHour > 12 ? rawHour - 12 : rawHour === 0 ? 12 : rawHour;
  return `${hour}:${String(rawMinute).padStart(2, '0')} ${ampm}`;
}

function getSpecialPaperPrintStyle() {
  return `
@page { size: letter; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
* { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
img { filter: none !important; -webkit-filter: none !important; }
.ticket-blank-line { display: inline-block; min-width: 1.6in; border-bottom: 2px solid #000; }
.event-ticket-page {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 0.12in;
  width: 7.6in;
  height: 10in;
  margin: 0.2in auto 0;
  break-after: page;
  page-break-after: always;
  overflow: hidden;
}
.event-ticket-page:last-child,
.bulk-ticket-page:last-child {
  break-after: auto;
  page-break-after: auto;
}
.event-ticket-card {
  border: 1.5px dashed #1a3a5c;
  border-radius: 6px;
  padding: 0.18in;
  background: #fffdf8;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  color: #1a3a5c;
  overflow: hidden;
}
.event-ticket-title { font-family: Georgia, serif; font-size: 18px; font-weight: 700; line-height: 1.15; margin-bottom: 0.12in; color: #1a3a5c; }
.event-ticket-name { font-size: 20px; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; max-width: 100%; margin-bottom: 0.1in; color: #1a3a5c; }
.event-ticket-row { display: flex; gap: 0.18in; justify-content: center; font-size: 16px; font-weight: 700; margin-bottom: 0.08in; }
.event-ticket-meta { font-size: 12px; color: #555; font-weight: 600; margin-bottom: 0.08in; }
.event-ticket-ref { font-family: monospace; font-size: 13px; font-weight: 700; color: #0f2d48; }
.bulk-ticket-page {
  display: flex;
  flex-direction: column;
  width: 8.5in;
  height: 11in;
  margin: 0 auto;
  break-after: page;
  page-break-after: always;
  overflow: hidden;
  background: #fff;
  font-family: 'Times New Roman', Georgia, serif;
}
.bulk-ticket-page .ticket-card {
  width: 100%;
  height: 3.6666in;
  border: 0;
  border-radius: 0;
  background: none;
  position: relative;
  overflow: hidden;
  display: flex;
}
.bulk-ticket-page .ticket-inner { display: flex; width: 100%; height: 100%; padding: 0.5in 0.3in 0.55in; gap: 0; }
.bulk-ticket-page .ticket-half { flex: 0 0 50%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; padding: 0 0.25in; color: #000; }
.bulk-ticket-page .ticket-half-spacer { flex: 0 0 50%; }
.bulk-ticket-page .ticket-block { max-width: 100%; }
.bulk-ticket-page .ticket-name-prominent { font-size: 28px; font-weight: 700; color: #000; margin: 0; line-height: 1.15; overflow-wrap: anywhere; max-width: 100%; }
.bulk-ticket-page .ticket-title-sub { font-size: 17px; font-weight: 700; color: #000; margin: 1px 0 0; line-height: 1.2; }
.bulk-ticket-page .ticket-title-main { font-size: 30px; font-weight: 700; color: #000; margin: 0; line-height: 1.15; }
.bulk-ticket-page .ticket-tableseat { font-size: 26px; font-weight: 700; color: #000; margin: 0; line-height: 1.2; }
.bulk-ticket-page .ticket-stub-label { font-size: 14px; font-weight: 700; color: #000; margin: 0 0 2px; }
.bulk-ticket-page .ticket-stub-label-u { text-decoration: underline; }
.bulk-ticket-page .ticket-stub-main { font-size: 19px; font-weight: 700; color: #000; margin: 0 0 2px; line-height: 1.2; overflow-wrap: anywhere; }
.bulk-ticket-page .ticket-dateref { font-size: 12px; font-weight: 700; color: #000; margin: 0; white-space: nowrap; }
.bulk-ticket-page .ticket-dateref u { text-decoration: underline; }
`;
}

export function writeSpecialPaperPrintDocument(body, onAfterPrint) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.left = '-10000px';
  frame.style.top = '0';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.border = '0';
  frame.style.opacity = '0';

  let printed = false;
  let finished = false;
  const cleanup = () => {
    setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 1000);
  };
  const finishPrint = () => {
    if (finished) return;
    finished = true;
    try {
      onAfterPrint?.();
    } finally {
      cleanup();
    }
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
    win.onafterprint = finishPrint;
    win.print();
    // Some browsers omit afterprint for hidden iframes. print() returns only
    // after the dialog closes, so this fallback still records the print job.
    setTimeout(finishPrint, 250);
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
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bulk Tickets</title><style>${getSpecialPaperPrintStyle()}</style></head><body>${body}</body></html>`);
  doc.close();
  setTimeout(printWhenImagesReady, 500);
}

export function buildSpecialPaperPrintBody(sessions = [], selectedTicketsForPrint = [], printParts = {}) {
  const selectedBySession = new Map();
  for (const ticket of selectedTicketsForPrint) {
    if (!selectedBySession.has(ticket.sessionId)) selectedBySession.set(ticket.sessionId, []);
    selectedBySession.get(ticket.sessionId).push(ticket);
  }

  return sessions.map(session => {
    const sessionTickets = selectedBySession.get(session.sessionId) || [];
    if (sessionTickets.length === 0) return '';

    const isEventSession = session.sessionType === 'event';
    const isSingleCopy = !isEventSession && printParts.singleCopy;
    if (!isEventSession && !printParts.nameCopy && !printParts.seatCopy && !printParts.singleCopy) return '';
    // Bingo stock is 3 perforated strips per letter sheet. The 2-copy layout
    // uses one strip per ticket (Name half + Seat half). Single copy puts two
    // different tickets on one strip, one per half, so 6 tickets per sheet.
    const ticketsPerPage = isEventSession || isSingleCopy ? 6 : 3;
    const pages = [];
    for (let i = 0; i < sessionTickets.length; i += ticketsPerPage) {
      pages.push(sessionTickets.slice(i, i + ticketsPerPage));
    }

    return pages.map(pageTickets => {
      let cards;
      if (isEventSession) {
        cards = pageTickets.map(ticket => buildEventTicketHtml(session, ticket)).join('');
      } else if (isSingleCopy) {
        const strips = [];
        for (let i = 0; i < pageTickets.length; i += 2) {
          strips.push(buildBingoSingleCopyStripHtml(session, pageTickets[i], pageTickets[i + 1]));
        }
        cards = strips.join('');
      } else {
        cards = pageTickets.map(ticket => buildBingoTicketHtml(session, ticket, printParts)).join('');
      }
      const pageClass = isEventSession ? 'event-ticket-page' : 'bulk-ticket-page';
      return `<section class="${pageClass}">${cards}</section>`;
    }).join('');
  }).join('');
}

function getTicketDisplayTitle(session) {
  if (session.eventTitle) return session.eventTitle;
  return session.sessionType === 'regular_bingo' ? 'Regular Bingo' : 'Mega Bucks Bingo';
}

function getWalkInReference(ticket) {
  return `WALKIN-T${ticket.tableNumber}-S${ticket.chairNumber}`;
}

function buildEventTicketHtml(session, ticket) {
  const isWalkIn = Boolean(ticket.isWalkIn);
  const displayTitle = escapePrintHtml(getTicketDisplayTitle(session));
  const name = isWalkIn
    ? 'Name <span class="ticket-blank-line"></span>'
    : escapePrintHtml(`${ticket.firstName || ''} ${ticket.lastName || ''}`.trim());
  const tableNumber = escapePrintHtml(ticket.tableNumber);
  const chairNumber = escapePrintHtml(ticket.chairNumber);
  const meta = escapePrintHtml(`${formatPrintDate(session.sessionDate)} - ${formatPrintTime(session.sessionTime)}`);
  const reference = escapePrintHtml(isWalkIn ? getWalkInReference(ticket) : ticket.referenceNumber);

  return `<div class="event-ticket-card">
    <div class="event-ticket-title">${displayTitle}</div>
    <div class="event-ticket-name">${name}</div>
    <div class="event-ticket-row"><span>Table ${tableNumber}</span><span>Seat ${chairNumber}</span></div>
    <div class="event-ticket-meta">${meta}</div>
    <div class="event-ticket-ref">${reference}</div>
  </div>`;
}

// One half of a single-copy strip: the same "Keep this Ticket" content and
// type sizes as the Seat half of the 2-copy layout, so it lines up with the
// perforations and the centre split staff already cut along.
function buildBingoSingleCopyHalfHtml(session, ticket, sideClass) {
  const isWalkIn = Boolean(ticket.isWalkIn);
  const displayTitle = escapePrintHtml(getTicketDisplayTitle(session));
  const name = isWalkIn
    ? 'Name <span class="ticket-blank-line"></span>'
    : escapePrintHtml(`${ticket.firstName || ''} ${ticket.lastName || ''}`.trim());
  const tableNumber = escapePrintHtml(ticket.tableNumber);
  const chairNumber = escapePrintHtml(ticket.chairNumber);
  const date = escapePrintHtml(formatPrintDate(session.sessionDate));
  const time = escapePrintHtml(formatPrintTime(session.sessionTime));
  const reference = escapePrintHtml(isWalkIn ? getWalkInReference(ticket) : ticket.referenceNumber);
  const dateRef = `${date} – ${time} - <u>${reference}</u>`;

  return `<div class="ticket-half ${sideClass}">
    <div class="ticket-block">
      <div class="ticket-title-main">${displayTitle}</div>
    </div>
    <div class="ticket-block">
      <div class="ticket-tableseat">Table ${tableNumber} – Seat ${chairNumber}</div>
    </div>
    <div class="ticket-block">
      <div class="ticket-stub-label ticket-stub-label-u">Keep this Ticket</div>
      <div class="ticket-stub-main">${name}</div>
      <div class="ticket-dateref">${dateRef}</div>
    </div>
  </div>`;
}

// A single-copy strip holds two different tickets, left then right. An odd
// last ticket leaves the right half blank so the stock stays aligned.
function buildBingoSingleCopyStripHtml(session, leftTicket, rightTicket) {
  const left = buildBingoSingleCopyHalfHtml(session, leftTicket, 'ticket-half-left');
  const right = rightTicket
    ? buildBingoSingleCopyHalfHtml(session, rightTicket, 'ticket-half-right')
    : '<div class="ticket-half-spacer"></div>';
  return `<div class="ticket-card ticket-card-single"><div class="ticket-inner">${left}${right}</div></div>`;
}

function buildBingoTicketHtml(session, ticket, printParts) {
  const isWalkIn = Boolean(ticket.isWalkIn);
  const displayTitle = escapePrintHtml(getTicketDisplayTitle(session));
  const name = isWalkIn
    ? 'Name <span class="ticket-blank-line"></span>'
    : escapePrintHtml(`${ticket.firstName || ''} ${ticket.lastName || ''}`.trim());
  const tableNumber = escapePrintHtml(ticket.tableNumber);
  const chairNumber = escapePrintHtml(ticket.chairNumber);
  const date = escapePrintHtml(formatPrintDate(session.sessionDate));
  const time = escapePrintHtml(formatPrintTime(session.sessionTime));
  const reference = escapePrintHtml(isWalkIn ? getWalkInReference(ticket) : ticket.referenceNumber);
  const packageName = escapePrintHtml(ticket.packageName);
  const priceCents = Number(ticket.packagePrice || 0);
  const price = escapePrintHtml(`$${priceCents % 100 === 0 ? (priceCents / 100).toFixed(0) : (priceCents / 100).toFixed(2)}`);
  const redeemMain = `${price} ${packageName}`;
  const dateRef = `${date} – ${time} - <u>${reference}</u>`;

  const nameCopy = printParts.nameCopy ? `<div class="ticket-half ticket-half-left">
    <div class="ticket-block">
      <div class="ticket-name-prominent">${name}</div>
      <div class="ticket-title-sub">${displayTitle}</div>
    </div>
    <div class="ticket-block">
      <div class="ticket-stub-label">Redeem this Ticket for:</div>
      <div class="ticket-stub-main">${redeemMain}</div>
      <div class="ticket-dateref">${dateRef}</div>
    </div>
  </div>` : '<div class="ticket-half-spacer"></div>';

  const seatCopy = printParts.seatCopy ? `<div class="ticket-half ticket-half-right">
    <div class="ticket-block">
      <div class="ticket-title-main">${displayTitle}</div>
    </div>
    <div class="ticket-block">
      <div class="ticket-tableseat">Table ${tableNumber} – Seat ${chairNumber}</div>
    </div>
    <div class="ticket-block">
      <div class="ticket-stub-label ticket-stub-label-u">Keep this Ticket</div>
      <div class="ticket-stub-main">${name}</div>
      <div class="ticket-dateref">${dateRef}</div>
    </div>
  </div>` : '<div class="ticket-half-spacer"></div>';

  return `<div class="ticket-card"><div class="ticket-inner">${nameCopy}${seatCopy}</div></div>`;
}
