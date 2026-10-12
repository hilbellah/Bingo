import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDialogHost, askAdmin, tellAdmin, resetAdminDialogsForTests } from './adminDialogs';

afterEach(() => {
  act(() => resetAdminDialogsForTests());
});

function refundPrompt() {
  return askAdmin({
    title: 'Refund BNG-1',
    details: ['Amount: CA$30.00'],
    warning: 'This cannot be undone.',
    fields: [{ name: 'reason', label: 'Reason for refund', type: 'textarea', required: true, minLength: 3 }],
    confirmLabel: 'Refund now',
    tone: 'danger',
  });
}

describe('admin dialogs', () => {
  it('shows the action, details and warning, and cannot refund without a reason', async () => {
    render(<AdminDialogHost />);
    let answer;
    act(() => { refundPrompt().then(value => { answer = value; }); });

    expect(screen.getByRole('dialog', { name: 'Refund BNG-1' })).toBeInTheDocument();
    expect(screen.getByText('Amount: CA$30.00')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    const refund = screen.getByRole('button', { name: 'Refund now' });
    expect(refund).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Reason for refund'), 'ab');
    expect(refund).toBeDisabled();
    await userEvent.tab();
    expect(screen.getByText('Reason for refund must be at least 3 characters.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Reason for refund'), 'c  ');
    expect(refund).toBeEnabled();
    await userEvent.click(refund);

    expect(answer).toEqual({ reason: 'abc' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('starts focus in the first field, never on the confirm button', () => {
    render(<AdminDialogHost />);
    act(() => { refundPrompt(); });
    expect(screen.getByLabelText('Reason for refund')).toHaveFocus();
  });

  it('focuses Cancel when there is nothing to type, so Enter cannot confirm', async () => {
    render(<AdminDialogHost />);
    let answer = 'pending';
    act(() => { askAdmin({ title: 'Confirm seat', confirmLabel: 'Confirm' }).then(value => { answer = value; }); });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(answer).toBeNull();
  });

  it('does not submit when Enter is pressed inside a field', async () => {
    render(<AdminDialogHost />);
    let answer = 'pending';
    act(() => {
      askAdmin({ title: 'Move seat', fields: [{ name: 'table', label: 'Table', required: true }] }).then(value => { answer = value; });
    });
    await userEvent.type(screen.getByLabelText('Table'), '12{Enter}');
    expect(answer).toBe('pending');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('cancels on Escape and on the Cancel button', async () => {
    render(<AdminDialogHost />);
    let first = 'pending';
    act(() => { refundPrompt().then(value => { first = value; }); });
    await userEvent.keyboard('{Escape}');
    expect(first).toBeNull();

    let second = 'pending';
    act(() => { refundPrompt().then(value => { second = value; }); });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(second).toBeNull();
  });

  it('runs custom validation and keeps optional fields optional', async () => {
    render(<AdminDialogHost />);
    let answer;
    act(() => {
      askAdmin({
        title: 'Issue no-show credit',
        fields: [
          { name: 'amount', label: 'Credit amount', type: 'number', required: true, defaultValue: '30.00', validate: v => (Number(v) >= 0 && Number.isFinite(Number(v)) ? '' : 'Enter a valid amount.') },
          { name: 'note', label: 'Note' },
        ],
        confirmLabel: 'Issue credit',
      }).then(value => { answer = value; });
    });
    const amount = screen.getByLabelText('Credit amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, 'abc');
    expect(screen.getByRole('button', { name: 'Issue credit' })).toBeDisabled();
    expect(screen.getByLabelText('Note (optional)')).toBeInTheDocument();
    await userEvent.clear(amount);
    await userEvent.type(amount, '12.50');
    await userEvent.click(screen.getByRole('button', { name: 'Issue credit' }));
    expect(answer).toEqual({ amount: '12.50', note: '' });
  });

  it('shows messages one at a time, in order', async () => {
    render(<AdminDialogHost />);
    act(() => {
      tellAdmin('Refund completed.', { tone: 'success' });
      tellAdmin('Second message.');
    });
    expect(screen.getByText('Refund completed.')).toBeInTheDocument();
    expect(screen.queryByText('Second message.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByText('Second message.')).toBeInTheDocument();
  });
});
