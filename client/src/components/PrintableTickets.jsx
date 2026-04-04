import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function TicketCard({ ticket, sessionDate, sessionTime, referenceNumber, eventTitle }) {
  const displayTitle = eventTitle || 'Mega Bucks Bingo';

  return (
    <div className="ticket-card">
      <div className="ticket-inner">
        {/* Left half: Client/Venue copy — name prominent */}
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
          <div className="ticket-half-row ticket-meta">
            <span className="ticket-meta-text">{formatDate(sessionDate)}</span>
            <span className="ticket-meta-text">{formatTime(sessionTime)}</span>
          </div>
          <div className="ticket-ref-block">
            <span className="ticket-ref-value">{referenceNumber}</span>
          </div>
        </div>

        {/* Right half: Customer/Attendee copy — table/seat prominent */}
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
          <p className="ticket-price-sm">{formatPrice(ticket.packagePrice)} — {ticket.packageName}</p>
          <div className="ticket-half-row ticket-meta">
            <span className="ticket-meta-text">{formatDate(sessionDate)}</span>
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

export default function PrintableTickets() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [searchCode, setSearchCode] = useState('');

  const loadTickets = (refCode) => {
    setError(null);
    setData(null);
    fetch(`/api/bookings/${refCode}/tickets`)
      .then(r => {
        if (!r.ok) throw new Error('Booking not found');
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message));
  };

  useEffect(() => {
    if (ref) loadTickets(ref);
  }, [ref]);

  const handleSearch = (e) => {
    e.preventDefault();
    const code = searchCode.trim();
    if (code) {
      navigate(`/tickets/${code}`);
    }
  };

  if (!ref) {
    // No ref in URL — show search form only
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

  // Split tickets into pages of 3 (3 rows, full width each)
  const pages = [];
  for (let i = 0; i < data.tickets.length; i += 3) {
    pages.push(data.tickets.slice(i, i + 3));
  }

  return (
    <>
      {/* Screen-only controls */}
      <div className="no-print bg-brand-blue text-white px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Print Tickets</h1>
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

      {/* Ticket pages: 3 per page, full width */}
      {pages.map((pageTickets, pageIdx) => (
        <div className="ticket-page" key={pageIdx}>
          {pageTickets.map((ticket, i) => (
            <TicketCard
              key={i}
              ticket={ticket}
              sessionDate={data.sessionDate}
              sessionTime={data.sessionTime}
              referenceNumber={data.referenceNumber}
              eventTitle={data.isSpecialEvent ? data.eventTitle : null}
            />
          ))}
        </div>
      ))}

      <style>{`
        /* Print-specific styles */
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          @page {
            size: letter;
            margin: 0.25in;
          }
        }

        /* Screen preview */
        @media screen {
          .ticket-page {
            max-width: 8.5in;
            margin: 20px auto;
            padding: 0.25in;
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
        }

        /* 3 tickets per page, full width, no wasted space */
        .ticket-page {
          display: flex;
          flex-direction: column;
          width: 8in;
          height: 10.5in;
          page-break-after: always;
          justify-content: space-between;
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
      `}</style>
    </>
  );
}
