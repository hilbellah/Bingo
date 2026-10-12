import React from 'react';

// Customer page footer: logo, contact details, social links and the
// responsible-gambling bar. Static. Moved verbatim from App.jsx.
export default function SiteFooter() {
  return (
    <>
      {/* Footer — matches the Wolastoq Casino main site footer (purple gradient,
          stacked logo, contact info, social icons, responsible gambling links).
          All external nav goes back to wolastoqcasino.ca pages. */}
      <footer className="bg-gradient-to-br from-casino-purple-light via-casino-purple to-casino-purple-dark border-t border-white/10 flex-shrink-0">
        <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Stacked Wolastoq Casino logo — same asset the main site uses */}
          <div className="flex md:justify-start justify-center">
            <a
              href="https://www.wolastoqcasino.ca"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Wolastoq Casino home"
            >
              <img
                src="/wolastoq-logo-stacked.png"
                alt="Wolastoq Casino"
                className="h-24 w-auto"
              />
            </a>
          </div>

          {/* Contact info — address, hours, phone numbers, chat link.
              Pulled from https://www.wolastoqcasino.ca/ footer. */}
          <ul className="text-white text-sm space-y-2 md:text-left text-center">
            <li className="flex items-start gap-2 md:justify-start justify-center">
              <svg className="w-4 h-4 mt-0.5 text-casino-cream shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span>185 Gabriel Drive, Fredericton, NB E3A 5V9</span>
            </li>
            <li className="flex items-start gap-2 md:justify-start justify-center">
              <svg className="w-4 h-4 mt-0.5 text-casino-cream shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <span>Open 7 Days a Week, 10:00 AM - 2:00 AM</span>
            </li>
            <li className="flex items-center gap-2 md:justify-start justify-center">
              <svg className="w-4 h-4 text-casino-cream shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              <a href="tel:+18889924646" className="hover:text-casino-cream transition-colors">888-992-4646</a>
            </li>
            <li className="flex items-center gap-2 md:justify-start justify-center">
              <svg className="w-4 h-4 text-casino-cream shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              <a href="tel:+15064629300" className="hover:text-casino-cream transition-colors">506-462-9300</a>
            </li>
          </ul>

          {/* Social icons. Links currently point at the main site's footer
              targets — update when official Facebook/YouTube URLs are known. */}
          <div className="flex flex-col gap-3 md:items-end items-center">
            <p className="text-white text-sm font-semibold">Follow US :</p>
            <div className="flex items-center gap-3">
              <a
                href="https://www.wolastoqcasino.ca"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="text-white hover:text-casino-cream transition-colors"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              <a
                href="https://www.wolastoqcasino.ca"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="text-white hover:text-casino-cream transition-colors"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar — copyright + compliance links. Matches the main site
            footer's secondary row. */}
        <div className="border-t border-white/20">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row md:justify-between items-center gap-2 text-xs text-white/80">
            <p>© {new Date().getFullYear()} Wolastoq Casino. All Rights Reserved.</p>
            <div className="flex items-center gap-4">
              <a href="https://www.wolastoqcasino.ca" target="_blank" rel="noopener noreferrer" className="hover:text-casino-cream transition-colors">Responsible Gambling</a>
              <a href="https://www.wolastoqcasino.ca" target="_blank" rel="noopener noreferrer" className="hover:text-casino-cream transition-colors">Policies/Terms and Conditions</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
