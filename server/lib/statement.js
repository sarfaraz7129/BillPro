'use strict';

const { db } = require('../db');
const { round2 } = require('./gst');

/** Build the single source of truth for a party statement, used by both Khata JSON and PDF. */
function buildPartyStatement(businessId, party, from = '1900-01-01', to = '2999-12-31') {
  const docs = db.prepare(`SELECT id, type, number, date, total, due_amount, paid_amount, payment_status, payment_mode, status
    FROM documents WHERE business_id = ? AND party_id = ? AND status = 'active'
      AND type IN ('sale', 'purchase', 'sale_return') AND date BETWEEN ? AND ? ORDER BY date, id`)
    .all(businessId, party.id, from, to);
  const txns = db.prepare(`SELECT t.id, t.type, t.amount, t.date, t.mode, t.reference, t.notes, t.document_id, t.receipt_group,
      d.number AS doc_number
    FROM transactions t LEFT JOIN documents d ON d.id = t.document_id AND d.business_id = t.business_id
    WHERE t.business_id = ? AND t.party_id = ? AND t.date BETWEEN ? AND ? ORDER BY t.date, t.id`)
    .all(businessId, party.id, from, to);

  let running = round2((party.balance_type === 'CR' ? -1 : 1) * party.opening_balance);
  const entries = [];
  if (party.opening_balance) {
    entries.push({ kind: 'opening', id: 'opening', date: from > '1900-01-01' ? from : party.created_at.slice(0, 10), label: 'Opening balance', reference: party.balance_type,
      debit: party.balance_type === 'DR' ? party.opening_balance : 0,
      credit: party.balance_type === 'CR' ? party.opening_balance : 0, balance: running });
  }

  const linkedPaid = new Map(db.prepare(`SELECT document_id, type, COALESCE(SUM(amount), 0) amount
    FROM transactions WHERE business_id = ? AND party_id = ? AND document_id IS NOT NULL GROUP BY document_id, type`)
    .all(businessId, party.id).map((r) => [`${r.document_id}:${r.type}`, Number(r.amount || 0)]));
  const merged = [
    ...docs.flatMap((doc) => {
      const expectedType = doc.type === 'sale' ? 'you_got' : 'you_gave';
      const linked = Number(linkedPaid.get(`${doc.id}:${expectedType}`) || 0);
      const untrackedPaid = round2(Math.max(0, Number(doc.paid_amount || 0) - linked));
      const billEvent = { sort: `${doc.date}T00:00:01:${String(doc.id).padStart(12, '0')}`, eventKind: 'document', ...doc };
      if (untrackedPaid <= 0.005) return [billEvent];
      return [billEvent, {
        sort: `${doc.date}T00:00:02:0:${String(doc.id).padStart(12, '0')}`,
        eventKind: 'transaction', id: `legacy-${doc.id}`, document_id: doc.id, type: expectedType,
        amount: untrackedPaid, date: doc.date, mode: doc.payment_mode, reference: doc.number,
        doc_number: doc.number,
        notes: 'Historical bill payment has no separate receipt date; shown on the bill date.', legacy_payment: true
      }];
    }),
    ...txns.map((txn) => ({ sort: `${txn.date}T00:00:02:1:${String(txn.id).padStart(12, '0')}`, eventKind: 'transaction', ...txn }))
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  for (const row of merged) {
    if (row.eventKind === 'document' && row.type === 'sale') {
      running = round2(running + row.total);
      entries.push({ kind: 'invoice', id: row.id, date: row.date, label: `Invoice ${row.number}`, reference: row.number,
        debit: row.total, credit: 0, balance: running, payment_status: row.payment_status, due_amount: row.due_amount, paid_amount: row.paid_amount });
    } else if (row.eventKind === 'document' && row.type === 'purchase') {
      running = round2(running - row.total);
      entries.push({ kind: 'bill', id: row.id, date: row.date, label: `Purchase ${row.number}`, reference: row.number,
        debit: 0, credit: row.total, balance: running, payment_status: row.payment_status, due_amount: row.due_amount, paid_amount: row.paid_amount });
    } else if (row.eventKind === 'document' && row.type === 'sale_return') {
      running = round2(running - row.total);
      entries.push({ kind: 'sale_return', id: row.id, date: row.date, label: `Sales return ${row.number}`, reference: row.number,
        debit: 0, credit: row.total, balance: running, payment_status: row.payment_status, due_amount: row.due_amount, paid_amount: row.paid_amount });
    } else if (row.eventKind === 'transaction' && row.type === 'you_gave') {
      running = round2(running + row.amount);
      entries.push({ kind: 'txn', id: row.id, date: row.date, label: row.doc_number ? 'Payment made' : 'You Gave',
        reference: row.reference || row.doc_number, document_id: row.document_id || null, document_number: row.doc_number,
        receipt_group: row.receipt_group || null, mode: row.mode, notes: row.notes, legacy_payment: !!row.legacy_payment,
        debit: row.amount, credit: 0, balance: running });
    } else if (row.eventKind === 'transaction' && row.type === 'you_got') {
      running = round2(running - row.amount);
      entries.push({ kind: 'txn', id: row.id, date: row.date, label: row.doc_number ? 'Payment received' : 'You Got',
        reference: row.reference || row.doc_number, document_id: row.document_id || null, document_number: row.doc_number,
        receipt_group: row.receipt_group || null, mode: row.mode, notes: row.notes, legacy_payment: !!row.legacy_payment,
        debit: 0, credit: row.amount, balance: running });
    } else if (row.eventKind === 'transaction' && (row.type === 'interest' || row.type === 'adjustment')) {
      running = round2(running + row.amount);
      entries.push({ kind: 'txn', id: row.id, date: row.date,
        label: row.type === 'interest' ? 'Interest charged' : 'Adjustment', notes: row.notes,
        debit: row.amount, credit: 0, balance: running });
    }
  }

  const totals = {
    debit: round2(entries.reduce((sum, entry) => sum + (entry.debit || 0), 0)),
    credit: round2(entries.reduce((sum, entry) => sum + (entry.credit || 0), 0))
  };
  return { entries, totals, running };
}

module.exports = { buildPartyStatement };
