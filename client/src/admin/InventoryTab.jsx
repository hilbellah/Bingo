import React, { useEffect, useState } from 'react';
import { useAdminDashboard } from './AdminDashboardContext';
import { fetchAdminPhdInventory, updateAdminPhdInventory, updateAdminSessionPhdInventory } from '../api';
import { confirmAdminAction } from './adminConfirm';

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
  const [sessionStockDrafts, setSessionStockDrafts] = useState({});
  const [sessionStockSaving, setSessionStockSaving] = useState(null);
  const [sessionStockError, setSessionStockError] = useState('');

  useEffect(() => {
    if (!phdInventory?.perSession) return;
    setSessionStockDrafts(Object.fromEntries(
      phdInventory.perSession.map(session => [session.id, String(session.totalStock ?? phdInventory.totalStock ?? 0)])
    ));
  }, [phdInventory]);

  const refreshInventory = async () => {
    const data = await fetchAdminPhdInventory(token);
    setPhdInventory(data);
  };

  const saveSessionStock = async (sessionId) => {
    const totalStock = Number(sessionStockDrafts[sessionId]);
    if (!Number.isFinite(totalStock) || totalStock < 0) {
      setSessionStockError('Session stock must be 0 or higher.');
      return;
    }

    const session = phdInventory?.perSession?.find(s => s.id === sessionId);
    if (!confirmAdminAction({
      action: 'Save PHD stock for this session',
      details: [
        session ? `Session: ${session.date} at ${session.time}` : '',
        `Stock for this session: ${totalStock}`,
      ],
      warning: 'This changes how many PHD units can be sold for this session.',
    })) return;

    setSessionStockSaving(sessionId);
    setSessionStockError('');
    try {
      await updateAdminSessionPhdInventory(token, sessionId, { totalStock });
      await refreshInventory();
    } catch (err) {
      setSessionStockError(err.message || 'Failed to update session stock.');
    } finally {
      setSessionStockSaving(null);
    }
  };

  const resetSessionStock = async (sessionId) => {
    const session = phdInventory?.perSession?.find(s => s.id === sessionId);
    if (!confirmAdminAction({
      action: 'Use default PHD stock for this session',
      details: [
        session ? `Session: ${session.date} at ${session.time}` : '',
        session ? `Default stock: ${session.defaultStock}` : '',
      ],
      warning: 'This removes the custom stock override for this session.',
    })) return;

    setSessionStockSaving(sessionId);
    setSessionStockError('');
    try {
      await updateAdminSessionPhdInventory(token, sessionId, { totalStock: null });
      await refreshInventory();
    } catch (err) {
      setSessionStockError(err.message || 'Failed to reset session stock.');
    } finally {
      setSessionStockSaving(null);
    }
  };

  return (
    <>
        {/* PHD INVENTORY TAB */}
        {tab === 'inventory' && phdInventory && (
          <div className="max-w-6xl">
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
                  if (!confirmAdminAction({
                    action: 'Update PHD inventory settings',
                    details: [
                      `Stock per session: ${phdEditForm.totalStock}`,
                      `Max per player: ${phdEditForm.perPlayerLimit}`,
                    ],
                    warning: 'This affects PHD availability and customer add-on limits.',
                  })) return;
                  setPhdSaving(true);
                  await updateAdminPhdInventory(token, phdEditForm);
                  await refreshInventory();
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
                <div className="flex flex-col gap-1 mb-4 sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="font-semibold text-brand-blue">PHD Stock by Session</h4>
                  <p className="text-xs text-gray-500">Use default removes a custom stock override.</p>
                </div>
                {sessionStockError && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {sessionStockError}
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-100">
                        <th className="text-left py-2 px-3 text-gray-500">Date</th>
                        <th className="text-left py-2 px-3 text-gray-500">Time</th>
                        <th className="text-left py-2 px-3 text-gray-500">Live Event / Venue</th>
                        <th className="text-right py-2 px-3 text-gray-500">PHDs Used</th>
                        <th className="text-right py-2 px-3 text-gray-500">Available</th>
                        <th className="text-left py-2 px-3 text-gray-500">Stock for This Session</th>
                        <th className="text-right py-2 px-3 text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phdInventory.perSession.map(s => (
                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">{s.date}</td>
                          <td className="py-2 px-3">{s.time}</td>
                          <td className="py-2 px-3">{s.is_special_event && s.event_title ? s.event_title : '-'}</td>
                          <td className="py-2 px-3 text-right font-bold text-brand-blue">{s.phd_count}</td>
                          <td className={`py-2 px-3 text-right font-bold ${s.remaining <= 10 ? 'text-red-600' : 'text-green-700'}`}>{s.remaining}</td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={sessionStockDrafts[s.id] ?? ''}
                                onChange={e => setSessionStockDrafts(drafts => ({ ...drafts, [s.id]: e.target.value }))}
                                className="w-24 border rounded-lg px-3 py-2 text-right focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none"
                              />
                              {s.hasSessionStockOverride ? (
                                <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Custom</span>
                              ) : (
                                <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500">Default {s.defaultStock}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => saveSessionStock(s.id)}
                                disabled={sessionStockSaving === s.id}
                                className="rounded-lg bg-brand-blue px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {sessionStockSaving === s.id ? 'Saving...' : 'Save'}
                              </button>
                              {s.hasSessionStockOverride && (
                                <button
                                  type="button"
                                  onClick={() => resetSessionStock(s.id)}
                                  disabled={sessionStockSaving === s.id}
                                  className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                                >
                                  Use Default
                                </button>
                              )}
                            </div>
                          </td>
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


