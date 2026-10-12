import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../api', () => ({
  fetchAdminPackages: vi.fn(() => Promise.resolve([])),
  createAdminPackage: vi.fn(() => Promise.resolve({})),
  updateAdminPackage: vi.fn(() => Promise.resolve({})),
  deleteAdminPackage: vi.fn(() => Promise.resolve({ ok: true })),
}));

import * as api from '../api';
import { usePackagesAdmin } from './usePackagesAdmin';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const setup = () => renderHook(() => usePackagesAdmin({ token: 'tok' }));

describe('usePackagesAdmin', () => {
  it('creates a package with the typed dollar price stored as integer cents', async () => {
    const { result } = setup();
    act(() => { result.current.setNewPackage({ name: 'Extra Card', price: '19.99', type: 'optional', max_quantity: '3', sort_order: '2', is_phd: false, description: '' }); });
    await act(async () => { await result.current.handleCreatePackage(); });

    expect(api.createAdminPackage).toHaveBeenCalledWith('tok', expect.objectContaining({ name: 'Extra Card', price: 1999, max_quantity: 3, sort_order: 2 }));
    expect(result.current.newPackage.name).toBe('');
    expect(api.fetchAdminPackages).toHaveBeenCalled();
  });

  it('saves nothing when the admin cancels the confirmation', async () => {
    window.confirm.mockReturnValue(false);
    const { result } = setup();
    act(() => { result.current.setNewPackage({ name: 'Extra Card', price: '5', type: 'optional', max_quantity: 1, sort_order: 0, is_phd: false, description: '' }); });
    await act(async () => { await result.current.handleCreatePackage(); });
    expect(api.createAdminPackage).not.toHaveBeenCalled();
  });

  it('opens the edit form with the stored cents shown as dollars', () => {
    const { result } = setup();
    act(() => { result.current.handleStartEditPackage({ id: 'p1', name: '9 up', price: 3000, type: 'required', max_quantity: 1, sort_order: 0, is_phd: 0 }); });
    expect(result.current.editingPackage).toMatchObject({ id: 'p1', price: '30.00', is_phd: false });
  });

  it('refuses a negative edited price', async () => {
    const { result } = setup();
    act(() => { result.current.handleStartEditPackage({ id: 'p1', name: '9 up', price: 3000 }); });
    act(() => { result.current.setEditingPackage(prev => ({ ...prev, price: '-1' })); });
    await act(async () => { await result.current.handleSaveEditPackage(); });
    expect(window.alert).toHaveBeenCalledWith('Price must be a non-negative number.');
    expect(api.updateAdminPackage).not.toHaveBeenCalled();
  });

  it('flips a package between active and inactive', async () => {
    const { result } = setup();
    await act(async () => { await result.current.handleTogglePackage('p1', true); });
    expect(api.updateAdminPackage).toHaveBeenCalledWith('tok', 'p1', { is_active: false });
  });
});
