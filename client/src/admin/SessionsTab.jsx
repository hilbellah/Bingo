import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

export default function SessionsTab() {
  const {
    tab,
    sessions,
    newSession,
    setNewSession,
    handleCreateSession,
    editingSession,
    setEditingSession,
    editForm,
    setEditForm,
    handleStartEdit,
    handleSaveEdit,
    handleToggleSession,
    handleEditSessionPkgs,
    handleDeleteSession,
    editingSessionPkgs,
    sessionPkgList,
    setSessionPkgList,
    handleSaveSessionPkgs,
    packages,
  } = useAdminDashboard();

  return (
    <>
        {/* SESSIONS TAB */}
        {tab === 'sessions' && (
          <div>
            <div className="bg-blue-50 rounded-xl p-4 shadow-sm mb-4 border border-blue-200">
              <div className="flex items-center gap-3">
                <div className="text-2xl">📅</div>
                <div>
                  <h3 className="font-semibold text-brand-blue text-sm">Auto-Schedule Active</h3>
                  <p className="text-xs text-gray-600">Regular bingo sessions (Tue–Sun) are generated automatically. Each new week opens Monday morning. Use the form below only for special events.</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
              <h3 className="font-semibold text-brand-blue mb-3">Add Special Event</h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date</label>
                  <div className="flex gap-1 items-center">
                    <select value={newSession.date ? new Date(newSession.date + 'T12:00:00').getMonth() : ''} onChange={e => {
                      const m = parseInt(e.target.value);
                      const prev = newSession.date ? new Date(newSession.date + 'T12:00:00') : new Date();
                      prev.setMonth(m);
                      const y = prev.getFullYear();
                      const d = Math.min(prev.getDate(), new Date(y, m + 1, 0).getDate());
                      setNewSession({...newSession, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                    }} className="px-2 py-2 border rounded-lg text-sm">
                      <option value="" disabled>Month</option>
                      {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                      ))}
                    </select>
                    <select value={newSession.date ? new Date(newSession.date + 'T12:00:00').getDate() : ''} onChange={e => {
                      const d = parseInt(e.target.value);
                      const prev = newSession.date ? new Date(newSession.date + 'T12:00:00') : new Date();
                      const y = prev.getFullYear();
                      const m = prev.getMonth();
                      setNewSession({...newSession, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                    }} className="px-2 py-2 border rounded-lg text-sm">
                      <option value="" disabled>Day</option>
                      {Array.from({length: 31}, (_, i) => (
                        <option key={i+1} value={i+1}>{i+1}</option>
                      ))}
                    </select>
                    <select value={newSession.date ? new Date(newSession.date + 'T12:00:00').getFullYear() : ''} onChange={e => {
                      const y = parseInt(e.target.value);
                      const prev = newSession.date ? new Date(newSession.date + 'T12:00:00') : new Date();
                      const m = prev.getMonth();
                      const d = Math.min(prev.getDate(), new Date(y, m + 1, 0).getDate());
                      setNewSession({...newSession, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                    }} className="px-2 py-2 border rounded-lg text-sm">
                      <option value="" disabled>Year</option>
                      {[2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Time</label>
                  <input type="time" value={newSession.time} onChange={e => setNewSession({...newSession, time: e.target.value})}
                    className="px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Cutoff</label>
                  <input type="time" value={newSession.cutoff_time} onChange={e => setNewSession({...newSession, cutoff_time: e.target.value})}
                    className="px-3 py-2 border rounded-lg text-sm" />
                </div>
                <button onClick={handleCreateSession}
                  className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90">
                  {newSession.is_special_event ? 'Add Special Event' : 'Add Session'}
                </button>
              </div>

              {/* Special Event Toggle */}
              <div className="mt-4 border-t pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newSession.is_special_event}
                    onChange={e => setNewSession({...newSession, is_special_event: e.target.checked})}
                    className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                  <span className="text-sm font-medium text-gray-700">Special Event</span>
                </label>

                {newSession.is_special_event && (
                  <div className="mt-3 space-y-3 bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Event Title</label>
                      <input value={newSession.event_title} onChange={e => setNewSession({...newSession, event_title: e.target.value})}
                        className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Special Bingo Event 1" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                      <textarea value={newSession.event_description} onChange={e => setNewSession({...newSession, event_description: e.target.value})}
                        className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Event details..." />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-2">Event Packages</label>
                      {newSession.packages.map((pkg, i) => (
                        <div key={i} className="flex gap-2 items-center mb-2">
                          <input value={pkg.name} onChange={e => {
                            const pkgs = [...newSession.packages];
                            pkgs[i] = {...pkgs[i], name: e.target.value};
                            setNewSession({...newSession, packages: pkgs});
                          }} className="flex-1 px-2 py-1.5 border rounded text-sm" placeholder="Package name" />
                          <div className="relative w-24">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">USD</span>
                            <input type="text" inputMode="decimal" value={(pkg.price / 100).toFixed(2)} onChange={e => {
                              const val = e.target.value.replace(/[^0-9.]/g, '');
                              const pkgs = [...newSession.packages];
                              pkgs[i] = {...pkgs[i], price: Math.round(parseFloat(val || 0) * 100)};
                              setNewSession({...newSession, packages: pkgs});
                            }} className="w-full pl-9 pr-2 py-1.5 border rounded text-sm" placeholder="0.00" />
                          </div>
                          <select value={pkg.type} onChange={e => {
                            const pkgs = [...newSession.packages];
                            pkgs[i] = {...pkgs[i], type: e.target.value};
                            setNewSession({...newSession, packages: pkgs});
                          }} className="px-2 py-1.5 border rounded text-sm">
                            <option value="required">Required</option>
                            <option value="optional">Add-on</option>
                          </select>
                          <input type="number" value={pkg.max_quantity} onChange={e => {
                            const pkgs = [...newSession.packages];
                            pkgs[i] = {...pkgs[i], max_quantity: parseInt(e.target.value) || 1};
                            setNewSession({...newSession, packages: pkgs});
                          }} className="w-16 px-2 py-1.5 border rounded text-sm" placeholder="Max" min="1" />
                          <label className="flex items-center gap-1 text-xs text-purple-600" title="PHD (Handheld Device)">
                            <input type="checkbox" checked={!!pkg.is_phd} onChange={e => {
                              const pkgs = [...newSession.packages];
                              pkgs[i] = {...pkgs[i], is_phd: e.target.checked};
                              setNewSession({...newSession, packages: pkgs});
                            }} className="rounded" />
                            PHD
                          </label>
                          <button onClick={() => {
                            const pkgs = newSession.packages.filter((_, j) => j !== i);
                            setNewSession({...newSession, packages: pkgs});
                          }} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                        </div>
                      ))}
                      <button onClick={() => setNewSession({...newSession, packages: [...newSession.packages, { name: '', price: 0, type: 'required', max_quantity: 1, sort_order: newSession.packages.length, is_phd: false }]})}
                        className="text-xs text-amber-600 hover:text-amber-800 font-medium">
                        + Add Package
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">All Sessions</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Cutoff</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.id} className={`border-b border-gray-50 ${s.is_special_event ? 'bg-amber-50/50' : ''}`}>
                        <td className="py-2 font-medium">{s.date}</td>
                        <td className="py-2">{s.time}</td>
                        <td className="py-2">{s.cutoff_time}</td>
                        <td className="py-2">
                          {s.is_special_event ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 font-medium">
                              {s.event_title || 'Special Event'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600">Auto</span>
                          )}
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${s.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {s.is_available ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-2 flex gap-2">
                          <button onClick={() => handleStartEdit(s)}
                            className="text-xs text-brand-blue hover:underline font-medium">
                            Edit
                          </button>
                          <button onClick={() => handleToggleSession(s.id, s.is_available)}
                            className="text-xs text-brand-blue hover:underline">
                            {s.is_available ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => handleEditSessionPkgs(s.id)}
                            className="text-xs text-amber-600 hover:underline">
                            Packages
                          </button>
                          <button onClick={() => handleDeleteSession(s.id, s.date, s.time)}
                            className="text-xs text-red-500 hover:underline font-medium">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Edit Session Modal */}
            {editingSession && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
                  <h3 className="font-semibold text-brand-blue mb-4">Edit Session</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Date</label>
                        <div className="flex gap-1">
                          <select value={editForm.date ? new Date(editForm.date + 'T12:00:00').getMonth() : ''} onChange={e => {
                            const m = parseInt(e.target.value);
                            const prev = editForm.date ? new Date(editForm.date + 'T12:00:00') : new Date();
                            prev.setMonth(m);
                            const y = prev.getFullYear();
                            const d = Math.min(prev.getDate(), new Date(y, m + 1, 0).getDate());
                            setEditForm({...editForm, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                          }} className="px-1 py-2 border rounded-lg text-sm">
                            <option value="" disabled>Mon</option>
                            {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                              <option key={i} value={i}>{m}</option>
                            ))}
                          </select>
                          <select value={editForm.date ? new Date(editForm.date + 'T12:00:00').getDate() : ''} onChange={e => {
                            const d = parseInt(e.target.value);
                            const prev = editForm.date ? new Date(editForm.date + 'T12:00:00') : new Date();
                            const y = prev.getFullYear();
                            const m = prev.getMonth();
                            setEditForm({...editForm, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                          }} className="px-1 py-2 border rounded-lg text-sm">
                            <option value="" disabled>Day</option>
                            {Array.from({length: 31}, (_, i) => (
                              <option key={i+1} value={i+1}>{i+1}</option>
                            ))}
                          </select>
                          <select value={editForm.date ? new Date(editForm.date + 'T12:00:00').getFullYear() : ''} onChange={e => {
                            const y = parseInt(e.target.value);
                            const prev = editForm.date ? new Date(editForm.date + 'T12:00:00') : new Date();
                            const m = prev.getMonth();
                            const d = Math.min(prev.getDate(), new Date(y, m + 1, 0).getDate());
                            setEditForm({...editForm, date: `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
                          }} className="px-1 py-2 border rounded-lg text-sm">
                            <option value="" disabled>Year</option>
                            {[2025, 2026, 2027, 2028].map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Time</label>
                        <input type="time" value={editForm.time} onChange={e => setEditForm({...editForm, time: e.target.value})}
                          className="w-full px-3 py-2 border rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Cutoff</label>
                        <input type="time" value={editForm.cutoff_time} onChange={e => setEditForm({...editForm, cutoff_time: e.target.value})}
                          className="w-full px-3 py-2 border rounded-lg text-sm" />
                      </div>
                    </div>

                    <div className="border-t pt-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editForm.is_special_event}
                          onChange={e => setEditForm({...editForm, is_special_event: e.target.checked})}
                          className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                        <span className="text-sm font-medium text-gray-700">Special Event</span>
                      </label>

                      {editForm.is_special_event && (
                        <div className="mt-3 space-y-3 bg-amber-50 rounded-lg p-4 border border-amber-200">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Event Title</label>
                            <input value={editForm.event_title} onChange={e => setEditForm({...editForm, event_title: e.target.value})}
                              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Special Bingo Event 1" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                            <textarea value={editForm.event_description} onChange={e => setEditForm({...editForm, event_description: e.target.value})}
                              className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Event details..." />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button onClick={handleSaveEdit}
                        className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90">
                        Save Changes
                      </button>
                      <button onClick={() => setEditingSession(null)}
                        className="text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Session Packages Editor Modal */}
            {editingSessionPkgs && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
                  <h3 className="font-semibold text-brand-blue mb-4">Edit Session Packages</h3>
                  {sessionPkgList.map((pkg, i) => (
                    <div key={i} className="flex gap-2 items-center mb-2">
                      <input value={pkg.name} onChange={e => {
                        const list = [...sessionPkgList];
                        list[i] = {...list[i], name: e.target.value};
                        setSessionPkgList(list);
                      }} className="flex-1 px-2 py-1.5 border rounded text-sm" placeholder="Package name" />
                      <input type="text" inputMode="decimal" value={pkg.price / 100} onChange={e => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        const list = [...sessionPkgList];
                        list[i] = {...list[i], price: Math.round(parseFloat(val || 0) * 100)};
                        setSessionPkgList(list);
                      }} className="w-20 px-2 py-1.5 border rounded text-sm" placeholder="$" />
                      <select value={pkg.type} onChange={e => {
                        const list = [...sessionPkgList];
                        list[i] = {...list[i], type: e.target.value};
                        setSessionPkgList(list);
                      }} className="px-2 py-1.5 border rounded text-sm">
                        <option value="required">Required</option>
                        <option value="optional">Add-on</option>
                      </select>
                      <input type="number" value={pkg.max_quantity} onChange={e => {
                        const list = [...sessionPkgList];
                        list[i] = {...list[i], max_quantity: parseInt(e.target.value) || 1};
                        setSessionPkgList(list);
                      }} className="w-16 px-2 py-1.5 border rounded text-sm" min="1" />
                      <label className="flex items-center gap-1 text-xs text-purple-600" title="PHD (Handheld Device)">
                        <input type="checkbox" checked={!!pkg.is_phd} onChange={e => {
                          const list = [...sessionPkgList];
                          list[i] = {...list[i], is_phd: e.target.checked};
                          setSessionPkgList(list);
                        }} className="rounded" />
                        PHD
                      </label>
                      <button onClick={() => setSessionPkgList(sessionPkgList.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 text-sm">X</button>
                    </div>
                  ))}
                  <button onClick={() => setSessionPkgList([...sessionPkgList, { name: '', price: 0, type: 'required', max_quantity: 1, sort_order: sessionPkgList.length, is_phd: false }])}
                    className="text-xs text-brand-blue hover:underline mb-4 block">
                    + Add Package
                  </button>
                  <div className="flex gap-3">
                    <button onClick={handleSaveSessionPkgs}
                      className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90">
                      Save Packages
                    </button>
                    <button onClick={() => { setEditingSessionPkgs(null); setSessionPkgList([]); }}
                      className="text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

    </>
  );
}


