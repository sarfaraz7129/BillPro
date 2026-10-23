'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { auth, PERMISSIONS } = require('../middleware');
const { istToday, istAddDays } = require('../lib/time');
const { getSystemSettings, updateSystemSettings } = require('../lib/settings');

const router = express.Router();
const ALL_PERMS = Object.keys(PERMISSIONS);

function requireSuperAdmin(req, res, next) {
  if (!req.user || !req.user.is_superadmin) {
    return res.status(403).json({ error: 'Access denied: Super Admin privileges required.' });
  }
  next();
}

router.use(auth);
router.use(requireSuperAdmin);

/**
 * Super Admin Dashboard Overview Stats
 */
router.get('/stats', (req, res) => {
  const today = istToday();
  const totalUsers = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const activeUsers = db.prepare("SELECT COUNT(*) n FROM users WHERE status = 'active'").get().n;
  const suspendedUsers = db.prepare("SELECT COUNT(*) n FROM users WHERE status = 'suspended'").get().n;
  const expiredUsers = db.prepare(`
    SELECT COUNT(*) n FROM users 
    WHERE is_superadmin = 0 AND expires_at IS NOT NULL AND expires_at < ?
  `).get(today).n;

  const totalBusinesses = db.prepare('SELECT COUNT(*) n FROM businesses').get().n;
  const totalInvoices = db.prepare('SELECT COUNT(*) n FROM documents').get().n;

  const totalInquiries = db.prepare('SELECT COUNT(*) n FROM inquiries').get().n;
  const newInquiries = db.prepare("SELECT COUNT(*) n FROM inquiries WHERE status = 'new'").get().n;

  const plans = db.prepare('SELECT plan, COUNT(*) count FROM users GROUP BY plan').all();
  const planMap = { monthly: 0, yearly: 0, lifetime: 0 };
  for (const p of plans) {
    if (p.plan) planMap[p.plan] = p.count;
  }

  res.json({
    ok: true,
    users: {
      total: totalUsers,
      active: activeUsers,
      suspended: suspendedUsers,
      expired: expiredUsers
    },
    businesses: totalBusinesses,
    invoices: totalInvoices,
    inquiries: {
      total: totalInquiries,
      new: newInquiries
    },
    plans: planMap,
    today_ist: today
  });
});

/**
 * List all users / customer accounts
 */
router.get('/users', (req, res) => {
  const today = istToday();
  const users = db.prepare(`
    SELECT id, name, email, phone, role, is_superadmin, status, plan, expires_at, created_at, active_business_id
    FROM users
    ORDER BY id DESC
  `).all();

  const userList = users.map((u) => {
    const isExpired = Boolean(!u.is_superadmin && u.expires_at && u.expires_at < today);
    const businesses = db.prepare('SELECT * FROM businesses WHERE owner_id = ?').all(u.id);
    const bizIds = businesses.map((b) => b.id);
    let invoiceCount = 0;
    if (bizIds.length > 0) {
      const placeholders = bizIds.map(() => '?').join(',');
      invoiceCount = db.prepare(`SELECT COUNT(*) n FROM documents WHERE business_id IN (${placeholders})`).get(...bizIds).n;
    }
    return {
      ...u,
      is_superadmin: Boolean(u.is_superadmin),
      is_expired: isExpired,
      businesses,
      business_count: businesses.length,
      invoice_count: invoiceCount
    };
  });

  res.json({ ok: true, users: userList });
});

/**
 * Helper to compute expiry date based on plan or custom input
 */
function computeExpiry(plan, customDays, customDate) {
  if (customDate) return customDate;
  if (customDays && Number(customDays) > 0) return istAddDays(Number(customDays));
  if (plan === 'lifetime') return null;
  if (plan === 'monthly') return istAddDays(30);
  // Default to yearly
  return istAddDays(365);
}

/**
 * Provision a new customer / client account
 */
router.post('/users', (req, res) => {
  const {
    name, email, password, phone,
    business_name, legal_name, gstin, pan, city, state, pincode, address, upi_id,
    plan = 'yearly', custom_days, expires_at
  } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (exists) {
    return res.status(409).json({ error: 'A user account with this email already exists.' });
  }

  const rawPassword = password && String(password).length >= 6 ? String(password) : 'BillPro@123';
  const finalExpiry = computeExpiry(plan, custom_days, expires_at);

  const userInsert = db.prepare(`
    INSERT INTO users (name, email, phone, password_hash, role, permissions, is_superadmin, status, plan, expires_at)
    VALUES (?, ?, ?, ?, 'owner', ?, 0, 'active', ?, ?)
  `).run(
    name.trim(),
    cleanEmail,
    (phone || '').trim() || null,
    bcrypt.hashSync(rawPassword, 10),
    JSON.stringify(ALL_PERMS),
    plan,
    finalExpiry
  );

  const newUserId = userInsert.lastInsertRowid;

  // Provision primary business
  const cleanBizName = (business_name || '').trim() || `${name.trim()}'s Business`;
  const cleanLegal = (legal_name || '').trim() || cleanBizName;
  const cleanGstin = (gstin || '').trim().toUpperCase() || null;
  const cleanPan = (pan || '').trim().toUpperCase() || (cleanGstin && cleanGstin.length >= 10 ? cleanGstin.slice(2, 12) : null);
  const cleanCity = (city || '').trim() || null;
  const cleanState = (state || '').trim() || null;
  const cleanPincode = (pincode || '').trim() || null;
  const cleanAddress = (address || '').trim() || null;
  const cleanUpi = (upi_id || '').trim() || null;

  const bizInsert = db.prepare(`
    INSERT INTO businesses (owner_id, name, legal_name, gstin, pan, phone, address, city, state, pincode, upi_id, invoice_prefix, quoter_prefix, default_gst_rate, credit_days, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INV', 'QT', 18, 30, '#4f46e5')
  `).run(
    newUserId, cleanBizName, cleanLegal, cleanGstin, cleanPan,
    (phone || '').trim() || null, cleanAddress, cleanCity, cleanState, cleanPincode, cleanUpi
  );

  const newBizId = bizInsert.lastInsertRowid;
  db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(newBizId, newUserId);

  const origin = req.headers.origin || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'https://billpro.in');
  const expiryText = finalExpiry ? `Valid until ${finalExpiry}` : 'Lifetime Access (Never expires)';
  const cleanPhone = (phone || '').trim();

  const welcomeWhatsapp = `👋 *Welcome to BillPro Billing Suite!*\n\nYour business billing account is active:\n🌐 *Login:* ${origin}\n📧 *Login User:* ${cleanEmail}${cleanPhone ? `\n📱 *Mobile:* ${cleanPhone}` : ''}\n🔑 *Password:* ${rawPassword}\n🏢 *Business:* ${cleanBizName}\n📦 *Plan:* ${plan.toUpperCase()} (${expiryText})\n\n💡 Sign in now to start issuing GST invoices, manage stock, and track Khata ledgers!`;

  res.json({
    ok: true,
    user: {
      id: newUserId,
      name: name.trim(),
      email: cleanEmail,
      phone: (phone || '').trim() || null,
      plan,
      expires_at: finalExpiry,
      status: 'active',
      raw_password: rawPassword
    },
    business: {
      id: newBizId,
      name: cleanBizName
    },
    welcome_whatsapp: welcomeWhatsapp
  });
});

/**
 * Edit user details / credentials / plan & business profile
 */
router.put('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const {
    name, email, phone, status, plan, expires_at, new_password, is_superadmin,
    business_name, legal_name, gstin, pan, business_phone, business_email,
    address, city, state, state_code, pincode, invoice_prefix, default_gst_rate, credit_days,
    bank_name, bank_account_no, bank_ifsc, upi_id
  } = req.body || {};

  // Self safety guards
  if (req.user.id === userId) {
    if (status === 'suspended') return res.status(400).json({ error: 'You cannot suspend your own Super Admin account.' });
    if (is_superadmin === false || is_superadmin === 0) return res.status(400).json({ error: 'You cannot remove your own Super Admin privileges.' });
  }

  // Handle email update with uniqueness check
  let updatedEmail = targetUser.email;
  if (email !== undefined && String(email).trim()) {
    const cleanEmail = String(email).trim().toLowerCase();
    if (cleanEmail !== targetUser.email) {
      const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?').get(cleanEmail, userId);
      if (existing) {
        return res.status(409).json({ error: `The email '${cleanEmail}' is already in use by another account.` });
      }
      updatedEmail = cleanEmail;
    }
  }

  const updatedName = name !== undefined ? String(name).trim() : targetUser.name;
  const updatedPhone = phone !== undefined ? ((phone || '').trim() || null) : targetUser.phone;
  const updatedStatus = status !== undefined ? status : targetUser.status;
  const updatedPlan = plan !== undefined ? plan : targetUser.plan;
  const updatedExpiry = expires_at !== undefined ? (expires_at || null) : targetUser.expires_at;
  const updatedIsAdmin = is_superadmin !== undefined ? (is_superadmin ? 1 : 0) : targetUser.is_superadmin;

  let pwdHash = targetUser.password_hash;
  if (new_password && String(new_password).length >= 6) {
    pwdHash = bcrypt.hashSync(String(new_password), 10);
  }

  db.prepare(`
    UPDATE users 
    SET name = ?, email = ?, phone = ?, status = ?, plan = ?, expires_at = ?, is_superadmin = ?, password_hash = ?
    WHERE id = ?
  `).run(updatedName, updatedEmail, updatedPhone, updatedStatus, updatedPlan, updatedExpiry, updatedIsAdmin, pwdHash, userId);

  // Update primary business
  let primaryBiz = null;
  if (targetUser.active_business_id) {
    primaryBiz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(targetUser.active_business_id);
  }
  if (!primaryBiz) {
    primaryBiz = db.prepare('SELECT * FROM businesses WHERE owner_id = ? ORDER BY id ASC LIMIT 1').get(userId);
  }

  if (primaryBiz) {
    const bName = business_name !== undefined ? (String(business_name).trim() || primaryBiz.name) : primaryBiz.name;
    const bLegal = legal_name !== undefined ? (String(legal_name).trim() || null) : primaryBiz.legal_name;
    const bGstin = gstin !== undefined ? (String(gstin).trim().toUpperCase() || null) : primaryBiz.gstin;
    const bPan = pan !== undefined ? (String(pan).trim().toUpperCase() || null) : primaryBiz.pan;
    const bPhone = business_phone !== undefined ? (String(business_phone).trim() || null) : primaryBiz.phone;
    const bEmail = business_email !== undefined ? (String(business_email).trim().toLowerCase() || null) : primaryBiz.email;
    const bAddress = address !== undefined ? (String(address).trim() || null) : primaryBiz.address;
    const bCity = city !== undefined ? (String(city).trim() || null) : primaryBiz.city;
    const bState = state !== undefined ? (String(state).trim() || null) : primaryBiz.state;
    const bStateCode = state_code !== undefined ? (String(state_code).trim() || null) : primaryBiz.state_code;
    const bPincode = pincode !== undefined ? (String(pincode).trim() || null) : primaryBiz.pincode;
    const bPrefix = invoice_prefix !== undefined ? (String(invoice_prefix).trim().toUpperCase() || primaryBiz.invoice_prefix) : primaryBiz.invoice_prefix;
    const bGstRate = default_gst_rate !== undefined ? Number(default_gst_rate) : primaryBiz.default_gst_rate;
    const bCreditDays = credit_days !== undefined ? Number(credit_days) : primaryBiz.credit_days;
    const bBankName = bank_name !== undefined ? (String(bank_name).trim() || null) : primaryBiz.bank_name;
    const bBankAcc = bank_account_no !== undefined ? (String(bank_account_no).trim() || null) : primaryBiz.bank_account_no;
    const bBankIfsc = bank_ifsc !== undefined ? (String(bank_ifsc).trim().toUpperCase() || null) : primaryBiz.bank_ifsc;
    const bUpi = upi_id !== undefined ? (String(upi_id).trim() || null) : primaryBiz.upi_id;

    db.prepare(`
      UPDATE businesses SET
        name = ?,
        legal_name = ?,
        gstin = ?,
        pan = ?,
        phone = ?,
        email = ?,
        address = ?,
        city = ?,
        state = ?,
        state_code = ?,
        pincode = ?,
        invoice_prefix = ?,
        default_gst_rate = ?,
        credit_days = ?,
        bank_name = ?,
        bank_account_no = ?,
        bank_ifsc = ?,
        upi_id = ?
      WHERE id = ?
    `).run(
      bName, bLegal, bGstin, bPan, bPhone, bEmail, bAddress, bCity, bState, bStateCode, bPincode,
      bPrefix, bGstRate, bCreditDays, bBankName, bBankAcc, bBankIfsc, bUpi, primaryBiz.id
    );
  } else if (business_name) {
    const newBizInsert = db.prepare(`
      INSERT INTO businesses (owner_id, name, legal_name, gstin, pan, phone, address, city, state, pincode, upi_id, invoice_prefix, default_gst_rate, credit_days, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INV', 18, 30, '#4f46e5')
    `).run(
      userId,
      String(business_name).trim(),
      legal_name ? String(legal_name).trim() : String(business_name).trim(),
      gstin ? String(gstin).trim().toUpperCase() : null,
      pan ? String(pan).trim().toUpperCase() : null,
      (business_phone || phone || '').trim() || null,
      (address || '').trim() || null,
      (city || '').trim() || null,
      (state || '').trim() || null,
      (pincode || '').trim() || null,
      (upi_id || '').trim() || null
    );
    db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(newBizInsert.lastInsertRowid, userId);
  }

  const updated = db.prepare('SELECT id, name, email, phone, role, is_superadmin, status, plan, expires_at FROM users WHERE id = ?').get(userId);
  const updatedBizList = db.prepare('SELECT * FROM businesses WHERE owner_id = ?').all(userId);

  res.json({
    ok: true,
    user: {
      ...updated,
      is_superadmin: Boolean(updated.is_superadmin),
      businesses: updatedBizList
    }
  });
});

/**
 * Renew customer subscription plan
 */
router.post('/users/:id/renew', (req, res) => {
  const userId = Number(req.params.id);
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const { plan = targetUser.plan || 'yearly', days } = req.body || {};
  const today = istToday();

  // If current expiry is in the future, extend from that date; otherwise extend from today
  const baseDate = (targetUser.expires_at && targetUser.expires_at > today) ? targetUser.expires_at : today;
  let newExpiry = null;

  if (plan === 'lifetime') {
    newExpiry = null;
  } else if (days && Number(days) > 0) {
    newExpiry = istAddDays(Number(days), baseDate);
  } else if (plan === 'monthly') {
    newExpiry = istAddDays(30, baseDate);
  } else {
    // yearly
    newExpiry = istAddDays(365, baseDate);
  }

  db.prepare(`
    UPDATE users SET plan = ?, expires_at = ?, status = 'active' WHERE id = ?
  `).run(plan, newExpiry, userId);

  const updated = db.prepare('SELECT id, name, email, phone, role, is_superadmin, status, plan, expires_at FROM users WHERE id = ?').get(userId);
  res.json({
    ok: true,
    user: { ...updated, is_superadmin: Boolean(updated.is_superadmin) },
    message: `Account renewed successfully under ${plan.toUpperCase()} plan.`
  });
});

/**
 * Delete a customer account and all associated data
 */
router.delete('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  if (req.user.id === userId) {
    return res.status(400).json({ error: 'You cannot delete your own Super Admin account.' });
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  // Delete owned businesses and data
  const bizList = db.prepare('SELECT id FROM businesses WHERE owner_id = ?').all(userId);
  for (const b of bizList) {
    db.prepare('DELETE FROM documents WHERE business_id = ?').run(b.id);
    db.prepare('DELETE FROM transactions WHERE business_id = ?').run(b.id);
    db.prepare('DELETE FROM parties WHERE business_id = ?').run(b.id);
    db.prepare('DELETE FROM products WHERE business_id = ?').run(b.id);
    db.prepare('DELETE FROM stock_moves WHERE business_id = ?').run(b.id);
    db.prepare('DELETE FROM staff WHERE business_id = ?').run(b.id);
    db.prepare('DELETE FROM businesses WHERE id = ?').run(b.id);
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  res.json({ ok: true, message: `User ${target.email} and all associated business records have been removed.` });
});

/**
 * List all inquiries
 */
router.get('/inquiries', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status && status !== 'all') {
    rows = db.prepare('SELECT * FROM inquiries WHERE status = ? ORDER BY id DESC').all(status);
  } else {
    rows = db.prepare('SELECT * FROM inquiries ORDER BY id DESC').all();
  }
  res.json({ ok: true, inquiries: rows });
});

/**
 * Update inquiry status or notes
 */
router.put('/inquiries/:id', (req, res) => {
  const inqId = Number(req.params.id);
  const target = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(inqId);
  if (!target) return res.status(404).json({ error: 'Inquiry not found' });

  const { status, message } = req.body || {};
  db.prepare('UPDATE inquiries SET status = COALESCE(?, status), message = COALESCE(?, message) WHERE id = ?')
    .run(status || null, message || null, inqId);

  const updated = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(inqId);
  res.json({ ok: true, inquiry: updated });
});

/**
 * Convert inquiry directly to a provisioned client account
 */
router.post('/inquiries/:id/convert', (req, res) => {
  const inqId = Number(req.params.id);
  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(inqId);
  if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });

  const { password, plan = inquiry.plan || 'yearly', business_name } = req.body || {};

  // Formulate email if inquiry had none
  const cleanPhone = inquiry.phone.replace(/[^\d]/g, '');
  const candidateEmail = inquiry.email ? inquiry.email.trim().toLowerCase() : `client${cleanPhone.slice(-6)}@billpro.client`;

  // Check if user already exists
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(candidateEmail);
  if (exists) {
    return res.status(409).json({ error: `An account with email '${candidateEmail}' already exists.` });
  }

  const rawPassword = password && String(password).length >= 6 ? String(password) : 'BillPro@123';
  const finalExpiry = computeExpiry(plan);

  const userInsert = db.prepare(`
    INSERT INTO users (name, email, phone, password_hash, role, permissions, is_superadmin, status, plan, expires_at)
    VALUES (?, ?, ?, ?, 'owner', ?, 0, 'active', ?, ?)
  `).run(
    inquiry.name,
    candidateEmail,
    inquiry.phone,
    bcrypt.hashSync(rawPassword, 10),
    JSON.stringify(ALL_PERMS),
    plan,
    finalExpiry
  );

  const newUserId = userInsert.lastInsertRowid;
  const cleanBizName = (business_name || inquiry.shop_name || `${inquiry.name}'s Business`).trim();

  const bizInsert = db.prepare(`
    INSERT INTO businesses (owner_id, name, legal_name, invoice_prefix, quoter_prefix, default_gst_rate, credit_days, color, phone, city)
    VALUES (?, ?, ?, 'INV', 'QT', 18, 30, '#4f46e5', ?, ?)
  `).run(newUserId, cleanBizName, cleanBizName, inquiry.phone, inquiry.city || null);

  const newBizId = bizInsert.lastInsertRowid;
  db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(newBizId, newUserId);

  // Mark inquiry as onboarded
  db.prepare("UPDATE inquiries SET status = 'onboarded' WHERE id = ?").run(inqId);

  const origin = req.headers.origin || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'https://billpro.in');
  const expiryText = finalExpiry ? `Valid until ${finalExpiry}` : 'Lifetime Access (Never expires)';

  const welcomeWhatsapp = `👋 *Welcome to BillPro Billing Suite!*\n\nYour business billing account is active:\n🌐 *Login:* ${origin}\n📧 *Login User:* ${candidateEmail}\n📱 *Mobile:* ${inquiry.phone}\n🔑 *Password:* ${rawPassword}\n🏢 *Business:* ${cleanBizName}\n📦 *Plan:* ${plan.toUpperCase()} (${expiryText})\n\n💡 Sign in now to start issuing GST invoices, manage stock, and track Khata ledgers!`;

  res.json({
    ok: true,
    user: {
      id: newUserId,
      name: inquiry.name,
      email: candidateEmail,
      phone: inquiry.phone,
      plan,
      expires_at: finalExpiry,
      raw_password: rawPassword
    },
    business: {
      id: newBizId,
      name: cleanBizName
    },
    welcome_whatsapp: welcomeWhatsapp
  });
});

/**
 * Delete an inquiry
 */
router.delete('/inquiries/:id', (req, res) => {
  const inqId = Number(req.params.id);
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(inqId);
  res.json({ ok: true, message: 'Inquiry deleted' });
});

/**
 * Get system & pricing settings
 */
router.get('/settings', (req, res) => {
  res.json({
    ok: true,
    settings: getSystemSettings(db)
  });
});

/**
 * Update system & pricing settings
 */
router.put('/settings', (req, res) => {
  updateSystemSettings(db, req.body);
  res.json({ ok: true, message: 'Settings saved successfully' });
});

module.exports = { router };
