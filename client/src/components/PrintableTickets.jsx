import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchBookingTickets } from '../api';
import { formatDateShort, formatTime, formatPrice } from '../utils/formatters';

function TicketCard({ ticket, sessionDate, sessionTime, referenceNumber, eventTitle }) {
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

function EventTicketCard({ ticket, sessionDate, sessionTime, referenceNumber, eventTitle }) {
  return (
    <div className="event-ticket-card">
      <div className="event-ticket-kicker">Live Event Ticket</div>
      <div className="event-ticket-title">{eventTitle || 'Live Event / Venue'}</div>
      <div className="event-ticket-admit">Admit One</div>
      <div className="event-ticket-name">{ticket.firstName} {ticket.lastName}</div>
      <div className="event-ticket-row">
        <span>Table {ticket.tableNumber}</span>
        <span>Seat {ticket.chairNumber}</span>
      </div>
      <div className="event-ticket-meta">{formatDateShort(sessionDate)} - {formatTime(sessionTime)}</div>
      <div className="event-ticket-ref"><span>Ticket</span>{referenceNumber}</div>
    </div>
  );
}

function RegularReceipt({ data }) {
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

export default function PrintableTickets() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ticketAccessToken = searchParams.get('t') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [searchCode, setSearchCode] = useState('');
  const [email, setEmail] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);

  const loadTickets = (refCode, options = {}) => {
    setError(null);
    setData(null);
    setNeedsVerification(false);
    fetchBookingTickets(refCode, options)
      .then(setData)
      .catch(e => {
        const message = e?.message || 'Booking not found';
        if (message.includes('email address used for this booking')) {
          setNeedsVerification(true);
          setError(null);
          return;
        }
        setError(message);
      });
  };

  useEffect(() => {
    if (ref) loadTickets(ref, { ticketAccessToken });
  }, [ref, ticketAccessToken]);

  const handleSearch = (e) => {
    e.preventDefault();
    const code = searchCode.trim();
    if (code) {
      navigate(`/tickets/${code}`);
    }
  };

  const handleVerifyEmail = (e) => {
    e.preventDefault();
    if (ref && email.trim()) loadTickets(ref, { email: email.trim() });
  };

  if (!ref) {
    // No ref in URL - show search form only
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl p-8 shadow max-w-md w-full">
          <h2 className="text-xl font-bold text-brand-blue mb-2">Reprint Tickets</h2>
          <p className="text-sm text-gray-500 mb-4">Enter your booking reference code to find and reprint your tickets.</p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchCode}
              onChange={e => setSearchCode(e.target.value.toUpperCase())}
              placeholder="e.g. BNG-A1B2C3"
              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <button type="submit" className="bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-blue/90 transition">
              Search
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (needsVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl p-8 shadow max-w-md w-full">
          <h2 className="text-xl font-bold text-brand-blue mb-2">Verify Booking</h2>
          <p className="text-sm text-gray-500 mb-4">Enter the email address used for this booking to view or print tickets.</p>
          <form onSubmit={handleVerifyEmail} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              autoComplete="email"
            />
            <button type="submit" className="w-full bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-blue/90 transition">
              View Tickets
            </button>
          </form>
          <button onClick={() => navigate('/')} className="mt-4 text-brand-blue underline text-sm">Go Back Home</button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl p-8 shadow text-center max-w-md w-full">
          <p className="text-red-500 font-semibold mb-4">{error}</p>
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <input
              type="text"
              value={searchCode}
              onChange={e => setSearchCode(e.target.value.toUpperCase())}
              placeholder="Enter booking code"
              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <button type="submit" className="bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-blue/90 transition">
              Search
            </button>
          </form>
          <button onClick={() => navigate('/')} className="text-brand-blue underline text-sm">Go Back Home</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading tickets...</p>
      </div>
    );
  }

  if (data.printMode === 'receipt' || !data.isSpecialEvent) {
    return <RegularReceipt data={data} />;
  }

  const isEventLayout = data.printLayout === 'event_6up' || data.sessionType === 'event';
  const printTitle = isEventLayout ? 'Print Live Event Tickets' : 'Print Tickets';
  const ticketsPerPage = isEventLayout ? 6 : 3;

  const pages = [];
  for (let i = 0; i < data.tickets.length; i += ticketsPerPage) {
    pages.push(data.tickets.slice(i, i + ticketsPerPage));
  }

  return (
    <>
      {/* Screen-only controls */}
      <div className="no-print bg-brand-blue text-white px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{printTitle}</h1>
          <p className="text-xs text-gray-300">Booking {data.referenceNumber} - {data.tickets.length} ticket(s)</p>
        </div>
        <div className="flex gap-3 items-center">
          {/* Reprint search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchCode}
              onChange={e => setSearchCode(e.target.value.toUpperCase())}
              placeholder="Reprint by code"
              className="px-3 py-1.5 rounded-lg text-sm text-gray-800 w-36 focus:outline-none focus:ring-2 focus:ring-brand-gold"
            />
            <button type="submit" className="bg-white/10 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-white/20 transition">
              Find
            </button>
          </form>
          <button
            onClick={() => window.print()}
            className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-gold-light transition"
          >
            Print
          </button>
          <button
            onClick={() => navigate(-1)}
            className="bg-white/10 text-white px-4 py-2 rounded-lg text-sm hover:bg-white/20 transition"
          >
            Back
          </button>
        </div>
      </div>

      {/* Ticket pages */}
      {pages.map((pageTickets, pageIdx) => (
        <div className={isEventLayout ? 'event-ticket-page' : 'ticket-page'} key={pageIdx}>
          {pageTickets.map((ticket, i) => (
            isEventLayout ? (
              <EventTicketCard
                key={i}
                ticket={ticket}
                sessionDate={data.sessionDate}
                sessionTime={data.sessionTime}
                referenceNumber={ticket.referenceNumber || data.referenceNumber}
                eventTitle={data.eventTitle}
              />
            ) : (
              <TicketCard
                key={i}
                ticket={ticket}
                sessionDate={data.sessionDate}
                sessionTime={data.sessionTime}
                referenceNumber={ticket.referenceNumber || data.referenceNumber}
                eventTitle={data.isSpecialEvent ? data.eventTitle : null}
              />
            )
          ))}
        </div>
      ))}

      <style>{`
        /* Print-specific styles */
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; color: #000; background: #fff; }
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
          .event-ticket-admit,
          .event-ticket-card::before {
            background: #000 !important;
            color: #fff !important;
          }
          @page {
            size: letter;
            margin: 0.25in;
          }
        }

        /* Screen preview */
        @media screen {
          .ticket-page, .event-ticket-page {
            max-width: 8.5in;
            margin: 20px auto;
            padding: 0.25in;
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
        }

        .event-ticket-page {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          grid-template-rows: repeat(3, 1fr);
          gap: 0.12in;
          width: 8in;
          height: 10.5in;
          page-break-after: always;
        }

        .event-ticket-card {
          border: 2px solid #2563eb;
          border-radius: 6px;
          box-sizing: border-box;
          padding: 0.18in;
          background: linear-gradient(180deg, #eff6ff 0%, #ffffff 52%, #dbeafe 100%);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          color: #0f2d48;
          overflow: hidden;
          position: relative;
        }

        .event-ticket-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0.08in;
          background: #2563eb;
        }

        .event-ticket-kicker {
          color: #2563eb;
          font-size: 11px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: 0;
          text-transform: uppercase;
          margin-bottom: 0.08in;
        }

        .event-ticket-title {
          font-size: 19px;
          font-weight: 700;
          line-height: 1.15;
          margin-bottom: 0.08in;
          max-width: 92%;
        }

        .event-ticket-admit {
          background: #2563eb;
          color: #fff;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
          padding: 0.05in 0.16in;
          text-transform: uppercase;
          margin-bottom: 0.1in;
        }

        .event-ticket-name {
          font-size: 19px;
          font-weight: 700;
          line-height: 1.2;
          word-break: break-word;
          max-width: 100%;
          margin-bottom: 0.1in;
        }

        .event-ticket-row {
          display: flex;
          gap: 0.18in;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 0.08in;
        }

        .event-ticket-meta {
          font-size: 12px;
          color: #555;
          font-weight: 600;
          margin-bottom: 0.08in;
        }

        .event-ticket-ref {
          font-family: monospace;
          font-size: 13px;
          font-weight: 700;
          color: #0f2d48;
          display: flex;
          align-items: center;
          gap: 0.08in;
        }

        .event-ticket-ref span {
          font-family: Arial, sans-serif;
          font-size: 10px;
          color: #2563eb;
          text-transform: uppercase;
          font-weight: 800;
        }

        /* 3 tickets per page, full width, no wasted space */
        .ticket-page {
          display: flex;
          flex-direction: column;
          width: 8in;
          height: 10.5in;
          page-break-after: always;
          justify-content: flex-start;
          gap: 0.15in;
        }

        .ticket-card {
          width: 100%;
          height: 3.4in;
          border: 1.5px dashed #c5a55a;
          border-radius: 8px;
          box-sizing: border-box;
          background: linear-gradient(135deg, #fdf6e3 0%, #fcecd6 50%, #f8e0c0 100%);
          position: relative;
          overflow: hidden;
        }

        .ticket-inner {
          display: flex;
          height: 100%;
          padding: 0.25in 0.3in;
          gap: 0;
        }

        /* 50/50 ticket halves */
        .ticket-half {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          box-sizing: border-box;
          padding: 0 0.2in;
          gap: 2px;
        }

        .ticket-half-left {
          border-right: 2px dashed #c5a55a;
        }

        .ticket-half-row {
          display: flex;
          gap: 16px;
          justify-content: center;
          align-items: center;
        }

        .ticket-title {
          font-family: 'Georgia', serif;
          font-size: 16px;
          font-weight: bold;
          color: #1a3a5c;
          margin: 0 0 4px 0;
          line-height: 1.2;
        }

        .ticket-logo {
          width: 50px;
          height: 35px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }

        .ticket-logo-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          opacity: 0.7;
        }

        /* Left half: name big */
        .ticket-name-prominent {
          font-size: 22px;
          font-weight: 700;
          color: #1a3a5c;
          margin: 0 0 2px 0;
          line-height: 1.2;
          word-break: break-word;
          max-width: 100%;
        }

        /* Right half: name smaller */
        .ticket-name-secondary {
          font-size: 16px;
          font-weight: 700;
          color: #1a3a5c;
          line-height: 1.2;
          word-break: break-word;
          margin: 2px 0;
        }

        .ticket-price {
          font-family: 'Georgia', serif;
          font-size: 20px;
          font-weight: bold;
          color: #c5a55a;
          margin: 2px 0 0 0;
        }

        .ticket-price-sm {
          font-size: 12px;
          font-weight: 600;
          color: #c5a55a;
          margin: 2px 0;
        }

        .ticket-pkg {
          font-size: 11px;
          color: #888;
          margin: 0;
        }

        /* Table/Seat on left (compact) */
        .ticket-detail-compact {
          text-align: center;
        }

        .ticket-detail-compact .ticket-label-sm {
          display: block;
          font-size: 9px;
          color: #aaa;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .ticket-value-md {
          display: block;
          font-size: 22px;
          font-weight: bold;
          color: #1a3a5c;
          line-height: 1.1;
        }

        /* Table/Seat on right (prominent) */
        .ticket-detail {
          text-align: center;
        }

        .ticket-label {
          display: block;
          font-size: 11px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .ticket-value {
          display: block;
          font-size: 36px;
          font-weight: bold;
          color: #1a3a5c;
          line-height: 1.1;
        }

        .ticket-label-sm {
          display: block;
          font-size: 9px;
          color: #aaa;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .ticket-meta {
          margin-top: 2px;
        }

        .ticket-meta-text {
          font-size: 11px;
          font-weight: 600;
          color: #555;
        }

        .ticket-ref-block {
          margin-top: 2px;
          text-align: center;
        }

        .ticket-ref-value {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #1a3a5c;
          font-family: monospace;
          letter-spacing: 0.5px;
        }

        .ticket-addons {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
          margin-top: 1px;
        }

        .ticket-addon-item {
          font-size: 10px;
          color: #7c5e2a;
          font-weight: 600;
        }
      `}</style>
    </>
  );
}
