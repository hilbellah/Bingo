import React, { useEffect, useMemo, useRef, useState } from 'react';
import CountdownTimer from './CountdownTimer';
import { formatDateShort, formatPrice, formatTime } from '../utils/formatters';

const MAX_EVENT_TICKETS_PER_ORDER = 6;

export default function EventCheckoutPanel({
  isOpen,
  onClose,
  session,
  attendees,
  onAttendees,
  onTicketSelection,
  requiredPkgs,
  availableTickets,
  holdExpiry,
  salesTaxAmount,
  total,
  loading,
  onSubmit,
  step,
  onStepChange,
}) {
  const [customerEmail, setCustomerEmail] = useState('');
  const [contactTouched, setContactTouched] = useState(false);
  const [updatingTickets, setUpdatingTickets] = useState(false);
  const updatingTicketsRef = useRef(false);

  useEffect(() => {
    setCustomerEmail('');
    setContactTouched(false);
    onStepChange(0);
  }, [session?.id]);

  const packageCounts = useMemo(() => {
    const counts = new Map(requiredPkgs.map(pkg => [pkg.id, 0]));
    attendees.forEach(attendee => {
      const packageId = attendee.ticketPackageId || requiredPkgs[0]?.id;
      if (packageId) counts.set(packageId, (counts.get(packageId) || 0) + 1);
    });
    return counts;
  }, [attendees, requiredPkgs]);

  const ticketCount = attendees.length;
  const ticketSubtotal = attendees.reduce((sum, attendee) => {
    const selectedPackage = requiredPkgs.find(pkg => pkg.id === (attendee.ticketPackageId || requiredPkgs[0]?.id));
    return sum + (selectedPackage?.price || 0);
  }, 0);
  const maxTickets = Math.min(MAX_EVENT_TICKETS_PER_ORDER, availableTickets + ticketCount);
  const trimmedEmail = customerEmail.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const attendeeNamesValid = ticketCount > 0 && attendees.every(attendee =>
    Boolean(attendee.firstName?.trim() && attendee.lastName?.trim())
  );
  const checkoutDetailsValid = attendeeNamesValid && emailValid;
  const primaryAttendee = attendees[0];

  const changePackageQuantity = async (packageId, change) => {
    if (updatingTicketsRef.current) return;

    const ticketPackageIds = attendees.map(attendee => attendee.ticketPackageId || requiredPkgs[0]?.id);
    if (change > 0) {
      if (ticketPackageIds.length >= maxTickets) return;
      ticketPackageIds.push(packageId);
    } else {
      const removeIndex = ticketPackageIds.lastIndexOf(packageId);
      if (removeIndex < 0) return;
      ticketPackageIds.splice(removeIndex, 1);
    }

    updatingTicketsRef.current = true;
    setUpdatingTickets(true);
    try {
      await onTicketSelection(ticketPackageIds);
    } finally {
      updatingTicketsRef.current = false;
      setUpdatingTickets(false);
    }
  };

  const reviewOrder = () => {
    setContactTouched(true);
    if (!checkoutDetailsValid) return;
    onStepChange(1);
  };

  const submitOrder = () => {
    setContactTouched(true);
    if (!checkoutDetailsValid) return;

    const bookingAttendees = attendees.map(attendee => ({
      ...attendee,
      firstName: attendee.firstName.trim(),
      lastName: attendee.lastName.trim(),
      addons: [],
    }));
    onAttendees(bookingAttendees);
    onSubmit({
      email: trimmedEmail,
      customerFirstName: bookingAttendees[0].firstName,
      customerLastName: bookingAttendees[0].lastName,
    }, bookingAttendees);
  };

  const updateAttendeeName = (index, field, value) => {
    const nextAttendees = attendees.map((attendee, attendeeIndex) =>
      attendeeIndex === index ? { ...attendee, [field]: value } : attendee
    );
    onAttendees(nextAttendees);
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-out sm:w-[460px] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Event ticket checkout"
        aria-hidden={!isOpen}
      >
        <header className="flex flex-shrink-0 items-start justify-between bg-sky-950 px-5 py-4">
          <div className="min-w-0 pr-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">Event tickets</p>
            <h2 className="truncate text-lg font-bold text-white">{session?.event_title || 'Live Event'}</h2>
            <p className="mt-0.5 text-sm text-sky-100/70">
              {formatDateShort(session?.date)} at {formatTime(session?.time)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-2xl leading-none text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Close event checkout"
          >
            &times;
          </button>
        </header>

        <div className="grid flex-shrink-0 grid-cols-2 border-b border-gray-200">
          {['Tickets & guests', 'Review & pay'].map((label, index) => (
            <button
              type="button"
              key={label}
              disabled={index === 1 && !checkoutDetailsValid}
              onClick={() => onStepChange(index)}
              className={`border-b-2 px-3 py-3 text-sm font-semibold transition ${
                step === index
                  ? 'border-brand-gold text-sky-950'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <span className={`mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                step === index ? 'bg-sky-950 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {index + 1}
              </span>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 0 ? (
            <div>
              <div className="mb-5 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-sky-950">Choose tickets for your party</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Choose up to {MAX_EVENT_TICKETS_PER_ORDER} tickets, then enter the name of the person using each ticket.
                    </p>
                  </div>
                  {ticketCount > 0 && (
                    <span className="shrink-0 rounded-full bg-sky-950 px-2.5 py-1 text-xs font-bold text-white">
                      {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {requiredPkgs.map(pkg => {
                  const quantity = packageCounts.get(pkg.id) || 0;
                  return (
                    <div key={pkg.id} className="rounded-xl border-2 border-gray-100 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="font-bold text-sky-950">{pkg.name}</h3>
                          {pkg.description ? (
                            <p className="mt-1 text-sm leading-relaxed text-gray-500">{pkg.description}</p>
                          ) : null}
                          <p className="mt-2 text-lg font-bold text-brand-gold">{formatPrice(pkg.price)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 rounded-xl bg-gray-50 p-1">
                          <button
                            type="button"
                            onClick={() => changePackageQuantity(pkg.id, -1)}
                            disabled={updatingTickets || quantity === 0}
                            className="h-9 w-9 rounded-lg border border-gray-200 bg-white text-xl font-bold text-sky-950 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label={`Remove one ${pkg.name} ticket`}
                          >
                            &minus;
                          </button>
                          <span className="w-6 text-center text-lg font-bold text-sky-950">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => changePackageQuantity(pkg.id, 1)}
                            disabled={updatingTickets || ticketCount >= maxTickets}
                            className="h-9 w-9 rounded-lg bg-sky-950 text-xl font-bold text-white transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label={`Add one ${pkg.name} ticket`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {ticketCount >= maxTickets && (
                <p className="mt-3 text-sm font-medium text-amber-700">
                  {maxTickets < MAX_EVENT_TICKETS_PER_ORDER
                    ? `Only ${maxTickets} tickets are currently available for this order.`
                    : `Online orders are limited to ${MAX_EVENT_TICKETS_PER_ORDER} tickets.`}
                </p>
              )}

              {ticketCount > 0 && (
                <div className="mt-6 border-t border-gray-200 pt-5">
                  <h3 className="text-lg font-bold text-sky-950">Ticket holder names</h3>
                  <p className="mt-1 text-sm text-gray-500">Each ticket will be issued in the individual guest&apos;s name.</p>

                  <div className="mt-4 space-y-3">
                    {attendees.map((attendee, index) => {
                      const ticketPackage = requiredPkgs.find(pkg =>
                        pkg.id === (attendee.ticketPackageId || requiredPkgs[0]?.id)
                      );
                      const firstNameMissing = contactTouched && !attendee.firstName?.trim();
                      const lastNameMissing = contactTouched && !attendee.lastName?.trim();

                      return (
                        <div key={`${attendee.ticketPackageId || 'ticket'}-${index}`} className="rounded-xl border border-gray-200 p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-sky-950">Ticket {index + 1}</p>
                            <span className="truncate rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                              {ticketPackage?.name || 'Event ticket'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="text-sm font-semibold text-gray-700">
                              First name
                              <input
                                value={attendee.firstName || ''}
                                onChange={event => updateAttendeeName(index, 'firstName', event.target.value)}
                                className={`mt-1.5 w-full rounded-xl border-2 px-3 py-2.5 text-base outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 ${
                                  firstNameMissing ? 'border-red-300 bg-red-50' : 'border-gray-200'
                                }`}
                                autoComplete={index === 0 ? 'given-name' : 'off'}
                              />
                            </label>
                            <label className="text-sm font-semibold text-gray-700">
                              Last name
                              <input
                                value={attendee.lastName || ''}
                                onChange={event => updateAttendeeName(index, 'lastName', event.target.value)}
                                className={`mt-1.5 w-full rounded-xl border-2 px-3 py-2.5 text-base outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 ${
                                  lastNameMissing ? 'border-red-300 bg-red-50' : 'border-gray-200'
                                }`}
                                autoComplete={index === 0 ? 'family-name' : 'off'}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <h3 className="mt-5 text-lg font-bold text-sky-950">Contact email</h3>
                  <p className="mt-1 text-sm text-gray-500">The confirmation and all tickets will be sent to this address.</p>
                  <label className="mt-3 block text-sm font-semibold text-gray-700">
                    Email address
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={event => setCustomerEmail(event.target.value)}
                      className={`mt-1.5 w-full rounded-xl border-2 px-3 py-2.5 text-base outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 ${
                        contactTouched && !emailValid ? 'border-red-300 bg-red-50' : 'border-gray-200'
                      }`}
                      autoComplete="email"
                      placeholder="you@example.com"
                    />
                  </label>
                  {contactTouched && !checkoutDetailsValid && (
                    <p className="mt-2 text-sm font-medium text-red-600">
                      Enter a first and last name for every ticket holder and a valid contact email.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-bold text-sky-950">Review your event order</h3>
              <p className="mt-1 text-sm text-gray-500">Confirm every ticket holder and ticket type before continuing to secure payment.</p>

              <div className="mt-5 overflow-hidden rounded-xl border-2 border-gray-100">
                <div className="border-b border-gray-100 bg-sky-50 px-4 py-3">
                  <p className="font-bold text-sky-950">{session?.event_title || 'Live Event'}</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {formatDateShort(session?.date)} at {formatTime(session?.time)}
                  </p>
                </div>
                <div className="divide-y divide-gray-100">
                  {requiredPkgs.map(pkg => {
                    const quantity = packageCounts.get(pkg.id) || 0;
                    if (quantity === 0) return null;
                    return (
                      <div key={pkg.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="text-gray-600">{quantity} &times; {pkg.name}</span>
                        <span className="font-semibold text-gray-800">{formatPrice(pkg.price * quantity)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2 border-t-2 border-gray-100 px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ticket subtotal</span>
                    <span className="font-medium text-gray-700">{formatPrice(ticketSubtotal)}</span>
                  </div>
                  {salesTaxAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">HST (15%)</span>
                      <span className="font-medium text-gray-700">{formatPrice(salesTaxAmount)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
                <p className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                  Ticket holders
                </p>
                <div className="divide-y divide-gray-100">
                  {attendees.map((attendee, index) => {
                    const ticketPackage = requiredPkgs.find(pkg =>
                      pkg.id === (attendee.ticketPackageId || requiredPkgs[0]?.id)
                    );
                    return (
                      <div key={`${attendee.ticketPackageId || 'ticket'}-review-${index}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="font-semibold text-sky-950">
                          {attendee.firstName.trim()} {attendee.lastName.trim()}
                        </span>
                        <span className="text-right text-gray-500">{ticketPackage?.name || 'Event ticket'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Booking contact</p>
                <p className="mt-1 font-semibold text-sky-950">
                  {primaryAttendee?.firstName?.trim()} {primaryAttendee?.lastName?.trim()}
                </p>
                <p className="text-sm text-gray-500">{trimmedEmail}</p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 border-t border-gray-200 bg-white p-5">
          {holdExpiry && ticketCount > 0 && (
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-gray-500">Tickets held for</span>
              <span className="font-bold text-sky-950"><CountdownTimer expiry={holdExpiry} /></span>
            </div>
          )}
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold text-sky-950">Total due</span>
            <span className="text-2xl font-bold text-brand-gold">{formatPrice(total)}</span>
          </div>
          {step === 0 ? (
            <button
              type="button"
              onClick={reviewOrder}
              disabled={ticketCount === 0 || updatingTickets}
              className="w-full rounded-xl bg-brand-gold py-3.5 text-lg font-bold text-white transition hover:bg-brand-gold-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              {updatingTickets ? 'Holding tickets...' : ticketCount === 0 ? 'Choose tickets to continue' : 'Review order'}
            </button>
          ) : (
            <div className="grid grid-cols-[auto_1fr] gap-3">
              <button
                type="button"
                onClick={() => onStepChange(0)}
                disabled={loading}
                className="rounded-xl border-2 border-gray-200 px-4 py-3 font-semibold text-gray-700 transition hover:border-sky-300 disabled:opacity-40"
              >
                Back
              </button>
              <button
              type="button"
              onClick={submitOrder}
                disabled={loading || !checkoutDetailsValid}
                className="rounded-xl bg-brand-gold px-4 py-3 text-lg font-bold text-white transition hover:bg-brand-gold-light disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? 'Starting secure payment...' : 'Continue to secure payment'}
              </button>
            </div>
          )}
        </footer>
      </aside>
    </>
  );
}
