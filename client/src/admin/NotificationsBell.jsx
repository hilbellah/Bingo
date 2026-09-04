import React, { useEffect, useRef, useState } from 'react';

// Header bell for payments that need a human: charges the site could not
// attach to a seat (payment_review) and duplicate charges awaiting a refund.
// Lives in the header instead of the overview so the dashboard stays clean;
// the badge count is the only thing visible until someone opens it.

function seatStateLabel(state) {
  switch (state) {
    case 'free': return 'seat is free';
    case 'sold_to_someone_else': return 'seat now sold to someone else';
    case 'held_by_someone_else': return 'seat held by another customer right now';
    case 'disabled': return 'seat disabled';
    default: return state || 'unknown';
  }
}

export default function NotificationsBell({
  items,
  canManage = false,
  onConfirm,
  onDismiss,
  onResolveDuplicate,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const reviews = items?.reviews || [];
  const duplicates = items?.duplicates || [];
  const count = reviews.length + duplicates.length;

  useEffect(() => {
    if (!open) return undefined;
    const onClickAway = event => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={count > 0 ? `${count} payment notification${count === 1 ? '' : 's'}` : 'Notifications'}
        aria-expanded={open}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
          count > 0
            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
            : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
        }`}
        title="Notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-[min(92vw,34rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
          role="dialog"
          aria-label="Payment notifications"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-brand-blue">Notifications</p>
              <p className="text-xs text-gray-500">
                {count === 0
                  ? 'Nothing needs attention.'
                  : 'Customers who were charged but whose booking needs a hand.'}
              </p>
            </div>
            {count > 0 && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">{count}</span>}
          </div>

          <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100">
            {count === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                All payments are attached to seats. Late or missing payment confirmations are recovered automatically; anything that still needs a person will appear here and be emailed to supervisors.
              </div>
            )}

            {reviews.map(review => (
              <div key={review.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Paid, seat not confirmed</p>
                    <p className="mt-0.5 font-bold text-brand-blue">{review.bookingReference} · {review.customerName || review.email}</p>
                    <p className="text-sm text-gray-700">
                      {review.amountFormatted} · tx {review.transactionId} · {review.sessionDate} {review.sessionTime}{review.eventTitle ? ` · ${review.eventTitle}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      {(review.seats || []).map(s => `Table ${s.tableNumber} Chair ${s.chairNumber} — ${seatStateLabel(s.state)}`).join('; ')}
                    </p>
                    {review.email && <p className="text-xs text-gray-500">{review.email}</p>}
                  </div>
                </div>
                {canManage ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.canConfirm ? (
                      <button
                        type="button"
                        onClick={() => onConfirm?.(review)}
                        className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800"
                        title="Re-verify with Authorize.Net, mark the seat sold and email the customer"
                      >Confirm seat</button>
                    ) : (
                      <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
                        Seat taken — reseat via Chair Management or refund via the refund workflow, then mark handled.
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onDismiss?.(review)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      title="Remove from notifications after handling it another way (note required)"
                    >Mark handled</button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">View only — an admin or supervisor resolves this.</p>
                )}
              </div>
            ))}

            {duplicates.map(dup => (
              <div key={dup.id} className="px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Charged twice</p>
                <p className="mt-0.5 font-bold text-brand-blue">{dup.bookingReference} · {dup.customerName || dup.email}</p>
                <p className="text-sm text-gray-700">
                  Extra {dup.amountFormatted} (tx {dup.duplicateTransactionId || 'unknown'}) needs a refund. Original tx {dup.originalTransactionId || 'unknown'} keeps the seat.
                </p>
                {dup.email && <p className="text-xs text-gray-500">{dup.email}</p>}
                {canManage ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => onResolveDuplicate?.(dup)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      title="Mark as handled after refunding the extra charge"
                    >Mark refunded</button>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">View only — an admin or supervisor resolves this.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
