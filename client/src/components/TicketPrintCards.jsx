import React from 'react';
import { formatDateShort, formatTime, formatPrice } from '../utils/formatters';

// Printable ticket and receipt cards for the customer tickets page.
// Presentational. Moved verbatim from PrintableTickets.jsx.
export function TicketCard({ ticket, sessionDate, sessionTime, referenceNumber, eventTitle }) {
  const displayTitle = eventTitle || 'Mega Bucks Bingo';

  return (
    <div className="ticket-card">
      <div className="ticket-inner">
        {/* Left half: Client/Venue copy - name prominent */}
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
          <p className="ticket-price">{formatPrice(ticket.packagePrice)}</p>
          <p className="ticket-pkg">{ticket.packageName}</p>
          {ticket.addons && ticket.addons.length > 0 && (
            <div className="ticket-addons">
              {ticket.addons.map((a, idx) => (
                <span key={idx} className="ticket-addon-item">+ {a.packageName} x{a.quantity}</span>
              ))}
            </div>
          )}
          <div className="ticket-half-row ticket-meta">
            <span className="ticket-meta-text">{formatDateShort(sessionDate)}</span>
            <span className="ticket-meta-text">{formatTime(sessionTime)}</span>
          </div>
          <div className="ticket-ref-block">
            <span className="ticket-ref-value">{referenceNumber}</span>
          </div>
        </div>

        {/* Right half: Customer/Attendee copy - table/seat prominent */}
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
          <p className="ticket-price-sm">{formatPrice(ticket.packagePrice)} - {ticket.packageName}</p>
          {ticket.addons && ticket.addons.length > 0 && (
            <div className="ticket-addons">
              {ticket.addons.map((a, idx) => (
                <span key={idx} className="ticket-addon-item">+ {a.packageName} x{a.quantity}</span>
              ))}
            </div>
          )}
          <div className="ticket-half-row ticket-meta">
            <span className="ticket-meta-text">{formatDateShort(sessionDate)}</span>
            <span className="ticket-meta-text">{formatTime(sessionTime)}</span>
          </div>
          <div className="ticket-ref-block">
            <span className="ticket-ref-value">{referenceNumber}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EventTicketCard({ ticket, sessionDate, sessionTime, referenceNumber, eventTitle }) {
  return (
    <div className="event-ticket-card">
      <div className="event-ticket-kicker">Live Event Ticket</div>
      <div className="event-ticket-title">{eventTitle || 'Live Event / Venue'}</div>
      <div className="event-ticket-admit">Admit One</div>
      <div className="event-ticket-name">{ticket.firstName} {ticket.lastName}</div>
      <div className="event-ticket-row">
        <span>General Admission</span>
        <span>{formatPrice(ticket.packagePrice)}</span>
      </div>
      <div className="event-ticket-meta">{formatDateShort(sessionDate)} - {formatTime(sessionTime)}</div>
      <div className="event-ticket-ref"><span>Ticket</span>{referenceNumber}</div>
    </div>
  );
}

export function RegularReceipt({ data }) {
  const itemSubtotal = (data.tickets || []).reduce((sum, ticket) => {
    const addonTotal = (ticket.addons || []).reduce((addonSum, addon) => addonSum + (Number(addon.price) || 0), 0);
    return sum + (Number(ticket.packagePrice) || 0) + addonTotal;
  }, 0);
  const serviceChargeAmount = Math.max(0, (Number(data.totalAmount) || 0) - itemSubtotal);
  const totalWithService = Number(data.totalAmount) || itemSubtotal + serviceChargeAmount;

  return (
    <>
      <div className="no-print bg-brand-blue text-white px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Regular Bingo Receipt</h1>
          <p className="text-xs text-gray-300">Booking {data.referenceNumber} - {data.tickets.length} player(s)</p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => window.print()}
            className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-gold-light transition"
          >
            Print Receipt
          </button>
        </div>
      </div>

      <main className="regular-receipt">
        <div className="receipt-header">SMEC BINGO</div>
        <div className="receipt-subheader">Saint Mary's Entertainment Centre</div>
        <div className="receipt-line" />
        <div className="receipt-center receipt-bold">REGULAR BINGO RECEIPT</div>
        <div className="receipt-center">{formatDateShort(data.sessionDate)} at {formatTime(data.sessionTime)}</div>
        <div className="receipt-line" />
        <div className="receipt-row">
          <span>Ref:</span>
          <span className="receipt-bold">{data.referenceNumber}</span>
        </div>
        <div className="receipt-row">
          <span>Status:</span>
          <span>{String(data.paymentStatus || '').toUpperCase()}</span>
        </div>
        <div className="receipt-line" />
        <div className="receipt-bold">Players</div>
        {data.tickets.map((ticket, idx) => (
          <div className="receipt-player" key={ticket.referenceNumber || idx}>
            <div>{ticket.firstName} {ticket.lastName}</div>
            <div className="receipt-item">
              <span>T{ticket.tableNumber}/C{ticket.chairNumber} - {ticket.packageName}</span>
              <span>{ticket.packagePriceFormatted || formatPrice(ticket.packagePrice)}</span>
            </div>
            {ticket.referenceNumber && (
              <div className="receipt-note">Ticket: {ticket.referenceNumber}</div>
            )}
            {(ticket.addons || []).map((addon, addonIdx) => (
              <div className="receipt-item receipt-note" key={addonIdx}>
                <span>+ {addon.packageName} x{addon.quantity}</span>
                <span>{addon.priceFormatted}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="receipt-double-line" />
        <div className="receipt-summary">
          <span>SUBTOTAL</span>
          <span>{formatPrice(itemSubtotal)}</span>
        </div>
        <div className="receipt-summary">
          <span>SERVICE CHARGE</span>
          <span>{formatPrice(serviceChargeAmount)}</span>
        </div>
        <div className="receipt-line" />
        <div className="receipt-total">
          <span>TOTAL</span>
          <span>{formatPrice(totalWithService)}</span>
        </div>
        <div className="receipt-line" />
        <div className="receipt-center receipt-note">Regular bingo orders are printed on receipt paper.</div>
      </main>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; background: #fff; color: #000; }
          *, *::before, *::after {
            color: #000 !important;
            background: #fff !important;
            border-color: #000 !important;
            box-shadow: none !important;
            text-shadow: none !important;
          }
          img {
            filter: grayscale(1) brightness(0) !important;
            -webkit-filter: grayscale(1) brightness(0) !important;
          }
          @page { size: 80mm auto; margin: 0; }
          .regular-receipt { box-shadow: none; margin: 0 auto; }
        }

        @media screen {
          body { background: #f3f4f6; }
          .regular-receipt {
            margin: 24px auto;
            box-shadow: 0 2px 8px rgba(0,0,0,0.12);
          }
        }

        .regular-receipt {
          width: 72mm;
          background: #fff;
          color: #000;
          padding: 4mm;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.4;
          box-sizing: border-box;
        }
        .receipt-header { text-align: center; font-size: 14px; font-weight: 700; margin-bottom: 4px; }
        .receipt-subheader { text-align: center; font-size: 10px; color: #333; margin-bottom: 8px; }
        .receipt-center { text-align: center; }
        .receipt-bold { font-weight: 700; }
        .receipt-line { border-top: 1px dashed #000; margin: 4px 0; }
        .receipt-double-line { border-top: 2px solid #000; margin: 6px 0; }
        .receipt-row, .receipt-item, .receipt-summary, .receipt-total {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .receipt-row span:last-child,
        .receipt-item span:last-child,
        .receipt-summary span:last-child,
        .receipt-total span:last-child {
          text-align: right;
        }
        .receipt-player { padding: 3px 0; }
        .receipt-item { font-size: 10px; color: #555; padding-left: 8px; }
        .receipt-note { font-size: 10px; color: #555; }
        .receipt-summary { font-size: 11px; font-weight: 700; padding: 1px 0; }
        .receipt-total { font-weight: 700; font-size: 13px; padding: 2px 0; }
      `}</style>
    </>
  );
}
