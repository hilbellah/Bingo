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

export async function fetchAdminDashboard(token) {
  const res = await fetch(`${API}/admin/dashboard`, { headers: adminHeaders(token) });
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

export async function fetchAdminPackages(token) {
  const res = await fetch(`${API}/admin/packages`, { headers: adminHeaders(token) });
  return res.json();
}

export async function updateAdminPackage(token, id, data) {
  const res = await fetch(`${API}/admin/packages/${id}`, {
    method: 'PATCH', headers: adminHeaders(token), body: JSON.stringify(data)
  });
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
