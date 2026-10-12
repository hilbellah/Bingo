import React from 'react';
import { render } from '@testing-library/react';
import { AdminDashboardProvider } from '../admin/AdminDashboardContext';

export const formatPrice = cents => `CA$${(Number(cents || 0) / 100).toFixed(2)}`;

// Renders an admin screen with a fake dashboard context. Pass only the values
// the test cares about; everything else gets a harmless default.
export function renderWithAdmin(ui, value = {}) {
  const context = {
    formatPrice,
    ...value,
  };
  return render(<AdminDashboardProvider value={context}>{ui}</AdminDashboardProvider>);
}
