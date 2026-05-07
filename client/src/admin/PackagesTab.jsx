import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

export default function PackagesTab() {
  const {
    tab,
    packages,
    newPackage,
    setNewPackage,
    handleCreatePackage,
    handleTogglePackage,
    editingPackage,
    setEditingPackage,
    handleStartEditPackage,
    handleCancelEditPackage,
    handleSaveEditPackage,
    handleDeletePackage,
    formatPrice,
  } = useAdminDashboard();

  return (
    <>
        {/* PACKAGES TAB */}
        {tab === 'packages' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
              <h3 className="font-semibold text-brand-blue mb-3">Add Ticket Package</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Name</label>
                    <input value={newPackage.name} onChange={e => setNewPackage({...newPackage, name: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. 6-up Admission Book" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Price ($)</label>
                    <input type="text" inputMode="decimal" value={newPackage.price} onChange={e => setNewPackage({...newPackage, price: e.target.value.replace(/[^0-9.]/g, '')})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="5.00" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Type</label>
                    <select value={newPackage.type} onChange={e => setNewPackage({...newPackage, type: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm">
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Max Qty</label>
                    <input type="number" min="1" value={newPackage.max_quantity} onChange={e => setNewPackage({...newPackage, max_quantity: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Sort Order</label>
                    <input type="number" min="0" value={newPackage.sort_order} onChange={e => setNewPackage({...newPackage, sort_order: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newPackage.is_phd} onChange={e => setNewPackage({...newPackage, is_phd: e.target.checked})}
                    className="rounded" />
                  <span className="text-gray-600">This is a PHD (Personal Handheld Device)</span>
                </label>
                <button onClick={handleCreatePackage}
                  disabled={!newPackage.name || !newPackage.price}
                  className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40">
                  Add Package
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">Ticket Packages</h3>
              <p className="text-xs text-gray-500 mb-3">
                Edit a package to update its name, price, type, qty, sort order, or PHD flag.
                Disable hides it from new bookings while keeping sales history. Delete only
                works for packages that have never been used in a booking — otherwise the
                system will tell you to disable it instead.
              </p>
              <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Price</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Max Qty</th>
                  <th className="pb-2">Sort</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right pr-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packages.map(p => {
                  const isEditing = editingPackage && editingPackage.id === p.id;
                  if (isEditing) {
                    // Inline edit row — replaces the normal row while editing
                    return (
                      <tr key={p.id} className="border-b border-gray-50 bg-amber-50/40">
                        <td className="py-2 pr-2 align-top">
                          <input
                            value={editingPackage.name}
                            onChange={e => setEditingPackage({ ...editingPackage, name: e.target.value })}
                            className="w-full px-2 py-1 border rounded text-sm"
                            placeholder="Name"
                          />
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 mt-1.5">
                            <input
                              type="checkbox"
                              checked={editingPackage.is_phd}
                              onChange={e => setEditingPackage({ ...editingPackage, is_phd: e.target.checked })}
                            />
                            PHD device
                          </label>
                        </td>
                        <td className="py-2 pr-2 align-top">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editingPackage.price}
                            onChange={e => setEditingPackage({ ...editingPackage, price: e.target.value.replace(/[^0-9.]/g, '') })}
                            className="w-20 px-2 py-1 border rounded text-sm"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="py-2 pr-2 align-top">
                          <select
                            value={editingPackage.type}
                            onChange={e => setEditingPackage({ ...editingPackage, type: e.target.value })}
                            className="px-2 py-1 border rounded text-sm"
                          >
                            <option value="required">Required</option>
                            <option value="optional">Optional</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2 align-top">
                          <input
                            type="number"
                            min="1"
                            value={editingPackage.max_quantity}
                            onChange={e => setEditingPackage({ ...editingPackage, max_quantity: e.target.value })}
                            className="w-16 px-2 py-1 border rounded text-sm"
                          />
                        </td>
                        <td className="py-2 pr-2 align-top">
                          <input
                            type="number"
                            min="0"
                            value={editingPackage.sort_order}
                            onChange={e => setEditingPackage({ ...editingPackage, sort_order: e.target.value })}
                            className="w-16 px-2 py-1 border rounded text-sm"
                          />
                        </td>
                        <td className="py-2 pr-2 align-top">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 italic">editing…</span>
                        </td>
                        <td className="py-2 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={handleSaveEditPackage}
                              className="text-xs px-2 py-1 rounded bg-brand-gold text-white font-medium hover:bg-brand-gold/90"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEditPackage}
                              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // Normal display row
                  return (
                    <tr key={p.id} className="border-b border-gray-50">
                      <td className="py-2 font-medium">
                        {p.name}
                        {p.is_phd ? <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">PHD</span> : null}
                      </td>
                      <td className="py-2">{formatPrice(p.price)}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${p.type === 'required' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {p.type}
                        </span>
                      </td>
                      <td className="py-2">{p.max_quantity}</td>
                      <td className="py-2 text-gray-500">{p.sort_order ?? 0}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {p.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => handleStartEditPackage(p)}
                            className="text-xs text-brand-blue hover:underline"
                            disabled={!!editingPackage}
                            title={editingPackage ? 'Finish or cancel the current edit first' : 'Edit this package'}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleTogglePackage(p.id, p.is_active)}
                            className="text-xs text-brand-blue hover:underline"
                          >
                            {p.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => handleDeletePackage(p)}
                            className="text-xs text-red-600 hover:underline"
                            title="Delete (only allowed if never used in a booking)"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

    </>
  );
}


