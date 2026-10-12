import { useRef } from 'react';
import {
  refundAdminBooking,
  refundAdminBookingItem,
  approveRefundRequest,
  rejectRefundRequest,
  confirmPaymentReview,
  dismissPaymentReview,
  resolveDuplicateCharge,
  removeAdminAssignedTicket,
  issueNoShowCredit,
  moveAdminBookingItemSeat,
} from '../api';
import { askAdmin, tellAdmin } from './adminDialogs';
import { reasonField, formatPrice } from './adminDashboardHelpers';

// Money and seat actions on paid bookings: refunds, refund approvals, payment
// reviews, duplicate charges, assigned seats, no-show credits and seat moves.
// Moved verbatim out of AdminDashboard; the caller passes the token and the
// loaders that refresh the screens after each action.
export function useBookingActions({
  token,
  reportSession,
  transactionFilters,
  dailySalesDate,
  dailySalesSearch,
  salesDrilldown,
  dashboardDateFrom,
  dashboardDateTo,
  loadRefundRequests,
  loadBookings,
  loadTransactions,
  loadBookingSales,
  loadDailySales,
  handleSalesDrilldown,
  loadDashboard,
  loadPaymentReviews,
  loadSessions,
}) {
  const approvingRefundRequestRef = useRef(false);

  // A refund keeps a persistent authorization record for audit/race safety,
  // then the same authorized admin immediately executes it. No second person
  // is required.
  const handleRefundBooking = async (id, refNumber) => {
    const answers = await askAdmin({
      title: `Refund ${refNumber || id}`,
      warning: 'This will immediately submit the void/refund to Authorize.Net and release the affected seats when successful. This financial action cannot be undone.',
      fields: [reasonField('Reason for refund')],
      confirmLabel: 'Refund now',
      tone: 'danger',
    });
    if (!answers) return;
    const reason = answers.reason;

    const result = await refundAdminBooking(token, id, reason);
    if (result.ok) {
      const completion = await approveRefundRequest(token, result.requestId, reason);
      await tellAdmin(completion.ok
        ? `Refund ${completion.action || 'reversal'} completed successfully.`
        : `Refund could not be completed: ${completion.error || 'Unknown error'}`,
      { title: refNumber || 'Refund', tone: completion.ok ? 'success' : 'error' });
      loadRefundRequests();
      loadBookings(reportSession);
      loadTransactions(transactionFilters);
      loadBookingSales();
      loadDailySales(dailySalesDate, dailySalesSearch);
      if (salesDrilldown?.session?.id) handleSalesDrilldown(salesDrilldown.session);
    } else {
      await tellAdmin('Refund failed: ' + (result.error || 'Unknown error'), { title: refNumber || 'Refund', tone: 'error' });
    }
  };

  const handleRefundBookingItem = async (item, booking) => {
    const ticketName = `${item.firstName || ''} ${item.lastName || ''}`.trim();
    const title = `Refund ticket ${item.referenceNumber || ''}${ticketName ? ` for ${ticketName}` : ''}`;
    const answers = await askAdmin({
      title,
      details: [booking?.referenceNumber ? `Booking: ${booking.referenceNumber}` : '', `Seat: Table ${item.tableNumber}, Chair ${item.chairNumber}`],
      warning: 'This will immediately submit the ticket refund to Authorize.Net and release its seat when successful. This financial action cannot be undone.',
      fields: [reasonField('Reason for refund')],
      confirmLabel: 'Refund ticket',
      tone: 'danger',
    });
    if (!answers) return;
    const reason = answers.reason;

    const result = await refundAdminBookingItem(token, item.id, reason);
    if (result.ok) {
      const completion = await approveRefundRequest(token, result.requestId, reason);
      await tellAdmin(completion.ok
        ? `Ticket refund ${completion.action || 'reversal'} completed successfully.`
        : `Ticket refund could not be completed: ${completion.error || 'Unknown error'}`,
      { title, tone: completion.ok ? 'success' : 'error' });
      loadRefundRequests();
      loadBookings(reportSession);
      loadTransactions(transactionFilters);
      loadBookingSales();
      loadDailySales(dailySalesDate, dailySalesSearch);
      if (salesDrilldown?.session?.id) handleSalesDrilldown(salesDrilldown.session);
    } else {
      await tellAdmin('Ticket refund failed: ' + (result.error || 'Unknown error'), { title, tone: 'error' });
    }
  };

  const handleApproveRefundRequest = async (request) => {
    // In-flight guard: the gateway round-trip can take seconds and a second
    // click on the money-moving Approve button must not fire a second POST.
    if (approvingRefundRequestRef.current) return;
    const answers = await askAdmin({
      title: `Approve refund ${request.bookingReference}`,
      details: [`Amount: ${request.amountFormatted}`, `Requested by: ${request.requestedBy}`, `Reason: ${request.reason}`],
      warning: 'Approval will immediately submit the void/refund to Authorize.Net. This financial action cannot be undone.',
      fields: [{ name: 'note', label: 'Approval note', type: 'textarea' }],
      confirmLabel: 'Approve and refund',
      tone: 'danger',
    });
    if (!answers) return;
    if (approvingRefundRequestRef.current) return;
    approvingRefundRequestRef.current = true;
    let result;
    try {
      result = await approveRefundRequest(token, request.id, answers.note);
    } finally {
      approvingRefundRequestRef.current = false;
    }
    await tellAdmin(result.ok ? `Refund approved and ${result.action || 'reversal'} completed.` : `Approval failed: ${result.error || 'Unknown error'}`,
      { title: request.bookingReference, tone: result.ok ? 'success' : 'error' });
    loadRefundRequests();
    loadDashboard();
  };

  const handleRejectRefundRequest = async (request) => {
    const answers = await askAdmin({
      title: `Reject refund request ${request.bookingReference || ''}`,
      details: [request.amountFormatted ? `Amount: ${request.amountFormatted}` : '', request.reason ? `Requested because: ${request.reason}` : ''],
      warning: 'No money is moved. The request is closed and kept in the audit history.',
      fields: [reasonField('Reason for rejecting')],
      confirmLabel: 'Reject request',
    });
    if (!answers) return;
    const result = await rejectRefundRequest(token, request.id, answers.reason);
    await tellAdmin(result.ok ? 'Refund request rejected. No money was moved.' : `Rejection failed: ${result.error || 'Unknown error'}`,
      { title: request.bookingReference || 'Refund request', tone: result.ok ? 'success' : 'error' });
    loadRefundRequests();
  };

  // A customer paid but the seat could not be attached automatically (late
  // gateway signal after the hold lapsed). When the seat is still free this
  // completes the booking exactly as a normal payment would.
  const handleConfirmPaymentReview = async (review) => {
    if (!await askAdmin({
      title: `Confirm seat for ${review.bookingReference}`,
      details: [
        `Customer: ${review.customerName || review.email}`,
        `Already paid: ${review.amountFormatted} (transaction ${review.transactionId})`,
        `Seats: ${(review.seats || []).map(s => `Table ${s.tableNumber} Chair ${s.chairNumber}`).join(', ')}`,
      ],
      warning: 'The payment is re-verified with Authorize.Net, the seat is marked sold, and the customer receives the normal confirmation email. No new charge is made.',
      confirmLabel: 'Confirm seat',
    })) return;
    const result = await confirmPaymentReview(token, review.id);
    await tellAdmin(result.ok
      ? `Booking ${review.bookingReference} confirmed. The customer has been emailed their tickets.`
      : `Could not confirm: ${result.message || result.error || 'Unknown error'}`,
    { title: review.bookingReference, tone: result.ok ? 'success' : 'error' });
    loadPaymentReviews();
    loadDashboard();
  };

  // Handled another way (customer reseated, refunded outside the panel,
  // etc.). Records the note in the audit trail and clears the notification.
  const handleDismissPaymentReview = async (review) => {
    const answers = await askAdmin({
      title: `Mark ${review.bookingReference} as handled`,
      details: [review.customerName || review.email ? `Customer: ${review.customerName || review.email}` : '', review.amountFormatted ? `Paid: ${review.amountFormatted}` : ''],
      warning: 'This clears the notification without moving money or seats. Your note is kept in the audit log.',
      fields: [reasonField('What was done for the customer')],
      confirmLabel: 'Mark handled',
    });
    if (!answers) return;
    const result = await dismissPaymentReview(token, review.id, answers.reason);
    await tellAdmin(result.ok ? 'Marked as handled.' : `Could not update: ${result.message || result.error || 'Unknown error'}`,
      { title: review.bookingReference, tone: result.ok ? 'success' : 'error' });
    loadPaymentReviews();
  };

  const handleResolveDuplicateCharge = async (dup) => {
    const answers = await askAdmin({
      title: `Mark duplicate charge ${dup.duplicateTransactionId || ''} as handled`,
      details: [
        `Booking ${dup.bookingReference} - ${dup.customerName || dup.email}`,
        `Extra charge: ${dup.amountFormatted}`,
        `Original (keeps the seat): ${dup.originalTransactionId || 'unknown'}`,
      ],
      warning: 'Only do this after the extra charge has actually been refunded or voided in Authorize.Net. This does not move money and does not touch the seat.',
      fields: [{ name: 'note', label: 'Refund/void reference or note', type: 'textarea' }],
      confirmLabel: 'Mark handled',
    });
    if (!answers) return;
    const result = await resolveDuplicateCharge(token, dup.id, answers.note);
    await tellAdmin(result.ok ? 'Duplicate charge marked as handled.' : `Could not update: ${result.message || result.error || 'Unknown error'}`,
      { title: dup.bookingReference || 'Duplicate charge', tone: result.ok ? 'success' : 'error' });
    loadPaymentReviews();
  };

  const handleRemoveAssignedTicket = async (item, booking) => {
    const ticketName = `${item.firstName || ''} ${item.lastName || ''}`.trim();
    const seatLabel = `Table ${item.tableNumber}, Seat ${item.chairNumber}`;
    const sourceLabel = booking?.bookingSource === 'donation' ? 'donation' : 'promo';
    const title = `Remove ${sourceLabel} seat ${item.referenceNumber || ''}${ticketName ? ` for ${ticketName}` : ''}`;
    if (!await askAdmin({
      title,
      warning: `${seatLabel} will become available again. No payment refund will be attempted because this is a $0 assigned seat. The removal will remain in the audit history.`,
      confirmLabel: 'Remove seat',
      tone: 'danger',
    })) return;

    const result = await removeAdminAssignedTicket(token, item.id);
    if (result.ok) {
      await tellAdmin(`${sourceLabel === 'donation' ? 'Donation' : 'Promo'} seat removed. ${seatLabel} is now available.`, { title, tone: 'success' });
      loadBookings(reportSession);
      loadTransactions(transactionFilters);
      loadBookingSales();
      loadDailySales(dailySalesDate, dailySalesSearch);
      loadSessions();
      if (salesDrilldown?.session?.id) handleSalesDrilldown(salesDrilldown.session);
    } else {
      await tellAdmin('Assigned seat removal failed: ' + (result.error || 'Unknown error'), { title, tone: 'error' });
    }
  };

  const handleIssueNoShowCredit = async (item, booking) => {
    const title = `Issue no-show credit for ${item.referenceNumber || 'this ticket'}`;
    if (item.credit?.code) {
      await tellAdmin(`This ticket already has credit ${item.credit.code}.`, { title });
      return;
    }
    const ticketName = `${item.firstName || ''} ${item.lastName || ''}`.trim();
    const defaultAmount = Number(item.packagePrice || 0) + (item.addons || []).reduce((sum, addon) => sum + Number(addon.price || 0), 0);
    const answers = await askAdmin({
      title,
      details: [
        `Booking: ${booking?.referenceNumber || ''}`,
        ticketName ? `Ticket holder: ${ticketName}` : '',
      ],
      warning: 'This records a store credit only. It does not refund Authorize.Net and does not change the paid booking status.',
      fields: [
        {
          name: 'amount',
          label: 'Credit amount (CA$)',
          type: 'number',
          required: true,
          defaultValue: (defaultAmount / 100).toFixed(2),
          validate: value => (/^\d+(\.\d{1,2})?$/.test(value) ? '' : 'Enter an amount like 30 or 30.00.'),
        },
        { name: 'note', label: 'Credit note', defaultValue: 'No-show credit' },
      ],
      confirmLabel: 'Issue credit',
    });
    if (!answers) return;
    const amountCents = Math.round(Number(answers.amount) * 100);

    const result = await issueNoShowCredit(token, item.id, { amountCents, note: answers.note });
    if (!result.ok) {
      await tellAdmin('No-show credit failed: ' + (result.error || 'Unknown error'), { title, tone: 'error' });
      return;
    }
    await tellAdmin(`Credit created: ${result.credit?.code || ''} (${result.credit?.amountFormatted || formatPrice(amountCents)})`, { title, tone: 'success' });
    refreshBookingViewsAfterSeatChange();
  };

  const refreshBookingViewsAfterSeatChange = () => {
    loadBookings(reportSession);
    loadBookingSales();
    loadDailySales(dailySalesDate, dailySalesSearch);
    loadDashboard(dashboardDateFrom, dashboardDateTo);
    if (salesDrilldown?.session?.id) handleSalesDrilldown(salesDrilldown.session);
  };

  const handleMoveBookingItemSeat = async (item, booking) => {
    const ticketName = `${item.firstName || ''} ${item.lastName || ''}`.trim();
    const currentSeat = `T${item.tableNumber}-C${item.chairNumber}`;
    const title = `Move ticket ${item.referenceNumber || ''}${ticketName ? ` for ${ticketName}` : ''}`;
    const positiveWhole = value => (/^[1-9]\d*$/.test(value) ? '' : 'Enter a whole number, 1 or higher.');
    const answers = await askAdmin({
      title,
      details: [
        `Booking: ${booking?.referenceNumber || ''}`,
        `Current seat: ${currentSeat}`,
      ],
      warning: 'This keeps the booking paid and only changes the assigned seat. The target seat must be vacant.',
      fields: [
        { name: 'table', label: 'Target table number', type: 'number', required: true, validate: positiveWhole },
        { name: 'chair', label: 'Target chair number', type: 'number', required: true, validate: positiveWhole },
      ],
      confirmLabel: 'Move seat',
    });
    if (!answers) return;
    const tableNumber = Number(answers.table);
    const chairNumber = Number(answers.chair);

    const result = await moveAdminBookingItemSeat(token, item.id, { tableNumber, chairNumber });
    if (result.ok) {
      await tellAdmin(`Seat moved to T${result.toSeat?.tableNumber || tableNumber}-C${result.toSeat?.chairNumber || chairNumber}.`, { title, tone: 'success' });
      refreshBookingViewsAfterSeatChange();
    } else {
      await tellAdmin('Seat move failed: ' + (result.error || 'Unknown error'), { title, tone: 'error' });
    }
  };


  return {
    handleRefundBooking,
    handleRefundBookingItem,
    handleApproveRefundRequest,
    handleRejectRefundRequest,
    handleConfirmPaymentReview,
    handleDismissPaymentReview,
    handleResolveDuplicateCharge,
    handleRemoveAssignedTicket,
    handleIssueNoShowCredit,
    refreshBookingViewsAfterSeatChange,
    handleMoveBookingItemSeat,
  };
}
