'use strict';
const express = require('express');
const { db } = require('../db');
const { auth, loadBusiness } = require('../middleware');
const { documentPdf, statementPdf, tablePdf, money } = require('../lib/pdf');
const { hsnSummary, round2, stateName } = require('../lib/gst');
const { partyBalance } = require('../lib/service');
const { istToday } = require('../lib/time');
const { prepareLedgerRows } = require('../../www/src/ledger');

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
    const rawParty = doc.party_id ? db.prepare('SELECT * FROM parties WHERE id = ?').get(doc.party_id) : null;
    let party = rawParty;
    if (rawParty) {
      const bal = partyBalance(req.business.id, rawParty.id);
      party = {
        ...rawParty,
        balance: bal ? bal.balance : 0,
        direction: bal ? bal.direction : 'DR',
        creditAvailable: bal?.creditAvailable ?? null,
        overLimit: !!bal?.overLimit
      };
    }
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
    const docs = db.prepare(`SELECT id, type, number, date, total, due_amount, paid_amount, payment_status, payment_mode
      FROM documents WHERE business_id = ? AND party_id = ? AND status = 'active'
        AND type IN ('sale', 'purchase', 'sale_return') AND date BETWEEN ? AND ? ORDER BY date, id`)
      .all(req.business.id, party.id, from, to);
    const txns = db.prepare(`SELECT t.id, t.type, t.amount, t.date, t.mode, t.reference, t.notes, t.document_id, t.receipt_group, d.number AS doc_number
      FROM transactions t LEFT JOIN documents d ON d.id = t.document_id AND d.business_id = t.business_id
      WHERE t.business_id = ? AND t.party_id = ? AND t.date BETWEEN ? AND ? ORDER BY t.date, t.id`)
      .all(req.business.id, party.id, from, to);
    let running = round2((party.balance_type === 'CR' ? -1 : 1) * party.opening_balance);
    const entries = [];
    if (party.opening_balance) entries.push({
      kind: 'opening', id: 'opening', date: from > '1900-01-01' ? from : party.created_at.slice(0, 10),
      label: 'Opening balance', reference: party.balance_type,
      debit: party.balance_type === 'DR' ? party.opening_balance : 0,
      credit: party.balance_type === 'CR' ? party.opening_balance : 0,
      balance: running
    });
    const linkedPaid = new Map(db.prepare(`SELECT document_id, type, COALESCE(SUM(amount), 0) amount
      FROM transactions WHERE business_id = ? AND party_id = ? AND document_id IS NOT NULL GROUP BY document_id, type`)
      .all(req.business.id, party.id).map((r) => [`${r.document_id}:${r.type}`, Number(r.amount || 0)]));
    const merged = [
      ...docs.flatMap((d) => {
        const expectedType = d.type === 'sale' ? 'you_got' : 'you_gave';
        const linked = Number(linkedPaid.get(`${d.id}:${expectedType}`) || 0);
        const untrackedPaid = round2(Math.max(0, Number(d.paid_amount || 0) - linked));
        const billEvent = { sort: `${d.date}T1:${String(d.id).padStart(12, '0')}`, eventKind: 'document', ...d };
        if (untrackedPaid <= 0.005) return [billEvent];
        return [billEvent, {
          sort: `${d.date}T2:0:${String(d.id).padStart(12, '0')}`, eventKind: 'transaction',
          id: `legacy-${d.id}`, document_id: d.id, document_number: d.number, type: expectedType,
          amount: untrackedPaid, date: d.date, mode: d.payment_mode, reference: d.number,
          doc_number: d.number, notes: 'Historical bill payment has no separate receipt date; shown on the bill date.', legacy_payment: true
        }];
      }),
      ...txns.map((t) => ({ sort: `${t.date}T2:1:${String(t.id).padStart(12, '0')}`, eventKind: 'transaction', ...t }))
    ].sort((a, b) => a.sort.localeCompare(b.sort));

    merged.forEach((row) => {
      if (row.eventKind === 'document' && row.type === 'sale') {
        running = round2(running + row.total);
        entries.push({ kind: 'invoice', id: row.id, date: row.date, label: `Invoice ${row.number}`, reference: row.number, debit: row.total, credit: 0, balance: running });
      } else if (row.eventKind === 'document' && row.type === 'purchase') {
        running = round2(running - row.total);
        entries.push({ kind: 'bill', id: row.id, date: row.date, label: `Purchase ${row.number}`, reference: row.number, debit: 0, credit: row.total, balance: running });
      } else if (row.eventKind === 'document' && row.type === 'sale_return') {
        running = round2(running - row.total);
        entries.push({ kind: 'sale_return', id: row.id, date: row.date, label: `Sales return ${row.number}`, reference: row.number, debit: 0, credit: row.total, balance: running });
      } else if (row.eventKind === 'transaction' && row.type === 'you_gave') {
        running = round2(running + row.amount);
        entries.push({ kind: 'txn', id: row.id, date: row.date, label: row.legacy_payment ? 'Payment on bill (date unavailable)' : row.doc_number ? 'Payment made' : 'You Gave', reference: row.reference || row.doc_number, document_id: row.document_id || null, document_number: row.doc_number, receipt_group: row.receipt_group || null, mode: row.mode, notes: row.notes, legacy_payment: !!row.legacy_payment, debit: row.amount, credit: 0, balance: running });
      } else if (row.eventKind === 'transaction' && row.type === 'you_got') {
        running = round2(running - row.amount);
        entries.push({ kind: 'txn', id: row.id, date: row.date, label: row.legacy_payment ? 'Payment on bill (date unavailable)' : row.doc_number ? 'Payment received' : 'You Got', reference: row.reference || row.doc_number, document_id: row.document_id || null, document_number: row.doc_number, receipt_group: row.receipt_group || null, mode: row.mode, notes: row.notes, legacy_payment: !!row.legacy_payment, debit: 0, credit: row.amount, balance: running });
      } else if (row.eventKind === 'transaction') {
        running = round2(running + row.amount);
        entries.push({ kind: 'txn', id: row.id, date: row.date, label: row.type === 'interest' ? 'Interest charged' : 'Adjustment', reference: row.mode || '', mode: row.mode, notes: row.notes, debit: row.amount, credit: 0, balance: running });
      }
    });
    const displayEntries = prepareLedgerRows(entries);
    const buf = await statementPdf(req.business, party, displayEntries, null, running);
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
