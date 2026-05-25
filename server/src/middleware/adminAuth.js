import bcrypt from 'bcryptjs';
import { get } from '../database.js';

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

export async function authenticateAdminToken(auth) {
  if (!auth || !auth.startsWith('Basic ')) return null;

  const decoded = Buffer.from(auth.split(' ')[1] || '', 'base64').toString();
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return null;

  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);

  if (
    user.toLowerCase() === (process.env.ADMIN_USERNAME || '').toLowerCase() &&
    pass === process.env.ADMIN_PASSWORD
  ) {
    return { email: user, source: 'env', isSuperUser: true };
  }

  const dbUser = await get('SELECT * FROM admin_users WHERE LOWER(email) = LOWER(?) AND is_active = 1', [user]);
  if (dbUser && bcrypt.compareSync(pass, dbUser.password_hash)) {
    return {
      id: dbUser.id,
      email: dbUser.email,
      displayName: dbUser.display_name,
      source: 'db',
      isSuperUser: isSuperUser(dbUser.email, 'db', dbUser),
    };
  }

  return null;
}

export async function adminAuth(req, res, next) {
  try {
    const adminUser = await authenticateAdminToken(req.headers.authorization);
    if (adminUser) {
      req.adminUser = adminUser;
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
