import React from 'react';

// Customer page header: Wolastoq Casino wordmark and main-site navigation.
// The booking controls (clock, hold timer, booking button) are passed in as
// children and render on the right, exactly as before. Moved from App.jsx.
export default function SiteHeader({ children }) {
  return (
    <>
      {/* Header — visually matches the Wolastoq Casino main site (purple gradient,
          white wordmark logo). The functional booking controls on the right are
          preserved unchanged so the seat-selection / booking flow keeps working. */}
      <header className="bg-gradient-to-r from-casino-purple-light via-casino-purple to-casino-purple-dark border-b border-white/10 px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between flex-shrink-0">
        {/* Wolastoq Casino wordmark — links back to the main casino site so
            customers can navigate away from the booking flow if they want. */}
        <a
          href="https://www.wolastoqcasino.ca"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center shrink-0"
          aria-label="Wolastoq Casino home"
        >
          <img
            src="/wolastoq-logo.png"
            alt="Wolastoq Casino"
            className="h-9 md:h-11 w-auto"
          />
        </a>

        {/* Main site nav — hidden on small screens (the booking button takes
            priority on mobile). Shown at lg+ where there's horizontal room.
            "Bingo" is rendered as the current/active link. */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium" aria-label="Main site">
          <a href="https://www.wolastoqcasino.ca" target="_blank" rel="noopener noreferrer" className="text-white hover:text-casino-cream transition-colors">Casino</a>
          <a href="https://www.wolastoqcasino.ca/events/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-casino-cream transition-colors">Events</a>
          <a href="https://www.wolastoqcasino.ca/promotions/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-casino-cream transition-colors">Promotions</a>
          <a href="https://booking.wolastoqcasino.ca" className="text-casino-cream font-semibold border-b-2 border-casino-cream pb-1" aria-current="page">Bingo</a>
          <a href="https://www.wolastoqcasino.ca/contact-us/" target="_blank" rel="noopener noreferrer" className="text-white hover:text-casino-cream transition-colors">Contact Us</a>
        </nav>
        {children}
      </header>
    </>
  );
}
