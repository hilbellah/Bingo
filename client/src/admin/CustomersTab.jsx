import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function CustomersTab() {
  const {
    tab,
    customers,
    customerSearch,
    setCustomerSearch,
    loadCustomers,
    handleExportCustomers,
  } = useAdminDashboard();

  if (tab !== 'customers') return null;

  const totalCustomers = customers.length;
  const totalPaidBookings = customers.reduce((sum, customer) => sum + (customer.paidBookingCount || 0), 0);
  const totalTickets = customers.reduce((sum, customer) => sum + (customer.ticketCount || 0), 0);
  const totalSpent = customers.reduce((sum, customer) => sum + (customer.totalSpent || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Customers</p>
          <p className="text-2xl font-bold text-brand-blue mt-1">{totalCustomers}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Transactions</p>
          <p className="text-2xl font-bold text-brand-blue mt-1">{totalPaidBookings}</p>
          <p className="text-xs text-gray-400 mt-1">{totalTickets} ticket holders</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Customer Revenue</p>
          <p className="text-2xl font-bold text-brand-gold mt-1">${(totalSpent / 100).toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-brand-blue">Customers</h3>
            <p className="text-xs text-gray-500 mt-1">Customer rows are built from paid ticket holders, including names purchased for by another customer.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={customerSearch}
              onChange={e => {
                setCustomerSearch(e.target.value);
                loadCustomers(e.target.value);
              }}
              placeholder="Search name or email..."
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
            />
            <button
              type="button"
              onClick={handleExportCustomers}
              className="px-3 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-brand-blue/90"
            >
              Export CSV
            </button>
          </div>
        </div>

        {customers.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No customers found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="pb-2 pl-2">Name</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2 text-center">Transactions</th>
                  <th className="pb-2 text-center">Tickets</th>
                  <th className="pb-2 text-right">Total Spent</th>
                  <th className="pb-2">Last Booking</th>
                  <th className="pb-2 pr-2">Verified</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(customer => (
                  <tr key={customer.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="py-3 pl-2">
                      <div className="font-medium text-gray-800">{customer.fullName}</div>
                      <div className="text-xs text-gray-400">First booking: {formatDateTime(customer.firstBookingAt)}</div>
                    </td>
                    <td className="py-3">
                      <a href={`mailto:${customer.email}`} className="text-brand-blue hover:underline">
                        {customer.email}
                      </a>
                    </td>
                    <td className="py-3 text-center font-semibold text-gray-700">{customer.paidBookingCount}</td>
                    <td className="py-3 text-center font-semibold text-gray-700">{customer.ticketCount || 0}</td>
                    <td className="py-3 text-right font-semibold text-gray-800">{customer.totalSpentFormatted}</td>
                    <td className="py-3 text-gray-600">{formatDateTime(customer.lastBookingAt)}</td>
                    <td className="py-3 pr-2">
                      {customer.emailVerifiedAt ? (
                        <span className="inline-flex px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">
                          Legacy
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
