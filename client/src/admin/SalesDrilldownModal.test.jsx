import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SalesDrilldownModal from './SalesDrilldownModal';
import { renderWithAdmin } from '../test/renderWithAdmin';

function item(overrides = {}) {
  return {
    id: 'item-1',
    referenceNumber: 'BNG-1-T0',
    firstName: 'Alice',
    lastName: 'Player',
    tableNumber: 1,
    chairNumber: 1,
    packageName: '9 up',
    addons: [],
    refundStatus: 'active',
    ...overrides,
  };
}

function booking(overrides = {}) {
  return {
    id: 'booking-1',
    referenceNumber: 'BNG-1',
    paymentStatus: 'paid',
    totalFormatted: 'CA$30.00',
    email: 'buyer@example.com',
    items: [item()],
    ...overrides,
  };
}

function renderDrilldown(bookings, handlers = {}) {
  const value = {
    salesDrilldown: {
      session: { id: 's1', date: '2026-09-05', time: '18:30', description: '2026-09-05 - 18:30', bookingCount: bookings.length, totalFormatted: 'CA$30.00' },
      bookings,
      loading: false,
      error: '',
    },
    setSalesDrilldown: vi.fn(),
    handlePrintBookingReceipt: vi.fn(),
    handlePrintSalesDrilldown: vi.fn(),
    handleSaveSalesDrilldownCsv: vi.fn(),
    handleRefundBooking: vi.fn(),
    handleRefundBookingItem: vi.fn(),
    handleRemoveAssignedTicket: vi.fn(),
    handleIssueNoShowCredit: vi.fn(),
    handleMoveBookingItemSeat: vi.fn(),
    ...handlers,
  };
  renderWithAdmin(<SalesDrilldownModal />, value);
  return value;
}

const refundButtons = () => screen.queryAllByRole('button', { name: 'Refund' });

describe('SalesDrilldownModal refund controls', () => {
  it('offers a whole-booking refund and a per-ticket refund on a paid booking', async () => {
    const ctx = renderDrilldown([booking()]);
    expect(refundButtons()).toHaveLength(2);

    await userEvent.click(screen.getByTitle('Refund this booking'));
    expect(ctx.handleRefundBooking).toHaveBeenCalledWith('booking-1', 'BNG-1');

    await userEvent.click(screen.getByTitle('Refund only this ticket'));
    expect(ctx.handleRefundBookingItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }), expect.objectContaining({ id: 'booking-1' }));
  });

  it('shows no refund buttons to a viewer account (handlers withheld)', () => {
    renderDrilldown([booking()], { handleRefundBooking: null, handleRefundBookingItem: null });
    expect(refundButtons()).toHaveLength(0);
  });

  it('shows no refund buttons on refunded, voided or cancelled bookings', () => {
    renderDrilldown([
      booking({ id: 'b-refunded', referenceNumber: 'BNG-R', paymentStatus: 'refunded', items: [item({ id: 'i-r', refundStatus: 'refunded', refundAmountFormatted: 'CA$30.00' })] }),
      booking({ id: 'b-voided', referenceNumber: 'BNG-V', paymentStatus: 'voided', items: [item({ id: 'i-v' })] }),
      booking({ id: 'b-cancelled', referenceNumber: 'BNG-C', paymentStatus: 'cancelled', items: [item({ id: 'i-c' })] }),
    ]);
    expect(refundButtons()).toHaveLength(0);
    expect(screen.getByText('Refunded CA$30.00')).toBeInTheDocument();
  });

  it('drops the whole-booking refund once any ticket is refunded, keeping per-ticket refunds for the rest', () => {
    renderDrilldown([booking({
      paymentStatus: 'partially_refunded',
      items: [item({ id: 'i-done', refundStatus: 'refunded', refundAmountFormatted: 'CA$30.00' }), item({ id: 'i-open', firstName: 'Bob' })],
    })]);
    expect(screen.queryByTitle('Refund this booking')).not.toBeInTheDocument();
    expect(screen.getAllByTitle('Refund only this ticket')).toHaveLength(1);
  });

  it('never offers a payment refund on a $0 promo or donation seat', () => {
    const ctx = renderDrilldown([booking({ bookingSource: 'promo' })]);
    expect(refundButtons()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Remove Assigned Seat' })).toBeInTheDocument();
    expect(ctx.handleRefundBooking).not.toHaveBeenCalled();
  });

  it('offers a whole-booking refund for a payment under review', () => {
    renderDrilldown([booking({ paymentStatus: 'payment_review' })]);
    expect(screen.getByTitle('Refund this booking')).toBeInTheDocument();
    // Per-ticket refunds need a settled paid booking.
    expect(screen.queryByTitle('Refund only this ticket')).not.toBeInTheDocument();
  });

  it('counts only active tickets in the header', () => {
    renderDrilldown([booking({
      paymentStatus: 'partially_refunded',
      items: [item({ id: 'a', refundStatus: 'refunded' }), item({ id: 'b' }), item({ id: 'c' })],
    })]);
    const header = screen.getByRole('heading', { name: 'Booking Details' }).parentElement;
    expect(within(header).getByText(/2 active ticket\(s\)/)).toBeInTheDocument();
  });
});
