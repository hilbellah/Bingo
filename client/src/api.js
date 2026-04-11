const API = '/api';

export async function fetchSessions() {
  const res = await fetch(`${API}/sessions`);
  return res.json();
}

export async function fetchSeats(sessionId) {
  const res = await fetch(`${API}/sessions/${sessionId}/seats`);
  return res.json();
}

export async function fetchPackages() {
  const res = await fetch(`${API}/packages`);
  return res.json();
}

export async function fetchSessionPackages(sessionId) {
  const res = await fetch(`${API}/sessions/${sessionId}/packages`);
  return res.json();
}

export async function fetchAnnouncements() {
  const res = await fetch(`${API}/announcements`);
  return res.json();
}

export async function lockSeat(seatId, holderId) {
  const res = await fetch(`${API}/seats/${seatId}/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holderId })
  });
  return res.json();
}

export async function unlockSeat(seatId, holderId) {
  const res = await fetch(`${API}/seats/${seatId}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holderId })
  });
  return res.json();
}

export async function createBooking(sessionId, holderId, attendees) {
  const res = await fetch(`${API}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, holderId, attendees })
  });
  return res.json();
}

// Admin API
export function adminHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${token}`
  };
}

export async function adminLogin(username, password) {
  const res = await fetch(`${API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error('Invalid credentials');
  return res.json();
}

export async function fetchAdminDashboard(token, dateFrom, dateTo) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API}/admin/dashboard${qs}`, { headers: adminHeaders(token) });
  return res.json();
}

export async function fetchAdminSessions(token) {
  const res = await fetch(`${API}/admin/sessions`, { headers: adminHeaders(token) });
  return res.json();
}

export async function createAdminSession(token, data) {
  const res = await fetch(`${API}/admin/sessions`, {
    method: 'POST', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  return res.json();
}

export async function updateAdminSession(token, id, data) {
  const res = await fetch(`${API}/admin/sessions/${id}`, {
    method: 'PATCH', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  return res.json();
}

export async function deleteAdminSession(token, id) {
  const res = await fetch(`${API}/admin/sessions/${id}`, {
    method: 'DELETE', headers: adminHeaders(token)
  });
  return res.json();
}

export async function fetchAdminPackages(token) {
  const res = await fetch(`${API}/admin/packages`, { headers: adminHeaders(token) });
  return res.json();
}

export async function createAdminPackage(token, data) {
  const res = await fetch(`${API}/admin/packages`, {
    method: 'POST', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  return res.json();
}

export async function updateAdminPackage(token, id, data) {
  const res = await fetch(`${API}/admin/packages/${id}`, {
    method: 'PATCH', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  return res.json();
}

export async function fetchDailySales(token, date, search) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (search) params.set('search', search);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API}/admin/daily-sales${qs}`, { headers: adminHeaders(token) });
  return res.json();
}

export async function fetchBookingSales(token) {
  const res = await fetch(`${API}/admin/booking-sales`, { headers: adminHeaders(token) });
  return res.json();
}

export async function fetchAdminBookings(token, sessionId) {
  const url = sessionId
    ? `${API}/admin/bookings?sessionId=${sessionId}`
    : `${API}/admin/bookings`;
  const res = await fetch(url, { headers: adminHeaders(token) });
  return res.json();
}

export async function cancelAdminBooking(token, id) {
  const res = await fetch(`${API}/admin/bookings/${id}/cancel`, {
    method: 'POST', headers: adminHeaders(token)
  });
  return res.json();
}

export function getExportUrl(token, sessionId) {
  const base = `${API}/admin/bookings/export`;
  return sessionId ? `${base}?sessionId=${sessionId}` : base;
}

// Admin Announcements
export async function fetchAdminAnnouncements(token) {
  const res = await fetch(`${API}/admin/announcements`, { headers: adminHeaders(token) });
  return res.json();
}

export async function createAdminAnnouncement(token, data) {
  const res = await fetch(`${API}/admin/announcements`, {
    method: 'POST', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  return res.json();
}

export async function updateAdminAnnouncement(token, id, data) {
  const res = await fetch(`${API}/admin/announcements/${id}`, {
    method: 'PATCH', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  return res.json();
}

export async function deleteAdminAnnouncement(token, id) {
  const res = await fetch(`${API}/admin/announcements/${id}`, {
    method: 'DELETE', headers: adminHeaders(token)
  });
  return res.json();
}

// Admin Bulk Tickets
export async function fetchAdminBulkTickets(token, dateFrom, dateTo) {
  const params = new URLSearchParams({ dateFrom });
  if (dateTo) params.set('dateTo', dateTo);
  const res = await fetch(`${API}/admin/bookings/bulk-tickets?${params}`, { headers: adminHeaders(token) });
  return res.json();
}

// Admin Session Packages
export async function fetchAdminSessionPackages(token, sessionId) {
  const res = await fetch(`${API}/admin/sessions/${sessionId}/packages`, { headers: adminHeaders(token) });
  return res.json();
}

export async function setAdminSessionPackages(token, sessionId, packages) {
  const res = await fetch(`${API}/admin/sessions/${sessionId}/packages`, {
    method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ packages })
  });
  return res.json();
}

// Admin Archive & Audit
export async function fetchDeletedSessions(token) {
  const res = await fetch(`${API}/admin/sessions/deleted`, { headers: adminHeaders(token) });
  return res.json();
}

export async function restoreSession(token, id) {
  const res = await fetch(`${API}/admin/sessions/${id}/restore`, {
    method: 'POST', headers: adminHeaders(token)
  });
  return res.json();
}

export async function fetchSessionBookings(token, id) {
  const res = await fetch(`${API}/admin/sessions/${id}/bookings`, { headers: adminHeaders(token) });
  return res.json();
}

export async function fetchAuditLog(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API}/admin/audit-log${qs ? '?' + qs : ''}`, { headers: adminHeaders(token) });
  return res.json();
}
