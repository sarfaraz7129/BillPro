'use strict';
const express = require('express');
const { db } = require('../db');
const { auth, loadBusiness } = require('../middleware');
const { documentPdf, statementPdf, tablePdf, money } = require('../lib/pdf');
const { hsnSummary, round2, stateName } = require('../lib/gst');
const { partyBalance } = require('../lib/service');
const { istToday } = require('../lib/time');

const router = express.Router();
router.use(auth, loadBusiness);

const send = (res, buf, filename, asDownload = false) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${asDownload ? 'attachment' : 'inline'}; filename="${filename}"`);
  res.send(buf);
};

/** Invoice / purchase bill / quotation PDF. */
router.get('/invoice/:id', async (req, res, next) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const party = doc.party_id ? db.prepare('SELECT * FROM parties WHERE id = ?').get(doc.party_id) : null;
    const buf = await documentPdf(doc, req.business, party);
    send(res, buf, `${doc.number.replace(/[^\w-]/g, '_')}.pdf`, req.query.download === '1');
  } catch (e) { next(e); }
});

/** Khata-style account statement for a party. */
router.get('/statement/:partyId', async (req, res, next) => {
  try {
    const party = db.prepare('SELECT * FROM parties WHERE id = ? AND business_id = ?').get(req.params.partyId, req.business.id);
    if (!party) return res.status(404).json({ error: 'Party not found' });
    const from = req.query.from || '1900-01-01';
    const to = req.query.to || '2999-12-31';
    const docs = db.prepare("SELECT id, type, number, date, total, due_amount, paid_amount FROM documents WHERE party_id = ? AND status = 'active' AND date BETWEEN ? AND ? ORDER BY date, id").all(party.id, from, to);
    const txns = db.prepare('SELECT id, type, amount, date, mode, reference FROM transactions WHERE party_id = ? AND date BETWEEN ? AND ? ORDER BY date, id').all(party.id, from, to);
    let running = round2((party.balance_type === 'CR' ? -1 : 1) * party.opening_balance);
    const entries = [];
    const merged = [...docs.map((d) => ({ sort: d.date + 'T1', ...d })), ...txns.map((t) => ({ sort: t.date + 'T2', ...t }))].sort((a, b) => a.sort.localeCompare(b.sort));
    merged.forEach((r) => {
      if (r.type === 'sale') { running = round2(running + r.total - r.paid_amount); entries.push({ date: r.date, label: `Invoice ${r.number}`, debit: r.total, credit: r.paid_amount || 0, balance: running }); }
      else if (r.type === 'purchase') { running = round2(running - r.paid_amount); entries.push({ date: r.date, label: `Purchase ${r.number}`, debit: 0, credit: r.paid_amount || 0, balance: running }); }
      else if (r.type === 'you_gave') { running = round2(running + r.amount); entries.push({ date: r.date, label: 'You Gave', reference: r.reference || r.mode, debit: r.amount, credit: 0, balance: running }); }
      else if (r.type === 'you_got') { running = round2(running - r.amount); entries.push({ date: r.date, label: 'You Got', reference: r.reference || r.mode, debit: 0, credit: r.amount, balance: running }); }
      else { running = round2(running + r.amount); entries.push({ date: r.date, label: 'Interest / adjustment', debit: r.amount, credit: 0, balance: running }); }
    });
    const buf = await statementPdf(req.business, party, entries, party.opening_balance ? `Opening balance (${party.balance_type}) ${money(party.opening_balance)}` : null);
    send(res, buf, `Statement-${party.name.replace(/\W+/g, '-')}.pdf`);
  } catch (e) { next(e); }
});

/** Stock report PDF with low-stock highlighting. */
router.get('/stock', async (req, res, next) => {
  try {
    const rows = db.prepare('SELECT * FROM products WHERE business_id = ? AND inactive = 0 ORDER BY name').all(req.business.id);
    const buf = await tablePdf('STOCK REPORT', req.business, [
      { label: 'PRODUCT', key: 'name', weight: 2 },
      { label: 'SKU', key: 'sku' },
      { label: 'HSN', key: 'hsn' },
      { label: 'UNIT', key: 'unit', align: 'left' },
      { label: 'STOCK', get: (r) => r.stock, align: 'right', color: (r) => (r.low_stock_at > 0 && r.stock <= r.low_stock_at ? '#b91c1c' : '#0f172a') },
      { label: 'PURCHASE', get: (r) => money(r.purchase_price), align: 'right' },
      { label: 'SALE', get: (r) => money(r.sale_price), align: 'right' },
      { label: 'STOCK VALUE', get: (r) => money(r.stock * r.purchase_price), align: 'right' }
    ], rows, `${rows.length} products  |  Stock value ${money(rows.reduce((s, r) => s + r.stock * r.purchase_price, 0))}`);
    send(res, buf, 'Stock-report.pdf');
  } catch (e) { next(e); }
});

/** GSTR-1 summary PDF for the accountant. */
router.get('/gstr1', async (req, res, next) => {
  try {
    const today = istToday();
    const from = req.query.from || today.slice(0, 8) + '01';
    const to = req.query.to || today;
    const docs = db.prepare("SELECT * FROM documents WHERE business_id=? AND type='sale' AND status='active' AND date BETWEEN ? AND ?").all(req.business.id, from, to);
    const lines = [];
    docs.forEach((d) => lines.push(...JSON.parse(d.items)));
    const rows = hsnSummary(lines);
    const buf = await tablePdf('GSTR-1 HSN SUMMARY', req.business, [
      { label: 'HSN/SAC', key: 'hsn' },
      { label: 'DESCRIPTION', key: 'desc', weight: 2 },
      { label: 'UQC', key: 'unit' },
      { label: 'QTY', key: 'qty', align: 'right' },
      { label: 'GST %', key: 'gstRate', align: 'right' },
      { label: 'TAXABLE', get: (r) => money(r.taxable), align: 'right' },
      { label: 'CGST', get: (r) => money(r.cgst), align: 'right' },
      { label: 'SGST', get: (r) => money(r.sgst), align: 'right' },
      { label: 'IGST', get: (r) => money(r.igst), align: 'right' }
    ], rows, `Period ${from} to ${to}  |  ${docs.length} invoices  |  Turnover ${money(docs.reduce((s, d) => s + d.total, 0))}`);
    send(res, buf, `GSTR1-${from}.pdf`);
  } catch (e) { next(e); }
});

/** Party-wise outstanding (receivables) PDF. */
router.get('/outstanding', async (req, res, next) => {
  try {
    const parties = db.prepare("SELECT * FROM parties WHERE business_id = ? AND type = ? AND inactive = 0 ORDER BY name").all(req.business.id, req.query.type || 'customer');
    const rows = parties.map((p) => ({ ...p, ...partyBalance(req.business.id, p.id) })).filter((p) => Math.abs(p.balance) > 0.005);
    rows.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    const buf = await tablePdf(req.query.type === 'supplier' ? 'PAYABLES (SUPPLIERS)' : 'OUTSTANDING RECEIVABLES', req.business, [
      { label: 'PARTY', key: 'name', weight: 2 },
      { label: 'PHONE', key: 'phone' },
      { label: 'GSTIN', key: 'gstin' },
      { label: 'CREDIT LIMIT', get: (r) => (r.credit_limit ? money(r.credit_limit) : '-'), align: 'right' },
      { label: 'BALANCE', get: (r) => money(Math.abs(r.balance)), align: 'right', color: (r) => (r.balance >= 0 ? '#b91c1c' : '#047857') },
      { label: 'DR/CR', key: 'direction', align: 'center' }
    ], rows, `${rows.length} parties  |  Total ${money(rows.reduce((s, r) => s + Math.abs(r.balance), 0))}`);
    send(res, buf, 'Outstanding.pdf');
  } catch (e) { next(e); }
});

module.exports = { router };
