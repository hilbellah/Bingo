import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

export default function SalesDrilldownModal() {
  const {
    bookings,
    handlePrintBookingReceipt,
    handleRefundBooking,
    handleRefundBookingItem,
    salesDrilldown,
    setSalesDrilldown,
    handlePrintSalesDrilldown,
    handleSaveSalesDrilldownCsv,
  } = useAdminDashboard();

  return (
    <>
      {/* Sales Drilldown Modal */}
      {salesDrilldown && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSalesDrilldown(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-brand-blue text-lg">Booking Details</h3>
                <p className="text-sm text-gray-500">
                  {salesDrilldown.session.description} &mdash; {salesDrilldown.bookings.reduce((sum, b) => sum + b.items.filter(item => item.refundStatus !== 'refunded').length, 0)} active ticket(s) in {salesDrilldown.session.bookingCount || salesDrilldown.bookings.length} batch(es) &mdash; {salesDrilldown.session.totalFormatted}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrintSalesDrilldown} className="px-3 py-1.5 text-sm bg-brand-blue text-white rounded-lg hover:bg-blue-800" title="Print">Print</button>
                <button onClick={handleSaveSalesDrilldownCsv} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700" title="Save CSV">Save CSV</button>
                <button onClick={() => setSalesDrilldown(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-2">&times;</button>
              </div>
            </div>
            <div id="sales-drilldown-content" className="overflow-y-auto p-5" style={{ maxHeight: 'calc(85vh - 80px)' }}>
              {salesDrilldown.bookings.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No bookings found.</p>
              ) : (
                salesDrilldown.bookings.map(b => (
                  <div key={b.id} className="mb-4 border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-xs text-gray-400">Batch:</span>
                        <span className="font-mono text-sm font-semibold text-brand-blue ml-1">{b.referenceNumber}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                          b.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                          b.paymentStatus === 'partially_refunded' ? 'bg-amber-100 text-amber-700' :
                          b.paymentStatus === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{b.paymentStatus}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{b.totalFormatted}</span>
                        <button
                          onClick={() => handlePrintBookingReceipt({...b, sessionDate: salesDrilldown.session.date, sessionTime: salesDrilldown.session.time})}
                          className="px-2 py-0.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800"
                          title="Print thermal receipt"
                        >
                          Receipt
                        </button>
                        {b.paymentStatus === 'paid' && b.items.every(item => item.refundStatus !== 'refunded') && handleRefundBooking && (
                          <button
                            onClick={() => handleRefundBooking(b.id, b.referenceNumber)}
                            className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                            title="Refund the full booking batch via Authorize.Net"
                          >
                            Refund Batch
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Customer email — shown so admins can resend tickets or follow up.
                        Older bookings made before email was required will show "(no email)". */}
                    {b.email ? (
                      <div className="mb-2 text-xs text-gray-500">
                        <span className="text-gray-400">Email:</span>{' '}
                        <a href={`mailto:${b.email}`} className="text-brand-blue hover:underline">{b.email}</a>
                      </div>
                    ) : (
                      <div className="mb-2 text-xs text-gray-400 italic">Email: (none on file)</div>
                    )}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 border-b">
                          <th className="pb-1">Ticket</th>
                          <th className="pb-1">Name</th>
                          <th className="pb-1">Table</th>
                          <th className="pb-1">Chair</th>
                          <th className="pb-1">Package</th>
                          <th className="pb-1">Add-ons</th>
                          <th className="pb-1 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.items.map((item, i) => (
                          <tr key={item.id || i} className={`border-b border-gray-50 ${item.refundStatus === 'refunded' ? 'text-gray-400 bg-gray-50' : ''}`}>
                            <td className="py-1 font-mono text-xs text-brand-blue font-semibold">{item.referenceNumber || '—'}</td>
                            <td className="py-1 font-medium">{item.firstName} {item.lastName}</td>
                            <td className="py-1">{item.tableNumber}</td>
                            <td className="py-1">{item.chairNumber}</td>
                            <td className="py-1">{item.packageName}</td>
                            <td className="py-1 text-xs text-gray-500">
                              {item.addons.length > 0
                                ? item.addons.map(a => `${a.packageName} x${a.quantity}`).join(', ')
                                : '—'}
                            </td>
                            <td className="py-1 text-right">
                              {item.refundStatus === 'refunded' ? (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                                  Refunded {item.refundAmountFormatted || ''}
                                </span>
                              ) : ['paid', 'partially_refunded'].includes(b.paymentStatus) && handleRefundBookingItem ? (
                                <button
                                  onClick={() => handleRefundBookingItem(item, b)}
                                  className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                  title="Refund only this ticket"
                                >
                                  Refund Ticket
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


