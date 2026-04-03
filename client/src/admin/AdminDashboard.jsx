import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchAdminDashboard, fetchAdminSessions, createAdminSession,
  updateAdminSession, fetchAdminPackages, updateAdminPackage,
  fetchAdminBookings, cancelAdminBooking, getExportUrl, adminHeaders,
  fetchAdminAnnouncements, createAdminAnnouncement, updateAdminAnnouncement, deleteAdminAnnouncement,
  fetchAdminSessionPackages, setAdminSessionPackages
} from '../api';

function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem('admin_token');

  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [reportSession, setReportSession] = useState('');
  const [newSession, setNewSession] = useState({ date: '', time: '18:30', cutoff_time: '12:00', is_special_event: false, event_title: '', event_description: '', packages: [] });
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', message: '', type: 'info', start_date: '', end_date: '' });
  const [editingSessionPkgs, setEditingSessionPkgs] = useState(null); // session id being edited
  const [sessionPkgList, setSessionPkgList] = useState([]);

  useEffect(() => {
    if (!token) { navigate('/admin'); return; }
    loadDashboard();
  }, []);

  const loadDashboard = () => fetchAdminDashboard(token).then(setDashboard);
  const loadSessions = () => fetchAdminSessions(token).then(setSessions);
  const loadPackages = () => fetchAdminPackages(token).then(setPackages);
  const loadBookings = (sid) => fetchAdminBookings(token, sid).then(setBookings);
  const loadAnnouncements = () => fetchAdminAnnouncements(token).then(setAnnouncements);

  useEffect(() => {
    if (tab === 'sessions') loadSessions();
    if (tab === 'packages') loadPackages();
    if (tab === 'bookings') { loadSessions(); loadBookings(reportSession); }
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'announcements') loadAnnouncements();
  }, [tab]);

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token');
    navigate('/admin');
  };

  const handleCreateSession = async () => {
    if (!newSession.date) return;
    const payload = { ...newSession };
    if (!payload.is_special_event) {
      delete payload.event_title;
      delete payload.event_description;
      delete payload.packages;
    }
    try {
      await createAdminSession(token, payload);
      setNewSession({ date: '', time: '18:30', cutoff_time: '12:00', is_special_event: false, event_title: '', event_description: '', packages: [] });
      loadSessions();
    } catch (err) {
      alert('Failed to create session: ' + (err?.message || 'Unknown error. Please try again.'));
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement.message) return;
    await createAdminAnnouncement(token, newAnnouncement);
    setNewAnnouncement({ title: '', message: '', type: 'info', start_date: '', end_date: '' });
    loadAnnouncements();
  };

  const handleToggleAnnouncement = async (id, currentActive) => {
    await updateAdminAnnouncement(token, id, { is_active: !currentActive });
    loadAnnouncements();
  };

  const handleDeleteAnnouncement = async (id) => {
    await deleteAdminAnnouncement(token, id);
    loadAnnouncements();
  };

  const handleEditSessionPkgs = async (sessionId) => {
    setEditingSessionPkgs(sessionId);
    const pkgs = await fetchAdminSessionPackages(token, sessionId);
    setSessionPkgList(pkgs.length > 0 ? pkgs : [
      { name: '', price: 0, type: 'required', max_quantity: 1, sort_order: 0 }
    ]);
  };

  const handleSaveSessionPkgs = async () => {
    const valid = sessionPkgList.filter(p => p.name && p.price > 0);
    await setAdminSessionPackages(token, editingSessionPkgs, valid);
    setEditingSessionPkgs(null);
    setSessionPkgList([]);
  };

  const handleToggleSession = async (id, currentAvail) => {
    await updateAdminSession(token, id, { is_available: !currentAvail });
    loadSessions();
  };

  const handleTogglePackage = async (id, currentActive) => {
    await updateAdminPackage(token, id, { is_active: !currentActive });
    loadPackages();
  };

  const handleCancelBooking = async (id) => {
    if (!confirm('Cancel this booking and release seats?')) return;
    await cancelAdminBooking(token, id);
    loadBookings(reportSession);
  };

  const handleExport = () => {
    const url = getExportUrl(token, reportSession);
    // Need to add auth header for download — open in iframe or use fetch+blob
    fetch(url, { headers: adminHeaders(token) })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bookings-report.csv`;
        a.click();
      });
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'packages', label: 'Packages' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'bookings', label: 'Bookings & Reports' },
  ];

  return (
    <div className="min-h-screen bg-brand-light">
      {/* Admin Header */}
      <header className="bg-brand-blue text-white px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">SMEC Admin Panel</h1>
          <p className="text-xs text-gray-300">Saint Mary's Entertainment Centre</p>
        </div>
        <div className="flex gap-3 items-center">
          <a href="/tickets" className="text-xs text-gray-300 hover:text-white">Reprint Tickets</a>
          <a href="/" className="text-xs text-gray-300 hover:text-white">View Booking Page</a>
          <button onClick={handleLogout} className="text-xs bg-white/10 px-3 py-1.5 rounded hover:bg-white/20">
            Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b px-4">
        <div className="max-w-6xl mx-auto flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                tab === t.id ? 'border-brand-gold text-brand-blue' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* DASHBOARD TAB */}
        {tab === 'dashboard' && dashboard && (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <p className="text-sm text-gray-400">Today's Bookings</p>
                <p className="text-3xl font-bold text-brand-blue mt-1">{dashboard.todayBookings}</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <p className="text-sm text-gray-400">Today's Revenue</p>
                <p className="text-3xl font-bold text-brand-gold mt-1">{dashboard.todayRevenueFormatted}</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <p className="text-sm text-gray-400">Upcoming Sessions</p>
                <p className="text-3xl font-bold text-brand-blue mt-1">{dashboard.upcomingSessions?.length || 0}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">Upcoming Sessions</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Available</th>
                      <th className="pb-2">Sold</th>
                      <th className="pb-2">Held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.upcomingSessions?.map(s => (
                      <tr key={s.id} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{s.date}</td>
                        <td className="py-2">{s.time}</td>
                        <td className="py-2 text-green-600">{s.available}</td>
                        <td className="py-2 text-gray-500">{s.sold}</td>
                        <td className="py-2 text-amber-500">{s.held}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SESSIONS TAB */}
        {tab === 'sessions' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
              <h3 className="font-semibold text-brand-blue mb-3">Create New Session</h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date</label>
                  <input type="date" value={newSession.date} onChange={e => setNewSession({...newSession, date: e.target.value})}
                    className="px-3 py-2 border rounded-lg text-sm" />
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
                          <input type="number" value={pkg.price / 100} onChange={e => {
                            const pkgs = [...newSession.packages];
                            pkgs[i] = {...pkgs[i], price: Math.round(parseFloat(e.target.value || 0) * 100)};
                            setNewSession({...newSession, packages: pkgs});
                          }} className="w-20 px-2 py-1.5 border rounded text-sm" placeholder="$" step="0.01" />
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
                          <button onClick={() => {
                            const pkgs = newSession.packages.filter((_, j) => j !== i);
                            setNewSession({...newSession, packages: pkgs});
                          }} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                        </div>
                      ))}
                      <button onClick={() => setNewSession({...newSession, packages: [...newSession.packages, { name: '', price: 0, type: 'required', max_quantity: 1, sort_order: newSession.packages.length }]})}
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
                            <span className="text-xs text-gray-400">Regular</span>
                          )}
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${s.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {s.is_available ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-2 flex gap-2">
                          <button onClick={() => handleToggleSession(s.id, s.is_available)}
                            className="text-xs text-brand-blue hover:underline">
                            {s.is_available ? 'Disable' : 'Enable'}
                          </button>
                          {!!s.is_special_event && (
                            <button onClick={() => handleEditSessionPkgs(s.id)}
                              className="text-xs text-amber-600 hover:underline">
                              Packages
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

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
                      <input type="number" value={pkg.price / 100} onChange={e => {
                        const list = [...sessionPkgList];
                        list[i] = {...list[i], price: Math.round(parseFloat(e.target.value || 0) * 100)};
                        setSessionPkgList(list);
                      }} className="w-20 px-2 py-1.5 border rounded text-sm" placeholder="$" step="0.01" />
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
                      <button onClick={() => setSessionPkgList(sessionPkgList.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 text-sm">X</button>
                    </div>
                  ))}
                  <button onClick={() => setSessionPkgList([...sessionPkgList, { name: '', price: 0, type: 'required', max_quantity: 1, sort_order: sessionPkgList.length }])}
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

        {/* PACKAGES TAB */}
        {tab === 'packages' && (
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-brand-blue mb-3">Ticket Packages</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Price</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Max Qty</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {packages.map(p => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2">{formatPrice(p.price)}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.type === 'required' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {p.type}
                      </span>
                    </td>
                    <td className="py-2">{p.max_quantity}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {p.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-2">
                      <button onClick={() => handleTogglePackage(p.id, p.is_active)}
                        className="text-xs text-brand-blue hover:underline">
                        {p.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
                <button onClick={handleCreateAnnouncement} disabled={!newAnnouncement.message}
                  className="bg-brand-gold text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40">
                  Create Announcement
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

        {/* BOOKINGS TAB */}
        {tab === 'bookings' && (
          <div>
            <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-gray-400 mb-1">Filter by Session</label>
                  <select
                    value={reportSession}
                    onChange={e => { setReportSession(e.target.value); loadBookings(e.target.value); }}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">All Sessions</option>
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>{s.date} — {s.time}</option>
                    ))}
                  </select>
                </div>
                <button onClick={handleExport}
                  className="bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-blue/90">
                  Export CSV
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-brand-blue mb-3">
                Bookings {bookings.length > 0 && `(${bookings.length})`}
              </h3>

              {bookings.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No bookings found</p>
              ) : (
                <div className="space-y-4">
                  {bookings.map(b => (
                    <div key={b.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-mono font-bold text-brand-blue">{b.referenceNumber}</p>
                          <p className="text-xs text-gray-400">{b.sessionDate} at {b.sessionTime}</p>
                          <p className="text-xs text-gray-400">{new Date(b.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-brand-gold">{b.totalFormatted}</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            b.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                            b.paymentStatus === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {b.paymentStatus}
                          </span>
                        </div>
                      </div>

                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 border-b">
                            <th className="pb-1 text-left">Name</th>
                            <th className="pb-1 text-left">Table</th>
                            <th className="pb-1 text-left">Chair</th>
                            <th className="pb-1 text-left">Package</th>
                            <th className="pb-1 text-left">Add-ons</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.items.map((item, j) => (
                            <tr key={j} className="border-b border-gray-50">
                              <td className="py-1">{item.firstName} {item.lastName}</td>
                              <td className="py-1">{item.tableNumber}</td>
                              <td className="py-1">{item.chairNumber}</td>
                              <td className="py-1">{item.packageName}</td>
                              <td className="py-1">
                                {item.addons.length > 0
                                  ? item.addons.map(a => `${a.packageName} x${a.quantity}`).join(', ')
                                  : '-'
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="flex gap-3 mt-2">
                        {b.paymentStatus === 'paid' && (
                          <a
                            href={`/tickets/${b.referenceNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand-blue hover:underline flex items-center gap-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Print Tickets
                          </a>
                        )}
                        {b.paymentStatus === 'paid' && (
                          <button onClick={() => handleCancelBooking(b.id)}
                            className="text-xs text-red-500 hover:underline">
                            Cancel Booking
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
