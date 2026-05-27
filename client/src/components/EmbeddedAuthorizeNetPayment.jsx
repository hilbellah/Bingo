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

export default function EmbeddedAuthorizeNetPayment({ payment, onBack, onCancel }) {
  const formRef = useRef(null);
  const submittedRef = useRef(false);
  const [frameSize, setFrameSize] = useState({ width: 700, height: 720 });
  const [statusText, setStatusText] = useState('Secure payment form loading...');
  const summaryItems = payment.checkoutSummary?.items || [];
  const bookingCustomerName = [
    [payment.customerFirstName, payment.customerLastName].filter(Boolean).join(' ').trim(),
    payment.checkoutSummary?.customerName,
    summaryItems[0]?.name,
    payment.email,
  ].find(value => String(value || '').trim()) || '';
  const [cardholderName, setCardholderName] = useState('');
  const trimmedCardholderName = cardholderName.trim();

  useEffect(() => {
    setCardholderName('');
    submittedRef.current = false;
  }, [payment.bookingId]);

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
            onClick={onBack}
            className="shrink-0 rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            Back to edit
          </button>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
          <section className="order-2 lg:order-1 rounded-lg bg-white shadow-2xl overflow-hidden text-brand-blue">
            <div className="border-b border-gray-200 px-5 py-4 flex items-center justify-between gap-3">
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
              <div className="w-full overflow-x-auto">
                {statusText && (
                  <div className="mx-auto mb-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600"
                    style={{ width: 'min(100%, 520px)' }}>
                    {statusText}
                  </div>
                )}

                <div
                  className="mx-auto bg-white px-0 pb-6 pt-8"
                  style={{ width: 'min(100%, 520px)', transform: 'translateX(-16px)' }}
                >
                  <label htmlFor="cardholder-name" className="block text-[18px] font-medium text-gray-700">
                    Name on card <span className="text-gray-900">*</span>
                  </label>
                  <input
                    id="cardholder-name"
                    type="text"
                    required
                    autoComplete="cc-name"
                    value={cardholderName}
                    onChange={event => setCardholderName(event.target.value)}
                    className="mt-1 w-full border-0 border-b border-gray-500 bg-transparent px-0 py-2 text-[18px] font-medium text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-brand-blue"
                    placeholder="Name as it appears on the card"
                  />
                </div>

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

          <aside className="order-1 lg:order-2 rounded-lg bg-white text-brand-blue shadow-2xl overflow-hidden lg:sticky lg:top-6">
            <div className="bg-brand-gold px-5 py-4 text-white">
              <p className="text-sm font-semibold uppercase tracking-wide opacity-90">Booking Reference</p>
              <p className="font-mono text-xl font-bold">{payment.referenceNumber}</p>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-sm text-gray-500 font-medium">Customer</p>
                <p className="font-semibold">{trimmedCardholderName || bookingCustomerName || payment.email}</p>
                {payment.email && <p className="text-sm text-gray-500 break-words">{payment.email}</p>}
              </div>

              {summaryItems.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Sale Summary</p>
                  <div className="space-y-4">
                    {summaryItems.map((item, itemIndex) => (
                      <div key={`${item.name}-${itemIndex}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-sm">{item.name || `Player ${itemIndex + 1}`}</p>
                            {item.seat && <p className="text-xs text-gray-500">{item.seat}</p>}
                          </div>
                        </div>
                        <div className="mt-3 space-y-1.5">
                          {(item.packages || []).map((pkg, pkgIndex) => (
                            <div key={`${pkg.id || pkg.name}-${pkgIndex}`} className="flex justify-between gap-3 text-sm">
                              <span className="text-gray-600">
                                {pkg.name}{pkg.quantity > 1 ? ` x${pkg.quantity}` : ''}
                              </span>
                              <span className="font-medium text-gray-800">{pkg.priceFormatted}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 pt-4">
                {payment.checkoutSummary?.serviceFee && (
                  <div className="mb-3 flex items-center justify-between gap-4 text-sm">
                    <span className="text-gray-500">{payment.checkoutSummary.serviceFee.name}</span>
                    <span className="font-semibold text-gray-700">{payment.checkoutSummary.serviceFee.priceFormatted}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-600 font-medium">Total Due</span>
                  <span className="text-2xl font-bold text-brand-gold">{payment.totalFormatted}</span>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-gray-700">
                Card details are handled by Authorize.Net. Wolastoq Bingo does not see or store your card number.
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel checkout
              </button>
            </div>
          </aside>
        </div>

        <form ref={formRef} method="post" action={payment.redirectUrl} target="authorizeNetPaymentFrame" className="hidden">
          <input type="hidden" name="token" value={payment.token} />
        </form>
      </div>
    </div>
  );
}
