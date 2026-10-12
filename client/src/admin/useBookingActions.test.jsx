import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api', () => ({
  refundAdminBooking: vi.fn(),
  refundAdminBookingItem: vi.fn(),
  approveRefundRequest: vi.fn(),
  rejectRefundRequest: vi.fn(),
  confirmPaymentReview: vi.fn(),
  dismissPaymentReview: vi.fn(),
  resolveDuplicateCharge: vi.fn(),
  removeAdminAssignedTicket: vi.fn(),
  issueNoShowCredit: vi.fn(),
  moveAdminBookingItemSeat: vi.fn(),
}));

import * as api from '../api';
import { useBookingActions } from './useBookingActions';
import { AdminDialogHost, resetAdminDialogsForTests } from './adminDialogs';

function makeDeps() {
  return {
    token: 'tok',
    reportSession: 's1',
    transactionFilters: { status: 'all' },
    dailySalesDate: '2026-10-12',
    dailySalesSearch: '',
    salesDrilldown: { session: { id: 's1' } },
    dashboardDateFrom: '2026-10-12',
    dashboardDateTo: '2026-10-12',
    loadRefundRequests: vi.fn(),
    loadBookings: vi.fn(),
    loadTransactions: vi.fn(),
    loadBookingSales: vi.fn(),
    loadDailySales: vi.fn(),
    handleSalesDrilldown: vi.fn(),
    loadDashboard: vi.fn(),
    loadPaymentReviews: vi.fn(),
    loadSessions: vi.fn(),
  };
}

let actions;
function Harness({ deps }) {
  actions = useBookingActions(deps);
  return <AdminDialogHost />;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  act(() => resetAdminDialogsForTests());
});

describe('useBookingActions', () => {
  it('refunds a booking with the typed reason, then refreshes every view', async () => {
    const deps = makeDeps();
    api.refundAdminBooking.mockResolvedValue({ ok: true, requestId: 'RFR-1' });
    api.approveRefundRequest.mockResolvedValue({ ok: true, action: 'refund' });
    render(<Harness deps={deps} />);

    let done;
    act(() => { done = actions.handleRefundBooking('b1', 'BNG-1'); });
    await userEvent.type(screen.getByLabelText('Reason for refund'), '  Customer cancelled  ');
    await userEvent.click(screen.getByRole('button', { name: 'Refund now' }));

    await screen.findByText('Refund refund completed successfully.');
    expect(api.refundAdminBooking).toHaveBeenCalledWith('tok', 'b1', 'Customer cancelled');
    expect(api.approveRefundRequest).toHaveBeenCalledWith('tok', 'RFR-1', 'Customer cancelled');
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    await done;

    expect(deps.loadRefundRequests).toHaveBeenCalled();
    expect(deps.loadBookings).toHaveBeenCalledWith('s1');
    expect(deps.loadTransactions).toHaveBeenCalledWith({ status: 'all' });
    expect(deps.loadBookingSales).toHaveBeenCalled();
    expect(deps.loadDailySales).toHaveBeenCalledWith('2026-10-12', '');
    expect(deps.handleSalesDrilldown).toHaveBeenCalledWith({ id: 's1' });
  });

  it('moves no money when the refund dialog is cancelled', async () => {
    render(<Harness deps={makeDeps()} />);
    let done;
    act(() => { done = actions.handleRefundBooking('b1', 'BNG-1'); });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await done;
    expect(api.refundAdminBooking).not.toHaveBeenCalled();
    expect(api.approveRefundRequest).not.toHaveBeenCalled();
  });

  it('reports a gateway failure and still refreshes', async () => {
    const deps = makeDeps();
    api.refundAdminBookingItem.mockResolvedValue({ ok: true, requestId: 'RFR-2' });
    api.approveRefundRequest.mockResolvedValue({ ok: false, error: 'E00040: record not found' });
    render(<Harness deps={deps} />);

    act(() => { actions.handleRefundBookingItem({ id: 'i1', referenceNumber: 'BNG-1-T0', firstName: 'Ann', lastName: 'Lee', tableNumber: 3, chairNumber: 2 }, { referenceNumber: 'BNG-1' }); });
    expect(screen.getByText('Seat: Table 3, Chair 2')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Reason for refund'), 'Duplicate seat');
    await userEvent.click(screen.getByRole('button', { name: 'Refund ticket' }));

    await screen.findByText('Ticket refund could not be completed: E00040: record not found');
    expect(api.refundAdminBookingItem).toHaveBeenCalledWith('tok', 'i1', 'Duplicate seat');
    // Views refresh once the admin has read the result, as with the old alert().
    expect(deps.loadRefundRequests).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(deps.loadRefundRequests).toHaveBeenCalled());
  });

  it('sends one approval even if Approve is clicked twice while the gateway is busy', async () => {
    let finishApproval;
    api.approveRefundRequest.mockImplementation(() => new Promise(resolve => { finishApproval = resolve; }));
    render(<Harness deps={makeDeps()} />);
    const request = { id: 'RFR-9', bookingReference: 'BNG-9', amountFormatted: 'CA$30.00', requestedBy: 'staff', reason: 'x' };

    act(() => { actions.handleApproveRefundRequest(request); });
    await userEvent.click(screen.getByRole('button', { name: 'Approve and refund' }));
    await waitFor(() => expect(api.approveRefundRequest).toHaveBeenCalledTimes(1));

    // Second click while the first approval is still in flight.
    await act(async () => { await actions.handleApproveRefundRequest(request); });
    expect(screen.queryByRole('button', { name: 'Approve and refund' })).not.toBeInTheDocument();

    await act(async () => { finishApproval({ ok: true, action: 'void' }); });
    await screen.findByText('Refund approved and void completed.');
    expect(api.approveRefundRequest).toHaveBeenCalledTimes(1);
  });

  it('issues a no-show credit in cents from the dollar amount typed', async () => {
    api.issueNoShowCredit.mockResolvedValue({ ok: true, credit: { code: 'NS-1', amountFormatted: 'CA$12.50' } });
    render(<Harness deps={makeDeps()} />);
    act(() => { actions.handleIssueNoShowCredit({ id: 'i1', referenceNumber: 'T0', packagePrice: 3000, addons: [] }, { referenceNumber: 'BNG-1' }); });

    const amount = screen.getByLabelText('Credit amount (CA$)');
    expect(amount).toHaveValue('30.00');
    await userEvent.clear(amount);
    await userEvent.type(amount, '12.5');
    await userEvent.click(screen.getByRole('button', { name: 'Issue credit' }));

    await screen.findByText('Credit created: NS-1 (CA$12.50)');
    expect(api.issueNoShowCredit).toHaveBeenCalledWith('tok', 'i1', { amountCents: 1250, note: 'No-show credit' });
  });

  it('moves a seat only to a valid table and chair', async () => {
    api.moveAdminBookingItemSeat.mockResolvedValue({ ok: true, toSeat: { tableNumber: 7, chairNumber: 4 } });
    render(<Harness deps={makeDeps()} />);
    act(() => { actions.handleMoveBookingItemSeat({ id: 'i1', referenceNumber: 'T0', tableNumber: 1, chairNumber: 1 }, { referenceNumber: 'BNG-1' }); });

    await userEvent.type(screen.getByLabelText('Target table number'), '0');
    await userEvent.type(screen.getByLabelText('Target chair number'), '4');
    expect(screen.getByRole('button', { name: 'Move seat' })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Target table number'));
    await userEvent.type(screen.getByLabelText('Target table number'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Move seat' }));

    await screen.findByText('Seat moved to T7-C4.');
    expect(api.moveAdminBookingItemSeat).toHaveBeenCalledWith('tok', 'i1', { tableNumber: 7, chairNumber: 4 });
  });
});
