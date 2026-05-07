import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

export default function SoldTicketsModal() {
  const {
    bookings,
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
                <p className="text-sm text-gray-500">{soldModal.session.date} at {soldModal.session.time} &mdash; {soldModal.session.sold} sold</p>
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
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-xs text-gray-400">Batch:</span>
                        <span className="font-mono text-sm font-semibold text-brand-blue ml-1">{b.referenceNumber}</span>
                      </div>
                      <span className="text-sm font-medium">{b.totalFormatted}</span>
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
                        </tr>
                      </thead>
                      <tbody>
                        {b.items.map((item, i) => (
                          <tr key={i} className="border-b border-gray-50">
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


