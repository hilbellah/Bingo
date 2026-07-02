import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { get } from '../database.js';

// Constant-time string comparison. Hashing both sides first means
// timingSafeEqual always gets equal-length buffers, so neither content
// nor length differences leak through timing.
export function safeCompare(a, b) {
  const ha = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const hb = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function getSuperUserEmails() {
  return (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperUser(email, source, dbUser = null) {
  if (source === 'env') return true;
  if (dbUser?.is_super_user) return true;
  return getSuperUserEmails().includes((email || '').toLowerCase());
}

function normalizeAdminRole(dbUser, source) {
  if (source === 'env') return 'super_user';
  if (isSuperUser(dbUser?.email, source, dbUser)) return 'super_user';
  const role = String(dbUser?.role || 'admin').trim().toLowerCase();
  return ['admin', 'print_staff'].includes(role) ? role : 'admin';
}

function printStaffCanAccess(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (method === 'GET' && path === '/api/admin/bookings/bulk-tickets') return true;
  if (method === 'POST' && path === '/api/admin/bookings/bulk-tickets/mark-printed') return true;
  if ((method === 'GET' || method === 'PUT') && path === '/api/admin/settings/receipt_config') return true;
  return false;
}

export async function authenticateAdminToken(auth) {
  if (!auth || !auth.startsWith('Basic ')) return null;

  const decoded = Buffer.from(auth.split(' ')[1] || '', 'base64').toString();
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return null;

  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);

  if (
    process.env.ADMIN_USERNAME &&
    process.env.ADMIN_PASSWORD &&
    user.toLowerCase() === process.env.ADMIN_USERNAME.toLowerCase() &&
    safeCompare(pass, process.env.ADMIN_PASSWORD)
  ) {
    return { email: user, source: 'env', isSuperUser: true, role: 'super_user' };
  }

  const dbUser = await get('SELECT * FROM admin_users WHERE LOWER(email) = LOWER(?) AND is_active = 1', [user]);
  if (dbUser && bcrypt.compareSync(pass, dbUser.password_hash)) {
    const role = normalizeAdminRole(dbUser, 'db');
    return {
      id: dbUser.id,
      email: dbUser.email,
      displayName: dbUser.display_name,
      source: 'db',
      isSuperUser: isSuperUser(dbUser.email, 'db', dbUser),
      role,
    };
  }

  return null;
}

export async function adminAuth(req, res, next) {
  try {
    const adminUser = await authenticateAdminToken(req.headers.authorization);
    if (adminUser) {
      req.adminUser = adminUser;
      if (adminUser.role === 'print_staff' && !printStaffCanAccess(req)) {
        return res.status(403).json({ error: 'Print staff access is limited to bulk print and printing settings.' });
      }
      return next();
    }
    res.status(401).json({ error: req.headers.authorization ? 'Invalid credentials' : 'Unauthorized' });
  } catch (err) {
    // Express 4 doesn't auto-catch rejected promises from middleware, so we
    // explicitly forward errors to the error handler chain.
    next(err);
  }
}

export function requireSuperUser(req, res, next) {
  if (!req.adminUser?.isSuperUser) {
    return res.status(403).json({ error: 'Super user access required' });
  }
  next();
}
