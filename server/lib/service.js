'use strict';
/**
 * Shared business rules: party balances, stock posting, payment status.
 * Everything that touches money or stock goes through here so invoices,
 * khata entries and stock adjustments can never drift out of sync.
 */
const { db } = require('../db');
const { round2, computeTotals, nextDocumentNumber, financialYear } = require('./gst');
const { istToday, istFinancialYear } = require('./time');

/**
 * Party balance, in "what they owe us" terms:
 *   opening balance
 * + outstanding on sale invoices
 * + you-gave entries
 * - you-got entries
 * - payments captured on purchase documents
 * Positive => they owe you (DR). Negative => you owe them (CR).
 */
function partyBalance(businessId, partyId) {
  const party = db.prepare('SELECT * FROM parties WHERE id = ? AND business_id = ?').get(partyId, businessId);
  if (!party) return null;
  const sign = party.balance_type === 'CR' ? -1 : 1;
  let bal = round2(sign * party.opening_balance);
  const sales = db.prepare("SELECT COALESCE(SUM(total - paid_amount),0) s FROM documents WHERE party_id = ? AND type = 'sale' AND status = 'active'").get(partyId);
  const purchases = db.prepare("SELECT COALESCE(SUM(total - paid_amount),0) s FROM documents WHERE party_id = ? AND type = 'purchase' AND status = 'active'").get(partyId);
  const txns = db.prepare("SELECT COALESCE(SUM(CASE WHEN type='you_gave' THEN amount WHEN type='you_got' THEN -amount ELSE 0 END),0) s FROM transactions WHERE party_id = ? AND document_id IS NULL").get(partyId);
  bal = round2(bal + sales.s + txns.s - purchases.s);
  return {
    party,
    balance: bal,
    direction: bal >= 0 ? 'DR' : 'CR',
    creditLimit: party.credit_limit,
    creditAvailable: party.credit_limit ? round2(party.credit_limit - Math.max(0, bal)) : null,
    overLimit: !!party.credit_limit && bal > party.credit_limit
  };
}

function documentTotals(partyId) {
  const rows = db.prepare("SELECT type, COALESCE(SUM(total),0) billed, COALESCE(SUM(due_amount),0) due, COUNT(*) n FROM documents WHERE party_id = ? AND status='active' GROUP BY type").all(partyId);
  return rows.reduce((a, r) => { a[r.type] = { billed: r.billed, due: r.due, count: r.n }; return a; }, {});
}

function refreshPaymentStatus(docId, paidOverride) {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!doc) return;
  const paid = paidOverride === undefined ? doc.paid_amount : paidOverride;
  const status = paid <= 0 ? 'unpaid' : paid >= doc.total - 0.005 ? 'paid' : 'partial';
  db.prepare('UPDATE documents SET paid_amount = ?, due_amount = ?, payment_status = ? WHERE id = ?')
    .run(round2(paid), round2(Math.max(0, doc.total - paid)), status, docId);
}

/** Reserve the next number for a document type, incrementing the business counter. */
function takeNumber(businessId, type) {
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId);
  if (type === 'quotation') {
    const fy = istFinancialYear();
    const n = biz.quoter_counter + 1;
    db.prepare('UPDATE businesses SET quoter_counter = ? WHERE id = ?').run(n, businessId);
    return `${biz.quoter_prefix}-${fy}-${n}`;
  }
  const fy = istFinancialYear();
  const n = biz.invoice_counter + 1;
  db.prepare('UPDATE businesses SET invoice_counter = ? WHERE id = ?').run(n, businessId);
  return `${biz.invoice_prefix}-${fy}-${n}`;
}

/** Apply stock movement for every line of a document (sale = out, purchase = in). */
function postStock(businessId, doc, direction) {
  const items = JSON.parse(doc.items || '[]');
  const insert = db.prepare(`INSERT INTO stock_moves (business_id, product_id, qty, date, reason, document_id, rate, notes)
                             VALUES (?,?,?,?,?,?,?,?)`);
  const move = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND business_id = ?');
  items.forEach((line) => {
    if (!line.product_id) return;
    const qty = (Number(line.qty) || 0) * direction;
    if (!qty) return;
    insert.run(businessId, line.product_id, qty, doc.date, direction < 0 ? 'sale' : 'purchase', doc.id, line.rate || 0, doc.number);
    move.run(qty, line.product_id, businessId);
  });
}

function unwindStock(businessId, doc) {
  const moves = db.prepare('SELECT * FROM stock_moves WHERE document_id = ?').all(doc.id);
  const move = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND business_id = ?');
  moves.forEach((m) => move.run(m.qty, m.product_id, businessId));
  db.prepare('DELETE FROM stock_moves WHERE document_id = ?').run(doc.id);
}

/** Build a document row from a request body, computing GST + totals server-side. */
function buildDocument(business, body, type, existing) {
  const supplyType = body.supplyType === 'inter' ? 'inter' : (body.supplyType === 'intra' ? 'intra' : inferSupply(business, body));
  const totals = computeTotals(body.items, {
    discountType: body.discountType,
    discountValue: Number(body.discountValue) || 0,
    roundOff: body.roundOff !== false,
    cessRate: Number(body.cessRate) || 0,
    supplyType
  });
  const paid = round2(Number(body.paidAmount) || 0);
  return {
    business_id: business.id,
    type,
    number: existing ? existing.number : takeNumber(business.id, type),
    party_id: body.partyId || null,
    party_name: body.partyName || 'Walk-in Customer',
    party_gstin: body.partyGstin || null,
    party_state_code: body.partyStateCode || null,
    date: body.date || istToday(),
    due_date: body.dueDate || null,
    place_of_supply: body.placeOfSupply || business.state_code,
    supply_type: supplyType,
    currency: body.currency || 'INR',
    items: JSON.stringify(totals.lines),
    subtotal: totals.subtotal,
    discount_type: body.discountType || 'flat',
    discount_value: Number(body.discountValue) || 0,
    discount_amount: totals.discountAmount,
    taxable_value: totals.taxableValue,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    cess: totals.cess,
    round_off: totals.roundOff,
    total: totals.total,
    amount_in_words: totals.amountInWords,
    paid_amount: round2(paid),
    due_amount: round2(Math.max(0, totals.total - paid)),
    payment_status: paid <= 0 ? 'unpaid' : paid >= totals.total - 0.005 ? 'paid' : 'partial',
    payment_mode: body.paymentMode || null,
    status: body.status || 'active',
    notes: body.notes || '',
    transport_doc_no: body.transportDocNo || null,
    vehicle_no: body.vehicleNo || null,
    ewaybill_no: body.ewaybillNo || null,
    ewaybill_date: body.ewaybillDate || null,
    ewaybill_valid_upto: body.ewaybillValidUpto || null,
    signed_by: body.signedBy || null,
    totals
  };
}

function inferSupply(business, body) {
  const partyCode = body.partyStateCode;
  if (!partyCode || !business.state_code) return 'intra';
  return String(partyCode).padStart(2, '0') === String(business.state_code).padStart(2, '0') ? 'intra' : 'inter';
}

const DOC_COLS = `business_id, type, number, party_id, party_name, party_gstin, party_state_code, date, due_date,
  place_of_supply, supply_type, currency, items, subtotal, discount_type, discount_value, discount_amount,
  taxable_value, cgst, sgst, igst, cess, round_off, total, amount_in_words, paid_amount, due_amount,
  payment_status, payment_mode, status, notes, transport_doc_no, vehicle_no, ewaybill_no, ewaybill_date,
  ewaybill_valid_upto, irn, ack_no, ack_date, signed_by, created_by`;

const DOC_PLACEHOLDERS = DOC_COLS.split(',').map(() => '?').join(',');

function docValues(d) {
  return [
    d.business_id, d.type, d.number, d.party_id, d.party_name, d.party_gstin, d.party_state_code, d.date, d.due_date,
    d.place_of_supply, d.supply_type, d.currency, d.items, d.subtotal, d.discount_type, d.discount_value, d.discount_amount,
    d.taxable_value, d.cgst, d.sgst, d.igst, d.cess, d.round_off, d.total, d.amount_in_words, d.paid_amount, d.due_amount,
    d.payment_status, d.payment_mode, d.status, d.notes, d.transport_doc_no, d.vehicle_no, d.ewaybill_no, d.ewaybill_date,
    d.ewaybill_valid_upto, d.irn, d.ack_no, d.ack_date, d.signed_by, d.created_by
  ];
}

function logActivity(businessId, userId, action, detail) {
  db.prepare('INSERT INTO activity (business_id, user_id, action, detail) VALUES (?,?,?,?)').run(businessId, userId, action, detail || '');
}

module.exports = {
  partyBalance,
  documentTotals,
  refreshPaymentStatus,
  takeNumber,
  postStock,
  unwindStock,
  buildDocument,
  DOC_COLS,
  DOC_PLACEHOLDERS,
  docValues,
  logActivity,
  financialYear
};
