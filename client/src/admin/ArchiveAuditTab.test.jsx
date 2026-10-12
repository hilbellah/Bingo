import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => ({
  fetchAdminErrors: vi.fn().mockResolvedValue([]),
  resolveAdminError: vi.fn(),
}));
import ArchiveAuditTab from './ArchiveAuditTab';
import * as api from '../api';
import { renderWithAdmin } from '../test/renderWithAdmin';

function hidden(id, date, deletedReason, overrides = {}) {
  return {
    id,
    date,
    time: '18:30',
    is_special_event: 0,
    event_title: null,
    paid_bookings: 0,
    total_revenue: 0,
    deleted_at: '2026-10-12T04:00:00.000Z',
    deleted_reason: deletedReason,
    ...overrides,
  };
}

function renderArchive(value = {}) {
  const ctx = {
    tab: 'archive',
    deletedSessions: [],
    handleViewArchiveBookings: vi.fn(),
    handleRestoreSession: vi.fn(),
    archiveBookings: null,
    setArchiveBookings: vi.fn(),
    auditLogs: [],
    ...value,
  };
  renderWithAdmin(<ArchiveAuditTab />, ctx);
  return ctx;
}

const rowFor = date => screen.getByText(date).closest('tr');

describe('Archive tab: why a session is hidden', () => {
  it('labels past, staff-deleted, schedule-removed and unrecorded sessions', () => {
    renderArchive({
      deletedSessions: [
        hidden('a', '2026-09-05', 'past_session', { paid_bookings: 3, total_revenue: 9000 }),
        hidden('b', '2026-12-20', 'staff'),
        hidden('c', '2027-01-04', 'schedule_pruned'),
        hidden('d', '2026-06-01', null),
      ],
    });

    expect(within(rowFor('2026-09-05')).getByText('Past date (auto)')).toBeInTheDocument();
    expect(within(rowFor('2026-09-05')).getByText('CA$90.00')).toBeInTheDocument();
    expect(within(rowFor('2026-12-20')).getByText('Deleted by staff')).toBeInTheDocument();
    expect(within(rowFor('2027-01-04')).getByText('Removed by schedule')).toBeInTheDocument();
    expect(within(rowFor('2026-06-01')).getByText('Not recorded')).toBeInTheDocument();
  });

  it('restores and opens bookings for the right session', async () => {
    const ctx = renderArchive({ deletedSessions: [hidden('staff-1', '2026-12-20', 'staff')] });
    await userEvent.click(within(rowFor('2026-12-20')).getByRole('button', { name: 'Restore' }));
    expect(ctx.handleRestoreSession).toHaveBeenCalledWith('staff-1');
    await userEvent.click(within(rowFor('2026-12-20')).getByRole('button', { name: 'View Bookings' }));
    expect(ctx.handleViewArchiveBookings).toHaveBeenCalledWith(expect.objectContaining({ id: 'staff-1' }));
  });

  it('hides Restore from accounts that may not restore', () => {
    renderArchive({ deletedSessions: [hidden('x', '2026-12-20', 'staff')], handleRestoreSession: null });
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });
});

describe('Archive tab: section switcher', () => {
  it('opens on Deleted Sessions and switches to System Errors and the Audit Log', async () => {
    renderArchive({
      deletedSessions: [hidden('a', '2026-09-05', 'past_session')],
      auditLogs: [{ id: 'log-1-abcdefgh', created_at: '2026-10-12T04:00:00.000Z', action: 'session_delete', entity_type: 'session', entity_id: 'abcdefgh1234', details: null }],
    });

    expect(screen.getByRole('tab', { name: /Deleted Sessions/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('2026-09-05')).toBeInTheDocument();
    expect(screen.queryByText('System Errors', { selector: 'h3' })).not.toBeInTheDocument();
    expect(api.fetchAdminErrors).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('tab', { name: /System Errors/ }));
    expect(screen.getByText('System Errors', { selector: 'h3' })).toBeInTheDocument();
    expect(await screen.findByText('No open errors.')).toBeInTheDocument();
    expect(screen.queryByText('2026-09-05')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Audit Log/ }));
    expect(screen.getByText('session_delete')).toBeInTheDocument();
    expect(screen.queryByText('System Errors', { selector: 'h3' })).not.toBeInTheDocument();
  });
});
