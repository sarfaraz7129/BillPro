'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { auth, loadBusiness, getUserBusinesses, PERMISSIONS } = require('../middleware');
const { normaliseGstin } = require('../lib/gst');
const { logActivity } = require('../lib/service');
const { istToday } = require('../lib/time');
const { ALL_PERMS } = require('./auth');

const router = express.Router();
router.use(auth);

/** All businesses for this account + headline numbers for the consolidated view. */
router.get('/', auth, (req, res) => {
  const businesses = getUserBusinesses(req.user.id, req.user.email);
  const enriched = businesses.map((b) => ({ ...b, stats: businessStats(b.id) }));
  res.json({ businesses: enriched });
});

router.post('/', auth, (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Business name is required' });
  const gstin = normaliseGstin(b.gstin);
  if (b.gstin && !gstin) return res.status(400).json({ error: 'GSTIN format looks invalid (expected 15 characters, e.g. 29ABCDE1234F1Z5)' });
  const info = db.prepare(`INSERT INTO businesses
    (owner_id, name, legal_name, gstin, pan, address, city, state, state_code, pincode, phone, email, website,
     logo_url, bank_name, bank_account_no, bank_ifsc, bank_branch, upi_id, invoice_prefix, quoter_prefix,
     default_gst_rate, composition_scheme, invoice_theme, invoice_footer, terms, credit_days, color)
    VALUES (@owner_id, @name, @legal_name, @gstin, @pan, @address, @city, @state, @state_code, @pincode, @phone,
            @email, @website, @logo_url, @bank_name, @bank_account_no, @bank_ifsc, @bank_branch, @upi_id,
            @invoice_prefix, @quoter_prefix, @default_gst_rate, @composition_scheme, @invoice_theme, @invoice_footer,
            @terms, @credit_days, @color)`)
    .run({
      owner_id: req.user.id,
      name: b.name,
      legal_name: b.legal_name || b.name,
      gstin,
      pan: b.pan || null,
      address: b.address || null,
      city: b.city || null,
      state: b.state || null,
      state_code: gstin ? gstin.slice(0, 2) : (b.state_code || null),
      pincode: b.pincode || null,
      phone: b.phone || null,
      email: b.email || null,
      website: b.website || null,
      logo_url: b.logo_url || null,
      bank_name: b.bank_name || null,
      bank_account_no: b.bank_account_no || null,
      bank_ifsc: b.bank_ifsc || null,
      bank_branch: b.bank_branch || null,
      upi_id: b.upi_id || null,
      invoice_prefix: b.invoice_prefix || 'INV',
      quoter_prefix: b.quoter_prefix || 'QT',
      default_gst_rate: Number(b.default_gst_rate) || 18,
      composition_scheme: b.composition_scheme ? 1 : 0,
      invoice_theme: b.invoice_theme || 'classic',
      invoice_footer: b.invoice_footer || null,
      terms: b.terms || null,
      credit_days: Number(b.credit_days) || 30,
      color: b.color || '#4f46e5'
    });
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(info.lastInsertRowid);
  db.prepare('UPDATE users SET active_business_id = ? WHERE id = ? AND active_business_id IS NULL').run(biz.id, req.user.id);
  logActivity(biz.id, req.user.id, 'business.created', biz.name);
  res.status(201).json({ business: biz });
});

/** Group roll-up: every business side by side + combined totals. Declared before /:id so "group" is not read as an id. */
router.get('/group/overview', auth, (req, res) => {
  const businesses = getUserBusinesses(req.user.id, req.user.email);
  const rows = businesses.map((b) => ({ id: b.id, name: b.name, gstin: b.gstin, state: b.state, color: b.color, ...businessStats(b.id) }));
  const total = rows.reduce((acc, r) => {
    acc.sales += r.sales; acc.purchases += r.purchases; acc.receivable += r.receivable;
    acc.payable += r.payable; acc.outputTax += r.outputTax; acc.inputTax += r.inputTax;
    acc.stockValue += r.stockValue; acc.invoices += r.invoices; acc.overdue += r.overdue;
    return acc;
  }, { sales: 0, purchases: 0, receivable: 0, payable: 0, outputTax: 0, inputTax: 0, stockValue: 0, invoices: 0, overdue: 0 });
  res.json({ businesses: rows, total });
});

router.get('/:id', auth, (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  res.json({ business: biz, stats: businessStats(biz.id) });
});

router.put('/:id', auth, (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  const b = req.body || {};
  const gstin = normaliseGstin(b.gstin || biz.gstin);
  db.prepare(`UPDATE businesses SET name=@name, legal_name=@legal_name, gstin=@gstin, pan=@pan, address=@address,
    city=@city, state=@state, state_code=@state_code, pincode=@pincode, phone=@phone, email=@email, website=@website,
    logo_url=@logo_url, bank_name=@bank_name, bank_account_no=@bank_account_no, bank_ifsc=@bank_ifsc,
    bank_branch=@bank_branch, upi_id=@upi_id, invoice_prefix=@invoice_prefix, quoter_prefix=@quoter_prefix,
    default_gst_rate=@default_gst_rate, composition_scheme=@composition_scheme, invoice_theme=@invoice_theme,
    invoice_footer=@invoice_footer, terms=@terms, credit_days=@credit_days, color=@color WHERE id=@id`)
    .run({
      id: biz.id,
      name: b.name ?? biz.name,
      legal_name: b.legal_name ?? biz.legal_name,
      gstin,
      pan: b.pan ?? biz.pan,
      address: b.address ?? biz.address,
      city: b.city ?? biz.city,
      state: b.state ?? biz.state,
      state_code: gstin ? gstin.slice(0, 2) : (b.state_code ?? biz.state_code),
      pincode: b.pincode ?? biz.pincode,
      phone: b.phone ?? biz.phone,
      email: b.email ?? biz.email,
      website: b.website ?? biz.website,
      logo_url: b.logo_url !== undefined ? (b.logo_url || null) : biz.logo_url,
      bank_name: b.bank_name ?? biz.bank_name,
      bank_account_no: b.bank_account_no ?? biz.bank_account_no,
      bank_ifsc: b.bank_ifsc ?? biz.bank_ifsc,
      bank_branch: b.bank_branch ?? biz.bank_branch,
      upi_id: b.upi_id ?? biz.upi_id,
      invoice_prefix: b.invoice_prefix ?? biz.invoice_prefix,
      quoter_prefix: b.quoter_prefix ?? biz.quoter_prefix,
      default_gst_rate: b.default_gst_rate !== undefined ? Number(b.default_gst_rate) : biz.default_gst_rate,
      composition_scheme: b.composition_scheme !== undefined ? (b.composition_scheme ? 1 : 0) : biz.composition_scheme,
      invoice_theme: b.invoice_theme ?? biz.invoice_theme,
      invoice_footer: b.invoice_footer ?? biz.invoice_footer,
      terms: b.terms ?? biz.terms,
      credit_days: b.credit_days !== undefined ? Number(b.credit_days) : biz.credit_days,
      color: b.color ?? biz.color
    });
  logActivity(biz.id, req.user.id, 'business.updated', biz.name);
  res.json({ business: db.prepare('SELECT * FROM businesses WHERE id = ?').get(biz.id) });
});

router.delete('/:id', auth, (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  db.prepare('DELETE FROM businesses WHERE id = ?').run(biz.id);
  db.prepare('UPDATE users SET active_business_id = NULL WHERE id = ? AND active_business_id = ?').run(req.user.id, biz.id);
  res.json({ ok: true });
});

/** Consolidated numbers across every business the user owns. */
router.get('/:id/summary', auth, (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  res.json({ business: biz, stats: businessStats(biz.id) });
});

/** Add/invite a staff member or accountant to this business with role, password and permissions. */
router.post('/:id/staff', auth, (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  const { name, email, phone, role, permissions, password } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  const cleanEmail = String(email).trim().toLowerCase();
  const staffRole = role || 'staff';
  const staffPerms = JSON.stringify(permissions || ALL_PERMS);

  // Check if a user with this email already exists in users table
  const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);

  if (password && String(password).trim().length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  if (existingUser) {
    // If a new password is provided, update it
    if (password) {
      const hash = bcrypt.hashSync(String(password).trim(), 10);
      db.prepare(`UPDATE users SET password_hash = ?, role = COALESCE(?, role), active_business_id = COALESCE(active_business_id, ?) WHERE id = ?`)
        .run(hash, staffRole, biz.id, existingUser.id);
    }
  } else {
    // For new accounts, require a password so they can log in
    const pwd = password ? String(password).trim() : 'staff1234'; // Default fallback if not provided
    const hash = bcrypt.hashSync(pwd, 10);
    db.prepare(`INSERT INTO users (name, email, phone, password_hash, role, permissions, active_business_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(name, cleanEmail, phone || null, hash, staffRole, staffPerms, biz.id);
  }

  try {
    const existingStaff = db.prepare('SELECT id FROM staff WHERE business_id = ? AND lower(email) = ?').get(biz.id, cleanEmail);
    if (existingStaff) {
      db.prepare('UPDATE staff SET name = ?, phone = ?, role = ?, permissions = ? WHERE id = ?')
        .run(name, phone || null, staffRole, staffPerms, existingStaff.id);
    } else {
      db.prepare('INSERT INTO staff (business_id, name, email, phone, role, permissions, invited) VALUES (?,?,?,?,?,?,0)')
        .run(biz.id, name, cleanEmail, phone || null, staffRole, staffPerms);
    }
  } catch (e) {
    return res.status(409).json({ error: 'Failed to record staff member: ' + e.message });
  }
  res.status(201).json({ staff: db.prepare('SELECT * FROM staff WHERE business_id = ?').all(biz.id) });
});

router.get('/:id/staff', auth, (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  res.json({ staff: db.prepare('SELECT * FROM staff WHERE business_id = ?').all(biz.id) });
});

/** Reset or change password for a team member */
router.put('/:id/staff/:staffId/password', auth, (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  const staffMember = db.prepare('SELECT * FROM staff WHERE id = ? AND business_id = ?').get(req.params.staffId, biz.id);
  if (!staffMember) return res.status(404).json({ error: 'Staff member not found' });

  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).trim().length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const hash = bcrypt.hashSync(String(newPassword).trim(), 10);
  const cleanEmail = staffMember.email.toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (user) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  } else {
    db.prepare(`INSERT INTO users (name, email, phone, password_hash, role, permissions, active_business_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(staffMember.name, cleanEmail, staffMember.phone, hash, staffMember.role, staffMember.permissions, biz.id);
  }

  res.json({ ok: true, message: `Password for ${staffMember.name} updated successfully` });
});

router.delete('/:id/staff/:staffId', auth, (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  db.prepare('DELETE FROM staff WHERE id = ? AND business_id = ?').run(req.params.staffId, biz.id);
  res.json({ ok: true });
});

function businessStats(businessId) {
  const today = istToday();
  const monthStart = today.slice(0, 8) + '01';
  const one = (sql, ...args) => (db.prepare(sql).get(...args) || {});
  const sales = one("SELECT COALESCE(SUM(total),0) s, COUNT(*) n FROM documents WHERE business_id=? AND type='sale' AND status='active'", businessId).s;
  const salesCount = one("SELECT COUNT(*) n FROM documents WHERE business_id=? AND type='sale' AND status='active'", businessId).n;
  const monthSales = one("SELECT COALESCE(SUM(total),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active' AND date >= ?", businessId, monthStart).s;
  const todaySales = one("SELECT COALESCE(SUM(total),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active' AND date = ?", businessId, today).s;
  const purchases = one("SELECT COALESCE(SUM(total),0) s FROM documents WHERE business_id=? AND type='purchase' AND status='active'", businessId).s;
  const receivable = one("SELECT COALESCE(SUM(due_amount),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active'", businessId).s;
  const payable = one("SELECT COALESCE(SUM(due_amount),0) s FROM documents WHERE business_id=? AND type='purchase' AND status='active'", businessId).s;
  const outputTax = one("SELECT COALESCE(SUM(cgst+sgst+igst+cess),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active'", businessId).s;
  const inputTax = one("SELECT COALESCE(SUM(cgst+sgst+igst+cess),0) s FROM documents WHERE business_id=? AND type='purchase' AND status='active'", businessId).s;
  const stockValue = one('SELECT COALESCE(SUM(stock*purchase_price),0) s FROM products WHERE business_id=?', businessId).s;
  const lowStock = one('SELECT COUNT(*) n FROM products WHERE business_id=? AND low_stock_at > 0 AND stock <= low_stock_at', businessId).n;
  const overdue = one("SELECT COALESCE(SUM(due_amount),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active' AND due_amount>0 AND due_date < ?", businessId, today).s;
  const customers = one("SELECT COUNT(*) n FROM parties WHERE business_id=? AND type='customer' AND inactive=0", businessId).n;
  const expenses = one("SELECT COALESCE(SUM(total),0) s FROM documents WHERE business_id=? AND type='expense' AND status='active'", businessId).s;
  return {
    sales: round(sales), salesCount, monthSales: round(monthSales), todaySales: round(todaySales),
    purchases: round(purchases), receivable: round(receivable), payable: round(payable),
    outputTax: round(outputTax), inputTax: round(inputTax), netTax: round(outputTax - inputTax),
    stockValue: round(stockValue), lowStock, overdue: round(overdue), customers, invoices: salesCount,
    expenses: round(expenses), profit: round(sales - purchases - expenses)
  };
}
const round = (x) => Math.round((Number(x) || 0) * 100) / 100;

module.exports = { router, businessStats };
