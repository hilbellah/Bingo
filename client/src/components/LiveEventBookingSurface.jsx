// Live-event landing surface: poster, details, pricing and the "Buy Tickets"
// call to action shown instead of the floor plan for concert-style events.
// Moved verbatim out of client/src/App.jsx on 2026-09-05 (Phase 3, step 5a).
import React, { useEffect, useRef, useState } from 'react';
import { formatDateShort, formatPrice, formatTime } from '../utils/formatters';

export default function LiveEventBookingSurface({
  event,
  packages,
  availableTickets,
  soldTickets,
  heldTickets,
  bookingClosed,
  bookingStatus,
  onStart
}) {
  const ticketPackages = packages.filter(pkg => pkg.type === 'required');
  const imageUrl = String(event?.event_image_url || '').trim();
  const description = String(event?.event_description || '').trim();
  const salesCutoff = String(event?.sales_cutoff_at || '').trim();
  const [cutoffDate, cutoffTime] = salesCutoff.split('T');
  const cutoffLabel = cutoffDate && cutoffTime
    ? `${formatDateShort(cutoffDate)} at ${formatTime(cutoffTime)}`
    : '';
  const bannerImageRef = useRef(null);
  const [bannerOrientation, setBannerOrientation] = useState('portrait');

  useEffect(() => {
    const image = bannerImageRef.current;
    setBannerOrientation(
      image?.complete && image.naturalWidth
        ? (image.naturalHeight > image.naturalWidth ? 'portrait' : 'landscape')
        : 'portrait'
    );
  }, [imageUrl]);

  const detectBannerOrientation = (loadEvent) => {
    const image = loadEvent.currentTarget;
    setBannerOrientation(image.naturalHeight > image.naturalWidth ? 'portrait' : 'landscape');
  };

  return (
    <section className="mx-auto grid max-w-6xl grid-cols-[112px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-sky-500/25 bg-slate-950 shadow-2xl shadow-sky-950/30 sm:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-[minmax(250px,0.75fr)_minmax(310px,1fr)_minmax(300px,0.85fr)]">
      <div className={`relative overflow-hidden bg-gradient-to-br from-casino-purple via-sky-950 to-slate-950 ${
        bannerOrientation === 'portrait'
          ? 'min-h-[205px] sm:min-h-[252px] lg:min-h-[410px]'
          : 'col-span-2 h-[150px] sm:h-[185px] lg:col-span-1 lg:h-auto lg:min-h-[410px]'
      }`}>
        {imageUrl ? (
          <>
            {bannerOrientation === 'portrait' && (
              <img
                src={imageUrl}
                alt=""
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
                aria-hidden="true"
              />
            )}
            <img
              src={imageUrl}
              alt={event?.event_title || 'Live Event / Venue'}
              className={`relative h-full w-full ${
                bannerOrientation === 'portrait' ? 'object-contain p-2 lg:p-4' : 'object-cover'
              }`}
              ref={bannerImageRef}
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={detectBannerOrientation}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4 opacity-30">
            <img src="/wolastoq-logo-stacked.png" alt="" className="max-h-full w-auto object-contain" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className={`p-3 text-left sm:p-5 lg:p-7 ${
        bannerOrientation === 'portrait' ? '' : 'col-span-2 lg:col-span-1'
      }`}>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
          bookingClosed ? 'bg-red-500 text-white' : 'bg-sky-500 text-white'
        }`}>
          {bookingClosed ? 'Sales Closed' : 'Live at Wolastoq'}
        </span>
        <h1 className="mt-1.5 text-lg font-bold leading-tight tracking-tight text-white sm:mt-2 sm:text-2xl lg:text-3xl">
          {event?.event_title || 'Live Event / Venue'}
        </h1>
        <p className="mt-1.5 text-sm font-semibold text-sky-100">
          {formatDateShort(event?.date)} · {formatTime(event?.time)}
        </p>
        <p className="mt-3 hidden line-clamp-2 text-xs leading-relaxed text-slate-300 sm:block sm:text-sm">
          {description || 'Join us at Wolastoq Casino for a live event experience.'}
        </p>

        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-white/10 pt-2 text-xs sm:mt-4 sm:gap-y-3 sm:pt-4">
          <div>
            <dt className="text-slate-500">Doors open</dt>
            <dd className="mt-0.5 font-semibold text-white">
              {event?.doors_open_time ? formatTime(event.doors_open_time) : '1 hour before'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Location</dt>
            <dd className="mt-0.5 font-semibold text-white">Wolastoq Casino</dd>
          </div>
          {cutoffLabel && (
            <div className="col-span-2 hidden sm:block">
              <dt className="text-slate-500">Online sales close</dt>
              <dd className="mt-0.5 font-semibold text-white">{cutoffLabel}</dd>
            </div>
          )}
        </dl>
      </div>

      <aside className="col-span-2 border-t border-white/10 bg-sky-950/45 p-3 text-left sm:p-5 lg:col-span-1 lg:border-l lg:border-t-0 lg:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white lg:text-xl">Tickets</h2>
          {!bookingClosed && (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300">On sale</span>
          )}
        </div>

        <div className="mt-2 divide-y divide-white/10">
          {ticketPackages.length > 0 ? ticketPackages.map(pkg => (
            <div key={pkg.id} className="flex items-center justify-between gap-3 py-1.5 sm:py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{pkg.name}</p>
                {pkg.description ? <p className="hidden truncate text-xs text-slate-400 sm:block">{pkg.description}</p> : null}
              </div>
              <p className="shrink-0 font-bold text-brand-gold">{formatPrice(pkg.price)}</p>
            </div>
          )) : (
            <p className="py-3 text-sm text-slate-400">Ticket pricing will be announced soon.</p>
          )}
        </div>

        <div className="mt-1 flex gap-4 text-xs text-slate-300 sm:mt-2">
          <span><strong className="text-white">{availableTickets}</strong> available</span>
          <span><strong className="text-white">{soldTickets}</strong> sold</span>
          {heldTickets > 0 && <span><strong className="text-white">{heldTickets}</strong> held</span>}
        </div>

        {bookingClosed && bookingStatus.message ? (
          <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            {bookingStatus.message}
          </p>
        ) : null}

        <button
          type="button"
          disabled={bookingClosed || ticketPackages.length === 0}
          onClick={onStart}
          className={`mt-2 w-full rounded-xl px-5 py-2.5 text-base font-bold transition active:translate-y-px sm:mt-4 sm:py-3 ${
            bookingClosed || ticketPackages.length === 0
              ? 'cursor-not-allowed border border-white/10 bg-white/10 text-white/40'
              : 'bg-brand-gold text-white glow-gold-sm hover:bg-brand-gold-light'
          }`}
        >
          {bookingClosed ? 'Booking Closed' : ticketPackages.length === 0 ? 'Tickets Coming Soon' : 'Buy Tickets'}
        </button>
      </aside>
    </section>
  );
}
