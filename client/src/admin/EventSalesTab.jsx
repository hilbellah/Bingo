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
  const eventPackages = newEvent.packages?.length
    ? newEvent.packages
    : [{ name: 'General Admission', price: 0, type: 'required', max_quantity: 1, sort_order: 0, is_phd: false }];
  const hasValidEventTicket = eventPackages.some(pkg => pkg.name?.trim() && Number(pkg.price) > 0);

  const normalizeEventPackage = (pkg, index) => ({
    ...pkg,
    type: 'required',
    max_quantity: 1,
    sort_order: index,
    is_phd: false,
  });

  const updateEventPackage = (index, patch) => {
    const packages = eventPackages.map((pkg, pkgIndex) => (
      pkgIndex === index ? normalizeEventPackage({ ...pkg, ...patch }, pkgIndex) : normalizeEventPackage(pkg, pkgIndex)
    ));
    setNewEvent({
      ...newEvent,
      packages,
    });
  };

  const addEventPackage = () => {
    setNewEvent({
      ...newEvent,
      packages: [
        ...eventPackages.map(normalizeEventPackage),
        normalizeEventPackage({ name: '', price: 0, description: '' }, eventPackages.length),
      ],
    });
  };

  const removeEventPackage = (index) => {
    const packages = eventPackages
      .filter((_, pkgIndex) => pkgIndex !== index)
      .map(normalizeEventPackage);
    setNewEvent({
      ...newEvent,
      packages: packages.length ? packages : [normalizeEventPackage({ name: 'General Admission', price: 0, description: '' }, 0)],
    });
  };

  return (
    <div>
      <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
        <h3 className="font-semibold text-brand-blue mb-3">Create Live Event / Venue</h3>
        <p className="text-sm text-gray-500 mb-4">
          Concerts and shows can use multiple ticket types, no add-ons, advance sales, and 6-up template printing.
        </p>
        <div className="grid md:grid-cols-6 gap-3">
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
            <label className="block text-xs text-gray-400 mb-1">Doors Open</label>
            <input
              type="time"
              value={newEvent.doors_open_time || ''}
              onChange={e => setNewEvent({ ...newEvent, doors_open_time: e.target.value })}
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
        <div className="mt-3 max-w-xs">
          <label className="block text-xs text-gray-400 mb-1">Ticket Limit (optional)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={newEvent.ticket_limit || ''}
            onChange={e => setNewEvent({ ...newEvent, ticket_limit: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="Unlimited"
          />
          <p className="mt-1 text-xs text-gray-400">Leave blank for no limit. Active customer holds reserve tickets until they expire.</p>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-brand-blue">Ticket Types</h4>
            <button onClick={addEventPackage} className="text-xs text-brand-blue hover:underline font-medium">Add Ticket Type</button>
          </div>
          <div className="space-y-2">
            {eventPackages.map((pkg, index) => (
              <div key={index} className="grid md:grid-cols-[1fr_140px_auto] gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Ticket Name</label>
                  <input
                    value={pkg.name}
                    onChange={e => updateEventPackage(index, { name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder={index === 0 ? 'General Admission' : 'VIP / Youth / Balcony'}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Price (CAD)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pkg.price ? String(pkg.price / 100) : ''}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      updateEventPackage(index, { price: Math.round(parseFloat(val || 0) * 100) });
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="25.00"
                  />
                </div>
                <button
                  onClick={() => removeEventPackage(index)}
                  disabled={eventPackages.length <= 1}
                  className="px-3 py-2 rounded-lg text-xs text-red-600 hover:bg-red-50 disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleCreateEvent}
              disabled={!newEvent.date || !newEvent.event_title || !hasValidEventTicket || uploadingEventImage}
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
                    <th className="pb-2">Doors</th>
                    <th className="pb-2">Ticket Limit</th>
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
                      <td className="py-2 text-xs text-gray-500">{session.doors_open_time || '-'}</td>
                      <td className="py-2 text-xs text-gray-600">{session.ticket_limit || 'Unlimited'}</td>
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
              <div className="grid grid-cols-5 gap-3">
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
                  <label className="block text-xs text-gray-500 mb-1">Doors Open</label>
                  <input type="time" value={editForm.doors_open_time || ''} onChange={e => setEditForm({ ...editForm, doors_open_time: e.target.value })}
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
                <label className="block text-xs text-gray-500 mb-1">Ticket Limit (optional)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={editForm.ticket_limit || ''}
                  onChange={e => setEditForm({ ...editForm, ticket_limit: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Unlimited"
                />
                <p className="mt-1 text-xs text-gray-400">You can change this while sales are open. Leave blank for unlimited; it cannot be set below tickets already sold or on hold.</p>
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
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full">
            <h3 className="font-semibold text-brand-blue mb-4">Edit Live Event / Venue Ticket Types</h3>
            <div className="space-y-3">
              {(sessionPkgList.length ? sessionPkgList : [{ name: 'General Admission', price: 0 }]).map((pkg, i) => (
              <div key={i} className="grid md:grid-cols-[1fr_140px_auto] gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Ticket Name</label>
                  <input value={pkg.name} onChange={e => {
                    const list = [...sessionPkgList];
                    list[i] = { ...(list[i] || pkg), name: e.target.value, type: 'required', max_quantity: 1, sort_order: i, is_phd: false };
                    setSessionPkgList(list);
                  }} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Price (CAD)</label>
                  <input type="text" inputMode="decimal" value={pkg.price ? pkg.price / 100 : ''} onChange={e => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    const list = [...sessionPkgList];
                    list[i] = { ...(list[i] || pkg), price: Math.round(parseFloat(val || 0) * 100), type: 'required', max_quantity: 1, sort_order: i, is_phd: false };
                    setSessionPkgList(list);
                  }} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <button
                  onClick={() => setSessionPkgList((sessionPkgList.length ? sessionPkgList : [{ name: 'General Admission', price: 0 }]).filter((_, idx) => idx !== i).map((item, idx) => ({ ...item, type: 'required', max_quantity: 1, sort_order: idx, is_phd: false })))}
                  disabled={(sessionPkgList.length || 1) <= 1}
                  className="px-3 py-2 rounded-lg text-xs text-red-600 hover:bg-red-50 disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            ))}
            </div>
            <button
              onClick={() => setSessionPkgList([...(sessionPkgList.length ? sessionPkgList : [{ name: 'General Admission', price: 0 }]), { name: '', price: 0, type: 'required', max_quantity: 1, sort_order: sessionPkgList.length || 1, is_phd: false, description: '' }])}
              className="mt-3 text-xs text-brand-blue hover:underline font-medium"
            >
              Add Ticket Type
            </button>
            <div className="flex gap-3 pt-5">
              <button onClick={handleSaveSessionPkgs} className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90">
                Save Ticket Types
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
