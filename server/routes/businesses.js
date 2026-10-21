'use strict';
const express = require('express');
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
      logo_url: b.logo_url ?? biz.logo_url,
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

/** Invite a staff member / accountant to this business with a role + permissions. */
router.post('/:id/staff', auth, (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  const { name, email, phone, role, permissions } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  try {
    db.prepare('INSERT INTO staff (business_id, name, email, phone, role, permissions, invited) VALUES (?,?,?,?,?,?,1)')
      .run(biz.id, name, String(email).toLowerCase(), phone || null, role || 'staff', JSON.stringify(permissions || ALL_PERMS));
  } catch (e) {
    return res.status(409).json({ error: 'That person is already added to this business' });
  }
  res.status(201).json({ staff: db.prepare('SELECT * FROM staff WHERE business_id = ?').all(biz.id) });
});

router.get('/:id/staff', auth, (req, res) => {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  res.json({ staff: db.prepare('SELECT * FROM staff WHERE business_id = ?').all(biz.id) });
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
