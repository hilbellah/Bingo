import React from 'react';

const styles = {
  body: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: '#0a1628',
    color: '#e0e0e0',
    lineHeight: 1.6,
    minHeight: '100vh',
  },
  header: {
    background: 'linear-gradient(135deg, #0d1f3c, #1a3a5c)',
    padding: '40px 20px',
    textAlign: 'center',
    borderBottom: '3px solid #c9a84c',
  },
  headerTitle: { color: '#c9a84c', fontSize: '2.5em', marginBottom: '8px' },
  headerSub: { color: '#aaa', fontSize: '1.1em' },
  headerLink: { color: '#c9a84c', textDecoration: 'none' },
  container: { maxWidth: '900px', margin: '0 auto', padding: '30px 20px' },
  partHeader: {
    background: 'linear-gradient(135deg, #1a3a5c, #0d1f3c)',
    padding: '30px',
    borderRadius: '12px',
    margin: '40px 0 30px',
    borderLeft: '5px solid #c9a84c',
  },
  partTitle: { color: '#c9a84c', fontSize: '1.8em', marginBottom: '5px' },
  partDesc: { color: '#aaa' },
  step: {
    background: '#111d2e',
    borderRadius: '12px',
    padding: '30px',
    marginBottom: '25px',
    border: '1px solid #1e3a5f',
  },
  stepHeader: {
    color: '#c9a84c',
    fontSize: '1.3em',
    marginBottom: '15px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  stepNumber: {
    background: '#c9a84c',
    color: '#0a1628',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '0.9em',
    flexShrink: 0,
  },
  ul: { margin: '10px 0 15px 20px', listStyle: 'disc' },
  li: { marginBottom: '6px' },
  img: {
    width: '100%',
    borderRadius: '8px',
    marginTop: '15px',
    border: '2px solid #1e3a5f',
    cursor: 'pointer',
  },
  note: {
    background: '#1a2a3c',
    borderLeft: '4px solid #c9a84c',
    padding: '12px 16px',
    margin: '12px 0',
    borderRadius: '0 8px 8px 0',
    fontSize: '0.95em',
  },
  noteStrong: { color: '#c9a84c' },
  table: { width: '100%', borderCollapse: 'collapse', margin: '15px 0' },
  th: {
    background: '#1a3a5c',
    color: '#c9a84c',
    padding: '10px 14px',
    textAlign: 'left',
    borderBottom: '2px solid #c9a84c',
  },
  td: { padding: '10px 14px', borderBottom: '1px solid #1e3a5f' },
  flowDiagram: {
    background: '#0d1f3c',
    padding: '20px',
    borderRadius: '8px',
    textAlign: 'center',
    fontFamily: 'monospace',
    fontSize: '0.95em',
    color: '#c9a84c',
    margin: '15px 0',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
  },
  refCard: {
    background: '#111d2e',
    borderRadius: '12px',
    padding: '30px',
    marginTop: '30px',
    border: '1px solid #1e3a5f',
  },
  refTitle: { color: '#c9a84c', marginBottom: '20px' },
  refSubtitle: { color: '#c9a84c', margin: '20px 0 10px' },
  divider: {
    height: '2px',
    background: 'linear-gradient(to right, transparent, #c9a84c, transparent)',
    margin: '40px 0',
  },
  gold: { color: '#c9a84c' },
  link: { color: '#c9a84c', textDecoration: 'none' },
  backLink: {
    display: 'inline-block',
    marginTop: '10px',
    color: '#c9a84c',
    textDecoration: 'none',
    fontSize: '0.95em',
  },
};

function Step({ number, title, children }) {
  return (
    <div style={styles.step}>
      <h3 style={styles.stepHeader}>
        <span style={styles.stepNumber}>{number}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Note({ label, children }) {
  return (
    <div style={styles.note}>
      <strong style={styles.noteStrong}>{label}:</strong> {children}
    </div>
  );
}

export default function Tutorial() {
  return (
    <div style={styles.body}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>Wolastoq BINGO</h1>
        <p style={styles.headerSub}>Step-by-Step Guide for Presentation &amp; Testing</p>
        <p style={{ marginTop: '10px' }}>
          Live Site:{' '}
          <a href="https://bingo-jk2h.onrender.com" target="_blank" rel="noreferrer" style={styles.headerLink}>
            https://bingo-jk2h.onrender.com
          </a>
        </p>
        <a href="/" style={styles.backLink}>&larr; Back to Booking</a>
      </div>

      <div style={styles.container}>

        {/* PART 1 */}
        <div style={styles.partHeader}>
          <h2 style={styles.partTitle}>PART 1: Buying Tickets (Customer Flow)</h2>
          <p style={styles.partDesc}>This is what a customer sees when they visit the site to purchase bingo tickets.</p>
        </div>

        <Step number={1} title="Open the Website">
          <ul style={styles.ul}>
            <li style={styles.li}>Go to <strong><a href="https://bingo-jk2h.onrender.com" target="_blank" rel="noreferrer" style={styles.link}>https://bingo-jk2h.onrender.com</a></strong></li>
            <li style={styles.li}>The site loads with the <strong>Saint Mary's Entertainment Centre</strong> branding.</li>
            <li style={styles.li}>The first available bingo session is automatically selected.</li>
            <li style={styles.li}>Any active announcements appear at the top of the page.</li>
          </ul>
          <img src="/screenshots/step1-homepage.png" alt="Homepage with floor map and session selector" style={styles.img} />
        </Step>

        <Step number={2} title="Choose a Session (Date & Time)">
          <ul style={styles.ul}>
            <li style={styles.li}>Sessions are displayed in a <strong>weekly calendar bar</strong> at the top.</li>
            <li style={styles.li}>Use the <strong>left/right arrows</strong> to navigate between weeks.</li>
            <li style={styles.li}>Each session shows its <strong>date, time, and available seats</strong>.</li>
            <li style={styles.li}>The currently selected session is highlighted in <strong style={styles.gold}>gold</strong>.</li>
          </ul>
          <Note label="Color Legend">Green = Available | Amber = Partial | Blue = Your Pick | Gray = Full</Note>
          <img src="/screenshots/step2-sessions.png" alt="Session selector bar with week navigation" style={styles.img} />
        </Step>

        <Step number={3} title="Select Your Seats on the Floor Map">
          <ul style={styles.ul}>
            <li style={styles.li}>A <strong>74-table floor plan</strong> appears showing the venue layout (tables 1-75, skipping table 41).</li>
            <li style={styles.li}>The floor plan shows "FRONT OF ROOM - STAGE" at the top and "ENTRANCE / BACK OF ROOM" at the bottom.</li>
            <li style={styles.li}>Each table shows its number and available seats (e.g., "6/6").</li>
            <li style={styles.li}><strong>Click a table</strong> to expand it and see the individual chairs (6 per table, numbered 1-6).</li>
          </ul>
          <img src="/screenshots/step3-seat-selection.png" alt="Table clicked showing 6 available chairs" style={styles.img} />
        </Step>

        <Step number={4} title="Lock a Seat">
          <ul style={styles.ul}>
            <li style={styles.li}><strong>Click a chair number</strong> inside the expanded table to lock it.</li>
            <li style={styles.li}>The seat is held for <strong>10 minutes</strong> (a countdown timer appears in the header).</li>
            <li style={styles.li}>Your locked seats turn <strong style={styles.gold}>blue</strong> on the floor map.</li>
            <li style={styles.li}>Other customers see your locked seats in real time -- they cannot double-book.</li>
            <li style={styles.li}>The booking panel opens automatically after your first seat selection.</li>
          </ul>
          <img src="/screenshots/step4-seat-locked.png" alt="Seat selected with chair picker visible" style={styles.img} />
        </Step>

        <Step number={5} title="Choose Party Size & Enter Player Names">
          <ul style={styles.ul}>
            <li style={styles.li}>After selecting a seat, the <strong>booking panel</strong> opens on the right side.</li>
            <li style={styles.li}>Select your party size: <strong>1 through 6</strong> players.</li>
            <li style={styles.li}>For each player, enter <strong>First Name</strong> and <strong>Last Name</strong>.</li>
            <li style={styles.li}>The <strong>base package</strong> is automatically included.</li>
            <li style={styles.li}>Optional <strong>add-ons</strong> can be selected with quantity controls (+/-).</li>
            <li style={styles.li}>A <strong style={styles.gold}>running subtotal</strong> is shown for each player.</li>
          </ul>
          <Note label="Note">For special events, players will see the event's custom packages instead of the standard ones.</Note>
          <img src="/screenshots/step5-booking-panel.png" alt="Booking panel with party size and name entry" style={styles.img} />
        </Step>

        <Step number={6} title="Review Your Order">
          <ul style={styles.ul}>
            <li style={styles.li}>A summary screen shows session info, per-player breakdown (name, table/seat, packages, price), and <strong style={styles.gold}>grand total</strong>.</li>
            <li style={styles.li}>Use the <strong>Back</strong> button to make changes, or <strong>Next</strong> to proceed to payment.</li>
          </ul>
          <img src="/screenshots/step6-packages.png" alt="Order summary with packages breakdown" style={styles.img} />
        </Step>

        <Step number={7} title="Enter Payment Information">
          <ul style={styles.ul}>
            <li style={styles.li}>A yellow banner reminds you this is <strong>demo mode</strong> (no real charges).</li>
            <li style={styles.li}>Fill in: <strong>Cardholder Name</strong>, <strong>Card Number</strong> (auto-detects Visa/Mastercard/Amex/Discover), <strong>Expiry Date</strong>, <strong>CVV</strong>, <strong>Address</strong>, <strong>Postal Code</strong>.</li>
            <li style={styles.li}>Click <strong>"Complete Booking"</strong> to submit.</li>
          </ul>
        </Step>

        <Step number={8} title="Booking Confirmation">
          <ul style={styles.ul}>
            <li style={styles.li}>A <strong>success screen</strong> appears with a green checkmark.</li>
            <li style={styles.li}>You see: <strong>Booking Reference Number</strong> (BNG-XXXXXX), <strong>date/time</strong>, <strong>total paid</strong>, <strong>seat assignments</strong>.</li>
            <li style={styles.li}>Two options: <strong>"View Printable Tickets"</strong> or <strong>"Start New Booking"</strong>.</li>
          </ul>
        </Step>

        <Step number={9} title="Print Your Tickets">
          <ul style={styles.ul}>
            <li style={styles.li}>Tickets can be accessed anytime at <strong><a href="https://bingo-jk2h.onrender.com/tickets" target="_blank" rel="noreferrer" style={styles.link}>https://bingo-jk2h.onrender.com/tickets</a></strong></li>
            <li style={styles.li}>Enter your <strong>reference number</strong> (BNG-XXXXXX) to look up your tickets.</li>
            <li style={styles.li}>Each attendee gets a <strong>double-sided tear-off ticket</strong> with venue copy and customer copy.</li>
            <li style={styles.li}>Optimized for <strong>A4 printing</strong> -- use your browser's Print function (Ctrl+P).</li>
            <li style={styles.li}>No login required -- just the reference number.</li>
          </ul>
          <img src="/screenshots/step7-tickets-lookup.png" alt="Ticket lookup page" style={styles.img} />
        </Step>

        <div style={styles.divider} />

        {/* PART 2 */}
        <div style={styles.partHeader}>
          <h2 style={styles.partTitle}>PART 2: Setting Up Special Events (Admin Flow)</h2>
          <p style={styles.partDesc}>This is what an administrator does to create and manage special bingo events.</p>
        </div>

        <Step number={1} title="Log In to the Admin Panel">
          <ul style={styles.ul}>
            <li style={styles.li}>Navigate to <strong><a href="https://bingo-jk2h.onrender.com/admin" target="_blank" rel="noreferrer" style={styles.link}>https://bingo-jk2h.onrender.com/admin</a></strong></li>
            <li style={styles.li}>Enter your <strong>Username</strong> and <strong>Password</strong>.</li>
            <li style={styles.li}>Click <strong>Sign In</strong>.</li>
          </ul>
          <img src="/screenshots/admin1-login.png" alt="Admin login page" style={styles.img} />
        </Step>

        <Step number={2} title="View the Dashboard">
          <ul style={styles.ul}>
            <li style={styles.li}>Key metrics at the top: <strong>Today's Bookings</strong>, <strong>Today's Revenue</strong>, <strong>Upcoming Sessions</strong>.</li>
            <li style={styles.li}>Below: table of <strong>Upcoming Sessions</strong> with date, time, available/sold/held seats.</li>
          </ul>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Tab</th>
                <th style={styles.th}>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={styles.td}><strong>Dashboard</strong></td><td style={styles.td}>Key metrics and upcoming sessions overview</td></tr>
              <tr><td style={styles.td}><strong>Sessions</strong></td><td style={styles.td}>Create and manage sessions/special events</td></tr>
              <tr><td style={styles.td}><strong>Packages</strong></td><td style={styles.td}>View and manage global ticket packages</td></tr>
              <tr><td style={styles.td}><strong>Announcements</strong></td><td style={styles.td}>Create public announcements</td></tr>
              <tr><td style={styles.td}><strong>Bookings &amp; Reports</strong></td><td style={styles.td}>View bookings, filter, export CSV</td></tr>
              <tr><td style={styles.td}><strong>Bulk Print</strong></td><td style={styles.td}>Print all tickets for a date range</td></tr>
            </tbody>
          </table>
          <img src="/screenshots/admin2-dashboard.png" alt="Admin Dashboard with metrics" style={styles.img} />
        </Step>

        <Step number={3} title="Go to Sessions Tab">
          <ul style={styles.ul}>
            <li style={styles.li}>Click the <strong>Sessions</strong> tab.</li>
            <li style={styles.li}>Two sections: <strong>Create New Session</strong> form at the top, and <strong>All Sessions</strong> table below.</li>
          </ul>
          <img src="/screenshots/admin3-sessions-tab.png" alt="Sessions tab with create form and session list" style={styles.img} />
        </Step>

        <Step number={4} title="Create a New Special Event">
          <ul style={styles.ul}>
            <li style={styles.li}><strong>Enter the date</strong> for the event.</li>
            <li style={styles.li}><strong>Enter the start time</strong> (default: 6:30 PM).</li>
            <li style={styles.li}><strong>Enter the cutoff time</strong> -- when online booking closes (default: 12:00 PM).</li>
            <li style={styles.li}><strong>Check the "Special Event" checkbox</strong>. The button changes to "Add Special Event" and a configuration section expands.</li>
          </ul>
          <img src="/screenshots/admin4-create-session.png" alt="Create session form" style={styles.img} />
        </Step>

        <Step number={5} title="Fill In Special Event Details">
          <ul style={styles.ul}>
            <li style={styles.li}><strong>Event Title</strong> (e.g., "Special Bingo Event 1") -- required.</li>
            <li style={styles.li}><strong>Description</strong> (optional -- visible to customers).</li>
            <li style={styles.li}><strong>Event Packages</strong> section with a <strong>"+ Add Package"</strong> link.</li>
          </ul>
          <img src="/screenshots/admin5-special-event.png" alt="Special Event checkbox enabled with details" style={styles.img} />
        </Step>

        <Step number={6} title="Configure Event Packages">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>"+ Add Package"</strong> to add custom packages.</li>
            <li style={styles.li}>For each package, enter: <strong>Package Name</strong>, <strong>Price</strong>, <strong>Type</strong> (Required or Add-on), <strong>Max Quantity</strong>.</li>
            <li style={styles.li}>Add as many packages as needed. Remove with the <strong>X</strong> button.</li>
            <li style={styles.li}>Click <strong>"Add Special Event"</strong> to create it.</li>
          </ul>
          <Note label="Behind the scenes">444 seats (74 tables x 6 chairs) are automatically generated. Custom packages are saved for this event only.</Note>
          <Note label="Tip">You need at least one <strong style={styles.noteStrong}>Required</strong> package. This is every attendee's base ticket price.</Note>
          <img src="/screenshots/admin6-event-packages.png" alt="Event packages configuration" style={styles.img} />
        </Step>

        <Step number={7} title="View All Sessions">
          <ul style={styles.ul}>
            <li style={styles.li}>Scroll down to see the <strong>All Sessions</strong> table with Date, Time, Cutoff, Type, Status, and Actions.</li>
            <li style={styles.li}>Special events show their event title under "Type" instead of "Regular".</li>
            <li style={styles.li}>Actions: <strong>Edit</strong>, <strong>Disable/Enable</strong> buttons.</li>
          </ul>
          <img src="/screenshots/admin7-sessions-list.png" alt="All Sessions table" style={styles.img} />
        </Step>

        <Step number={8} title="Manage Packages (Global)">
          <ul style={styles.ul}>
            <li style={styles.li}>Click the <strong>Packages</strong> tab to view and manage global ticket packages that apply to all regular (non-special-event) sessions.</li>
          </ul>
          <img src="/screenshots/admin11-packages.png" alt="Global packages management tab" style={styles.img} />
        </Step>

        <Step number={9} title="Monitor Bookings & Sales">
          <ul style={styles.ul}>
            <li style={styles.li}>Click the <strong>Bookings &amp; Reports</strong> tab.</li>
            <li style={styles.li}><strong>Filter by Session</strong> using the dropdown.</li>
            <li style={styles.li}>Click <strong>"Export CSV"</strong> to download booking data as a spreadsheet.</li>
            <li style={styles.li}>View each booking with reference number, total, payment status, and attendee details.</li>
            <li style={styles.li}>Actions: <strong>Print Tickets</strong> or <strong>Cancel Booking</strong> (red).</li>
          </ul>
          <img src="/screenshots/admin8-bookings.png" alt="Bookings & Reports tab" style={styles.img} />
        </Step>

        <Step number={10} title="Bulk Print Tickets">
          <ul style={styles.ul}>
            <li style={styles.li}>Click the <strong>Bulk Print</strong> tab.</li>
            <li style={styles.li}>Select <strong>"From Date"</strong> and optional <strong>"To Date"</strong>.</li>
            <li style={styles.li}>Click <strong>"Load Tickets"</strong> to see a summary.</li>
            <li style={styles.li}>Click <strong>"Print All (X tickets)"</strong> to open browser print dialog.</li>
            <li style={styles.li}>Tickets print <strong>3 per page</strong> with venue and customer copies.</li>
          </ul>
          <img src="/screenshots/admin9-bulk-print.png" alt="Bulk Print tab" style={styles.img} />
        </Step>

        <Step number={11} title="Create Announcements (Optional)">
          <ul style={styles.ul}>
            <li style={styles.li}>Click the <strong>Announcements</strong> tab.</li>
            <li style={styles.li}>Enter a <strong>Title</strong> (optional), select <strong>Type</strong> (Info/Warning/Success), enter <strong>Message</strong>.</li>
            <li style={styles.li}>Set <strong>Start Date</strong> and <strong>End Date</strong> (optional).</li>
            <li style={styles.li}>Click <strong>"Create Announcement"</strong>.</li>
            <li style={styles.li}>The announcement appears on the public booking page in real time.</li>
          </ul>
          <img src="/screenshots/admin10-announcements.png" alt="Announcements tab" style={styles.img} />
        </Step>

        <div style={styles.divider} />

        {/* Quick Reference */}
        <div style={styles.refCard}>
          <h2 style={styles.refTitle}>Quick Reference Card</h2>

          <h3 style={styles.refSubtitle}>Customer Booking Flow</h3>
          <div style={styles.flowDiagram}>
            Homepage &rarr; Select Session &rarr; Pick Seats &rarr; Party Size &rarr; Names &amp; Packages &rarr; Review &rarr; Pay &rarr; Confirmation &rarr; Print Tickets
          </div>

          <h3 style={styles.refSubtitle}>Admin Event Setup Flow</h3>
          <div style={styles.flowDiagram}>
            Login &rarr; Sessions Tab &rarr; Create Session &rarr; Enable Special Event &rarr; Add Title &rarr; Configure Packages &rarr; Save &rarr; Monitor Bookings
          </div>

          <h3 style={styles.refSubtitle}>Key URLs</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Page</th>
                <th style={styles.th}>URL</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={styles.td}>Homepage (Booking)</td><td style={styles.td}><a href="https://bingo-jk2h.onrender.com" target="_blank" rel="noreferrer" style={styles.link}>https://bingo-jk2h.onrender.com</a></td></tr>
              <tr><td style={styles.td}>Ticket Lookup</td><td style={styles.td}><a href="https://bingo-jk2h.onrender.com/tickets" target="_blank" rel="noreferrer" style={styles.link}>https://bingo-jk2h.onrender.com/tickets</a></td></tr>
              <tr><td style={styles.td}>View Tickets</td><td style={styles.td}>https://bingo-jk2h.onrender.com/tickets/&#123;reference-number&#125;</td></tr>
              <tr><td style={styles.td}>Admin Login</td><td style={styles.td}><a href="https://bingo-jk2h.onrender.com/admin" target="_blank" rel="noreferrer" style={styles.link}>https://bingo-jk2h.onrender.com/admin</a></td></tr>
              <tr><td style={styles.td}>Tutorial</td><td style={styles.td}><a href="https://bingo-jk2h.onrender.com/tutorial" target="_blank" rel="noreferrer" style={styles.link}>https://bingo-jk2h.onrender.com/tutorial</a></td></tr>
            </tbody>
          </table>

          <h3 style={styles.refSubtitle}>Key Terms</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Term</th>
                <th style={styles.th}>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={styles.td}><strong>Session</strong></td><td style={styles.td}>A scheduled bingo event on a specific date and time</td></tr>
              <tr><td style={styles.td}><strong>Special Event</strong></td><td style={styles.td}>A session with a custom title, description, and unique packages</td></tr>
              <tr><td style={styles.td}><strong>Package</strong></td><td style={styles.td}>A ticket type with a name and price (required or add-on)</td></tr>
              <tr><td style={styles.td}><strong>Reference Number</strong></td><td style={styles.td}>Unique booking ID (format: BNG-XXXXXX)</td></tr>
              <tr><td style={styles.td}><strong>Cutoff Time</strong></td><td style={styles.td}>Deadline for online booking before the session starts</td></tr>
              <tr><td style={styles.td}><strong>Hold Timer</strong></td><td style={styles.td}>10-minute lock on selected seats to prevent double-booking</td></tr>
              <tr><td style={styles.td}><strong>SMEC</strong></td><td style={styles.td}>Saint Mary's Entertainment Centre (venue name)</td></tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
