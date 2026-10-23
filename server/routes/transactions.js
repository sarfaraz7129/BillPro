'use strict';
const express = require('express');
const { db } = require('../db');
const { auth, loadBusiness } = require('../middleware');
const { round2 } = require('../lib/gst');
const { logActivity, partyBalance } = require('../lib/service');
const { istToday } = require('../lib/time');

const router = express.Router();
router.use(auth, loadBusiness);

const MODES = ['cash', 'upi', 'bank', 'card', 'cheque', 'credit'];

/** All ledger entries for the active business, newest first. */
router.get('/', (req, res) => {
  const from = req.query.from || '1900-01-01';
  const to = req.query.to || '2999-12-31';
  const partyId = req.query.partyId || null;
  const type = req.query.type || null;
  let rows = db.prepare(`SELECT t.*, p.name AS party_name, p.phone, d.number AS doc_number
    FROM transactions t LEFT JOIN parties p ON p.id = t.party_id LEFT JOIN documents d ON d.id = t.document_id
    WHERE t.business_id = ? AND t.date BETWEEN ? AND ? ORDER BY t.date DESC, t.id DESC`).all(req.business.id, from, to);
  if (partyId) rows = rows.filter((r) => String(r.party_id) === String(partyId));
  if (type) rows = rows.filter((r) => r.type === type);
  const totals = rows.reduce((a, r) => {
    if (r.type === 'you_got') a.received += r.amount;
    if (r.type === 'you_gave') a.paid += r.amount;
    if (r.mode && r.mode !== 'credit') a.byMode[r.mode] = round2((a.byMode[r.mode] || 0) + r.amount);
    return a;
  }, { received: 0, paid: 0, byMode: {} });
  res.json({ transactions: rows, totals: { received: round2(totals.received), paid: round2(totals.paid), byMode: totals.byMode, count: rows.length } });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const amount = round2(Number(b.amount));
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
  const party = db.prepare('SELECT * FROM parties WHERE id = ? AND business_id = ?').get(b.partyId, req.business.id);
  if (!party) return res.status(404).json({ error: 'Party not found' });
  const mode = MODES.includes(b.mode) ? b.mode : 'cash';
  const entryDate = (req.isAdmin && b.date) ? b.date : istToday();
  const info = db.prepare(`INSERT INTO transactions (business_id, party_id, type, amount, date, mode, reference, document_id, notes)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(req.business.id, party.id, b.type === 'you_gave' ? 'you_gave' : 'you_got', amount,
      entryDate, mode, b.reference || null, b.documentId || null, b.notes || null);
  logActivity(req.business.id, req.user.id, 'payment.recorded', `${party.name} ${b.type === 'you_gave' ? 'paid out' : 'received'} ${amount}`);
  res.status(201).json({
    transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid),
    balance: currentBalance(party.id)
  });
});

router.put('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM transactions WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
  if (!t) return res.status(404).json({ error: 'Entry not found' });
  const b = req.body || {};
  const amount = b.amount !== undefined ? round2(Number(b.amount)) : t.amount;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
  db.prepare('UPDATE transactions SET type = ?, amount = ?, date = ?, mode = ?, reference = ?, notes = ? WHERE id = ?')
    .run(b.type || t.type, amount, b.date || t.date, MODES.includes(b.mode) ? b.mode : t.mode, b.reference ?? t.reference, b.notes ?? t.notes, t.id);
  res.json({ transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(t.id) });
});

router.delete('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM transactions WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
  if (!t) return res.status(404).json({ error: 'Entry not found' });
  db.prepare('DELETE FROM transactions WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

/** Charge overdue interest on a party's outstanding balance. */
router.post('/interest', (req, res) => {
  const b = req.body || {};
  const party = db.prepare('SELECT * FROM parties WHERE id = ? AND business_id = ?').get(b.partyId, req.business.id);
  if (!party) return res.status(404).json({ error: 'Party not found' });
  const rate = Number(b.rate) || 18;
  const days = Number(b.days) || 30;
  const onAmount = Number(b.onAmount) || currentBalance(party.id);
  if (onAmount <= 0) return res.status(400).json({ error: 'No outstanding balance to charge interest on' });
  const interest = round2((onAmount * rate * days) / 36500);
  const interestDate = (req.isAdmin && b.date) ? b.date : istToday();
  const info = db.prepare(`INSERT INTO transactions (business_id, party_id, type, amount, date, mode, notes)
    VALUES (?,?,?,?,?,?,?)`)
    .run(req.business.id, party.id, 'interest', interest, interestDate, 'cash',
      `Interest @${rate}% p.a. for ${days} days on ${round2(onAmount)}`);
  res.status(201).json({ transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid), balance: currentBalance(party.id) });
});

function currentBalance(partyId) {
  const p = db.prepare('SELECT business_id FROM parties WHERE id = ?').get(partyId);
  if (!p) return 0;
  const pb = partyBalance(p.business_id, partyId);
  return pb ? pb.balance : 0;
}

module.exports = { router, MODES };
