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
            <li style={styles.li}>The site loads with the <strong>Saint Mary's Entertainment Centre</strong> branding and tagline "Bingo -- Nightly Jackpots up to $5,000".</li>
            <li style={styles.li}>The first available bingo session is automatically selected.</li>
            <li style={styles.li}>Any active announcements appear at the top of the page.</li>
            <li style={styles.li}>A <strong>"Start Booking"</strong> button is visible in the top-right corner.</li>
          </ul>
          <img src="/screenshots/step1-homepage.png" alt="Homepage with floor map and session selector" style={styles.img} />
        </Step>

        <Step number={2} title="Choose a Session (Date & Time)">
          <ul style={styles.ul}>
            <li style={styles.li}>Sessions are displayed in a <strong>weekly calendar bar</strong> at the top.</li>
            <li style={styles.li}>Use the <strong>left/right arrows</strong> to navigate between weeks (e.g., "APR 13 -- APR 19").</li>
            <li style={styles.li}>Each session shows its <strong>date, time, and available seats</strong> count.</li>
            <li style={styles.li}>The currently selected session is highlighted in <strong style={styles.gold}>gold</strong>.</li>
            <li style={styles.li}><strong style={{ color: '#f97316' }}>Special events</strong> display with an <strong>orange "SPECIAL EVENT" banner</strong> and animated glow effect on their table buttons.</li>
          </ul>
          <Note label="Color Legend">Green = Available | Amber = Partial | Blue = Your Pick | Gray = Full</Note>
          <img src="/screenshots/step2-sessions.png" alt="Session selector bar with week navigation" style={styles.img} />

          <h4 style={{ color: '#f97316', marginTop: '25px', marginBottom: '10px', fontSize: '1.1em' }}>Special Bingo Events</h4>
          <p style={{ marginBottom: '12px' }}>Special events are premium bingo sessions with custom themes, unique packages, and higher jackpots. They stand out in the session bar with an <strong style={{ color: '#f97316' }}>orange "SPECIAL EVENT" banner</strong> and the event title (e.g., "Spring Jackpot Bingo").</p>
          <ul style={styles.ul}>
            <li style={styles.li}>Navigate to the week containing the special event using the <strong>arrow buttons</strong>.</li>
            <li style={styles.li}>Special events show an <strong style={{ color: '#f97316' }}>orange banner</strong> with the event title above the session button.</li>
            <li style={styles.li}>The session button itself has an <strong>animated amber glow</strong> to draw attention.</li>
          </ul>
          <img src="/screenshots/step2-special-event.png" alt="Special event visible in session bar with orange SPECIAL EVENT banner" style={styles.img} />

          <p style={{ marginTop: '20px', marginBottom: '12px' }}>When you <strong>click a special event session</strong>, the floor map loads with the event's custom configuration. The bottom banner shows the event title and all <strong>444 seats</strong> are available.</p>
          <ul style={styles.ul}>
            <li style={styles.li}>Special events use <strong>custom ticket packages</strong> instead of the standard ones (e.g., Gold Package, Silver Add-on, Mega Jackpot Entry).</li>
            <li style={styles.li}>The booking panel will show the event-specific packages when you proceed to book.</li>
            <li style={styles.li}>Everything else (seat selection, payment, tickets) works the same as regular sessions.</li>
          </ul>
          <img src="/screenshots/step2-special-selected.png" alt="Special event selected showing 444 available chairs and event banner" style={styles.img} />
        </Step>

        <Step number={3} title="Select Your Seats on the Floor Map">
          <ul style={styles.ul}>
            <li style={styles.li}>A <strong>74-table floor plan</strong> appears showing the venue layout (tables 1-75, skipping table 41).</li>
            <li style={styles.li}>The floor plan shows <strong>"FRONT OF ROOM -- STAGE"</strong> at the top and <strong>"ENTRANCE / BACK OF ROOM"</strong> at the bottom.</li>
            <li style={styles.li}>Each table shows its number and available seats (e.g., "6/6").</li>
            <li style={styles.li}><strong>Tap a table</strong> to expand it and see the individual chairs (6 per table, numbered 1-6).</li>
            <li style={styles.li}>A date and event banner appears at the bottom of the floor plan (e.g., "Apr 16, 2026 -- 6:30 PM Regular Bingo Night").</li>
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
            <li style={styles.li}>Your party size is set automatically based on the number of chairs selected.</li>
          </ul>
          <img src="/screenshots/step4-seat-locked.png" alt="Seat selected with chair picker visible" style={styles.img} />
        </Step>

        <Step number={5} title="Enter Player Names & Choose Packages">
          <ul style={styles.ul}>
            <li style={styles.li}>After selecting a seat, the <strong>booking panel</strong> opens on the right side.</li>
            <li style={styles.li}>For each player, enter <strong>First Name</strong> and <strong>Last Name</strong>.</li>
            <li style={styles.li}>The <strong>base package</strong> (e.g., "12up / Toonie") is automatically included.</li>
            <li style={styles.li}>Optional <strong>add-ons</strong> can be selected with quantity controls (+/-).</li>
            <li style={styles.li}>Some packages are <strong>PHD (Personal Handheld Device)</strong> items with limited stock.</li>
            <li style={styles.li}>A <strong style={styles.gold}>running subtotal</strong> is shown for each player.</li>
          </ul>
          <Note label="Note">For special events, players will see the event's custom packages instead of the standard ones.</Note>
          <img src="/screenshots/step5-booking-panel.png" alt="Booking panel with party size and name entry" style={styles.img} />
        </Step>

        <Step number={6} title="Review Your Order">
          <ul style={styles.ul}>
            <li style={styles.li}>A summary screen shows session info, per-player breakdown (name, table/seat, packages, price), and <strong style={styles.gold}>grand total</strong>.</li>
            <li style={styles.li}>Each attendee gets a <strong>unique ticket reference</strong> number.</li>
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
            <li style={styles.li}>Each attendee receives a <strong>unique ticket reference</strong> within the booking.</li>
            <li style={styles.li}>Two options: <strong>"View Printable Tickets"</strong> or <strong>"Start New Booking"</strong>.</li>
          </ul>
        </Step>

        <Step number={9} title="Print Your Tickets">
          <ul style={styles.ul}>
            <li style={styles.li}>Tickets can be accessed anytime at <strong><a href="https://bingo-jk2h.onrender.com/tickets" target="_blank" rel="noreferrer" style={styles.link}>https://bingo-jk2h.onrender.com/tickets</a></strong></li>
            <li style={styles.li}>Enter your <strong>reference number</strong> (BNG-XXXXXX) to look up your tickets.</li>
            <li style={styles.li}>Each attendee gets a <strong>double-sided tear-off ticket</strong> with venue copy and customer copy.</li>
            <li style={styles.li}>Tickets show individual reference numbers, add-on items, and package details.</li>
            <li style={styles.li}>Optimized for <strong>A4 printing</strong> -- use your browser's Print function (Ctrl+P).</li>
            <li style={styles.li}>No login required -- just the reference number.</li>
          </ul>
          <img src="/screenshots/step7-tickets-lookup.png" alt="Ticket lookup page" style={styles.img} />
        </Step>

        <div style={styles.divider} />

        {/* PART 2 */}
        <div style={styles.partHeader}>
          <h2 style={styles.partTitle}>PART 2: Admin Panel (Managing Events &amp; Operations)</h2>
          <p style={styles.partDesc}>This is what an administrator does to create and manage bingo sessions, packages, inventory, and more.</p>
        </div>

        <Step number={1} title="Log In to the Admin Panel">
          <ul style={styles.ul}>
            <li style={styles.li}>Navigate to <strong><a href="https://bingo-jk2h.onrender.com/admin" target="_blank" rel="noreferrer" style={styles.link}>https://bingo-jk2h.onrender.com/admin</a></strong></li>
            <li style={styles.li}>Enter your <strong>Username</strong> (email) and <strong>Password</strong>.</li>
            <li style={styles.li}>Use the <strong>eye icon</strong> to toggle password visibility.</li>
            <li style={styles.li}>Click <strong>Sign In</strong>.</li>
          </ul>
          <Note label="Multi-User">The system supports multiple admin accounts. Each admin sees their name displayed in the sidebar and top bar after logging in.</Note>
          <img src="/screenshots/admin1-login.png" alt="Admin login page with password toggle" style={styles.img} />
        </Step>

        <Step number={2} title="Navigate the Admin Panel">
          <ul style={styles.ul}>
            <li style={styles.li}>The admin panel uses a <strong>sidebar navigation</strong> on the left side.</li>
            <li style={styles.li}>The sidebar shows <strong>SMEC</strong> branding, "Admin Panel", and your logged-in username.</li>
            <li style={styles.li}>The <strong>top bar</strong> displays an Auto-Print toggle, the venue name, and your admin name.</li>
            <li style={styles.li}>At the bottom of the sidebar: <strong>Reprint Tickets</strong>, <strong>View Booking Page</strong>, and <strong>Logout</strong>.</li>
          </ul>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Sidebar Menu</th>
                <th style={styles.th}>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={styles.td}><strong>Dashboard</strong></td><td style={styles.td}>Key metrics, PHD inventory overview, and upcoming sessions</td></tr>
              <tr><td style={styles.td}><strong>Sessions</strong></td><td style={styles.td}>Create and manage regular &amp; special event sessions</td></tr>
              <tr><td style={styles.td}><strong>Packages</strong></td><td style={styles.td}>Manage global ticket packages and PHD items</td></tr>
              <tr><td style={styles.td}><strong>Announcements</strong></td><td style={styles.td}>Create public announcements shown on the booking page</td></tr>
              <tr><td style={styles.td}><strong>Bookings &amp; Reports</strong></td><td style={styles.td}>View booking sales, daily sales, search by name, export CSV</td></tr>
              <tr><td style={styles.td}><strong>Bulk Print</strong></td><td style={styles.td}>Print all tickets for a date range</td></tr>
              <tr><td style={styles.td}><strong>Archive &amp; Audit</strong></td><td style={styles.td}>View deleted sessions and audit log history</td></tr>
              <tr><td style={styles.td}><strong>Chair Management</strong></td><td style={styles.td}>Disable/enable individual chairs per session</td></tr>
              <tr><td style={styles.td}><strong>PHD Inventory</strong></td><td style={styles.td}>Manage Personal Handheld Device stock and limits</td></tr>
              <tr><td style={styles.td}><strong>Printing Settings</strong></td><td style={styles.td}>Configure receipt format, display options, and printer settings</td></tr>
            </tbody>
          </table>
          <img src="/screenshots/admin2-dashboard.png" alt="Admin Dashboard with sidebar navigation and metrics" style={styles.img} />
        </Step>

        <Step number={3} title="View the Dashboard">
          <ul style={styles.ul}>
            <li style={styles.li}>Use the <strong>From/To date pickers</strong> to filter metrics by date range. Click <strong>"Today"</strong> to reset.</li>
            <li style={styles.li}><strong>Top row</strong>: Total Bookings, Revenue, Total Persons, Upcoming Sessions.</li>
            <li style={styles.li}><strong>Second row</strong>: Available Tables, Partial Tables, Full Tables, Chairs Available.</li>
            <li style={styles.li}><strong>Third row</strong>: Chairs Sold and Chairs Held cards.</li>
            <li style={styles.li}><strong>PHD Inventory</strong> summary: Available, In Use, Total Stock, Per Player Max, with a utilization progress bar.</li>
            <li style={styles.li}><strong>Upcoming Sessions</strong> table: Date, Time, Available, Sold, Held, Total. Click the sold count to view purchaser details.</li>
          </ul>
          <img src="/screenshots/admin2-dashboard.png" alt="Admin Dashboard with metrics and upcoming sessions" style={styles.img} />
        </Step>

        <Step number={4} title="Go to Sessions">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>Sessions</strong> in the sidebar.</li>
            <li style={styles.li}>Two sections: <strong>Create New Session</strong> form at the top, and <strong>All Sessions</strong> table below.</li>
            <li style={styles.li}>The create form uses <strong>Month/Day/Year</strong> dropdown selectors for the date.</li>
          </ul>
          <img src="/screenshots/admin3-sessions-tab.png" alt="Sessions page with create form and session list" style={styles.img} />
        </Step>

        <Step number={5} title="Create a New Session or Special Event">
          <ul style={styles.ul}>
            <li style={styles.li}><strong>Select the date</strong> using Month, Day, and Year dropdowns.</li>
            <li style={styles.li}><strong>Enter the start time</strong> (default: 6:30 PM).</li>
            <li style={styles.li}><strong>Enter the cutoff time</strong> -- when online booking closes (default: 12:00 PM).</li>
            <li style={styles.li}>For a regular session, click <strong>"Add Session"</strong>.</li>
            <li style={styles.li}><strong>Check the "Special Event" checkbox</strong> to expand event configuration with title, description, and custom packages.</li>
          </ul>
          <Note label="Limit">A maximum of 10 active sessions can exist at one time. Duplicate sessions in the same hour on the same date are prevented.</Note>
          <img src="/screenshots/admin4-create-session.png" alt="Create session form" style={styles.img} />
        </Step>

        <Step number={6} title="Fill In Special Event Details">
          <ul style={styles.ul}>
            <li style={styles.li}><strong>Event Title</strong> (e.g., "Special Bingo Event 1") -- required.</li>
            <li style={styles.li}><strong>Description</strong> (optional -- visible to customers).</li>
            <li style={styles.li}><strong>Event Packages</strong> section with a <strong>"+ Add Package"</strong> link.</li>
          </ul>
          <img src="/screenshots/admin5-special-event.png" alt="Special Event checkbox enabled with details" style={styles.img} />
        </Step>

        <Step number={7} title="Configure Event Packages">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>"+ Add Package"</strong> to add custom packages.</li>
            <li style={styles.li}>For each package, enter: <strong>Package Name</strong>, <strong>Price (USD)</strong>, <strong>Type</strong> (Required or Add-on), <strong>Max Quantity</strong>.</li>
            <li style={styles.li}>Add as many packages as needed. Remove with the <strong>X</strong> button.</li>
            <li style={styles.li}>Click <strong>"Add Special Event"</strong> to create it.</li>
          </ul>
          <Note label="Behind the scenes">444 seats (74 tables x 6 chairs) are automatically generated. Custom packages are saved for this event only.</Note>
          <Note label="Tip">You need at least one <strong style={styles.noteStrong}>Required</strong> package. This is every attendee's base ticket price.</Note>
          <img src="/screenshots/admin6-event-packages.png" alt="Event packages configuration" style={styles.img} />
        </Step>

        <Step number={8} title="View All Sessions">
          <ul style={styles.ul}>
            <li style={styles.li}>The <strong>All Sessions</strong> table shows Date, Time, Cutoff, Type, Status, and Actions.</li>
            <li style={styles.li}>Sessions are sorted by nearest upcoming date first.</li>
            <li style={styles.li}>Special events show their event title under "Type" instead of "Regular".</li>
            <li style={styles.li}>Actions: <strong>Edit</strong>, <strong>Disable/Enable</strong>, <strong style={styles.gold}>Packages</strong> (view session packages), <strong style={{ color: '#ef4444' }}>Delete</strong> (soft-delete with audit trail).</li>
          </ul>
          <img src="/screenshots/admin7-sessions-list.png" alt="All Sessions table" style={styles.img} />
        </Step>

        <Step number={9} title="Manage Packages (Global)">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>Packages</strong> in the sidebar to manage global ticket packages.</li>
            <li style={styles.li}><strong>Add Ticket Package</strong> form: Name, Price ($), Type (Required/Optional), Max Qty, Sort Order.</li>
            <li style={styles.li}>Check <strong>"This is a PHD (Personal Handheld Device)"</strong> for device-based packages tracked by inventory.</li>
            <li style={styles.li}>The <strong>Ticket Packages</strong> table shows all packages with Name, Price, Type, Max Qty, Status, and Disable action.</li>
          </ul>
          <img src="/screenshots/admin11-packages.png" alt="Global packages management" style={styles.img} />
        </Step>

        <Step number={10} title="Monitor Bookings & Sales">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>Bookings &amp; Reports</strong> in the sidebar.</li>
            <li style={styles.li}><strong>Booking Sales</strong> table shows a summary by session: Description (date/time), Quantity (clickable to view details), and Amount.</li>
            <li style={styles.li}><strong>Daily Sales</strong> section with a <strong>name search</strong> filter and <strong>date picker</strong>.</li>
            <li style={styles.li}>View detailed booking breakdowns with reference numbers, attendee details, and package info.</li>
            <li style={styles.li}>Actions: <strong>Print Tickets</strong>, <strong>Save CSV</strong> for export.</li>
          </ul>
          <img src="/screenshots/admin8-bookings.png" alt="Bookings & Reports" style={styles.img} />
        </Step>

        <Step number={11} title="Bulk Print Tickets">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>Bulk Print</strong> in the sidebar.</li>
            <li style={styles.li}>Select <strong>"From Date"</strong> and optional <strong>"To Date"</strong>.</li>
            <li style={styles.li}>Click <strong>"Load Tickets"</strong> to see a summary.</li>
            <li style={styles.li}>Click <strong>"Print All (X tickets)"</strong> to open browser print dialog.</li>
            <li style={styles.li}>Tickets print <strong>3 per page</strong> with venue and customer copies.</li>
          </ul>
          <img src="/screenshots/admin9-bulk-print.png" alt="Bulk Print" style={styles.img} />
        </Step>

        <Step number={12} title="Create Announcements">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>Announcements</strong> in the sidebar.</li>
            <li style={styles.li}>Enter a <strong>Title</strong> (optional), select <strong>Type</strong> (Info/Warning/Success), enter <strong>Message</strong>.</li>
            <li style={styles.li}>Set <strong>Start Date</strong> and <strong>End Date</strong> (optional).</li>
            <li style={styles.li}>Click <strong>"Create Announcement"</strong>.</li>
            <li style={styles.li}>The announcement appears on the public booking page in real time.</li>
          </ul>
          <img src="/screenshots/admin10-announcements.png" alt="Announcements" style={styles.img} />
        </Step>

        <Step number={13} title="Archive & Audit">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>Archive &amp; Audit</strong> in the sidebar.</li>
            <li style={styles.li}><strong>Deleted Sessions</strong> table shows: Date, Time, Event, Paid Bookings, Revenue, Deleted At, and Actions.</li>
            <li style={styles.li}>Actions: <strong>View Bookings</strong> (see bookings from deleted sessions) and <strong style={{ color: '#22c55e' }}>Restore</strong> (bring back a deleted session).</li>
            <li style={styles.li}><strong>Audit Log (Last 50)</strong> tracks all admin actions: Time, Action type, Entity, and Details.</li>
          </ul>
        </Step>

        <Step number={14} title="Chair Management">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>Chair Management</strong> in the sidebar.</li>
            <li style={styles.li}><strong>Select a session</strong> from the dropdown to load its floor plan.</li>
            <li style={styles.li}>Click individual chairs to <strong>disable or enable</strong> them.</li>
            <li style={styles.li}>Disabled chairs appear as unavailable to customers -- useful for broken or reserved chairs.</li>
          </ul>
        </Step>

        <Step number={15} title="PHD Inventory">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>PHD Inventory</strong> in the sidebar.</li>
            <li style={styles.li}>View <strong>real-time inventory cards</strong>: Available (ready to assign), In Use (currently booked), Total Stock (devices owned), Per Player Limit (max per person).</li>
            <li style={styles.li}>A <strong>Stock Utilization</strong> progress bar shows allocation percentage.</li>
            <li style={styles.li}>Update <strong>Inventory Settings</strong>: Total Stock and Max Per Player limits.</li>
          </ul>
          <Note label="PHD">Personal Handheld Devices are tracked automatically when customers purchase PHD-type packages. Stock is limited and enforced at checkout.</Note>
        </Step>

        <Step number={16} title="Printing Settings">
          <ul style={styles.ul}>
            <li style={styles.li}>Click <strong>Printing Settings</strong> in the sidebar.</li>
            <li style={styles.li}><strong>Receipt Information</strong>: Business Name, Subtitle/Tagline, Receipt Title, Footer Message.</li>
            <li style={styles.li}><strong>Display Options</strong>: Toggle what appears on receipts -- Reference Number, Table &amp; Chair Numbers, Package Prices, Add-ons, Timestamp.</li>
            <li style={styles.li}><strong>Printer Settings</strong>: Paper Width (80mm Standard Thermal), and <strong>Auto-Print on New Orders</strong> toggle for automatic receipt printing.</li>
            <li style={styles.li}>Click <strong>"Save Receipt Settings"</strong> to apply, or <strong>"Print Preview"</strong> to test the layout.</li>
          </ul>
        </Step>

        <div style={styles.divider} />

        {/* Quick Reference */}
        <div style={styles.refCard}>
          <h2 style={styles.refTitle}>Quick Reference Card</h2>

          <h3 style={styles.refSubtitle}>Customer Booking Flow</h3>
          <div style={styles.flowDiagram}>
            Homepage &rarr; Select Session &rarr; Pick Seats &rarr; Names &amp; Packages &rarr; Review &rarr; Pay &rarr; Confirmation &rarr; Print Tickets
          </div>

          <h3 style={styles.refSubtitle}>Admin Event Setup Flow</h3>
          <div style={styles.flowDiagram}>
            Login &rarr; Sessions &rarr; Create Session &rarr; Enable Special Event &rarr; Add Title &rarr; Configure Packages &rarr; Save &rarr; Monitor Bookings
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

          <h3 style={styles.refSubtitle}>Admin Sidebar Navigation</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Menu Item</th>
                <th style={styles.th}>What It Does</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={styles.td}><strong>Dashboard</strong></td><td style={styles.td}>Overview of bookings, revenue, tables, chairs, PHD inventory, upcoming sessions</td></tr>
              <tr><td style={styles.td}><strong>Sessions</strong></td><td style={styles.td}>Create regular/special sessions, view/edit/delete all sessions</td></tr>
              <tr><td style={styles.td}><strong>Packages</strong></td><td style={styles.td}>Manage global ticket packages and PHD device packages</td></tr>
              <tr><td style={styles.td}><strong>Announcements</strong></td><td style={styles.td}>Create/manage announcements shown on the booking page</td></tr>
              <tr><td style={styles.td}><strong>Bookings &amp; Reports</strong></td><td style={styles.td}>View booking sales by session, daily sales with search, export CSV</td></tr>
              <tr><td style={styles.td}><strong>Bulk Print</strong></td><td style={styles.td}>Print all tickets for a date range (3 per page)</td></tr>
              <tr><td style={styles.td}><strong>Archive &amp; Audit</strong></td><td style={styles.td}>View/restore deleted sessions, see audit log of all admin actions</td></tr>
              <tr><td style={styles.td}><strong>Chair Management</strong></td><td style={styles.td}>Disable/enable individual chairs per session for broken or reserved seats</td></tr>
              <tr><td style={styles.td}><strong>PHD Inventory</strong></td><td style={styles.td}>Track handheld device stock, utilization, and per-player limits</td></tr>
              <tr><td style={styles.td}><strong>Printing Settings</strong></td><td style={styles.td}>Configure receipt layout, display options, paper width, auto-print</td></tr>
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
              <tr><td style={styles.td}><strong>PHD</strong></td><td style={styles.td}>Personal Handheld Device -- a limited-stock device tracked by inventory</td></tr>
              <tr><td style={styles.td}><strong>Reference Number</strong></td><td style={styles.td}>Unique booking ID (format: BNG-XXXXXX)</td></tr>
              <tr><td style={styles.td}><strong>Cutoff Time</strong></td><td style={styles.td}>Deadline for online booking before the session starts</td></tr>
              <tr><td style={styles.td}><strong>Hold Timer</strong></td><td style={styles.td}>10-minute lock on selected seats to prevent double-booking</td></tr>
              <tr><td style={styles.td}><strong>SMEC</strong></td><td style={styles.td}>Saint Mary's Entertainment Centre (venue name)</td></tr>
              <tr><td style={styles.td}><strong>Audit Log</strong></td><td style={styles.td}>Record of all admin actions (session creates, deletes, restores, etc.)</td></tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
