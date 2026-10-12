import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';
import WebsiteListingFields from './WebsiteListingFields';

// Edit Session pop-up on Manage Sessions. Moved verbatim from SessionsTab;
// shared state comes from the dashboard context, the tab's date-picker
// helpers are passed in.
export default function EditSessionModal({ datePickerYears, daysInSelectedMonth }) {
  const {
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
    editFlyerFile,
    editFlyerPreview,
    handleEditFlyerFileChange,
  } = useAdminDashboard();
  if (!editingSession) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
        <h3 className="font-semibold text-brand-blue mb-2">Edit / Move Session</h3>
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Change the date or time here to move this session. Existing bookings, seats, and ticket references stay attached.
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-3">
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
                  {Array.from({length: daysInSelectedMonth(editForm.date)}, (_, i) => (
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
                  {datePickerYears.map(y => (
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
            {editForm.is_special_event && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Doors Open</label>
                <input type="time" value={editForm.doors_open_time || ''} onChange={e => setEditForm({...editForm, doors_open_time: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            )}
            {editForm.is_special_event && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cutoff Date</label>
                <input type="date" value={editForm.sales_cutoff_date || editForm.date} onChange={e => setEditForm({...editForm, sales_cutoff_date: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cutoff Time</label>
              <input type="time" value={editForm.cutoff_time} onChange={e => setEditForm({...editForm, cutoff_time: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>

          <div className="border-t pt-3">
            <label className="flex items-start gap-2 mb-3 rounded-lg bg-blue-50 border border-blue-100 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.notify_reschedule !== false}
                onChange={e => setEditForm({ ...editForm, notify_reschedule: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
              />
              <span>
                <span className="block text-sm font-medium text-gray-700">Email customers if date or time changes</span>
                <span className="block text-xs text-gray-500">Bookings, seats, ticket references, and sales stay on this same session.</span>
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editForm.is_special_event}
                onChange={e => {
                  const checked = e.target.checked;
                  setEditForm({
                    ...editForm,
                    is_special_event: checked,
                    // handleSaveEdit derives is_special_event from
                    // session_type, so the type must follow the
                    // checkbox or unchecking is silently reverted.
                    session_type: editForm.session_type === 'event'
                      ? 'event'
                      : (checked ? 'special_bingo' : 'regular_bingo'),
                  });
                }}
                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
              <span className="text-sm font-medium text-gray-700">Special Bingo</span>
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
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Event Image (optional)</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm border transition-colors">
                      {editImageFile ? 'Change Image' : 'Upload Image'}
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files[0];
                        if (file) {
                          setEditImageFile(file);
                          setEditImagePreview(URL.createObjectURL(file));
                          setEditForm({...editForm, event_image_url: ''});
                        }
                      }} />
                    </label>
                    <span className="text-gray-300">or</span>
                    <input value={editForm.event_image_url || ''} onChange={e => {
                      setEditForm({...editForm, event_image_url: e.target.value});
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
                        setEditForm({...editForm, event_image_url: ''});
                      }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">&times;</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(editForm.is_special_event || editForm.session_type === 'event') && (
              <WebsiteListingFields
                form={editForm}
                onChange={setEditForm}
                flyerFile={editFlyerFile}
                flyerPreview={editFlyerPreview}
                onFlyerFileChange={handleEditFlyerFileChange}
                sessionDate={editForm.date}
                disabled={uploadingEventImage}
              />
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSaveEdit} disabled={uploadingEventImage}
              className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90">
              {uploadingEventImage ? 'Uploading...' : 'Save Changes'}
            </button>
            <button onClick={() => setEditingSession(null)}
              className="text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
