'use strict';
const express = require('express');
const QRCode = require('qrcode');
const { db } = require('../db');
const { auth, loadBusiness } = require('../middleware');
const { buildDocument, DOC_COLS, DOC_PLACEHOLDERS, docValues, postStock, unwindStock, logActivity, partyBalance } = require('../lib/service');
const { buildEinvoicePayload, buildEwayBillPayload, round2, hsnSummary } = require('../lib/gst');
const { istToday, istTime, istIso, istAddDays, formatIstDateTime } = require('../lib/time');

const router = express.Router();

/** Public direct PDF download link (used by WhatsApp, SMS, email, and direct bill download). */
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).send('Document not found');
    const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(doc.business_id);
    const rawParty = doc.party_id ? db.prepare('SELECT * FROM parties WHERE id = ?').get(doc.party_id) : null;
    let party = rawParty;
    if (rawParty) {
      const { partyBalance } = require('../lib/service');
      const bal = partyBalance(doc.business_id, rawParty.id);
      party = {
        ...rawParty,
        balance: bal ? bal.balance : 0,
        direction: bal ? bal.direction : 'DR',
        creditAvailable: bal?.creditAvailable ?? null,
        overLimit: !!bal?.overLimit
      };
    }
    const { documentPdf } = require('../lib/pdf');
    const buf = await documentPdf(doc, business, party);
    const filename = `${doc.number.replace(/[^\w-]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${filename}"`);
    res.send(buf);
  } catch (e) { next(e); }
});

router.use(auth, loadBusiness);

const TYPES = ['sale', 'purchase', 'quotation', 'expense'];

router.get('/', (req, res) => {
  const type = req.query.type || 'sale';
  const status = req.query.status || '';
  const q = (req.query.q || '').trim().toLowerCase();
  const from = req.query.from || '1900-01-01';
  const to = req.query.to || '2999-12-31';
  const partyId = req.query.partyId || null;

  let rows = db.prepare(`SELECT d.*, p.name AS party_display, p.phone AS party_phone FROM documents d
    LEFT JOIN parties p ON p.id = d.party_id
    WHERE d.business_id = ? AND d.type = ? AND d.date BETWEEN ? AND ?
    ORDER BY d.date DESC, d.id DESC`).all(req.business.id, type, from, to);
  if (status) rows = rows.filter((r) => r.payment_status === status || r.status === status);
  if (partyId) rows = rows.filter((r) => String(r.party_id) === String(partyId));
  if (q) rows = rows.filter((r) => [r.number, r.party_name, r.party_display, r.party_gstin].some((f) => String(f || '').toLowerCase().includes(q)));

  const totals = rows.reduce((a, r) => {
    a.billed += r.total; a.due += r.due_amount; a.tax += r.cgst + r.sgst + r.igst + r.cess;
    if (r.payment_status === 'unpaid') a.unpaid++; else if (r.payment_status === 'partial') a.partial++; else a.paid++;
    return a;
  }, { billed: 0, due: 0, tax: 0, unpaid: 0, partial: 0, paid: 0 });
  res.json({
    documents: rows.map(hydrate),
    totals: { ...totals, billed: round2(totals.billed), due: round2(totals.due), tax: round2(totals.tax), count: rows.length }
  });
});

/** Overdue invoices across the business - drives the reminder queue. */
router.get('/reminders/overdue', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT d.*, p.name AS party_display, p.phone FROM documents d LEFT JOIN parties p ON p.id = d.party_id
    WHERE d.business_id = ? AND d.type = 'sale' AND d.status = 'active' AND d.due_amount > 0
    ORDER BY d.due_date IS NULL, d.due_date ASC, d.date ASC`).all(req.business.id);
  const buckets = { overdue: [], dueSoon: [], unpaid: [] };
  rows.forEach((r) => {
    const days = r.due_date ? Math.floor((new Date(today) - new Date(r.due_date)) / 86400000) : null;
    if (days !== null && days > 0) buckets.overdue.push({ ...hydrate(r), daysOverdue: days });
    else if (days !== null && days >= -7) buckets.dueSoon.push({ ...hydrate(r), daysToDue: -days });
    else buckets.unpaid.push(hydrate(r));
  });
  res.json({ ...buckets, totalDue: round2(rows.reduce((s, r) => s + r.due_amount, 0)) });
});

router.get('/:id', (req, res) => {
  const doc = getDoc(req, req.params.id);
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
  const payments = db.prepare('SELECT * FROM transactions WHERE document_id = ? ORDER BY date').all(doc.id);
  res.json({ document: doc, party, payments, ewaybill: doc.ewaybill_no ? buildEwayBillPayload(doc, req.business, party) : null });
});

router.post('/', (req, res) => {
  const type = req.body?.type || 'sale';
  if (!TYPES.includes(type)) return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });

  const body = { ...(req.body || {}) };
  const todayIST = istToday();

  // Role restriction: Only Admin/Owner can customize or backdate bill dates.
  // Other roles (staff, accountant, etc.) are strictly locked to Indian Standard Time (+5:30).
  if (!req.isAdmin) {
    if (body.date && body.date !== todayIST) {
      return res.status(403).json({
        error: 'Permission denied: Only Admin can customize or backdate the bill date. Date is locked to Indian Standard Time (IST +05:30).'
      });
    }
    body.date = todayIST;
  } else {
    body.date = body.date || todayIST;
  }

  const doc = buildDocument(req.business, body, type);
  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO documents (${DOC_COLS}) VALUES (${DOC_PLACEHOLDERS})`).run(...docValues(doc));
    doc.id = info.lastInsertRowid;
    if (type === 'sale' || type === 'purchase' || type === 'sale_return') postStock(req.business.id, doc, (type === 'purchase' || type === 'sale_return') ? 1 : -1);
    // a payment captured on the invoice itself becomes a khata entry automatically
    if (doc.paid_amount > 0 && doc.party_id) {
      db.prepare(`INSERT INTO transactions (business_id, party_id, type, amount, date, mode, document_id, notes)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(req.business.id, doc.party_id, type === 'sale' ? 'you_got' : 'you_gave', doc.paid_amount, doc.date, doc.payment_mode || 'cash', doc.id, `Payment against ${doc.number}`);
    }
    logActivity(req.business.id, req.user.id, `${type}.created`, doc.number);
  });
  tx();
  res.status(201).json({ document: getDoc(req, doc.id) });
});

router.put('/:id', (req, res) => {
  const existing = getDoc(req, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Document not found' });
  const body = { ...(req.body || {}), type: existing.type };

  // Role restriction: Only Admin/Owner can edit the bill date of an existing invoice/bill.
  if (!req.isAdmin) {
    if (body.date !== undefined && body.date !== existing.date) {
      return res.status(403).json({
        error: 'Permission denied: Only Admin can edit the bill date of an existing invoice/bill.'
      });
    }
    body.date = existing.date; // Enforce original date
  } else {
    if (body.date === undefined) body.date = existing.date;
  }

  if (body.partyStateCode === undefined) body.partyStateCode = existing.party_state_code;
  const doc = buildDocument(req.business, body, existing.type, existing);
  const tx = db.transaction(() => {
    unwindStock(req.business.id, existing);
    db.prepare('DELETE FROM transactions WHERE document_id = ?').run(existing.id);
    db.prepare(`UPDATE documents SET ${DOC_COLS.split(',').map((c) => `${c.trim()} = ?`).join(', ')} WHERE id = ?`)
      .run(...docValues(doc), existing.id);
    doc.id = existing.id;
    if (existing.type === 'sale' || existing.type === 'purchase' || existing.type === 'sale_return') postStock(req.business.id, doc, (existing.type === 'purchase' || existing.type === 'sale_return') ? 1 : -1);
    if (doc.paid_amount > 0 && doc.party_id) {
      db.prepare(`INSERT INTO transactions (business_id, party_id, type, amount, date, mode, document_id, notes)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(req.business.id, doc.party_id, existing.type === 'sale' ? 'you_got' : 'you_gave', doc.paid_amount, doc.date, doc.payment_mode || 'cash', doc.id, `Payment against ${doc.number}`);
    }
    logActivity(req.business.id, req.user.id, `${existing.type}.updated`, doc.number);
  });
  tx();
  res.json({ document: getDoc(req, existing.id) });
});

router.delete('/:id', (req, res) => {
  const doc = getDoc(req, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const tx = db.transaction(() => {
    unwindStock(req.business.id, doc);
    db.prepare('DELETE FROM transactions WHERE document_id = ?').run(doc.id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    logActivity(req.business.id, req.user.id, `${doc.type}.deleted`, doc.number);
  });
  tx();
  res.json({ ok: true });
});

/** Soft-cancel keeps the number reserved (GST rule: invoice numbers must not be reused). */
router.post('/:id/cancel', (req, res) => {
  const doc = getDoc(req, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const tx = db.transaction(() => {
    unwindStock(req.business.id, doc);
    db.prepare('DELETE FROM transactions WHERE document_id = ?').run(doc.id);
    db.prepare("UPDATE documents SET status = 'cancelled', due_amount = 0, paid_amount = 0, payment_status = 'unpaid' WHERE id = ?").run(doc.id);
    logActivity(req.business.id, req.user.id, `${doc.type}.cancelled`, doc.number);
  });
  tx();
  res.json({ document: getDoc(req, doc.id) });
});

/** Duplicate an invoice into a new draft - handy for recurring customers. */
router.post('/:id/duplicate', (req, res) => {
  const src = getDoc(req, req.params.id);
  if (!src) return res.status(404).json({ error: 'Document not found' });
  const items = JSON.parse(src.items).map((l) => ({ ...l, discountFlat: 0, docDiscount: 0 }));
  const todayIST = istToday();
  const targetDate = (req.isAdmin && req.body?.date) ? req.body.date : todayIST;
  const body = {
    type: src.type, partyId: src.party_id, partyName: src.party_name, partyGstin: src.party_gstin,
    partyStateCode: src.party_state_code, date: targetDate,
    items, paymentMode: src.payment_mode, notes: src.notes, status: 'active'
  };
  const doc = buildDocument(req.business, body, src.type);
  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO documents (${DOC_COLS}) VALUES (${DOC_PLACEHOLDERS})`).run(...docValues(doc));
    doc.id = info.lastInsertRowid;
    postStock(req.business.id, doc, src.type === 'sale' ? -1 : 1);
  });
  tx();
  res.status(201).json({ document: getDoc(req, doc.id) });
});

/** Record a payment against an invoice without editing the invoice. */
router.post('/:id/payment', (req, res) => {
  const doc = getDoc(req, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const amount = round2(Number(req.body?.amount));
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a payment amount' });
  const mode = req.body?.mode || 'cash';
  const todayIST = istToday();
  const date = (req.isAdmin && req.body?.date) ? req.body.date : todayIST;
  const tx = db.transaction(() => {
    if (doc.party_id) {
      db.prepare(`INSERT INTO transactions (business_id, party_id, type, amount, date, mode, document_id, reference, notes)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(req.business.id, doc.party_id, doc.type === 'sale' ? 'you_got' : 'you_gave', amount, date, mode, doc.id, req.body?.reference || null, `Payment against ${doc.number}`);
    }
    const paid = doc.party_id
      ? db.prepare("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE document_id = ? AND type IN ('you_got','you_gave')").get(doc.id).s
      : round2(doc.paid_amount + amount);
    const newPaid = round2(paid);
    db.prepare('UPDATE documents SET paid_amount = ?, due_amount = ?, payment_status = ? WHERE id = ?')
      .run(newPaid, round2(Math.max(0, doc.total - newPaid)), newPaid <= 0 ? 'unpaid' : newPaid >= doc.total - 0.005 ? 'paid' : 'partial', doc.id);
  });
  tx();
  res.json({ document: getDoc(req, doc.id) });
});

/** Generate an E-Way Bill (Part-A/Part-B) for this consignment. */
router.post('/:id/ewaybill', (req, res) => {
  const doc = getDoc(req, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!req.business.gstin) return res.status(400).json({ error: 'Add your GSTIN in business settings before generating an E-Way Bill' });
  const b = req.body || {};
  const party = doc.party_id ? db.prepare('SELECT * FROM parties WHERE id = ?').get(doc.party_id) : null;
  const today = istToday();
  const validDays = Number(b.validDays) || (doc.total > 50000 ? 4 : 1);
  const validUpto = istAddDays(validDays);
  // E-Way Bill numbers are 12 digits; locally we mint a reference in the same shape.
  const ewbNo = String(b.ewaybillNo || generateEwbNumber());
  const payload = buildEwayBillPayload({ ...doc, vehicle_no: b.vehicleNo || doc.vehicle_no, transport_doc_no: b.transportDocNo || doc.transport_doc_no, ewaybill_date: today }, req.business, party);
  db.prepare('UPDATE documents SET ewaybill_no = ?, ewaybill_date = ?, ewaybill_valid_upto = ?, vehicle_no = COALESCE(?, vehicle_no), transport_doc_no = COALESCE(?, transport_doc_no) WHERE id = ?')
    .run(ewbNo, today, validUpto, b.vehicleNo || null, b.transportDocNo || null, doc.id);
  res.json({ ewaybillNo: ewbNo, validUpto, payload });
});

/** Build the GST e-invoice (IRN) payload - ready for the IRP/GSP gateway. */
router.post('/:id/einvoice', async (req, res) => {
  const doc = getDoc(req, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!req.business.gstin) return res.status(400).json({ error: 'Add your GSTIN in business settings before generating an e-invoice' });
  const party = doc.party_id ? db.prepare('SELECT * FROM parties WHERE id = ?').get(doc.party_id) : null;
  const payload = buildEinvoicePayload(doc, req.business, party);
  // In production this JSON is POSTed to an IRP/GSP gateway; we mint a local IRN reference.
  const irn = b64(`${doc.number}|${doc.total}|${Date.now()}`);
  const ack = `${req.business.gstin.slice(0, 2)}${new Date().getFullYear()}${String(doc.id).padStart(6, '0')}`;
  const now = istToday();
  db.prepare('UPDATE documents SET irn = ?, ack_no = ?, ack_date = ? WHERE id = ?').run(irn, ack, now, doc.id);
  const qr = await QRCode.toDataURL(upiLink(req.business, doc), { margin: 1, width: 260 }).catch(() => null);
  res.json({ irn, ackNo: ack, ackDate: now, payload, qrDataUrl: qr });
});

/** UPI + IRP style QR for the invoice footer. */
router.get('/:id/qr', async (req, res) => {
  const doc = getDoc(req, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const qr = await QRCode.toDataURL(upiLink(req.business, doc), { margin: 1, width: 260 });
  res.json({ qrDataUrl: qr, link: upiLink(req.business, doc) });
});

/** Ready-to-send WhatsApp / SMS / email body for a document. */
router.get('/:id/share', (req, res) => {
  const doc = getDoc(req, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const party = doc.party_id ? db.prepare('SELECT * FROM parties WHERE id = ?').get(doc.party_id) : null;
  const channel = req.query.channel || 'whatsapp';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const pdfUrl = `${proto}://${host}/api/documents/${doc.id}/pdf`;
  const money = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let body;
  if (doc.type === 'sale' && doc.due_amount > 0) {
    body = `Dear ${doc.party_name},\n\nPayment Reminder: ${money(doc.due_amount)} is pending against Tax Invoice *${doc.number}* dated ${doc.date}${doc.due_date ? ` (due ${doc.due_date})` : ''}.\n\n📄 View / Download Bill: ${pdfUrl}\n💳 Pay via UPI: ${req.business.upi_id || 'Contact store'}\n\nThank you,\n*${req.business.name}*`;
  } else if (doc.type === 'sale') {
    body = `Dear ${doc.party_name},\n\nThank you for shopping with us! Here is your Tax Invoice *${doc.number}* dated ${doc.date} for *${money(doc.total)}*.\n\n📄 View / Download Bill: ${pdfUrl}\n\nThank you,\n*${req.business.name}*`;
  } else if (doc.type === 'quotation') {
    body = `Dear ${doc.party_name},\n\nPlease find our quotation *${doc.number}* dated ${doc.date} for *${money(doc.total)}*.\n\n📄 View Quotation: ${pdfUrl}\nValid till: ${doc.due_date || '7 days'}\n\nThank you,\n*${req.business.name}*`;
  } else {
    body = `Dear ${doc.party_name},\n\nBill *${doc.number}* dated ${doc.date} for *${money(doc.total)}* is ready.\n\n📄 View / Download: ${pdfUrl}\n\nThank you,\n*${req.business.name}*`;
  }

  const rawPhone = req.query.phone || (party && party.phone) || doc.party_phone || '';
  const phone = String(rawPhone).replace(/\D/g, '');
  const cleanPhone = phone.length === 10 ? '91' + phone : (phone.startsWith('91') && phone.length === 12 ? phone : (phone ? '91' + phone : ''));
  const links = {
    whatsapp: cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(body)}` : null,
    sms: phone ? `sms:${phone}?&body=${encodeURIComponent(body)}` : null,
    email: party && party.email ? `mailto:${party.email}?subject=${encodeURIComponent(`Invoice ${doc.number} - ${req.business.name}`)}&body=${encodeURIComponent(body + '\n\nDownload: ' + pdfUrl)}` : null,
    pdf: pdfUrl
  };
  res.json({ message: body, links, channel, phone: rawPhone, party: party ? { name: party.name, phone: party.phone, email: party.email } : null });
});

function getDoc(req, id) {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND business_id = ?').get(id, req.business.id);
  return doc ? hydrate(doc) : null;
}

function hydrate(doc) {
  return { ...doc, items: JSON.parse(doc.items || '[]'), hsnSummary: hsnSummary(JSON.parse(doc.items || '[]'), doc.supply_type) };
}

function upiLink(business, doc) {
  if (!business.upi_id) return `BILLPRO:${doc.number}`;
  const p = new URLSearchParams({ pa: business.upi_id, pn: business.name, am: String(doc.total), cu: 'INR', tn: doc.number });
  return `upi://pay?${p.toString()}`;
}

function generateEwbNumber() {
  let n = '';
  for (let i = 0; i < 12; i++) n += Math.floor(Math.random() * 10);
  return n;
}

const b64 = (s) => Buffer.from(s).toString('base64').replace(/=+$/, '').slice(0, 40);

module.exports = { router, hydrate, upiLink };
