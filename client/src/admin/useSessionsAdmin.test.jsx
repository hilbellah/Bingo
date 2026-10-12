import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../api', () => ({
  fetchAdminSessions: vi.fn(() => Promise.resolve([])),
  createAdminSession: vi.fn(() => Promise.resolve({})),
  updateAdminSession: vi.fn(() => Promise.resolve({})),
  deleteAdminSession: vi.fn(() => Promise.resolve({ ok: true })),
  fetchAdminSessionPackages: vi.fn(() => Promise.resolve([])),
  setAdminSessionPackages: vi.fn(() => Promise.resolve({})),
  uploadImage: vi.fn(),
}));

import * as api from '../api';
import { useSessionsAdmin } from './useSessionsAdmin';
import { DEFAULT_SPECIAL_BINGO_CONFIG } from './adminDashboardHelpers';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const setup = () => renderHook(() => useSessionsAdmin({
  specialBingoConfig: DEFAULT_SPECIAL_BINGO_CONFIG,
  token: 'tok',
  loadBookingSales: vi.fn(),
}));

describe('useSessionsAdmin', () => {
  it('creates a regular session without any special-event fields', async () => {
    const { result } = setup();
    act(() => {
      result.current.setNewSession(prev => ({ ...prev, date: '2026-10-20', time: '18:30', cutoff_time: '12:00', is_special_event: false, event_title: 'leftover' }));
    });
    await act(async () => { await result.current.handleCreateSession(); });

    expect(api.createAdminSession).toHaveBeenCalledTimes(1);
    const [, payload] = api.createAdminSession.mock.calls[0];
    expect(payload).toMatchObject({ date: '2026-10-20', session_type: 'regular_bingo' });
    for (const key of ['event_title', 'event_description', 'event_image_url', 'doors_open_time', 'packages', 'sales_cutoff_date']) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload).not.toHaveProperty('sales_cutoff_at');
  });

  it('gives a special bingo event a sales cutoff built from its date and cutoff time', async () => {
    const { result } = setup();
    act(() => {
      result.current.setNewSession(prev => ({ ...prev, date: '2026-11-07', time: '18:30', cutoff_time: '15:00', sales_cutoff_date: '', is_special_event: true, event_title: 'Big Bank Bingo' }));
    });
    await act(async () => { await result.current.handleCreateSession(); });

    const [, payload] = api.createAdminSession.mock.calls[0];
    expect(payload).toMatchObject({ session_type: 'special_bingo', sales_cutoff_at: '2026-11-07T15:00', event_title: 'Big Bank Bingo' });
    expect(payload.packages.map(pkg => pkg.price)).toEqual([7500, 5000]);
    expect(payload).not.toHaveProperty('sales_cutoff_date');
  });

  it('does nothing without a date or when the confirmation is cancelled', async () => {
    const { result } = setup();
    await act(async () => { await result.current.handleCreateSession(); });
    expect(api.createAdminSession).not.toHaveBeenCalled();

    window.confirm.mockReturnValue(false);
    act(() => { result.current.setNewSession(prev => ({ ...prev, date: '2026-10-20', is_special_event: false })); });
    await act(async () => { await result.current.handleCreateSession(); });
    expect(api.createAdminSession).not.toHaveBeenCalled();
  });
});
