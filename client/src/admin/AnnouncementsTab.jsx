import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';

export default function AnnouncementsTab() {
  const {
    tab,
    announcements,
    newAnnouncement,
    setNewAnnouncement,
    announcementImageFile,
    setAnnouncementImageFile,
    announcementImagePreview,
    setAnnouncementImagePreview,
    uploadingImage,
    handleCreateAnnouncement,
    handleToggleAnnouncement,
    handleDeleteAnnouncement,
  } = useAdminDashboard();

  return (
    <>
        {/* ANNOUNCEMENTS TAB */}
        {tab === 'announcements' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
              <h3 className="font-semibold text-brand-blue mb-3">Create Announcement</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Title (optional)</label>
                    <input value={newAnnouncement.title} onChange={e => setNewAnnouncement({...newAnnouncement, title: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Announcement title" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Type</label>
                    <select value={newAnnouncement.type} onChange={e => setNewAnnouncement({...newAnnouncement, type: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm">
                      <option value="info">Info (Blue)</option>
                      <option value="warning">Warning (Amber)</option>
                      <option value="success">Success (Green)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Message</label>
                  <textarea value={newAnnouncement.message} onChange={e => setNewAnnouncement({...newAnnouncement, message: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Announcement message..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Start Date (optional)</label>
                    <input type="date" value={newAnnouncement.start_date} onChange={e => setNewAnnouncement({...newAnnouncement, start_date: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">End Date (optional)</label>
                    <input type="date" value={newAnnouncement.end_date} onChange={e => setNewAnnouncement({...newAnnouncement, end_date: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Image (optional)</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm border transition-colors">
                      {announcementImageFile ? 'Change Image' : 'Upload Image'}
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files[0];
                        if (file) {
                          setAnnouncementImageFile(file);
                          setAnnouncementImagePreview(URL.createObjectURL(file));
                          setNewAnnouncement({...newAnnouncement, image_url: ''});
                        }
                      }} />
                    </label>
                    <span className="text-gray-300">or</span>
                    <input value={newAnnouncement.image_url} onChange={e => {
                      setNewAnnouncement({...newAnnouncement, image_url: e.target.value});
                      setAnnouncementImageFile(null);
                      setAnnouncementImagePreview(null);
                    }}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Paste image URL..." />
                  </div>
                  {(announcementImagePreview || newAnnouncement.image_url) && (
                    <div className="mt-2 relative inline-block">
                      <img src={announcementImagePreview || newAnnouncement.image_url} alt="Preview"
                        className="h-20 rounded-lg object-cover border" />
                      <button onClick={() => {
                        setAnnouncementImageFile(null);
                        setAnnouncementImagePreview(null);
                        setNewAnnouncement({...newAnnouncement, image_url: ''});
                      }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">&times;</button>
                    </div>
                  )}
                </div>
                <button onClick={handleCreateAnnouncement} disabled={!newAnnouncement.message || uploadingImage}
                  className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40">
                  {uploadingImage ? 'Uploading...' : 'Create Announcement'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">All Announcements</h3>
              {announcements.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No announcements yet</p>
              ) : (
                <div className="space-y-3">
                  {announcements.map(a => (
                    <div key={a.id} className={`border rounded-lg p-4 ${a.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              a.type === 'info' ? 'bg-blue-100 text-blue-700' :
                              a.type === 'warning' ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>{a.type}</span>
                            {a.title && <span className="font-semibold text-sm">{a.title}</span>}
                            <span className={`px-2 py-0.5 rounded-full text-xs ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {a.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{a.message}</p>
                          {a.image_url && (
                            <img src={a.image_url} alt="Announcement" className="mt-2 h-16 rounded object-cover border" />
                          )}
                          {(a.start_date || a.end_date) && (
                            <p className="text-xs text-gray-400 mt-1">
                              {a.start_date && `From: ${a.start_date}`} {a.end_date && `Until: ${a.end_date}`}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => handleToggleAnnouncement(a.id, a.is_active)}
                            className="text-xs text-brand-blue hover:underline">
                            {a.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button onClick={() => handleDeleteAnnouncement(a.id)}
                            className="text-xs text-red-500 hover:underline">
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

    </>
  );
}


