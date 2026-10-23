'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { auth, PERMISSIONS } = require('../middleware');
const { istToday, istAddDays } = require('../lib/time');
const { getSystemSettings, updateSystemSettings } = require('../lib/settings');
const { normaliseGstin } = require('../lib/gst');
const { saveToRegistry, removeFromRegistry, hasPersistentRegistryStorage } = require('../lib/persistent-clients');

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

function saveUserSnapshotToRegistry(userId, previousEmail) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, error: 'User not found' };
  const business = db.prepare('SELECT * FROM businesses WHERE owner_id = ? ORDER BY id LIMIT 1').get(userId);
  const parties = business ? db.prepare('SELECT name, contact_name, phone, email, type, city, state FROM parties WHERE business_id = ?').all(business.id) : [];
  const record = {
    name: user.name,
    email: user.email,
    phone: user.phone,
    initial_password: user.initial_password || null,
    password_hash: user.password_hash,
    plan: user.plan || 'yearly',
    expires_at: user.plan === 'lifetime' ? null : user.expires_at,
    status: user.status || 'active',
    business: business ? {
      name: business.name, legal_name: business.legal_name, gstin: business.gstin, pan: business.pan,
      phone: business.phone, city: business.city, state: business.state, state_code: business.state_code,
      pincode: business.pincode, invoice_prefix: business.invoice_prefix, estimate_prefix: business.estimate_prefix,
      estimate_counter: business.estimate_counter, default_bill_mode: business.default_bill_mode,
      default_gst_rate: business.default_gst_rate, credit_days: business.credit_days
    } : null,
    parties,
    ...(previousEmail && previousEmail !== user.email ? { previous_email: previousEmail } : {})
  };
  return saveToRegistry(record);
}

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
    WHERE is_superadmin = 0 AND plan != 'lifetime' AND expires_at IS NOT NULL AND expires_at < ?
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
    SELECT id, name, email, phone, role, is_superadmin, status, plan, expires_at, created_at, active_business_id, initial_password
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
      initial_password: u.initial_password || (u.email === 'zoheb@billpro.in' ? 'demo1234' : 'BillPro@123'),
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
  if (plan === 'lifetime') return null;
  if (customDate) return customDate;
  if (customDays && Number(customDays) > 0) return istAddDays(Number(customDays));
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
    INSERT INTO users (name, email, phone, password_hash, role, permissions, is_superadmin, status, plan, expires_at, initial_password)
    VALUES (?, ?, ?, ?, 'owner', ?, 0, 'active', ?, ?, ?)
  `).run(
    name.trim(),
    cleanEmail,
    (phone || '').trim() || null,
    bcrypt.hashSync(rawPassword, 10),
    JSON.stringify(ALL_PERMS),
    plan,
    finalExpiry,
    rawPassword
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

  const registrySave = saveToRegistry({
    name: name.trim(),
    email: cleanEmail,
    phone: (phone || '').trim() || null,
    password: rawPassword,
    plan,
    expires_at: finalExpiry,
    status: 'active',
    business: {
      name: cleanBizName,
      legal_name: cleanLegal,
      gstin: cleanGstin,
      pan: cleanPan,
      phone: (phone || '').trim() || null,
      city: cleanCity,
      state: cleanState,
      pincode: cleanPincode,
      upi_id: cleanUpi
    }
  });

  const origin = req.headers.origin || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'https://billpro.in');
  const expiryText = finalExpiry ? `Valid until ${finalExpiry}` : 'Lifetime Access (Never expires)';
  const cleanPhone = (phone || '').trim();

  const welcomeWhatsapp = `👋 *Welcome to BillPro Billing Suite!*\n\nYour business billing account is active:\n🌐 *Login:* ${origin}\n📧 *Login User:* ${cleanEmail}${cleanPhone ? `\n📱 *Mobile:* ${cleanPhone}` : ''}\n🔑 *Password:* ${rawPassword}\n🏢 *Business:* ${cleanBizName}\n📦 *Plan:* ${plan.toUpperCase()} (${expiryText})\n\n💡 Sign in now to start issuing GST invoices, manage stock, and track Khata ledgers!`;
  const persistenceWarning = !hasPersistentRegistryStorage()
    ? 'This server is using ephemeral storage. Attach a Render Persistent Disk and set BILLPRO_DATA_DIR=/var/data or this new account may be lost on redeploy.'
    : (!registrySave.ok ? `Account created, but persistence snapshot failed: ${registrySave.error}` : null);

  res.json({
    ok: true,
    persistence_warning: persistenceWarning,
    user: {
      id: newUserId,
      name: name.trim(),
      email: cleanEmail,
      phone: (phone || '').trim() || null,
      plan,
      expires_at: finalExpiry,
      status: 'active',
      raw_password: rawPassword,
      initial_password: rawPassword
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
  const updatedStatus = (req.user.id === userId) ? 'active' : (status !== undefined ? status : targetUser.status);
  const updatedPlan = plan !== undefined ? plan : targetUser.plan;
  const updatedExpiry = updatedPlan === 'lifetime' ? null : (expires_at !== undefined ? (expires_at || null) : targetUser.expires_at);
  const updatedIsAdmin = (req.user.id === userId) ? 1 : (is_superadmin !== undefined ? (is_superadmin ? 1 : 0) : targetUser.is_superadmin);

  let pwdHash = targetUser.password_hash;
  let rawPassword = targetUser.initial_password || (targetUser.email === 'zoheb@billpro.in' ? 'demo1234' : 'BillPro@123');
  if (new_password && String(new_password).trim().length >= 6) {
    rawPassword = String(new_password).trim();
    pwdHash = bcrypt.hashSync(rawPassword, 10);
    db.prepare('UPDATE users SET initial_password = ? WHERE id = ?').run(rawPassword, userId);
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

    let bGstin = primaryBiz.gstin;
    if (gstin !== undefined) {
      const trimmed = String(gstin || '').trim();
      bGstin = trimmed ? (normaliseGstin(trimmed) || trimmed.toUpperCase()) : null;
    }

    const bPan = pan !== undefined ? (String(pan).trim().toUpperCase() || null) : (bGstin && bGstin.length >= 12 ? bGstin.slice(2, 12) : primaryBiz.pan);
    const bPhone = business_phone !== undefined ? (String(business_phone).trim() || null) : primaryBiz.phone;
    const bEmail = business_email !== undefined ? (String(business_email).trim().toLowerCase() || null) : primaryBiz.email;
    const bAddress = address !== undefined ? (String(address).trim() || null) : primaryBiz.address;
    const bCity = city !== undefined ? (String(city).trim() || null) : primaryBiz.city;
    const bState = state !== undefined ? (String(state).trim() || null) : primaryBiz.state;
    const bStateCode = state_code !== undefined ? (String(state_code).trim() || null) : (bGstin && bGstin.length >= 2 ? bGstin.slice(0, 2) : primaryBiz.state_code);
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

  const registrySave = saveUserSnapshotToRegistry(userId, targetUser.email);
  const persistenceWarning = !hasPersistentRegistryStorage()
    ? 'Runtime storage is ephemeral. Attach a Render Persistent Disk and set BILLPRO_DATA_DIR=/var/data to keep this update across deployments.'
    : (!registrySave.ok ? `Profile was updated, but registry snapshot failed: ${registrySave.error}` : null);

  const origin = req.headers.origin || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'https://billpro.in');
  const expiryText = updatedExpiry ? `Valid until ${updatedExpiry}` : 'Lifetime Access (Never expires)';
  const welcomeWhatsapp = `👋 *Welcome to BillPro Billing Suite!*\n\nYour business billing account is active:\n🌐 *Login:* ${origin}\n📧 *Login User:* ${updatedEmail}${updatedPhone ? `\n📱 *Mobile:* ${updatedPhone}` : ''}\n🔑 *Password:* ${rawPassword}\n🏢 *Business:* ${primaryBiz ? primaryBiz.name : 'Your Business'}\n📦 *Plan:* ${(updatedPlan || 'yearly').toUpperCase()} (${expiryText})\n\n💡 Sign in now to start issuing GST invoices, manage stock, and track Khata ledgers!`;

  const updated = db.prepare('SELECT id, name, email, phone, role, is_superadmin, status, plan, expires_at, initial_password FROM users WHERE id = ?').get(userId);
  const updatedBizList = db.prepare('SELECT * FROM businesses WHERE owner_id = ?').all(userId);

  res.json({
    ok: true,
    persistence_warning: persistenceWarning,
    user: {
      ...updated,
      initial_password: rawPassword,
      raw_password: rawPassword,
      is_superadmin: Boolean(updated.is_superadmin),
      businesses: updatedBizList
    },
    welcome_whatsapp: welcomeWhatsapp
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
  const registrySave = saveUserSnapshotToRegistry(userId);
  const persistenceWarning = !hasPersistentRegistryStorage()
    ? 'Runtime storage is ephemeral. Attach a Render Persistent Disk and set BILLPRO_DATA_DIR=/var/data to keep this renewal across deployments.'
    : (!registrySave.ok ? `Renewal was saved, but registry snapshot failed: ${registrySave.error}` : null);
  res.json({
    ok: true,
    persistence_warning: persistenceWarning,
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
  const registryResult = removeFromRegistry(target.email);

  res.json({
    ok: true,
    persistence_warning: !registryResult.ok ? `Registry cleanup failed: ${registryResult.error}` : null,
    message: `User ${target.email} and all associated business records have been removed.`
  });
});

/**
 * Add / lock a client into persistent_registry.json
 */
router.post('/users/:id/persist', (req, res) => {
  const userId = Number(req.params.id);
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  if (!hasPersistentRegistryStorage()) {
    return res.status(409).json({
      error: 'Permanent locking is unavailable on ephemeral storage. Attach a Render Persistent Disk mounted at /var/data and set BILLPRO_DATA_DIR=/var/data, then retry.'
    });
  }

  const primaryBiz = db.prepare('SELECT * FROM businesses WHERE owner_id = ? ORDER BY id ASC LIMIT 1').get(userId);
  const saved = saveUserSnapshotToRegistry(userId);
  if (!saved.ok) return res.status(500).json({ error: `Could not persist client: ${saved.error}` });

  res.json({
    ok: true,
    message: `${targetUser.name} & ${primaryBiz ? primaryBiz.name : 'account'} locked into persistent storage.`,
    storage: 'persistent'
  });
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
    INSERT INTO users (name, email, phone, password_hash, role, permissions, is_superadmin, status, plan, expires_at, initial_password)
    VALUES (?, ?, ?, ?, 'owner', ?, 0, 'active', ?, ?, ?)
  `).run(
    inquiry.name,
    candidateEmail,
    inquiry.phone,
    bcrypt.hashSync(rawPassword, 10),
    JSON.stringify(ALL_PERMS),
    plan,
    finalExpiry,
    rawPassword
  );

  const newUserId = userInsert.lastInsertRowid;
  const cleanBizName = (business_name || inquiry.shop_name || `${inquiry.name}'s Business`).trim();

  const bizInsert = db.prepare(`
    INSERT INTO businesses (owner_id, name, legal_name, invoice_prefix, quoter_prefix, default_gst_rate, credit_days, color, phone, city)
    VALUES (?, ?, ?, 'INV', 'QT', 18, 30, '#4f46e5', ?, ?)
  `).run(newUserId, cleanBizName, cleanBizName, inquiry.phone, inquiry.city || null);

  const newBizId = bizInsert.lastInsertRowid;
  db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(newBizId, newUserId);

  const registrySave = saveToRegistry({
    name: inquiry.name,
    email: candidateEmail,
    phone: inquiry.phone,
    password: rawPassword,
    plan,
    expires_at: finalExpiry,
    status: 'active',
    business: {
      name: cleanBizName,
      phone: inquiry.phone,
      city: inquiry.city || null
    }
  });

  // Mark inquiry as onboarded
  db.prepare("UPDATE inquiries SET status = 'onboarded' WHERE id = ?").run(inqId);

  const origin = req.headers.origin || (req.headers.host ? `${req.protocol}://${req.headers.host}` : 'https://billpro.in');
  const expiryText = finalExpiry ? `Valid until ${finalExpiry}` : 'Lifetime Access (Never expires)';

  const welcomeWhatsapp = `👋 *Welcome to BillPro Billing Suite!*\n\nYour business billing account is active:\n🌐 *Login:* ${origin}\n📧 *Login User:* ${candidateEmail}\n📱 *Mobile:* ${inquiry.phone}\n🔑 *Password:* ${rawPassword}\n🏢 *Business:* ${cleanBizName}\n📦 *Plan:* ${plan.toUpperCase()} (${expiryText})\n\n💡 Sign in now to start issuing GST invoices, manage stock, and track Khata ledgers!`;

  const persistenceWarning = !hasPersistentRegistryStorage()
    ? 'This server is using ephemeral storage. Attach a Render Persistent Disk and set BILLPRO_DATA_DIR=/var/data or this account may be lost on redeploy.'
    : (!registrySave.ok ? `Account created, but persistence snapshot failed: ${registrySave.error}` : null);

  res.json({
    ok: true,
    persistence_warning: persistenceWarning,
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

/**
 * Persistence & Storage Status
 */
router.get('/persistence-status', (req, res) => {
  const dataDir = process.env.BILLPRO_DATA_DIR || path.join(__dirname, '..', '..', 'data');
  const isRenderDisk = Boolean(process.env.BILLPRO_DATA_DIR && process.env.BILLPRO_DATA_DIR.startsWith('/var/data'));
  const isCustomPersistent = Boolean(process.env.BILLPRO_DATA_DIR);
  const dbPath = process.env.BILLPRO_DB || path.join(dataDir, 'billpro.db');
  const dbExists = fs.existsSync(dbPath);
  const dbStats = dbExists ? fs.statSync(dbPath) : null;

  res.json({
    ok: true,
    storage: {
      isPersistent: isRenderDisk || isCustomPersistent,
      isRenderDisk,
      dataDir,
      dbPath,
      dbSizeBytes: dbStats ? dbStats.size : 0,
      mode: (isRenderDisk || isCustomPersistent) ? 'persistent' : 'ephemeral',
      message: (isRenderDisk || isCustomPersistent)
        ? 'Persistent storage active (/var/data). Database is preserved across deployments.'
        : 'Running on ephemeral container disk. Attach a Render Persistent Disk (/var/data) or download backups periodically to preserve data permanently.'
    }
  });
});

/**
 * Download Database Backup (.json full snapshot or raw .db)
 */
router.get('/backup', (req, res) => {
  try {
    const format = req.query.format || 'json';
    const dataDir = process.env.BILLPRO_DATA_DIR || path.join(__dirname, '..', '..', 'data');
    const dbPath = process.env.BILLPRO_DB || path.join(dataDir, 'billpro.db');

    if (format === 'db') {
      if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'Database file not found' });
      res.setHeader('Content-Type', 'application/x-sqlite3');
      res.setHeader('Content-Disposition', `attachment; filename="billpro-backup-${new Date().toISOString().slice(0, 10)}.db"`);
      return res.sendFile(dbPath);
    }

    // JSON Snapshot of everything
    const snapshot = {
      version: 2,
      exported_at: new Date().toISOString(),
      users: db.prepare('SELECT id, name, email, phone, role, permissions, active_business_id, lang, is_superadmin, status, plan, expires_at, initial_password, password_hash, created_at FROM users').all(),
      businesses: db.prepare('SELECT * FROM businesses').all(),
      parties: db.prepare('SELECT * FROM parties').all(),
      products: db.prepare('SELECT * FROM products').all(),
      product_categories: db.prepare('SELECT * FROM product_categories').all(),
      documents: db.prepare('SELECT * FROM documents').all(),
      transactions: db.prepare('SELECT * FROM transactions').all(),
      stock_moves: db.prepare('SELECT * FROM stock_moves').all(),
      staff: db.prepare('SELECT * FROM staff').all()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="billpro-data-snapshot-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate backup: ' + err.message });
  }
});

/**
 * Restore from a full JSON snapshot. Remaps IDs by email/business ownership so a
 * fresh Render database can safely restore into newly allocated SQLite IDs.
 */
router.post('/restore', (req, res) => {
  try {
    const data = req.body;
    if (!data || (!Array.isArray(data.businesses) && !Array.isArray(data.users))) {
      return res.status(400).json({ error: 'Invalid backup format. Expected users or businesses arrays.' });
    }

    const maps = {
      users: new Map(), businesses: new Map(), parties: new Map(), products: new Map(), documents: new Map()
    };
    const restored = { users: 0, businesses: 0, parties: 0, products: 0, documents: 0, transactions: 0, stock_moves: 0 };
    const configuredAdminEmail = String(process.env.BILLPRO_SUPERADMIN_EMAIL || process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
    const publicDemoEmails = ['demo@billpro.in', 'admin@billpro.in', 'demo.user@billpro.in'];
    const tableColumnCache = new Map();
    const tableColumns = (table) => {
      if (!tableColumnCache.has(table)) tableColumnCache.set(table, new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)));
      return tableColumnCache.get(table);
    };
    const filtered = (table, row, omitId = true) => Object.fromEntries(
      Object.entries(row || {}).filter(([key, value]) => tableColumns(table).has(key) && !(omitId && key === 'id') && value !== undefined)
    );
    const insertRow = (table, row) => {
      const clean = filtered(table, row, true);
      const keys = Object.keys(clean);
      if (!keys.length) throw new Error(`No restorable columns for ${table}`);
      const info = db.prepare(`INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
        .run(...keys.map((k) => clean[k]));
      return Number(info.lastInsertRowid);
    };
    const updateRow = (table, id, row) => {
      const clean = filtered(table, row, true);
      const keys = Object.keys(clean);
      if (keys.length) db.prepare(`UPDATE ${table} SET ${keys.map((k) => `"${k}"=?`).join(',')} WHERE id=?`)
        .run(...keys.map((k) => clean[k]), id);
    };

    const tx = db.transaction(() => {
      // Restore/merge users by email, never by their old SQLite row IDs.
      for (const original of (Array.isArray(data.users) ? data.users : [])) {
        const email = String(original.email || '').trim().toLowerCase();
        if (!email) continue;
        const row = { ...original, email };
        if (row.plan === 'lifetime') row.expires_at = null;
        if (process.env.NODE_ENV === 'production' && publicDemoEmails.includes(email)) row.is_superadmin = 0;
        const existing = db.prepare('SELECT * FROM users WHERE lower(email)=?').get(email);
        let id;
        if (existing) {
          if (email === configuredAdminEmail) {
            row.password_hash = existing.password_hash;
            row.is_superadmin = 1;
            row.role = 'owner';
          }
          delete row.active_business_id;
          updateRow('users', existing.id, row);
          id = existing.id;
        } else {
          delete row.active_business_id;
          id = insertRow('users', row);
        }
        if (original.id !== undefined) maps.users.set(Number(original.id), id);
        restored.users++;
      }

      // Restore businesses by mapped owner and natural business identity.
      for (const original of (Array.isArray(data.businesses) ? data.businesses : [])) {
        const ownerId = maps.users.get(Number(original.owner_id)) || Number(original.owner_id);
        if (!db.prepare('SELECT id FROM users WHERE id=?').get(ownerId)) continue;
        const row = { ...original, owner_id: ownerId };
        const existing = db.prepare(`SELECT id FROM businesses WHERE owner_id=? AND
          (lower(name)=lower(?) OR (? IS NOT NULL AND gstin=?)) ORDER BY id LIMIT 1`)
          .get(ownerId, original.name || '', original.gstin || null, original.gstin || null);
        const id = existing ? existing.id : insertRow('businesses', row);
        if (existing) updateRow('businesses', id, row);
        if (original.id !== undefined) maps.businesses.set(Number(original.id), id);
        restored.businesses++;
      }

      // Now that tenant IDs are mapped, restore parties, categories, products and staff.
      for (const original of (Array.isArray(data.parties) ? data.parties : [])) {
        const businessId = maps.businesses.get(Number(original.business_id)) || Number(original.business_id);
        if (!db.prepare('SELECT id FROM businesses WHERE id=?').get(businessId)) continue;
        const row = { ...original, business_id: businessId };
        const existing = (original.id && db.prepare('SELECT id FROM parties WHERE id=? AND business_id=?').get(original.id, businessId))
          || db.prepare('SELECT id FROM parties WHERE business_id=? AND type=? AND lower(name)=lower(?)').get(businessId, original.type || 'customer', original.name || '');
        const id = existing ? existing.id : insertRow('parties', row);
        if (existing) updateRow('parties', id, row);
        if (original.id !== undefined) maps.parties.set(Number(original.id), id);
        restored.parties++;
      }

      for (const original of (Array.isArray(data.product_categories) ? data.product_categories : [])) {
        const business_id = maps.businesses.get(Number(original.business_id)) || Number(original.business_id);
        if (!db.prepare('SELECT id FROM businesses WHERE id=?').get(business_id)) continue;
        const exists = db.prepare('SELECT id FROM product_categories WHERE business_id=? AND lower(name)=lower(?)').get(business_id, original.name);
        if (exists) updateRow('product_categories', exists.id, { ...original, business_id });
        else insertRow('product_categories', { ...original, business_id });
      }

      for (const original of (Array.isArray(data.products) ? data.products : [])) {
        const business_id = maps.businesses.get(Number(original.business_id)) || Number(original.business_id);
        if (!db.prepare('SELECT id FROM businesses WHERE id=?').get(business_id)) continue;
        const row = { ...original, business_id };
        const existing = (original.id && db.prepare('SELECT id FROM products WHERE id=? AND business_id=?').get(original.id, business_id))
          || (original.sku ? db.prepare('SELECT id FROM products WHERE business_id=? AND sku=?').get(business_id, original.sku) : null)
          || db.prepare('SELECT id FROM products WHERE business_id=? AND lower(name)=lower(?)').get(business_id, original.name || '');
        const id = existing ? existing.id : insertRow('products', row);
        if (existing) updateRow('products', id, row);
        if (original.id !== undefined) maps.products.set(Number(original.id), id);
        restored.products++;
      }

      for (const original of (Array.isArray(data.documents) ? data.documents : [])) {
        const business_id = maps.businesses.get(Number(original.business_id)) || Number(original.business_id);
        if (!db.prepare('SELECT id FROM businesses WHERE id=?').get(business_id)) continue;
        const party_id = original.party_id == null ? null : (maps.parties.get(Number(original.party_id)) || null);
        const created_by = original.created_by == null ? null : (maps.users.get(Number(original.created_by)) || null);
        let items = original.items;
        try {
          const parsed = typeof items === 'string' ? JSON.parse(items) : (items || []);
          items = JSON.stringify(parsed.map((line) => line && line.product_id != null
            ? { ...line, product_id: maps.products.get(Number(line.product_id)) || null }
            : line));
        } catch (_) { items = typeof original.items === 'string' ? original.items : '[]'; }
        const row = { ...original, business_id, party_id, created_by, items };
        const existing = (original.id && db.prepare('SELECT id FROM documents WHERE id=? AND business_id=?').get(original.id, business_id))
          || db.prepare('SELECT id FROM documents WHERE business_id=? AND type=? AND number=?').get(business_id, original.type, original.number);
        const id = existing ? existing.id : insertRow('documents', row);
        if (existing) updateRow('documents', id, row);
        if (original.id !== undefined) maps.documents.set(Number(original.id), id);
        restored.documents++;
      }

      for (const original of (Array.isArray(data.transactions) ? data.transactions : [])) {
        const business_id = maps.businesses.get(Number(original.business_id)) || Number(original.business_id);
        const party_id = maps.parties.get(Number(original.party_id)) || Number(original.party_id);
        if (!db.prepare('SELECT id FROM businesses WHERE id=?').get(business_id) || !db.prepare('SELECT id FROM parties WHERE id=?').get(party_id)) continue;
        const row = { ...original, business_id, party_id, document_id: original.document_id == null ? null : (maps.documents.get(Number(original.document_id)) || null) };
        const existing = db.prepare(`SELECT id FROM transactions WHERE business_id=? AND party_id=? AND type=? AND amount=? AND date=? AND COALESCE(reference,'')=COALESCE(?,'') AND COALESCE(document_id,0)=COALESCE(?,0) LIMIT 1`)
          .get(business_id, party_id, original.type, original.amount, original.date, original.reference || null, row.document_id);
        if (existing) updateRow('transactions', existing.id, row); else insertRow('transactions', row);
        restored.transactions++;
      }

      for (const original of (Array.isArray(data.stock_moves) ? data.stock_moves : [])) {
        const business_id = maps.businesses.get(Number(original.business_id)) || Number(original.business_id);
        const product_id = maps.products.get(Number(original.product_id)) || null;
        if (!product_id || !db.prepare('SELECT id FROM businesses WHERE id=?').get(business_id)) continue;
        const row = { ...original, business_id, product_id, document_id: original.document_id == null ? null : (maps.documents.get(Number(original.document_id)) || null) };
        const existing = db.prepare(`SELECT id FROM stock_moves WHERE business_id=? AND product_id=? AND date=? AND reason=? AND qty=? AND COALESCE(document_id,0)=COALESCE(?,0) AND COALESCE(notes,'')=COALESCE(?,'') LIMIT 1`)
          .get(business_id, product_id, original.date, original.reason, original.qty, row.document_id, original.notes || null);
        if (existing) updateRow('stock_moves', existing.id, row); else insertRow('stock_moves', row);
        restored.stock_moves++;
      }

      for (const original of (Array.isArray(data.staff) ? data.staff : [])) {
        const business_id = maps.businesses.get(Number(original.business_id)) || Number(original.business_id);
        if (!db.prepare('SELECT id FROM businesses WHERE id=?').get(business_id)) continue;
        const existing = db.prepare('SELECT id FROM staff WHERE business_id=? AND lower(email)=lower(?)').get(business_id, original.email);
        if (existing) updateRow('staff', existing.id, { ...original, business_id });
        else insertRow('staff', { ...original, business_id });
      }

      // Reconnect each user's active business to the newly mapped ID.
      for (const original of (Array.isArray(data.users) ? data.users : [])) {
        if (original.id == null || original.active_business_id == null) continue;
        const userId = maps.users.get(Number(original.id));
        const businessId = maps.businesses.get(Number(original.active_business_id));
        if (userId && businessId) db.prepare('UPDATE users SET active_business_id=? WHERE id=?').run(businessId, userId);
      }
    });
    tx();
    const registryWarning = hasPersistentRegistryStorage() ? null : 'This restore is on ephemeral storage; download a backup before every redeploy or restart.';
    res.json({ ok: true, message: 'Data restored successfully!', restored, persistence_warning: registryWarning });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore data: ' + err.message });
  }
});

module.exports = { router };
