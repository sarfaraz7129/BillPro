'use strict';
/**
 * Shared business rules: party balances, stock posting, payment status.
 * Everything that touches money or stock goes through here so invoices,
 * khata entries and stock adjustments can never drift out of sync.
 */
const { db } = require('../db');
const { round2, computeTotals, nextDocumentNumber, financialYear } = require('./gst');
const { istToday, istFinancialYear, isIstDate } = require('./time');

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
  const items = Array.isArray(doc.items) ? doc.items : JSON.parse(doc.items || '[]');
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
function buildDocument(business, body, type, existing = null) {
  const supplyType = body.supplyType === 'inter' ? 'inter' : (body.supplyType === 'intra' ? 'intra' : inferSupply(business, body));

  const transportation = Number(body.transportation !== undefined ? body.transportation : (existing ? existing.transportation : 0)) || 0;
  const loadingCharges = Number(body.loadingCharges !== undefined ? body.loadingCharges : (body.loading_charges !== undefined ? body.loading_charges : (existing ? existing.loading_charges : 0))) || 0;
  const extraCharges = Number(body.extraCharges !== undefined ? body.extraCharges : (body.extra_charges !== undefined ? body.extra_charges : (body.extra !== undefined ? body.extra : (existing ? existing.extra_charges : 0)))) || 0;
  const bagsCount = body.bagsCount !== undefined ? String(body.bagsCount).trim() : (body.bags_count !== undefined ? String(body.bags_count).trim() : (body.bags !== undefined ? String(body.bags).trim() : (existing ? existing.bags_count : null)));

  const totals = computeTotals(body.items, {
    discountType: body.discountType || (existing ? existing.discount_type : 'flat'),
    discountValue: Number(body.discountValue !== undefined ? body.discountValue : (existing ? existing.discount_value : 0)),
    roundOff: body.roundOff !== false,
    cessRate: Number(body.cessRate !== undefined ? body.cessRate : (existing ? existing.cess : 0)),
    transportation,
    loadingCharges,
    extraCharges,
    bagsCount,
    supplyType
  });
  const paid = round2(Number(body.paidAmount !== undefined ? body.paidAmount : (body.paid_amount !== undefined ? body.paid_amount : (existing ? existing.paid_amount : 0))));
  return {
    business_id: business.id,
    type,
    number: existing ? existing.number : (body.number || takeNumber(business.id, type)),
    party_id: body.partyId !== undefined ? body.partyId : (body.party_id !== undefined ? body.party_id : (existing ? existing.party_id : null)),
    party_name: body.partyName || body.party_name || (existing ? existing.party_name : 'Walk-in Customer'),
    party_gstin: body.partyGstin !== undefined ? body.partyGstin : (body.party_gstin !== undefined ? body.party_gstin : (existing ? existing.party_gstin : null)),
    party_state_code: body.partyStateCode !== undefined ? body.partyStateCode : (body.party_state_code !== undefined ? body.party_state_code : (existing ? existing.party_state_code : null)),
    party_address: body.partyAddress !== undefined ? body.partyAddress : (body.party_address !== undefined ? body.party_address : (existing ? existing.party_address : null)),
    date: (body.date && isIstDate(body.date)) ? body.date : (existing ? existing.date : istToday()),
    due_date: body.dueDate !== undefined ? body.dueDate : (body.due_date !== undefined ? body.due_date : (existing ? existing.due_date : null)),
    place_of_supply: body.placeOfSupply || body.place_of_supply || (existing ? existing.place_of_supply : business.state_code),
    supply_type: supplyType,
    currency: body.currency || (existing ? existing.currency : 'INR'),
    items: JSON.stringify(totals.lines),
    subtotal: totals.subtotal,
    discount_type: body.discountType || (existing ? existing.discount_type : 'flat'),
    discount_value: Number(body.discountValue !== undefined ? body.discountValue : (existing ? existing.discount_value : 0)),
    discount_amount: totals.discountAmount,
    taxable_value: totals.taxableValue,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    cess: totals.cess,
    transportation,
    loading_charges: loadingCharges,
    bags_count: bagsCount || null,
    extra_charges: extraCharges,
    round_off: totals.roundOff,
    total: totals.total,
    amount_in_words: totals.amountInWords,
    paid_amount: round2(paid),
    due_amount: round2(Math.max(0, totals.total - paid)),
    payment_status: paid <= 0 ? 'unpaid' : paid >= totals.total - 0.005 ? 'paid' : 'partial',
    payment_mode: body.paymentMode || body.payment_mode || (existing ? existing.payment_mode : null),
    status: body.status || (existing ? existing.status : 'active'),
    notes: body.notes !== undefined ? body.notes : (existing ? existing.notes : ''),
    transport_doc_no: body.transportDocNo !== undefined ? body.transportDocNo : (body.transport_doc_no !== undefined ? body.transport_doc_no : (existing ? existing.transport_doc_no : null)),
    vehicle_no: body.vehicleNo !== undefined ? body.vehicleNo : (body.vehicle_no !== undefined ? body.vehicle_no : (existing ? existing.vehicle_no : null)),
    ewaybill_no: body.ewaybillNo !== undefined ? body.ewaybillNo : (body.ewaybill_no !== undefined ? body.ewaybill_no : (existing ? existing.ewaybill_no : null)),
    ewaybill_date: body.ewaybillDate !== undefined ? body.ewaybillDate : (body.ewaybill_date !== undefined ? body.ewaybill_date : (existing ? existing.ewaybill_date : null)),
    ewaybill_valid_upto: body.ewaybillValidUpto !== undefined ? body.ewaybillValidUpto : (body.ewaybill_valid_upto !== undefined ? body.ewaybill_valid_upto : (existing ? existing.ewaybill_valid_upto : null)),
    irn: existing ? existing.irn : (body.irn || null),
    ack_no: existing ? existing.ack_no : (body.ackNo || body.ack_no || null),
    ack_date: existing ? existing.ack_date : (body.ackDate || body.ack_date || null),
    signed_by: body.signedBy || body.signed_by || (existing ? existing.signed_by : null),
    created_by: existing ? existing.created_by : (body.createdBy || body.created_by || null),
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
  taxable_value, cgst, sgst, igst, cess, transportation, loading_charges, bags_count, extra_charges, round_off, total, amount_in_words, paid_amount, due_amount,
  payment_status, payment_mode, status, notes, transport_doc_no, vehicle_no, ewaybill_no, ewaybill_date,
  ewaybill_valid_upto, irn, ack_no, ack_date, signed_by, created_by`;

const DOC_PLACEHOLDERS = DOC_COLS.split(',').map(() => '?').join(',');

function docValues(d) {
  return [
    d.business_id ?? null, d.type ?? null, d.number ?? null, d.party_id ?? null, d.party_name ?? null, d.party_gstin ?? null, d.party_state_code ?? null, d.date ?? null, d.due_date ?? null,
    d.place_of_supply ?? null, d.supply_type ?? null, d.currency ?? 'INR', d.items ?? '[]', d.subtotal ?? 0, d.discount_type ?? 'flat', d.discount_value ?? 0, d.discount_amount ?? 0,
    d.taxable_value ?? 0, d.cgst ?? 0, d.sgst ?? 0, d.igst ?? 0, d.cess ?? 0, d.transportation ?? 0, d.loading_charges ?? 0, d.bags_count ?? null, d.extra_charges ?? 0, d.round_off ?? 0, d.total ?? 0, d.amount_in_words ?? '', d.paid_amount ?? 0, d.due_amount ?? 0,
    d.payment_status ?? 'unpaid', d.payment_mode ?? null, d.status ?? 'active', d.notes ?? '', d.transport_doc_no ?? null, d.vehicle_no ?? null, d.ewaybill_no ?? null, d.ewaybill_date ?? null,
    d.ewaybill_valid_upto ?? null, d.irn ?? null, d.ack_no ?? null, d.ack_date ?? null, d.signed_by ?? null, d.created_by ?? null
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
