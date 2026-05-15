// Client-side "Confirming your payment..." page.
//
// User lands here after Authorize.Net redirects them back to /payment/return
// (which then redirects to /booking/:id/processing). At that moment the
// booking may already be 'paid' (if the webhook fired faster than the browser
// redirect) or still 'pending' (waiting for the webhook).
//
// Behavior:
//   - Polls /api/bookings/:id/status every 2 seconds
//   - 'paid'      → fetches full ticket details, shows receipt
//   - 'failed'    → shows decline message + Try Again button
//   - 'cancelled' → shows cancelled message + Try Again button
//   - After ~60s with no resolution: shows "We'll email you" message
//                                    (the webhook will still complete the booking)

import React, { useEffect, useState } from 'react';
import { fetchBookingStatus, fetchBookingTickets } from '../api';
import { formatDateLong, formatTime } from '../utils/formatters';

const POLL_INTERVAL_MS = 2000;
const SLOW_MODE_AFTER_POLLS = 30; // 30 polls * 2s = 60 seconds

export default function BookingProcessing({ bookingId }) {
  const [phase, setPhase] = useState('polling'); // 'polling' | 'paid' | 'paid_no_details' | 'failed' | 'cancelled'
  const [pollCount, setPollCount] = useState(0);
  const [tickets, setTickets] = useState(null);
  const [referenceNumber, setReferenceNumber] = useState(null);
  const [failureReason, setFailureReason] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let polls = 0;

    async function tick() {
      if (cancelled) return;
      try {
        const res = await fetchBookingStatus(bookingId);
        if (cancelled) return;

        if (res.status === 'paid') {
          setReferenceNumber(res.referenceNumber);
          // Fetch full receipt data
          try {
            const t = await fetchBookingTickets(res.referenceNumber);
            if (cancelled) return;
            if (t && t.tickets) {
              setTickets(t);
              setPhase('paid');
            } else {
              setPhase('paid_no_details');
            }
          } catch (e) {
            if (!cancelled) setPhase('paid_no_details');
          }
          return;
        }

        if (res.status === 'failed') {
          setFailureReason(res.failureReason);
          setPhase('failed');
          return;
        }

        if (res.status === 'cancelled') {
          setPhase('cancelled');
          return;
        }

        polls += 1;
        setPollCount(polls);
        setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        console.error('[BookingProcessing] poll error:', err);
        polls += 1;
        setPollCount(polls);
        setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    tick();
    return () => { cancelled = true; };
  }, [bookingId]);

  const goHome = () => { window.location.href = '/'; };

  // ----- Paid: full receipt -----
  if (phase === 'paid' && tickets) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-blue-dark via-brand-blue to-brand-blue-mid flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 md:p-10">
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-brand-blue">Payment Confirmed!</h1>
            <p className="text-gray-500 text-lg mt-1">Your bingo seats are reserved</p>
          </div>

          <div className="bg-brand-gold/10 border-2 border-brand-gold/30 rounded-2xl p-5 mb-6 text-center">
            <p className="text-sm text-gray-500 font-medium">Booking Reference</p>
            <p className="text-2xl font-mono font-bold text-brand-blue mt-1 tracking-wider">
              {tickets.referenceNumber}
            </p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-5 mb-6 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-medium">Session</span>
              <span className="font-semibold text-brand-blue">{formatDateLong(tickets.sessionDate)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-medium">Time</span>
              <span className="font-semibold">{formatTime(tickets.sessionTime)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-medium">Total Paid</span>
              <span className="font-bold text-xl text-brand-gold">{tickets.totalFormatted}</span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-bold text-brand-blue mb-3 text-lg">Your Tickets</h3>
            <div className="space-y-2">
              {tickets.tickets.map((t, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-4">
                  <div className="font-semibold text-brand-blue">{t.firstName} {t.lastName}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Table <strong>{t.tableNumber}</strong>, Chair <strong>{t.chairNumber}</strong>
                  </div>
                  {t.referenceNumber && (
                    <div className="mt-2 text-xs font-mono bg-brand-gold/10 inline-block px-2 py-1 rounded">
                      {t.referenceNumber}
                    </div>
                  )}
                  {t.addons && t.addons.length > 0 && (
                    <div className="mt-2 text-sm text-gray-500">
                      {t.addons.map((a, ai) => (
                        <div key={ai}>+ {a.packageName} &times;{a.quantity}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-sm text-gray-500 mb-4">
            A confirmation has been emailed to you. Check spam or junk if you do not see it, and save this page or the email for your records.
          </p>

          <button
            onClick={goHome}
            className="w-full bg-brand-blue text-white py-3 px-6 rounded-xl font-semibold hover:bg-brand-blue-dark transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // ----- Paid but ticket fetch failed (rare) -----
  if (phase === 'paid_no_details') {
    return (
      <CenteredCard>
        <SuccessIcon />
        <h1 className="text-3xl font-bold text-brand-blue text-center">Payment Confirmed!</h1>
        <p className="text-gray-600 text-center mt-2">
          Your booking is confirmed and a confirmation has been emailed to you. Check spam or junk if you do not see it.
        </p>
        {referenceNumber && (
          <div className="bg-brand-gold/10 border-2 border-brand-gold/30 rounded-2xl p-5 my-6 text-center">
            <p className="text-sm text-gray-500 font-medium">Booking Reference</p>
            <p className="text-2xl font-mono font-bold text-brand-blue mt-1 tracking-wider">
              {referenceNumber}
            </p>
          </div>
        )}
        <button
          onClick={goHome}
          className="w-full bg-brand-blue text-white py-3 px-6 rounded-xl font-semibold hover:bg-brand-blue-dark transition-colors"
        >
          Return to Home
        </button>
      </CenteredCard>
    );
  }

  // ----- Failed (declined) -----
  if (phase === 'failed') {
    return (
      <CenteredCard>
        <div className="w-20 h-20 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-brand-blue text-center">Payment Declined</h1>
        <p className="text-gray-600 text-center mt-2">
          Your card was not charged. {failureReason ? `Reason: ${failureReason}` : 'Please try a different card or contact your bank.'}
        </p>
        <button
          onClick={goHome}
          className="w-full bg-brand-blue text-white py-3 px-6 rounded-xl font-semibold hover:bg-brand-blue-dark transition-colors mt-6"
        >
          Try Again
        </button>
      </CenteredCard>
    );
  }

  // ----- Cancelled -----
  if (phase === 'cancelled') {
    return (
      <CenteredCard>
        <div className="w-20 h-20 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-brand-blue text-center">Payment Cancelled</h1>
        <p className="text-gray-600 text-center mt-2">
          Your booking was cancelled. No charge was made. You can start over to try again.
        </p>
        <button
          onClick={goHome}
          className="w-full bg-brand-blue text-white py-3 px-6 rounded-xl font-semibold hover:bg-brand-blue-dark transition-colors mt-6"
        >
          Return to Home
        </button>
      </CenteredCard>
    );
  }

  // ----- Polling (default) -----
  const slowMode = pollCount >= SLOW_MODE_AFTER_POLLS;
  return (
    <CenteredCard>
      <div className="w-20 h-20 mx-auto mb-4">
        <Spinner />
      </div>
      <h1 className="text-3xl font-bold text-brand-blue text-center">
        {slowMode ? 'Still Processing...' : 'Confirming Your Payment...'}
      </h1>
      <p className="text-gray-600 text-center mt-3">
        {slowMode
          ? "Your payment is being processed. We'll email you a confirmation when it completes. Check spam or junk if you do not see it. You can safely close this window."
          : 'This usually takes just a few seconds. Please do not close this window.'}
      </p>
    </CenteredCard>
  );
}

// ---------- Small inline subcomponents ----------

function CenteredCard({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-blue-dark via-brand-blue to-brand-blue-mid flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 md:p-10">
        {children}
      </div>
    </div>
  );
}

function SuccessIcon() {
  return (
    <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
      <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-full h-full text-brand-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
