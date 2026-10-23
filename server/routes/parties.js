'use strict';
const express = require('express');
const { db } = require('../db');
const { auth, loadBusiness } = require('../middleware');
const { partyBalance, documentTotals, logActivity } = require('../lib/service');
const { normaliseGstin, round2 } = require('../lib/gst');

const router = express.Router();
router.use(auth, loadBusiness);

router.get('/', (req, res) => {
  const type = req.query.type || 'customer';
  const q = (req.query.q || '').trim();
  const includeInactive = req.query.inactive === '1';
  let rows = db.prepare(`SELECT * FROM parties WHERE business_id = ? AND type = ? ${includeInactive ? '' : 'AND inactive = 0'} ORDER BY name`).all(req.business.id, type);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((p) => [p.name, p.phone, p.gstin, p.city, p.contact_name].some((f) => String(f || '').toLowerCase().includes(needle)));
  }
  const withBalance = rows.map((p) => decorate(req.business.id, p));
  const totals = withBalance.reduce((a, p) => {
    if (p.balance >= 0) a.toCollect += p.balance; else a.toPay += -p.balance;
    if (p.overLimit) a.overLimit += 1;
    return a;
  }, { toCollect: 0, toPay: 0, overLimit: 0 });
  res.json({ parties: withBalance, totals: { ...totals, count: withBalance.length } });
});

router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  const type = req.query.type || 'customer';
  if (!q) return res.json({ parties: [] });
  const rows = db.prepare("SELECT * FROM parties WHERE business_id = ? AND type = ? AND inactive = 0").all(req.business.id, type);
  res.json({ parties: rows.filter((p) => String(p.name).toLowerCase().includes(q) || String(p.phone || '').includes(q)).slice(0, 15).map((p) => decorate(req.business.id, p)) });
});

router.get('/:id', (req, res) => {
  const party = db.prepare('SELECT * FROM parties WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
  if (!party) return res.status(404).json({ error: 'Party not found' });
  res.json({ party: decorate(req.business.id, party), docs: documentTotals(party.id) });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Name is required' });
  const gstin = normaliseGstin(b.gstin);
  if (b.gstin && !gstin) return res.status(400).json({ error: 'GSTIN format looks invalid' });
  try {
    const info = db.prepare(`INSERT INTO parties (business_id, type, name, contact_name, phone, email, gstin, address,
      city, state, state_code, pincode, opening_balance, balance_type, credit_limit, credit_days, tag, notes)
      VALUES (@business_id,@type,@name,@contact_name,@phone,@email,@gstin,@address,@city,@state,@state_code,@pincode,
              @opening_balance,@balance_type,@credit_limit,@credit_days,@tag,@notes)`)
      .run({
        business_id: req.business.id,
        type: b.type === 'supplier' ? 'supplier' : 'customer',
        name: b.name.trim(),
        contact_name: b.contact_name || null,
        phone: b.phone || null,
        email: b.email || null,
        gstin,
        address: b.address || null,
        city: b.city || null,
        state: b.state || null,
        state_code: gstin ? gstin.slice(0, 2) : (b.state_code || null),
        pincode: b.pincode || null,
        opening_balance: Number(b.opening_balance) || 0,
        balance_type: b.balance_type === 'CR' ? 'CR' : 'DR',
        credit_limit: Number(b.credit_limit) || 0,
        credit_days: Number(b.credit_days) || req.business.credit_days,
        tag: b.tag || null,
        notes: b.notes || null
      });
    logActivity(req.business.id, req.user.id, 'party.created', b.name);
    const party = db.prepare('SELECT * FROM parties WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ party: decorate(req.business.id, party) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'A party with this name already exists' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const party = db.prepare('SELECT * FROM parties WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
  if (!party) return res.status(404).json({ error: 'Party not found' });
  const b = req.body || {};
  const gstin = normaliseGstin(b.gstin ?? party.gstin);
  db.prepare(`UPDATE parties SET name=@name, contact_name=@contact_name, phone=@phone, email=@email, gstin=@gstin,
    address=@address, city=@city, state=@state, state_code=@state_code, pincode=@pincode, opening_balance=@opening_balance,
    balance_type=@balance_type, credit_limit=@credit_limit, credit_days=@credit_days, tag=@tag, notes=@notes, inactive=@inactive
    WHERE id=@id`)
    .run({
      id: party.id,
      name: b.name ?? party.name,
      contact_name: b.contact_name ?? party.contact_name,
      phone: b.phone ?? party.phone,
      email: b.email ?? party.email,
      gstin,
      address: b.address ?? party.address,
      city: b.city ?? party.city,
      state: b.state ?? party.state,
      state_code: gstin ? gstin.slice(0, 2) : (b.state_code ?? party.state_code),
      pincode: b.pincode ?? party.pincode,
      opening_balance: b.opening_balance !== undefined ? Number(b.opening_balance) : party.opening_balance,
      balance_type: b.balance_type ?? party.balance_type,
      credit_limit: b.credit_limit !== undefined ? Number(b.credit_limit) : party.credit_limit,
      credit_days: b.credit_days !== undefined ? Number(b.credit_days) : party.credit_days,
      tag: b.tag ?? party.tag,
      notes: b.notes ?? party.notes,
      inactive: b.inactive !== undefined ? (b.inactive ? 1 : 0) : party.inactive
    });
  res.json({ party: decorate(req.business.id, db.prepare('SELECT * FROM parties WHERE id = ?').get(party.id)) });
});

router.delete('/:id', (req, res) => {
  const party = db.prepare('SELECT * FROM parties WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
  if (!party) return res.status(404).json({ error: 'Party not found' });
  db.prepare('DELETE FROM parties WHERE id = ?').run(party.id);
  res.json({ ok: true });
});

/** Khata statement: opening balance + every invoice, bill and payment, running balance. */
router.get('/:id/statement', (req, res) => {
  const party = db.prepare('SELECT * FROM parties WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
  if (!party) return res.status(404).json({ error: 'Party not found' });
  const from = req.query.from || '1900-01-01';
  const to = req.query.to || '2999-12-31';

  const docs = db.prepare(`SELECT id, type, number, date, total, due_amount, paid_amount, payment_status, status
    FROM documents WHERE party_id = ? AND status = 'active' AND date BETWEEN ? AND ? ORDER BY date, id`).all(party.id, from, to);
  const txns = db.prepare('SELECT id, type, amount, date, mode, reference, notes FROM transactions WHERE party_id = ? AND document_id IS NULL AND date BETWEEN ? AND ? ORDER BY date, id').all(party.id, from, to);

  let running = round2((party.balance_type === 'CR' ? -1 : 1) * party.opening_balance);
  const entries = [];
  if (party.opening_balance) {
    entries.push({ kind: 'opening', date: from > '1900-01-01' ? from : party.created_at.slice(0, 10), label: 'Opening balance', debit: party.balance_type === 'DR' ? party.opening_balance : 0, credit: party.balance_type === 'CR' ? party.opening_balance : 0, balance: running });
  }
  const merged = [
    ...docs.map((d) => ({ sort: d.date + 'T00:00:01', ...d })),
    ...txns.map((t) => ({ sort: t.date + 'T00:00:02', ...t }))
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  merged.forEach((row) => {
    if (row.type === 'sale') {
      running = round2(running + row.total - row.paid_amount);
      entries.push({ kind: 'invoice', id: row.id, date: row.date, label: `Invoice ${row.number}`, reference: row.number, debit: row.total, credit: row.paid_amount || 0, balance: running, payment_status: row.payment_status });
    } else if (row.type === 'purchase') {
      const netDue = round2(row.total - (row.paid_amount || 0));
      running = round2(running - netDue);
      entries.push({ kind: 'bill', id: row.id, date: row.date, label: `Purchase ${row.number}`, reference: row.number, debit: 0, credit: netDue, balance: running, payment_status: row.payment_status });
    } else if (row.type === 'you_gave') {
      running = round2(running + row.amount);
      entries.push({ kind: 'txn', id: row.id, date: row.date, label: 'You Gave', reference: row.reference, mode: row.mode, notes: row.notes, debit: row.amount, credit: 0, balance: running });
    } else if (row.type === 'you_got') {
      running = round2(running - row.amount);
      entries.push({ kind: 'txn', id: row.id, date: row.date, label: 'You Got', reference: row.reference, mode: row.mode, notes: row.notes, debit: 0, credit: row.amount, balance: running });
    } else if (row.type === 'interest' || row.type === 'adjustment') {
      running = round2(running + row.amount);
      entries.push({ kind: 'txn', id: row.id, date: row.date, label: row.type === 'interest' ? 'Interest charged' : 'Adjustment', notes: row.notes, debit: row.amount, credit: 0, balance: running });
    }
  });

  const totals = {
    debit: round2(entries.reduce((s, e) => s + (e.debit || 0), 0)),
    credit: round2(entries.reduce((s, e) => s + (e.credit || 0), 0))
  };
  res.json({ party: decorate(req.business.id, party), entries, totals, running });
});

function decorate(businessId, party) {
  const b = partyBalance(businessId, party.id) || {};
  const last = db.prepare('SELECT date, number FROM documents WHERE party_id = ? AND status = ? ORDER BY date DESC, id DESC LIMIT 1').get(party.id, 'active');
  return {
    ...party,
    balance: b.balance ?? 0,
    direction: b.direction ?? 'DR',
    creditAvailable: b.creditAvailable ?? null,
    overLimit: !!b.overLimit,
    lastTransaction: last ? `${last.number} on ${last.date}` : null
  };
}

router.post('/bulk', (req, res) => {
  const parties = Array.isArray(req.body?.parties) ? req.body.parties : [];
  const defaultType = req.body?.type === 'supplier' ? 'supplier' : 'customer';
  const updateExisting = req.body?.updateExisting !== false;
  if (!parties.length) {
    return res.status(400).json({ error: 'No parties provided for import' });
  }

  const findExisting = db.prepare(`
    SELECT * FROM parties
    WHERE business_id = ? AND type = ?
      AND (
        LOWER(name) = LOWER(?)
        OR (phone IS NOT NULL AND phone != '' AND phone = ?)
      )
    LIMIT 1
  `);

  const insertParty = db.prepare(`
    INSERT INTO parties (
      business_id, type, name, contact_name, phone, email, gstin, address,
      city, state, state_code, pincode, opening_balance, balance_type,
      credit_limit, credit_days, tag, notes
    ) VALUES (
      @business_id, @type, @name, @contact_name, @phone, @email, @gstin, @address,
      @city, @state, @state_code, @pincode, @opening_balance, @balance_type,
      @credit_limit, @credit_days, @tag, @notes
    )
  `);

  const updateParty = db.prepare(`
    UPDATE parties SET
      contact_name = COALESCE(@contact_name, contact_name),
      phone = COALESCE(@phone, phone),
      email = COALESCE(@email, email),
      gstin = COALESCE(@gstin, gstin),
      address = COALESCE(@address, address),
      city = COALESCE(@city, city),
      state = COALESCE(@state, state),
      state_code = COALESCE(@state_code, state_code),
      pincode = COALESCE(@pincode, pincode),
      credit_limit = COALESCE(@credit_limit, credit_limit),
      notes = COALESCE(@notes, notes)
    WHERE id = @id
  `);

  let created = 0;
  let updated = 0;
  const errors = [];

  const tx = db.transaction(() => {
    parties.forEach((raw, idx) => {
      const rowNum = idx + 1;
      const name = String(raw.name || raw.partyName || raw.party_name || '').trim();
      if (!name) {
        errors.push({ row: rowNum, error: 'Party name is required' });
        return;
      }

      const partyType = (raw.type && String(raw.type).toLowerCase().includes('sup')) ? 'supplier' : (raw.type || defaultType);
      let phone = raw.phone ? String(raw.phone).replace(/\D+/g, '') : null;
      if (phone && phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
      if (phone && phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1);

      const gstin = normaliseGstin(raw.gstin);
      const stateCode = gstin ? gstin.slice(0, 2) : (raw.state_code || null);
      const contactName = raw.contact_name ? String(raw.contact_name).trim() : null;
      const email = raw.email ? String(raw.email).trim() : null;
      const address = raw.address ? String(raw.address).trim() : null;
      const city = raw.city ? String(raw.city).trim() : null;
      const state = raw.state ? String(raw.state).trim() : null;
      const pincode = raw.pincode ? String(raw.pincode).trim() : null;
      const openingBalance = Number(raw.opening_balance) || 0;
      const balanceType = String(raw.balance_type || 'DR').toUpperCase() === 'CR' ? 'CR' : 'DR';
      const creditLimit = Number(raw.credit_limit) || 0;
      const creditDays = Number(raw.credit_days) || req.business.credit_days || 30;
      const tag = raw.tag ? String(raw.tag).trim() : null;
      const notes = raw.notes ? String(raw.notes).trim() : null;

      const existing = findExisting.get(req.business.id, partyType, name, phone || '');

      if (existing) {
        if (updateExisting) {
          updateParty.run({
            id: existing.id,
            contact_name: contactName,
            phone: phone || existing.phone,
            email: email || existing.email,
            gstin: gstin || existing.gstin,
            address: address || existing.address,
            city: city || existing.city,
            state: state || existing.state,
            state_code: stateCode || existing.state_code,
            pincode: pincode || existing.pincode,
            credit_limit: creditLimit || existing.credit_limit,
            notes: notes ? (existing.notes ? existing.notes + ' | ' + notes : notes) : existing.notes
          });
          updated++;
        }
      } else {
        insertParty.run({
          business_id: req.business.id,
          type: partyType,
          name,
          contact_name: contactName,
          phone,
          email,
          gstin,
          address,
          city,
          state,
          state_code: stateCode,
          pincode,
          opening_balance: openingBalance,
          balance_type: balanceType,
          credit_limit: creditLimit,
          credit_days: creditDays,
          tag,
          notes
        });
        created++;
      }
    });
  });

  try {
    tx();
    logActivity(req.business.id, req.user.id, 'import', `Imported ${created + updated} ${defaultType}s (${created} created, ${updated} updated) from Excel`);
    res.json({
      success: true,
      created,
      updated,
      total: parties.length,
      errors
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import parties: ' + err.message });
  }
});

module.exports = { router, decorate };
