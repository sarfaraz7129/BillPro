'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { sign, auth, getUserBusinesses, PERMISSIONS } = require('../middleware');
const { istToday } = require('../lib/time');

const router = express.Router();
const ALL_PERMS = Object.keys(PERMISSIONS);
const { getSystemSettings } = require('../lib/settings');

router.get('/sales-info', (req, res) => {
  const current = getSystemSettings(db);
  res.json({
    sales_whatsapp: current.sales_whatsapp,
    sales_phone: current.sales_phone,
    public_signup_enabled: current.public_signup_enabled,
    pricing: {
      monthly: current.pricing_monthly,
      yearly: current.pricing_yearly,
      lifetime: current.pricing_lifetime
    }
  });
});

router.post('/inquire', (req, res) => {
  const { name, phone, email, shop_name, city, plan, message } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and WhatsApp phone number are required' });
  }
  const cleanPhone = String(phone).trim();
  const info = db.prepare(`
    INSERT INTO inquiries (name, phone, email, shop_name, city, plan, message, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
  `).run(
    name.trim(),
    cleanPhone,
    (email || '').trim() || null,
    (shop_name || '').trim() || null,
    (city || '').trim() || null,
    plan || 'yearly',
    (message || '').trim() || null
  );

  const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'sales_whatsapp'").get();
  const salesWhatsapp = setting?.value || '919845012345';

  res.json({
    ok: true,
    inquiry_id: info.lastInsertRowid,
    sales_whatsapp: salesWhatsapp,
    message: 'Your inquiry has been submitted! Our team will activate your account shortly.'
  });
});

router.post('/signup', (req, res) => {
  const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'public_signup_enabled'").get();
  const allowSignup = setting && setting.value === '1';
  if (!allowSignup) {
    return res.status(403).json({
      error: 'Direct public registration is disabled. Please contact sales or submit an inquiry to activate your business license.',
      signup_disabled: true
    });
  }

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
  const cleanInput = String(email || '').trim();
  const cleanEmail = cleanInput.toLowerCase();
  const rawPassword = String(password || '');
  const trimmedPassword = rawPassword.trim();

  const digitsOnly = cleanInput.replace(/\D/g, '');
  const phone10 = digitsOnly.length === 10 ? digitsOnly : (digitsOnly.length === 12 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly);
  const phoneWith91 = digitsOnly.length === 10 ? '91' + digitsOnly : digitsOnly;

  const user = db.prepare(`
    SELECT * FROM users 
    WHERE lower(email) = ? 
       OR (phone IS NOT NULL AND phone != '' AND (phone = ? OR phone = ? OR phone = ? OR replace(replace(replace(replace(phone, ' ', ''), '-', ''), '+', ''), '(', '') = ?))
  `).get(cleanEmail, cleanInput, phone10, phoneWith91, digitsOnly);

  if (!user) {
    return res.status(401).json({ error: 'Incorrect email/phone or password' });
  }

  const pwdMatch = bcrypt.compareSync(rawPassword, user.password_hash) || bcrypt.compareSync(trimmedPassword, user.password_hash);
  if (!pwdMatch) {
    return res.status(401).json({ error: 'Incorrect email/phone or password' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({
      error: 'Your account is suspended by the administrator. Please contact support via WhatsApp.',
      suspended: true
    });
  }
  let businesses;
  if (user.is_superadmin) {
    businesses = db.prepare(`
      SELECT b.*, u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
      FROM businesses b
      LEFT JOIN users u ON u.id = b.owner_id
      ORDER BY b.id ASC
    `).all();
  } else {
    businesses = getUserBusinesses(user.id, user.email);
  }
  if (!user.active_business_id && businesses.length > 0) {
    db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(businesses[0].id, user.id);
    user.active_business_id = businesses[0].id;
  }
  res.json({ token: sign(user), user: publicUser(user), businesses });
});

router.get('/me', auth, (req, res) => {
  let businesses;
  if (req.user.is_superadmin) {
    businesses = db.prepare(`
      SELECT b.*, u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
      FROM businesses b
      LEFT JOIN users u ON u.id = b.owner_id
      ORDER BY b.id ASC
    `).all();
  } else {
    businesses = getUserBusinesses(req.user.id, req.user.email);
  }
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
  let biz;
  if (req.user.is_superadmin) {
    biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(Number(req.params.id));
  } else {
    const list = getUserBusinesses(req.user.id, req.user.email);
    biz = list.find((b) => b.id === Number(req.params.id));
  }
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(biz.id, req.user.id);
  res.json({ ok: true, business: biz });
});

function publicUser(u) {
  const isSuperadmin = Boolean(u.is_superadmin);
  let isExpired = false;
  if (!isSuperadmin && u.expires_at) {
    const today = istToday();
    if (u.expires_at < today) {
      isExpired = true;
    }
  }
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    permissions: JSON.parse(u.permissions || '[]'),
    activeBusinessId: u.active_business_id,
    lang: u.lang,
    is_superadmin: isSuperadmin,
    status: u.status || 'active',
    plan: u.plan || 'yearly',
    expires_at: u.expires_at || null,
    is_expired: isExpired
  };
}

module.exports = { router, publicUser, ALL_PERMS };
