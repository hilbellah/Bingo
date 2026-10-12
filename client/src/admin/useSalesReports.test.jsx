import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../api', () => ({
  fetchAdminBookings: vi.fn(),
  fetchBookingSales: vi.fn(),
  fetchDailySales: vi.fn(),
  fetchAdminTransactions: vi.fn(),
  fetchAdminCustomers: vi.fn(),
  getCustomersExportUrl: vi.fn(),
  adminHeaders: vi.fn(() => ({})),
}));

import * as api from '../api';
import { useSalesReports } from './useSalesReports';

const setup = () => renderHook(() => useSalesReports({ token: 'tok', receiptConfigRef: { current: {} } }));
const row = (id, date) => ({ id, date, quantity: 1, sessionType: 'regular_bingo' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSalesReports', () => {
  it('ignores a slow date-view reply once newer dates were requested', async () => {
    let answerSeptember;
    api.fetchBookingSales.mockImplementation((token, range) => {
      if (range?.dateFrom === '2026-09-01') return new Promise(resolve => { answerSeptember = resolve; });
      return Promise.resolve([row('oct', '2026-10-03')]);
    });
    const { result } = setup();

    act(() => { result.current.loadDatedBookingSales({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }); });
    await act(async () => { await result.current.loadDatedBookingSales({ dateFrom: '2026-10-01', dateTo: '2026-10-12' }); });
    expect(result.current.datedBookingSales.rows.map(r => r.id)).toEqual(['oct']);

    await act(async () => { answerSeptember([row('sep', '2026-09-05')]); });
    expect(result.current.datedBookingSales.rows.map(r => r.id)).toEqual(['oct']);
    expect(result.current.bookingSalesRange).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-10-12' });
  });

  it('refreshes the date view as well as the current list after a booking change', async () => {
    api.fetchBookingSales.mockResolvedValue([row('a', '2026-09-05')]);
    const { result } = setup();
    await act(async () => { await result.current.loadDatedBookingSales({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }); });
    api.fetchBookingSales.mockClear();

    await act(async () => { await result.current.loadBookingSales(); });
    expect(api.fetchBookingSales).toHaveBeenCalledWith('tok', { dateFrom: '2026-09-01', dateTo: '2026-09-30' });
    expect(api.fetchBookingSales).toHaveBeenCalledWith('tok');
  });

  it('turns a server error on the date view into a message', async () => {
    api.fetchBookingSales.mockResolvedValue({ error: 'dateFrom must be on or before dateTo.' });
    const { result } = setup();
    await act(async () => { await result.current.loadDatedBookingSales({ dateFrom: '2026-10-12', dateTo: '2026-09-01' }); });
    expect(result.current.datedBookingSales).toEqual({ rows: [], error: 'dateFrom must be on or before dateTo.', loading: false });
  });

  it('opens the drilldown only for sessions with tickets, and surfaces load errors', async () => {
    api.fetchAdminBookings.mockResolvedValue({ error: 'Session not found' });
    const { result } = setup();

    act(() => { result.current.handleSalesDrilldown({ id: 's0', quantity: 0 }); });
    expect(api.fetchAdminBookings).not.toHaveBeenCalled();
    expect(result.current.salesDrilldown).toBeNull();

    act(() => { result.current.handleSalesDrilldown({ id: 's1', quantity: 2 }); });
    expect(result.current.salesDrilldown.loading).toBe(true);
    await waitFor(() => expect(result.current.salesDrilldown.error).toBe('Session not found'));
    expect(api.fetchAdminBookings).toHaveBeenCalledWith('tok', 's1');
  });

  it('asks for a multi-day daily sales range only when one is selected', async () => {
    api.fetchDailySales.mockResolvedValue({ totalTickets: 0 });
    const { result } = setup();
    await act(async () => { await result.current.loadDailySales({ range: 'multi-day', dateFrom: '2026-10-01', dateTo: '2026-10-07', search: 'ann' }); });
    expect(api.fetchDailySales).toHaveBeenLastCalledWith('tok', { range: 'multi-day', search: 'ann', dateFrom: '2026-10-01', dateTo: '2026-10-07' });
    await act(async () => { await result.current.loadDailySales({ range: 'daily', date: '2026-10-05' }); });
    expect(api.fetchDailySales).toHaveBeenLastCalledWith('tok', { range: 'daily', search: '', date: '2026-10-05' });
  });
});
