import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => ({
  fetchAdminErrors: vi.fn(),
  resolveAdminError: vi.fn(),
}));

import * as api from '../api';
import SystemErrorsPanel from './SystemErrorsPanel';

const sample = [
  { id: 'e1', source: 'client', page: '/', message: 'TypeError: total is undefined', stack: 'TypeError: total\n    at render (App.js:1:1)', occurrences: 4, lastSeenAt: '2026-10-12T09:00:00.000Z', resolvedAt: null },
  { id: 'e2', source: 'client', page: '/admin/dashboard', message: 'Request failed', stack: '', occurrences: 1, lastSeenAt: '2026-10-12T08:00:00.000Z', resolvedAt: null },
  { id: 'e3', source: 'server', page: '', message: 'Database timeout', stack: '', occurrences: 2, lastSeenAt: '2026-10-12T07:00:00.000Z', resolvedAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchAdminErrors.mockResolvedValue(sample);
  api.resolveAdminError.mockResolvedValue({ ok: true });
});

describe('System errors panel', () => {
  it('lists open errors with where they happened and how often', async () => {
    render(<SystemErrorsPanel token="tok" canResolve />);
    expect(await screen.findByText('TypeError: total is undefined')).toBeInTheDocument();
    expect(screen.getByText('Customer page')).toBeInTheDocument();
    expect(screen.getByText('Admin screen')).toBeInTheDocument();
    expect(screen.getByText('Server')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(api.fetchAdminErrors).toHaveBeenCalledWith('tok', { includeResolved: false });
  });

  it('resolves an error and reloads', async () => {
    render(<SystemErrorsPanel token="tok" canResolve />);
    await screen.findByText('Request failed');
    await userEvent.click(screen.getAllByRole('button', { name: 'Resolve' })[1]);
    expect(api.resolveAdminError).toHaveBeenCalledWith('tok', 'e2');
    await waitFor(() => expect(api.fetchAdminErrors).toHaveBeenCalledTimes(2));
  });

  it('hides Resolve from viewers', async () => {
    render(<SystemErrorsPanel token="tok" canResolve={false} />);
    await screen.findByText('Request failed');
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
  });

  it('shows details on request and can include resolved errors', async () => {
    render(<SystemErrorsPanel token="tok" canResolve />);
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }));
    expect(screen.getByText(/at render \(App\.js:1:1\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Show resolved'));
    await waitFor(() => expect(api.fetchAdminErrors).toHaveBeenLastCalledWith('tok', { includeResolved: true }));
  });

  it('says so when there is nothing open', async () => {
    api.fetchAdminErrors.mockResolvedValue([]);
    render(<SystemErrorsPanel token="tok" canResolve />);
    expect(await screen.findByText('No open errors.')).toBeInTheDocument();
  });
});
