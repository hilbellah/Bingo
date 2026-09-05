// Admin sign-in (env super user or admin_users row) and super-user management
// of admin accounts.
//
// Moved verbatim out of server/src/index.js on 2026-09-05 (Phase 3, step 4).
// registerAdminAuthRoutes() receives the index.js-scoped values the code used.

import { all, get, run } from '../database.js';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { adminAuth, requireSuperUser, isSuperUser, safeCompare } from '../middleware/adminAuth.js';

export function registerAdminAuthRoutes(app, { adminLoginLimiter, logAudit }) {
  app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
      // Check env-var admin
      if (
        process.env.ADMIN_USERNAME &&
        process.env.ADMIN_PASSWORD &&
        username.toLowerCase() === process.env.ADMIN_USERNAME.toLowerCase() &&
        safeCompare(password, process.env.ADMIN_PASSWORD)
      ) {
        const token = Buffer.from(`${username}:${password}`).toString('base64');
        return res.json({ token, displayName: 'Admin', isSuperUser: true, role: 'super_user' });
      }
      // Check DB admin users
      const dbUser = await get('SELECT * FROM admin_users WHERE LOWER(email) = LOWER(?) AND is_active = 1', [username]);
      if (dbUser && bcrypt.compareSync(password, dbUser.password_hash)) {
        const superUser = isSuperUser(dbUser.email, 'db', dbUser);
        const role = superUser ? 'super_user' : ['admin', 'print_staff', 'viewer'].includes(String(dbUser.role || '').toLowerCase()) ? String(dbUser.role).toLowerCase() : 'admin';
        const token = Buffer.from(`${username}:${password}`).toString('base64');
        return res.json({
          token,
          displayName: dbUser.display_name || dbUser.email,
          isSuperUser: superUser,
          role,
        });
      }
      res.status(401).json({ error: 'Invalid credentials' });
    } catch (err) {
      console.error('POST /api/admin/login failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ============ ADMIN USERS ============

  app.get('/api/admin/users', adminAuth, requireSuperUser, async (req, res) => {
    try {
      const users = await all("SELECT id, email, display_name, is_active, is_super_user, COALESCE(role, CASE WHEN is_super_user = 1 THEN 'super_user' ELSE 'admin' END) as role, created_at FROM admin_users ORDER BY created_at");
      res.json(users);
    } catch (err) {
      console.error('GET /api/admin/users failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/users', adminAuth, requireSuperUser, async (req, res) => {
    try {
      const { email, password, displayName, isSuperUser: makeSuperUser } = req.body;
      const role = ['super_user', 'admin', 'print_staff', 'viewer'].includes(String(req.body.role || '').toLowerCase())
        ? String(req.body.role).toLowerCase()
        : makeSuperUser ? 'super_user' : 'admin';
      const normalizedEmail = (email || '').trim();
      if (!normalizedEmail || !password) return res.status(400).json({ error: 'Email and password are required' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ error: 'A valid email address is required' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const existing = await get('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?)', [normalizedEmail]);
      if (existing) return res.status(409).json({ error: 'User with this email already exists' });
      const id = uuid();
      const hash = bcrypt.hashSync(password, 10);
      await run('INSERT INTO admin_users (id, email, password_hash, display_name, is_super_user, role) VALUES (?, ?, ?, ?, ?, ?)',
        [id, normalizedEmail, hash, displayName || null, role === 'super_user' ? 1 : 0, role]);
      await logAudit('admin_user_created', 'admin_user', id, {
        email: normalizedEmail,
        displayName: displayName || null,
        role,
        isSuperUser: role === 'super_user',
        createdBy: req.adminUser.email,
      });
      res.status(201).json({ id, email: normalizedEmail, displayName: displayName || null, isSuperUser: role === 'super_user', role });
    } catch (err) {
      console.error('POST /api/admin/users failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.patch('/api/admin/users/:id', adminAuth, requireSuperUser, async (req, res) => {
    try {
      const { email, password, displayName, isActive } = req.body;
      const user = await get('SELECT * FROM admin_users WHERE id = ?', [req.params.id]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (email !== undefined) {
        const normalizedEmail = (email || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ error: 'A valid email address is required' });
        const existing = await get('SELECT id FROM admin_users WHERE LOWER(email) = LOWER(?) AND id <> ?', [normalizedEmail, req.params.id]);
        if (existing) return res.status(409).json({ error: 'User with this email already exists' });
        await run('UPDATE admin_users SET email = ?, updated_at = datetime(\'now\') WHERE id = ?', [normalizedEmail, req.params.id]);
      }
      if (password && password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      if (password) await run('UPDATE admin_users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?', [bcrypt.hashSync(password, 10), req.params.id]);
      if (displayName !== undefined) await run('UPDATE admin_users SET display_name = ?, updated_at = datetime(\'now\') WHERE id = ?', [displayName, req.params.id]);
      if (isActive !== undefined) {
        if (user.email.toLowerCase() === 'kylepaul@stmec.com' && !isActive) {
          return res.status(400).json({ error: 'Kyle account must remain active' });
        }
        await run('UPDATE admin_users SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?', [isActive ? 1 : 0, req.params.id]);
      }
      if (req.body.role !== undefined || req.body.isSuperUser !== undefined) {
        const nextRole = req.body.role !== undefined
          ? String(req.body.role || '').toLowerCase()
          : req.body.isSuperUser ? 'super_user' : 'admin';
        if (!['super_user', 'admin', 'print_staff', 'viewer'].includes(nextRole)) {
          return res.status(400).json({ error: 'Invalid role' });
        }
        if (user.email.toLowerCase() === 'kylepaul@stmec.com' && nextRole !== 'super_user') {
          return res.status(400).json({ error: 'Kyle account must remain a super user' });
        }
        await run('UPDATE admin_users SET role = ?, is_super_user = ?, updated_at = datetime(\'now\') WHERE id = ?', [nextRole, nextRole === 'super_user' ? 1 : 0, req.params.id]);
      }
      await logAudit('admin_user_updated', 'admin_user', req.params.id, {
        email: email !== undefined ? email : user.email,
        updatedBy: req.adminUser.email,
      });
      res.json({ success: true });
    } catch (err) {
      console.error('PATCH /api/admin/users/:id failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/admin/users/:id', adminAuth, requireSuperUser, async (req, res) => {
    try {
      const user = await get('SELECT * FROM admin_users WHERE id = ?', [req.params.id]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.email.toLowerCase() === 'kylepaul@stmec.com') {
        return res.status(400).json({ error: 'Kyle account must remain active' });
      }
      await run('UPDATE admin_users SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?', [req.params.id]);
      await logAudit('admin_user_deactivated', 'admin_user', req.params.id, {
        email: user.email,
        deactivatedBy: req.adminUser.email,
      });
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /api/admin/users/:id failed:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
