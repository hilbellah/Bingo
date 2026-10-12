import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookingsTab from './BookingsTab';
import { renderWithAdmin } from '../test/renderWithAdmin';

function sale(overrides = {}) {
  return {
    id: 'session-current',
    date: '2026-10-18',
    time: '18:30',
    description: '2026-10-18 - 18:30',
    sessionType: 'regular_bingo',
    isSpecialEvent: false,
    quantity: 2,
    bookingCount: 1,
    totalAmount: 6000,
    totalFormatted: 'CA$60.00',
    ...overrides,
  };
}

function renderBookingSales(value = {}) {
  const ctx = {
    tab: 'bookings',
    bookingSales: [sale(), sale({ id: 'session-empty', description: '2026-10-19 - 18:30', quantity: 0, bookingCount: 0, totalAmount: 0, totalFormatted: 'CA$0.00' })],
    bookingSalesRange: null,
    datedBookingSales: null,
    loadDatedBookingSales: vi.fn(),
    handleSalesDrilldown: vi.fn(),
    dailySales: null,
    dailySalesSearch: '',
    setDailySalesSearch: vi.fn(),
    loadDailySales: vi.fn(),
    dailySalesDate: '2026-10-12',
    setDailySalesDate: vi.fn(),
    dailySalesDateTo: '2026-10-12',
    setDailySalesDateTo: vi.fn(),
    dailySalesRange: 'daily',
    setDailySalesRange: vi.fn(),
    transactions: { items: [], summary: {} },
    transactionFilters: { dateFrom: '', dateTo: '', status: 'all', search: '' },
    setTransactionFilters: vi.fn(),
    loadTransactions: vi.fn(),
    handlePrintDailySalesReceipt: vi.fn(),
    handleReprintTransactionReceipt: vi.fn(),
    handleResetSalesReporting: vi.fn(),
    ...value,
  };
  const utils = renderWithAdmin(<BookingsTab />, ctx);
  return { ctx, ...utils };
}

async function openBookingSales() {
  await userEvent.click(screen.getByRole('tab', { name: /Booking Sales/ }));
}

const salesTable = () => screen.getByRole('table');

describe('Booking Sales panel', () => {
  it('lists current sessions with View / Refund only where tickets were sold', async () => {
    const { ctx } = renderBookingSales();
    await openBookingSales();

    expect(within(salesTable()).getByText('2026-10-18 - 18:30')).toBeInTheDocument();
    const viewButtons = screen.getAllByRole('button', { name: 'View / Refund' });
    expect(viewButtons).toHaveLength(1);

    await userEvent.click(viewButtons[0]);
    expect(ctx.handleSalesDrilldown).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-current' }));
    expect(screen.getByText(/Showing current sessions/)).toBeInTheDocument();
  });

  it('asks for the chosen date range when Show Dates is clicked', async () => {
    const { ctx } = renderBookingSales();
    await openBookingSales();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-12' } });
    await userEvent.click(screen.getByRole('button', { name: 'Show Dates' }));

    expect(ctx.loadDatedBookingSales).toHaveBeenCalledWith({ dateFrom: '2026-09-01', dateTo: '2026-10-12' });
  });

  it('blocks a range whose From date is after its To date', async () => {
    const { ctx } = renderBookingSales();
    await openBookingSales();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-12' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01' } });

    const show = screen.getByRole('button', { name: 'Show Dates' });
    expect(show).toBeDisabled();
    expect(screen.getByText('Choose a From date on or before the To date.')).toBeInTheDocument();
    await userEvent.click(show);
    expect(ctx.loadDatedBookingSales).not.toHaveBeenCalled();
  });

  it('shows past sessions from the date view, each refundable, and can go back', async () => {
    const past = sale({ id: 'session-sep05', date: '2026-09-05', description: '2026-09-05 - 18:30', quantity: 3, totalAmount: 9000, totalFormatted: 'CA$90.00' });
    const { ctx } = renderBookingSales({
      bookingSalesRange: { dateFrom: '2026-09-01', dateTo: '2026-10-12' },
      datedBookingSales: { rows: [past], error: '', loading: false },
    });
    await openBookingSales();

    expect(within(salesTable()).getByText('2026-09-05 - 18:30')).toBeInTheDocument();
    expect(within(salesTable()).queryByText('2026-10-18 - 18:30')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing sessions from 2026-09-01 to 2026-10-12, including past sessions/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'View / Refund' }));
    expect(ctx.handleSalesDrilldown).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-sep05' }));

    await userEvent.click(screen.getByRole('button', { name: 'Back to Current Sessions' }));
    expect(ctx.loadDatedBookingSales).toHaveBeenCalledWith(null);
  });

  it('leaves live events out of the bingo Booking Sales list', async () => {
    renderBookingSales({
      bookingSales: [sale(), sale({ id: 'event-1', description: 'Coldplay Experience', sessionType: 'event', quantity: 5 })],
    });
    await openBookingSales();
    expect(within(salesTable()).queryByText('Coldplay Experience')).not.toBeInTheDocument();
  });

  it('reports a failed date lookup instead of an empty list', async () => {
    renderBookingSales({
      bookingSalesRange: { dateFrom: '2026-09-01', dateTo: '2026-10-12' },
      datedBookingSales: { rows: [], error: 'dateFrom must be on or before dateTo.', loading: false },
    });
    await openBookingSales();
    expect(screen.getByText('dateFrom must be on or before dateTo.')).toBeInTheDocument();
  });
});
