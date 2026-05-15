import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchBookingStatus } from '../api';

const STATUS_POLL_INTERVAL_MS = 2000;

function parseGatewayMessage(queryString) {
  const normalized = String(queryString || '').replace(/^[?#]/, '');
  const params = new URLSearchParams(normalized);
  let response = null;
  try {
    const rawResponse = params.get('response');
    response = rawResponse ? JSON.parse(rawResponse) : null;
  } catch {
    response = null;
  }
  return {
    action: params.get('action') || '',
    width: Number(params.get('width')),
    height: Number(params.get('height')),
    transactionId: response?.transId || response?.transactionId || response?.transactionResponse?.transId || '',
  };
}

export default function EmbeddedAuthorizeNetPayment({ payment, onCancel }) {
  const formRef = useRef(null);
  const submittedRef = useRef(false);
  const [frameSize, setFrameSize] = useState({ width: 700, height: 720 });
  const [statusText, setStatusText] = useState('Secure payment form loading...');

  const cancelledUrl = useMemo(
    () => `/booking/${encodeURIComponent(payment.bookingId)}/cancelled`,
    [payment.bookingId]
  );
  const processingUrl = useMemo(
    () => `/booking/${encodeURIComponent(payment.bookingId)}/processing`,
    [payment.bookingId]
  );

  useEffect(() => {
    window.AuthorizeNetIFrame = {
      onReceiveCommunication(queryString) {
        const message = parseGatewayMessage(queryString);

        if (message.action === 'resizeWindow') {
          setFrameSize({
            width: Number.isFinite(message.width) && message.width > 0 ? message.width : 700,
            height: Number.isFinite(message.height) && message.height > 0 ? message.height : 720,
          });
          setStatusText('');
          return;
        }

        if (message.action === 'transactResponse' || message.action === 'transactionResponse') {
          setStatusText('Payment received. Confirming your booking...');
          const params = new URLSearchParams({ bookingId: payment.bookingId });
          if (message.transactionId) params.set('transId', message.transactionId);
          window.location.href = `/payment/return?${params.toString()}`;
          return;
        }

        if (message.action === 'cancel') {
          setStatusText('Payment cancelled. Returning to booking status...');
          window.location.href = cancelledUrl;
        }
      },
    };

    return () => {
      delete window.AuthorizeNetIFrame;
    };
  }, [cancelledUrl, payment.bookingId]);

  useEffect(() => {
    let stopped = false;
    let timeoutId;

    async function pollStatus() {
      try {
        const status = await fetchBookingStatus(payment.bookingId);
        if (stopped) return;

        if (status?.status === 'paid') {
          setStatusText('Payment confirmed. Loading your booking confirmation...');
          window.location.href = processingUrl;
          return;
        }

        if (status?.status === 'failed') {
          setStatusText('Payment declined. Loading next steps...');
          window.location.href = processingUrl;
          return;
        }

        if (status?.status === 'cancelled') {
          setStatusText('Payment cancelled. Returning to booking status...');
          window.location.href = cancelledUrl;
          return;
        }
      } catch (err) {
        console.error('[EmbeddedAuthorizeNetPayment] status poll failed:', err);
      }

      if (!stopped) {
        timeoutId = window.setTimeout(pollStatus, STATUS_POLL_INTERVAL_MS);
      }
    }

    timeoutId = window.setTimeout(pollStatus, STATUS_POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearTimeout(timeoutId);
    };
  }, [cancelledUrl, payment.bookingId, processingUrl]);

  useEffect(() => {
    if (!formRef.current || submittedRef.current) return;
    submittedRef.current = true;
    formRef.current.submit();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-blue-dark via-brand-blue to-brand-blue-mid text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="Wolastoq Bingo" className="h-12 w-12 rounded-lg bg-white object-contain p-1" />
            <div className="min-w-0">
              <p className="text-brand-gold font-semibold text-sm uppercase tracking-wide">Saint Mary's Entertainment Centre</p>
              <h1 className="text-2xl md:text-3xl font-bold leading-tight">Secure Checkout</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>

        <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
          <aside className="rounded-lg bg-white text-brand-blue shadow-2xl overflow-hidden">
            <div className="bg-brand-gold px-5 py-4 text-white">
              <p className="text-sm font-semibold uppercase tracking-wide opacity-90">Booking Reference</p>
              <p className="font-mono text-xl font-bold">{payment.referenceNumber}</p>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-sm text-gray-500 font-medium">Customer</p>
                <p className="font-semibold">
                  {[payment.customerFirstName, payment.customerLastName].filter(Boolean).join(' ') || payment.email}
                </p>
                <p className="text-sm text-gray-500 break-words">{payment.email}</p>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-600 font-medium">Total Due</span>
                  <span className="text-2xl font-bold text-brand-gold">{payment.totalFormatted}</span>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-gray-700">
                Card details are handled by Authorize.Net. Wolastoq Bingo does not see or store your card number.
              </div>
            </div>
          </aside>

          <section className="rounded-lg bg-white shadow-2xl overflow-hidden text-brand-blue">
            <div className="border-b border-gray-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">Payment Details</h2>
                <p className="text-sm text-gray-500">Powered securely by Authorize.Net</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700 self-start sm:self-auto">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Secure
              </div>
            </div>

            <div className="p-3 sm:p-5">
              {statusText && (
                <div className="mb-3 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
                  {statusText}
                </div>
              )}
              <div className="w-full overflow-x-auto">
                <iframe
                  title="Authorize.Net secure payment form"
                  name="authorizeNetPaymentFrame"
                  className="block mx-auto bg-white"
                  style={{
                    width: `min(100%, ${frameSize.width}px)`,
                    minHeight: `${frameSize.height}px`,
                  }}
                  frameBorder="0"
                  scrolling="no"
                />
              </div>
            </div>
          </section>
        </div>

        <form ref={formRef} method="post" action={payment.redirectUrl} target="authorizeNetPaymentFrame" className="hidden">
          <input type="hidden" name="token" value={payment.token} />
        </form>
      </div>
    </div>
  );
}
