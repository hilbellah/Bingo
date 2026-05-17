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

export async function fetchTheme() {
  const res = await fetch(`${API}/theme`);
  const data = await res.json();
  return data.value;
}

export async function uploadImage(token, file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API}/admin/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${token}` },
    body: formData
  });
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

export async function createBooking(sessionId, holderId, attendees, customer) {
  const email = typeof customer === 'string' ? customer : customer?.email;
  const customerFirstName = typeof customer === 'object' ? customer?.customerFirstName : undefined;
  const customerLastName = typeof customer === 'object' ? customer?.customerLastName : undefined;
  const emailVerificationId = typeof customer === 'object' ? customer?.emailVerificationId : undefined;
  const res = await fetch(`${API}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, holderId, attendees, email, customerFirstName, customerLastName, emailVerificationId })
  });
  return res.json();
}

export async function sendEmailVerification(email, customerFirstName, customerLastName) {
  const res = await fetch(`${API}/email-verifications/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, customerFirstName, customerLastName })
  });
  return res.json();
}

export async function verifyEmailCode(email, verificationId, code) {
  const res = await fetch(`${API}/email-verifications/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, verificationId, code })
  });
  return res.json();
}

// Initiates a customer booking through the Authorize.Net hosted-payment flow.
// Returns { bookingId, referenceNumber, redirectUrl, token, totalAmount, ... }
// on success, or { error } on validation failure / server error.
// The caller is expected to build a self-submitting form that POSTs `token`
// to `redirectUrl` to send the customer to Authorize.Net's hosted card page.
export async function initiateBooking(sessionId, holderId, attendees, customer) {
  const email = typeof customer === 'string' ? customer : customer?.email;
  const customerFirstName = typeof customer === 'object' ? customer?.customerFirstName : undefined;
  const customerLastName = typeof customer === 'object' ? customer?.customerLastName : undefined;
  const emailVerificationId = typeof customer === 'object' ? customer?.emailVerificationId : undefined;
  const res = await fetch(`${API}/bookings/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, holderId, attendees, email, customerFirstName, customerLastName, emailVerificationId })
  });
  return res.json();
}

// Polls booking payment status. Used by BookingProcessing while waiting for
// the webhook to flip the booking to 'paid' / 'failed' / 'cancelled'.
export async function fetchBookingStatus(bookingId) {
  const res = await fetch(`${API}/bookings/${encodeURIComponent(bookingId)}/status`);
  return res.json();
}

// Fetches the full ticket details (used to render the post-payment receipt).
export async function fetchBookingTickets(referenceNumber) {
  const res = await fetch(`${API}/bookings/${encodeURIComponent(referenceNumber)}/tickets`);
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
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to create session');
  return json;
}

export async function updateAdminSession(token, id, data) {
  const res = await fetch(`${API}/admin/sessions/${id}`, {
    method: 'PATCH', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update session');
  return json;
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

export async function deleteAdminPackage(token, id) {
  const res = await fetch(`${API}/admin/packages/${id}`, {
    method: 'DELETE', headers: adminHeaders(token)
  });
  // 200 → { success: true, deleted: name }
  // 409 → { error: 'package_in_use', message, references }
  // 404 → { error: 'Package not found' }
  // Caller should check both ok and parsed body so they can show the message.
  const body = await res.json();
  return { ok: res.ok, status: res.status, ...body };
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

export async function fetchAdminCustomers(token, search) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API}/admin/customers${qs}`, { headers: adminHeaders(token) });
  return res.json();
}

export function getCustomersExportUrl(search) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return `${API}/admin/customers/export${qs}`;
}

export async function fetchSettings(token, key) {
  const res = await fetch(`${API}/admin/settings/${key}`, { headers: adminHeaders(token) });
  const data = await res.json();
  return data.value;
}

export async function saveSettings(token, key, value) {
  const res = await fetch(`${API}/admin/settings/${key}`, {
    method: 'PUT',
    headers: { ...adminHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ value })
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

export async function deleteAdminBooking(token, id) {
  const res = await fetch(`${API}/admin/bookings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(token)
  });
  const json = await res.json();
  return { ok: res.ok, ...json };
}

export async function clearAdminTestBookings(token) {
  const res = await fetch(`${API}/admin/bookings/clear-test-data`, {
    method: 'POST',
    headers: adminHeaders(token)
  });
  const json = await res.json();
  return { ok: res.ok, ...json };
}

// Refund a paid booking through Authorize.Net. The server auto-decides
// between void (pre-settlement) and refund (post-settlement) and always
// releases seats. Returns { ok, action: 'void'|'refund', seatsReleased,
// refundTransId } on success or { ok: false, error } on failure.
export async function refundAdminBooking(token, id) {
  const res = await fetch(`${API}/admin/bookings/${id}/refund`, {
    method: 'POST', headers: adminHeaders(token)
  });
  const json = await res.json();
  return { ok: res.ok, ...json };
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
export async function fetchAdminBulkTickets(token, dateFrom, dateTo, department = 'special_bingo') {
  const params = new URLSearchParams({ dateFrom });
  if (dateTo) params.set('dateTo', dateTo);
  if (department) params.set('department', department);
  const res = await fetch(`${API}/admin/bookings/bulk-tickets?${params}`, { headers: adminHeaders(token) });
  return res.json();
}

export async function markAdminBulkTicketsPrinted(token, ticketIds) {
  const res = await fetch(`${API}/admin/bookings/bulk-tickets/mark-printed`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ ticketIds })
  });
  const json = await res.json();
  return { ok: res.ok, ...json };
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
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to save session packages');
  return json;
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

// Admin Schedule
export async function fetchAdminSchedule(token) {
  const res = await fetch(`${API}/admin/schedule`, { headers: adminHeaders(token) });
  return res.json();
}

export async function triggerScheduleGenerate(token) {
  const res = await fetch(`${API}/admin/schedule/generate`, {
    method: 'POST', headers: adminHeaders(token)
  });
  const json = await res.json();
  return { ok: res.ok, ...json };
}

// Admin Recurring Schedules (day-of-week templates that drive auto-generation)
export async function fetchRecurringSchedules(token) {
  const res = await fetch(`${API}/admin/recurring-schedules`, { headers: adminHeaders(token) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load recurring schedules');
  return json;
}

export async function createRecurringSchedule(token, data) {
  const res = await fetch(`${API}/admin/recurring-schedules`, {
    method: 'POST', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to create recurring schedule');
  return json;
}

export async function updateRecurringSchedule(token, id, data) {
  const res = await fetch(`${API}/admin/recurring-schedules/${id}`, {
    method: 'PATCH', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update recurring schedule');
  return json;
}

export async function deleteRecurringSchedule(token, id) {
  const res = await fetch(`${API}/admin/recurring-schedules/${id}`, {
    method: 'DELETE', headers: adminHeaders(token)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to delete recurring schedule');
  return json;
}

export async function fetchRecurringScheduleSummary(token) {
  const res = await fetch(`${API}/admin/recurring-schedules/summary`, { headers: adminHeaders(token) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load schedule summary');
  return json;
}

export async function updateAutoGenerateConfig(token, data) {
  const res = await fetch(`${API}/admin/recurring-schedules/config`, {
    method: 'PATCH', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update auto-generate config');
  return json;
}

// Admin Users (super users only)
export async function fetchAdminUsers(token) {
  const res = await fetch(`${API}/admin/users`, { headers: adminHeaders(token) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load users');
  return json;
}

export async function createAdminUser(token, data) {
  const res = await fetch(`${API}/admin/users`, {
    method: 'POST', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to create user');
  return json;
}

export async function updateAdminUser(token, id, data) {
  const res = await fetch(`${API}/admin/users/${id}`, {
    method: 'PATCH', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update user');
  return json;
}

export async function deactivateAdminUser(token, id) {
  const res = await fetch(`${API}/admin/users/${id}`, {
    method: 'DELETE', headers: adminHeaders(token)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to deactivate user');
  return json;
}

// Admin Seat Management
export async function toggleAdminSeat(token, seatId, isDisabled) {
  const res = await fetch(`${API}/admin/seats/${seatId}`, {
    method: 'PATCH', headers: adminHeaders(token), body: JSON.stringify({ is_disabled: isDisabled })
  });
  return res.json();
}

// PHD Inventory
export async function fetchPhdInventory(sessionId) {
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  const res = await fetch(`${API}/phd-inventory${qs}`);
  return res.json();
}

export async function fetchAdminPhdInventory(token) {
  const res = await fetch(`${API}/admin/phd-inventory`, { headers: adminHeaders(token) });
  return res.json();
}

export async function updateAdminPhdInventory(token, data) {
  const res = await fetch(`${API}/admin/phd-inventory`, {
    method: 'PUT', headers: adminHeaders(token), body: JSON.stringify(data)
  });
  return res.json();
}
