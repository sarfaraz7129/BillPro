'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { sign, auth, getUserBusinesses, PERMISSIONS } = require('../middleware');

const router = express.Router();
const ALL_PERMS = Object.keys(PERMISSIONS);

router.post('/signup', (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: 'An account with this email already exists' });
  const info = db.prepare('INSERT INTO users (name, email, phone, password_hash, role, permissions) VALUES (?,?,?,?,?,?)')
    .run(name, String(email).toLowerCase(), phone || null, bcrypt.hashSync(String(password), 10), 'owner', JSON.stringify(ALL_PERMS));
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

  // Automatically seed starter business for new user
  const cleanName = (name || '').trim();
  const defaultBizName = cleanName.endsWith('s') || cleanName.endsWith('S')
    ? `${cleanName} Enterprises`
    : `${cleanName}'s Business`;
  const bizInfo = db.prepare(`INSERT INTO businesses
    (owner_id, name, legal_name, invoice_prefix, quoter_prefix, default_gst_rate, credit_days, color)
    VALUES (?, ?, ?, 'INV', 'QT', 18, 30, '#4f46e5')`)
    .run(user.id, defaultBizName, defaultBizName);
  const defaultBizId = bizInfo.lastInsertRowid;
  db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(defaultBizId, user.id);
  user.active_business_id = defaultBizId;

  const businesses = getUserBusinesses(user.id, user.email);
  res.json({ token: sign(user), user: publicUser(user), businesses });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  const businesses = getUserBusinesses(user.id, user.email);
  if (!user.active_business_id && businesses.length > 0) {
    db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(businesses[0].id, user.id);
    user.active_business_id = businesses[0].id;
  }
  res.json({ token: sign(user), user: publicUser(user), businesses });
});

router.get('/me', auth, (req, res) => {
  const businesses = getUserBusinesses(req.user.id, req.user.email);
  res.json({ user: publicUser(req.user), businesses });
});

router.put('/me', auth, (req, res) => {
  const { name, phone, lang } = req.body || {};
  db.prepare('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), lang = COALESCE(?, lang) WHERE id = ?')
    .run(name || null, phone || null, lang || null, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

router.post('/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(currentPassword || ''), user.password_hash)) return res.status(401).json({ error: 'Current password is incorrect' });
  if (String(newPassword || '').length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(newPassword), 10), req.user.id);
  res.json({ ok: true });
});

/** Switch the business that the app is currently operating on. */
router.post('/active-business/:id', auth, (req, res) => {
  const list = getUserBusinesses(req.user.id, req.user.email);
  const biz = list.find((b) => b.id === Number(req.params.id));
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(biz.id, req.user.id);
  res.json({ ok: true, business: biz });
});

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role,
    permissions: JSON.parse(u.permissions || '[]'), activeBusinessId: u.active_business_id, lang: u.lang
  };
}

module.exports = { router, publicUser, ALL_PERMS };
