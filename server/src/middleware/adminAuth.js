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

export function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const [user, pass] = decoded.split(':');

  if (
    user.toLowerCase() === (process.env.ADMIN_USERNAME || '').toLowerCase() &&
    pass === process.env.ADMIN_PASSWORD
  ) {
    req.adminUser = { email: user, source: 'env', isSuperUser: true };
    return next();
  }

  const dbUser = get('SELECT * FROM admin_users WHERE LOWER(email) = LOWER(?) AND is_active = 1', [user]);
  if (dbUser && bcrypt.compareSync(pass, dbUser.password_hash)) {
    req.adminUser = {
      id: dbUser.id,
      email: dbUser.email,
      displayName: dbUser.display_name,
      source: 'db',
      isSuperUser: isSuperUser(dbUser.email, 'db', dbUser),
    };
    return next();
  }

  res.status(401).json({ error: 'Invalid credentials' });
}

export function requireSuperUser(req, res, next) {
  if (!req.adminUser?.isSuperUser) {
    return res.status(403).json({ error: 'Super user access required' });
  }
  next();
}
