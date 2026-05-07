import bcrypt from 'bcryptjs';
import { get } from '../database.js';

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
    req.adminUser = { email: user, source: 'env' };
    return next();
  }

  const dbUser = get('SELECT * FROM admin_users WHERE LOWER(email) = LOWER(?) AND is_active = 1', [user]);
  if (dbUser && bcrypt.compareSync(pass, dbUser.password_hash)) {
    req.adminUser = { id: dbUser.id, email: dbUser.email, displayName: dbUser.display_name, source: 'db' };
    return next();
  }

  res.status(401).json({ error: 'Invalid credentials' });
}
