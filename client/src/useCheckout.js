import { editPendingBooking, fetchSeats, initiateBooking } from './api';
import { CHECKOUT_SERVICE_FEE_CENTS } from './bookingHelpers';
import { formatPrice } from './utils/formatters';

// Customer checkout: create the pending booking and open the Authorize.Net
// payment step, or reopen a pending booking for editing. Moved verbatim out of
// App.jsx; the caller passes state and setters explicitly.
export function useCheckout({
  holderId,
  packages,
  selectedSession,
  partySize,
  attendees,
  seats,
  setSeats,
  selectedSeats,
  setHoldExpiry,
  setLoading,
  error,
  setError,
  paymentSession,
  setPaymentSession,
  setPanelOpen,
  setBookingStep,
  isSelectedEvent,
  requiredPkgs,
  optionalPkgs,
  selectedBookingStatus,
  bookingClosed,
  serviceFeeUnitAmount,
  serviceFeeAmount,
  salesTaxAmount,
  reserveEventTickets,
}) {

  const handleSubmit = async (customer, submittedAttendees = attendees) => {
    if (bookingClosed) {
      setError(selectedBookingStatus.message);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');

    // Everything below performs network calls; without the try/finally a
    // dropped request left the customer stuck on a disabled spinner button.
    try {

    let submitSelectedSeats = selectedSeats;
    if (isSelectedEvent && selectedSeats.length !== partySize) {
      const reserved = await reserveEventTickets(partySize);
      if (!reserved) {
        setLoading(false);
        return;
      }
      submitSelectedSeats = reserved;
    }

    const bookingAttendees = submittedAttendees.map((attendee, index) => ({
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      seatId: submitSelectedSeats[index],
      ticketPackageId: isSelectedEvent ? (attendee.ticketPackageId || requiredPkgs[0]?.id || '') : undefined,
      addons: (attendee.addons || []).filter(addon => addon.quantity > 0)
    }));
    const checkoutSummary = {
      customerName: [submittedAttendees[0]?.firstName, submittedAttendees[0]?.lastName].filter(Boolean).join(' ').trim(),
      items: submittedAttendees.map((attendee, index) => {
        const seat = seats.find(item => item.id === submitSelectedSeats[index]);
        const addonItems = (attendee.addons || [])
          .filter(addon => addon.quantity > 0)
          .map(addon => {
            const pkg = optionalPkgs.find(item => item.id === addon.packageId);
            if (!pkg) return null;
            return {
              id: pkg.id,
              name: pkg.name,
              quantity: addon.quantity,
              price: pkg.price * addon.quantity,
              priceFormatted: formatPrice(pkg.price * addon.quantity),
            };
          })
          .filter(Boolean);

        return {
          name: [attendee.firstName, attendee.lastName].filter(Boolean).join(' ').trim(),
          seat: isSelectedEvent ? 'General admission' : seat ? `Table ${seat.table_number}, Chair ${seat.chair_number}` : '',
          packages: [
            ...(isSelectedEvent
              ? [requiredPkgs.find(pkg => pkg.id === (attendee.ticketPackageId || requiredPkgs[0]?.id)) || requiredPkgs[0]].filter(Boolean)
              : requiredPkgs
            ).map(pkg => ({
              id: pkg.id,
              name: pkg.name,
              quantity: 1,
              price: pkg.price,
              priceFormatted: formatPrice(pkg.price),
            })),
            ...addonItems,
          ],
        };
      }),
    };

    // /api/bookings/initiate creates the booking as 'pending' and returns a
    // short-lived Authorize.Net hosted-page token + redirect URL.
    const result = await initiateBooking(selectedSession.id, holderId, bookingAttendees, customer);

    if (!result || !result.bookingId || !result.token || !result.redirectUrl) {
      setLoading(false);
      setError(result?.error || 'Could not start payment. Please try again.');
      return;
    }

    // Render Authorize.Net's hosted card-entry form inside our branded checkout page.
    // Authorize.Net still owns the card iframe, so we never see PAN/CVV.
    const serviceFeeAmount = result.serviceFeeAmount || 0;
    const serviceFeeQuantity = result.serviceFeeQuantity || submittedAttendees.length || 1;
    const serviceFeeUnitFormatted = result.serviceFeeUnitFormatted || formatPrice(result.serviceFeeUnitAmount || CHECKOUT_SERVICE_FEE_CENTS);
    const salesTaxAmount = result.salesTaxAmount || 0;
    setPaymentSession({
      ...result,
      checkoutSummary: {
        ...checkoutSummary,
        serviceFee: serviceFeeAmount > 0 ? {
          name: `Service charge (${serviceFeeUnitFormatted} x ${serviceFeeQuantity} ${serviceFeeQuantity === 1 ? 'player' : 'players'})`,
          price: serviceFeeAmount,
          priceFormatted: result.serviceFeeFormatted || formatPrice(serviceFeeAmount),
        } : null,
        salesTax: salesTaxAmount > 0 ? {
          name: result.salesTaxLabel || 'HST (15%)',
          price: salesTaxAmount,
          priceFormatted: result.salesTaxFormatted || formatPrice(salesTaxAmount),
        } : null,
      },
    });

    } catch (err) {
      console.error('Booking submit failed:', err);
      setError('Could not start payment. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEditCheckout = async () => {
    if (!paymentSession?.bookingId) return;
    setLoading(true);
    setError('');

    try {
      const result = await editPendingBooking(paymentSession.bookingId);
      if (!result?.success) {
        setError(result?.error || 'Could not reopen this booking for editing.');
        setLoading(false);
        return;
      }

      if (result.heldUntil) setHoldExpiry(result.heldUntil);
      if (selectedSession) {
        fetchSeats(selectedSession.id, holderId).then(setSeats).catch(() => {});
      }
      setPaymentSession(null);
      setBookingStep(isSelectedEvent ? 0 : 2);
      setPanelOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return {
    handleSubmit,
    handleBackToEditCheckout,
  };
}
