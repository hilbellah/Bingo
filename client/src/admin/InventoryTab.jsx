import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';
import { fetchAdminPhdInventory, updateAdminPhdInventory } from '../api';

export default function InventoryTab() {
  const {
    tab,
    token,
    phdInventory,
    phdEditForm,
    setPhdEditForm,
    phdSaving,
    setPhdSaving,
    setPhdInventory,
  } = useAdminDashboard();

  return (
    <>
        {/* PHD INVENTORY TAB */}
        {tab === 'inventory' && phdInventory && (
          <div className="max-w-4xl">
            <h3 className="text-xl font-bold text-brand-blue mb-6">PHD (Personal Handheld Device) Inventory</h3>

            {/* Inventory Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className={`rounded-xl p-5 shadow-sm text-white`} style={{ background: phdInventory.remaining <= 20 ? '#dc2626' : phdInventory.remaining <= 50 ? '#d97706' : '#16a34a' }}>
                <p className="text-sm opacity-80">Available</p>
                <p className="text-4xl font-bold mt-1">{phdInventory.remaining}</p>
                <p className="text-xs opacity-60 mt-1">for next session</p>
              </div>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#dc2626' }}>
                <p className="text-sm opacity-80">In Use</p>
                <p className="text-4xl font-bold mt-1">{phdInventory.totalUsed}</p>
                <p className="text-xs opacity-60 mt-1">next session</p>
              </div>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#2563eb' }}>
                <p className="text-sm opacity-80">Total Stock</p>
                <p className="text-4xl font-bold mt-1">{phdInventory.totalStock}</p>
                <p className="text-xs opacity-60 mt-1">per session</p>
              </div>
              <div className="rounded-xl p-5 shadow-sm text-white" style={{ background: '#7c3aed' }}>
                <p className="text-sm opacity-80">Per Player Limit</p>
                <p className="text-4xl font-bold mt-1">{phdInventory.perPlayerLimit}</p>
                <p className="text-xs opacity-60 mt-1">max per person</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-600">Next Session Utilization</span>
                <span className="text-sm font-bold text-gray-800">{Math.round((phdInventory.totalUsed / phdInventory.totalStock) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all ${
                    phdInventory.remaining <= 20 ? 'bg-red-500' :
                    phdInventory.remaining <= 50 ? 'bg-amber-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(100, (phdInventory.totalUsed / phdInventory.totalStock) * 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Settings Form */}
            <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
              <h4 className="font-semibold text-brand-blue mb-4">Inventory Settings</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Stock Per Session</label>
                  <input
                    type="number"
                    min="0"
                    value={phdEditForm.totalStock}
                    onChange={e => setPhdEditForm(f => ({ ...f, totalStock: parseInt(e.target.value) || 0 }))}
                    className="w-full border-2 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Max Per Player</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={phdEditForm.perPlayerLimit}
                    onChange={e => setPhdEditForm(f => ({ ...f, perPlayerLimit: parseInt(e.target.value) || 1 }))}
                    className="w-full border-2 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none"
                  />
                </div>
              </div>
              <button
                onClick={async () => {
                  setPhdSaving(true);
                  await updateAdminPhdInventory(token, phdEditForm);
                  const data = await fetchAdminPhdInventory(token);
                  setPhdInventory(data);
                  setPhdSaving(false);
                }}
                disabled={phdSaving}
                className="mt-4 bg-brand-blue text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50"
              >
                {phdSaving ? 'Saving...' : 'Update Settings'}
              </button>
            </div>

            {/* Per-Session Breakdown */}
            {phdInventory.perSession && phdInventory.perSession.length > 0 && (
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <h4 className="font-semibold text-brand-blue mb-4">PHD Usage by Session</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-100">
                        <th className="text-left py-2 px-3 text-gray-500">Date</th>
                        <th className="text-left py-2 px-3 text-gray-500">Time</th>
                        <th className="text-left py-2 px-3 text-gray-500">Live Event / Venue</th>
                        <th className="text-right py-2 px-3 text-gray-500">PHDs Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phdInventory.perSession.map(s => (
                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">{s.date}</td>
                          <td className="py-2 px-3">{s.time}</td>
                          <td className="py-2 px-3">{s.is_special_event && s.event_title ? s.event_title : '-'}</td>
                          <td className="py-2 px-3 text-right font-bold text-brand-blue">{s.phd_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

    </>
  );
}


