import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

export default function EventSalesTab() {
  const {
    tab,
    sessions,
    newEvent,
    setNewEvent,
    eventImageFile,
    setEventImageFile,
    eventImagePreview,
    setEventImagePreview,
    handleCreateEvent,
    bookingSales,
    handleSalesDrilldown,
    handleStartEdit,
    editingSession,
    setEditingSession,
    editForm,
    setEditForm,
    editImageFile,
    setEditImageFile,
    editImagePreview,
    setEditImagePreview,
    uploadingEventImage,
    handleSaveEdit,
    handleToggleSession,
    handleEditSessionPkgs,
    editingSessionPkgs,
    setEditingSessionPkgs,
    sessionPkgList,
    setSessionPkgList,
    handleSaveSessionPkgs,
    handleDeleteSession,
    formatPrice,
  } = useAdminDashboard();

  if (tab !== 'events') return null;

  const eventSessions = sessions.filter(session => session.session_type === 'event');
  const eventSales = bookingSales.filter(sale => sale.sessionType === 'event');
  const eventPackage = newEvent.packages[0] || { name: 'Live Event / Venue Admission', price: 0, type: 'required', max_quantity: 1, sort_order: 0, is_phd: false };

  const updatePackage = (patch) => {
    setNewEvent({
      ...newEvent,
      packages: [{ ...eventPackage, ...patch, type: 'required', max_quantity: 1, sort_order: 0, is_phd: false }],
    });
  };

  return (
    <div>
      <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-brand-blue mb-3">Create Live Event / Venue</h3>
        <p className="text-sm text-gray-500 mb-4">
          Concerts and shows use one set admission price, no add-ons, advance sales, and 6-up template printing.
        </p>
        <div className="grid md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Live Event / Venue Name</label>
            <input
              value={newEvent.event_title}
              onChange={e => setNewEvent({ ...newEvent, event_title: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="Concert or show name"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Date</label>
            <input
              type="date"
              value={newEvent.date}
              onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Time</label>
            <input
              type="time"
              value={newEvent.time}
              onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Sales Cutoff Date</label>
            <input
              type="date"
              value={newEvent.sales_cutoff_date || newEvent.date}
              onChange={e => setNewEvent({ ...newEvent, sales_cutoff_date: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Sales Cutoff Time</label>
            <input
              type="time"
              value={newEvent.cutoff_time}
              onChange={e => setNewEvent({ ...newEvent, cutoff_time: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Ticket Name</label>
            <input
              value={eventPackage.name}
              onChange={e => updatePackage({ name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="Live Event / Venue Admission"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Price (CAD)</label>
            <input
              type="text"
              inputMode="decimal"
              value={eventPackage.price ? String(eventPackage.price / 100) : ''}
              onChange={e => {
                const val = e.target.value.replace(/[^0-9.]/g, '');
                updatePackage({ price: Math.round(parseFloat(val || 0) * 100) });
              }}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="25.00"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreateEvent}
              disabled={!newEvent.date || !newEvent.event_title || !eventPackage.price || uploadingEventImage}
              className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40"
            >
              {uploadingEventImage ? 'Uploading...' : 'Add Live Event / Venue'}
            </button>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs text-gray-400 mb-1">Event Image (optional)</label>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm border transition-colors">
              {eventImageFile ? 'Change Image' : 'Upload Image'}
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const file = e.target.files[0];
                if (file) {
                  setEventImageFile(file);
                  setEventImagePreview(URL.createObjectURL(file));
                  setNewEvent({ ...newEvent, event_image_url: '' });
                }
              }} />
            </label>
            <span className="text-gray-300">or</span>
            <input value={newEvent.event_image_url || ''} onChange={e => {
              setNewEvent({ ...newEvent, event_image_url: e.target.value });
              setEventImageFile(null);
              setEventImagePreview(null);
            }} className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Paste image URL..." />
          </div>
          {(eventImagePreview || newEvent.event_image_url) && (
            <div className="mt-2 relative inline-block">
              <img src={eventImagePreview || newEvent.event_image_url} alt="Live event preview"
                className="h-20 w-32 rounded-lg object-cover border" />
              <button onClick={() => {
                setEventImageFile(null);
                setEventImagePreview(null);
                setNewEvent({ ...newEvent, event_image_url: '' });
              }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">&times;</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-brand-blue mb-3">Live Event / Venue Sessions</h3>
          {eventSessions.length === 0 ? (
            <p className="text-gray-400 text-sm py-6 text-center">No live events or venues created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b">
                    <th className="pb-2">Live Event / Venue</th>
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {eventSessions.map(session => (
                    <tr key={session.id} className="border-b border-gray-50">
                      <td className="py-2 font-medium text-gray-800">{session.event_title || 'Live Event / Venue'}</td>
                      <td className="py-2">{session.date}</td>
                      <td className="py-2">{session.time}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${session.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {session.is_available ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-2 flex gap-2">
                        <button onClick={() => handleStartEdit(session)} className="text-xs text-brand-blue hover:underline font-medium">Edit</button>
                        <button onClick={() => handleStartEdit(session)} className="text-xs text-blue-600 hover:underline font-semibold">Move Date</button>
                        <button onClick={() => handleToggleSession(session.id, session.is_available)} className="text-xs text-brand-blue hover:underline">
                          {session.is_available ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => handleEditSessionPkgs(session.id)} className="text-xs text-amber-600 hover:underline">Price</button>
                        <button onClick={() => handleDeleteSession(session.id, session.date, session.time)} className="text-xs text-red-500 hover:underline font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-brand-blue mb-3">Live Event / Venue Sales</h3>
          {eventSales.length === 0 ? (
            <p className="text-gray-400 text-sm py-6 text-center">No live event or venue sales yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="pb-2">Live Event / Venue</th>
                  <th className="pb-2 text-center">Tickets</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {eventSales.map(sale => (
                  <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2.5 font-medium text-gray-800">{sale.description}</td>
                    <td className="py-2.5 text-center">
                      {sale.quantity > 0 ? (
                        <button onClick={() => handleSalesDrilldown(sale)} className="text-brand-blue underline font-semibold">{sale.quantity}</button>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-medium text-gray-800">{sale.totalFormatted}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td className="py-3 font-semibold text-brand-blue">Total</td>
                  <td className="py-3 text-center font-bold text-brand-blue">{eventSales.reduce((sum, s) => sum + s.quantity, 0)}</td>
                  <td className="py-3 text-right font-bold text-brand-gold">{formatPrice(eventSales.reduce((sum, s) => sum + s.totalAmount, 0))}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {editingSession && (editingSession.session_type === 'event') && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <h3 className="font-semibold text-brand-blue mb-2">Edit / Move Live Event</h3>
            <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Change the date or time here to move this event. Existing ticket sales and bookings stay attached.
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Live Event / Venue Name</label>
                <input
                  value={editForm.event_title}
                  onChange={e => setEditForm({ ...editForm, event_title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Time</label>
                  <input type="time" value={editForm.time} onChange={e => setEditForm({ ...editForm, time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cutoff Date</label>
                  <input type="date" value={editForm.sales_cutoff_date || editForm.date} onChange={e => setEditForm({ ...editForm, sales_cutoff_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cutoff Time</label>
                  <input type="time" value={editForm.cutoff_time} onChange={e => setEditForm({ ...editForm, cutoff_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea value={editForm.event_description} onChange={e => setEditForm({ ...editForm, event_description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Event Image (optional)</label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm border transition-colors">
                    {editImageFile ? 'Change Image' : 'Upload Image'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => {
                      const file = e.target.files[0];
                      if (file) {
                        setEditImageFile(file);
                        setEditImagePreview(URL.createObjectURL(file));
                        setEditForm({ ...editForm, event_image_url: '' });
                      }
                    }} />
                  </label>
                  <span className="text-gray-300">or</span>
                  <input value={editForm.event_image_url || ''} onChange={e => {
                    setEditForm({ ...editForm, event_image_url: e.target.value });
                    setEditImageFile(null);
                    setEditImagePreview(null);
                  }} className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Paste image URL..." />
                </div>
                {(editImagePreview || editForm.event_image_url) && (
                  <div className="mt-2 relative inline-block">
                    <img src={editImagePreview || editForm.event_image_url} alt="Event preview"
                      className="h-20 w-32 rounded-lg object-cover border" />
                    <button onClick={() => {
                      setEditImageFile(null);
                      setEditImagePreview(null);
                      setEditForm({ ...editForm, event_image_url: '' });
                    }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">&times;</button>
                  </div>
                )}
              </div>
              <label className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.notify_reschedule !== false}
                  onChange={e => setEditForm({ ...editForm, notify_reschedule: e.target.checked })}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-700">Email customers if date or time changes</span>
                  <span className="block text-xs text-gray-500">Existing ticket sales and bookings stay attached to this event.</span>
                </span>
              </label>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSaveEdit} disabled={uploadingEventImage} className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40">
                  {uploadingEventImage ? 'Uploading...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditingSession(null)} className="text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingSessionPkgs && sessions.find(session => session.id === editingSessionPkgs)?.session_type === 'event' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="font-semibold text-brand-blue mb-4">Edit Live Event / Venue Price</h3>
            {(sessionPkgList.length ? sessionPkgList : [{ name: 'Live Event / Venue Admission', price: 0 }]).slice(0, 1).map((pkg, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Ticket Name</label>
                  <input value={pkg.name} onChange={e => {
                    const list = [...sessionPkgList];
                    list[0] = { ...(list[0] || pkg), name: e.target.value, type: 'required', max_quantity: 1, sort_order: 0, is_phd: false };
                    setSessionPkgList(list);
                  }} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Price (CAD)</label>
                  <input type="text" inputMode="decimal" value={pkg.price ? pkg.price / 100 : ''} onChange={e => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    const list = [...sessionPkgList];
                    list[0] = { ...(list[0] || pkg), price: Math.round(parseFloat(val || 0) * 100), type: 'required', max_quantity: 1, sort_order: 0, is_phd: false };
                    setSessionPkgList(list);
                  }} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
            ))}
            <div className="flex gap-3 pt-5">
              <button onClick={handleSaveSessionPkgs} className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90">
                Save Price
              </button>
              <button onClick={() => { setEditingSessionPkgs(null); setSessionPkgList([]); }} className="text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
