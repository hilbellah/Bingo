import { v4 as uuid } from 'uuid';
import { all, run } from '../database.js';
import { adminAuth } from '../middleware/adminAuth.js';

export function registerAnnouncementRoutes(app, { io, upload, saveUploadedImage }) {
  app.get('/api/admin/announcements', adminAuth, (req, res) => {
    res.json(all('SELECT * FROM announcements ORDER BY sort_order ASC, created_at DESC'));
  });

  app.post('/api/admin/announcements', adminAuth, (req, res) => {
    const { title, message, type, is_active, start_date, end_date, sort_order, image_url } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    const id = uuid();
    const now = new Date().toISOString();
    run('INSERT INTO announcements (id, title, message, type, is_active, start_date, end_date, sort_order, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title || null, message, type || 'info', is_active !== false ? 1 : 0, start_date || null, end_date || null, sort_order || 0, image_url || null, now, now]);
    io.emit('announcements:refresh');
    res.json({ id, title, message, type: type || 'info', image_url: image_url || null });
  });

  app.post('/api/admin/upload', adminAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    try {
      const saved = await saveUploadedImage(req.file);
      res.json(saved);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Invalid image upload' });
    }
  });

  app.patch('/api/admin/announcements/:id', adminAuth, (req, res) => {
    const { title, message, type, is_active, start_date, end_date, sort_order, image_url } = req.body;
    const updates = [];
    const values = [];
    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (message !== undefined) { updates.push('message = ?'); values.push(message); }
    if (type !== undefined) { updates.push('type = ?'); values.push(type); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (start_date !== undefined) { updates.push('start_date = ?'); values.push(start_date || null); }
    if (end_date !== undefined) { updates.push('end_date = ?'); values.push(end_date || null); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
    if (image_url !== undefined) { updates.push('image_url = ?'); values.push(image_url || null); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields' });
    updates.push('updated_at = ?'); values.push(new Date().toISOString());
    values.push(req.params.id);
    run(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`, values);
    io.emit('announcements:refresh');
    res.json({ success: true });
  });

  app.delete('/api/admin/announcements/:id', adminAuth, (req, res) => {
    run('DELETE FROM announcements WHERE id = ?', [req.params.id]);
    io.emit('announcements:refresh');
    res.json({ success: true });
  });
}
