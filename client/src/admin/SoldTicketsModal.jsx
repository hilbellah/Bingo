import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

function isAssignedBooking(booking) {
  return ['promo', 'donation'].includes(String(booking?.bookingSource || '').toLowerCase());
}

export default function SoldTicketsModal() {
  const {
    handlePrintBookingReceipt,
    handleRefundBooking,
    handleRefundBookingItem,
    handleRemoveAssignedTicket,
    handleIssueNoShowCredit,
    handleMoveBookingItemSeat,
    soldModal,
    setSoldModal,
    handlePrintPurchasers,
    handleSavePurchasersCsv,
  } = useAdminDashboard();

  return (
    <>
      {/* Sold Tickets Modal */}
      {soldModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSoldModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-brand-blue text-lg">Ticket Purchasers</h3>
                <p className="text-sm text-gray-500">{soldModal.session.date} at {soldModal.session.time} - {soldModal.session.sold} sold</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrintPurchasers} className="px-3 py-1.5 text-sm bg-brand-blue text-white rounded-lg hover:bg-blue-800" title="Print">Print</button>
                <button onClick={handleSavePurchasersCsv} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700" title="Save CSV">Save CSV</button>
                <button onClick={() => setSoldModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-2">&times;</button>
              </div>
            </div>
            <div id="sold-modal-content" className="overflow-y-auto p-5" style={{ maxHeight: 'calc(80vh - 80px)' }}>
              {soldModal.bookings.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No bookings found.</p>
              ) : (
                soldModal.bookings.map(b => (
                  <div key={b.id} className="mb-4 border rounded-lg p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <span className="text-xs text-gray-400">Batch:</span>
                        <span className="font-mono text-sm font-semibold text-brand-blue ml-1">{b.referenceNumber}</span>
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                          b.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                          b.paymentStatus === 'partially_refunded' ? 'bg-amber-100 text-amber-700' :
                          b.paymentStatus === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{b.paymentStatus}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-medium">{b.totalFormatted}</span>
                        <button
                          onClick={() => handlePrintBookingReceipt({...b, sessionDate: soldModal.session.date, sessionTime: soldModal.session.time})}
                          className="px-2 py-0.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800"
                          title="Reprint automatic thermal receipt"
                        >
                          Reprint Receipt
                        </button>
                        {b.paymentStatus === 'paid' && !isAssignedBooking(b) && b.items.every(item => item.refundStatus !== 'refunded') && handleRefundBooking && (
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
                            <td className="py-1 font-mono text-xs text-brand-blue font-semibold">{item.referenceNumber || '-'}</td>
                            <td className="py-1 font-medium">{item.firstName} {item.lastName}</td>
                            <td className="py-1">{item.tableNumber}</td>
                            <td className="py-1">{item.chairNumber}</td>
                            <td className="py-1">{item.packageName}</td>
                            <td className="py-1 text-xs text-gray-500">
                              {item.addons.length > 0
                                ? item.addons.map(a => `${a.packageName} x${a.quantity}`).join(', ')
                                : '-'}
                            </td>
                            <td className="py-1 text-right">
                              {item.refundStatus === 'refunded' ? (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                                  {item.refundAction === 'assigned_seat_removed'
                                    ? 'Removed'
                                    : `Refunded ${item.refundAmountFormatted || ''}`}
                                </span>
                              ) : ['paid', 'partially_refunded'].includes(b.paymentStatus) ? (
                                <div className="flex flex-wrap justify-end gap-2">
                                  {!isAssignedBooking(b) && (item.credit?.code ? (
                                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700" title={item.credit.note || 'No-show credit'}>
                                      Credit {item.credit.code}
                                    </span>
                                  ) : handleIssueNoShowCredit && (
                                    <button
                                      onClick={() => handleIssueNoShowCredit(item, b)}
                                      className="px-2 py-0.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
                                      title="Issue a tracked no-show credit without refunding the payment"
                                    >
                                      No-Show Credit
                                    </button>
                                  ))}
                                  {handleMoveBookingItemSeat && (
                                    <button
                                      onClick={() => handleMoveBookingItemSeat(item, b)}
                                      className="px-2 py-0.5 text-xs bg-brand-blue text-white rounded hover:bg-blue-800"
                                      title="Move this ticket to another vacant seat"
                                    >
                                      Move Seat
                                    </button>
                                  )}
                                  {isAssignedBooking(b) && handleRemoveAssignedTicket ? (
                                    <button
                                      onClick={() => handleRemoveAssignedTicket(item, b)}
                                      className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                      title="Release this $0 promo or donation seat without a payment refund"
                                    >
                                      Remove Assigned Seat
                                    </button>
                                  ) : handleRefundBookingItem && (
                                    <button
                                      onClick={() => handleRefundBookingItem(item, b)}
                                      className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                      title="Refund only this ticket"
                                    >
                                      Refund Ticket
                                    </button>
                                  )}
                                </div>
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
