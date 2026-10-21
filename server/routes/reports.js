'use strict';
const express = require('express');
const { db } = require('../db');
const { auth, loadBusiness } = require('../middleware');
const { round2, hsnSummary, financialYear, stateName } = require('../lib/gst');
const { istToday, istFinancialYear, istAddDays } = require('../lib/time');

const router = express.Router();
router.use(auth, loadBusiness);

/** Home dashboard numbers for the active business. */
router.get('/dashboard', (req, res) => {
  const biz = req.business.id;
  const today = istToday();
  const monthStart = today.slice(0, 8) + '01';
  const start6 = istAddDays(-5);

  const salesSeries = db.prepare(`SELECT date, SUM(total) s, COUNT(*) n FROM documents
    WHERE business_id = ? AND type='sale' AND status='active' AND date >= ? GROUP BY date ORDER BY date`).all(biz, start6);
  const days = [];
  for (let i = 5; i >= 0; i--) {
    const d = istAddDays(-i);
    const row = salesSeries.find((r) => r.date === d);
    days.push({ date: d, total: round2(row ? row.s : 0), count: row ? row.n : 0 });
  }

  const topProducts = db.prepare(`SELECT name FROM products WHERE business_id = ?`).all(biz);
  const productSales = new Map();
  db.prepare("SELECT items FROM documents WHERE business_id = ? AND type='sale' AND status='active' AND date >= ?").all(biz, monthStart)
    .forEach((r) => JSON.parse(r.items).forEach((l) => {
      const cur = productSales.get(l.name) || { name: l.name, qty: 0, value: 0 };
      cur.qty += l.qty; cur.value = round2(cur.value + l.total);
      productSales.set(l.name, cur);
    }));

  const topCustomers = db.prepare("SELECT d.party_id, COALESCE(p.name, d.party_name) name, SUM(d.total) s, COUNT(*) n FROM documents d LEFT JOIN parties p ON p.id = d.party_id WHERE d.business_id = ? AND d.type='sale' AND d.status='active' AND d.party_id IS NOT NULL GROUP BY d.party_id ORDER BY s DESC LIMIT 5").all(biz);

  const byRate = db.prepare("SELECT items, cgst, sgst, igst, cess, taxable_value FROM documents WHERE business_id = ? AND type='sale' AND status='active'").all(biz);
  const rateMap = new Map();
  byRate.forEach((r) => JSON.parse(r.items).forEach((l) => {
    const k = `${l.gstRate}`;
    const cur = rateMap.get(k) || { rate: l.gstRate, taxable: 0, tax: 0 };
    cur.taxable = round2(cur.taxable + l.taxable);
    cur.tax = round2(cur.tax + l.cgst + l.sgst + l.igst + l.cess);
    rateMap.set(k, cur);
  }));

  res.json({
    today,
    todaySales: round2(db.prepare("SELECT COALESCE(SUM(total),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active' AND date=?").get(biz, today).s),
    monthSales: round2(db.prepare("SELECT COALESCE(SUM(total),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active' AND date>=?").get(biz, monthStart).s),
    receivable: round2(db.prepare("SELECT COALESCE(SUM(due_amount),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active'").get(biz).s),
    payable: round2(db.prepare("SELECT COALESCE(SUM(due_amount),0) s FROM documents WHERE business_id=? AND type='purchase' AND status='active'").get(biz).s),
    netTax: round2(
      db.prepare("SELECT COALESCE(SUM(cgst+sgst+igst+cess),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active'").get(biz).s -
      db.prepare("SELECT COALESCE(SUM(cgst+sgst+igst+cess),0) s FROM documents WHERE business_id=? AND type='purchase' AND status='active'").get(biz).s
    ),
    invoiceCount: db.prepare("SELECT COUNT(*) n FROM documents WHERE business_id=? AND type='sale' AND status='active'").get(biz).n,
    lowStock: db.prepare('SELECT id, name, stock, low_stock_at, unit FROM products WHERE business_id=? AND low_stock_at>0 AND stock<=low_stock_at ORDER BY stock LIMIT 10').all(biz),
    overdueCount: db.prepare("SELECT COUNT(*) n FROM documents WHERE business_id=? AND type='sale' AND status='active' AND due_amount>0 AND due_date<?").get(biz, today).n,
    overdueAmount: round2(db.prepare("SELECT COALESCE(SUM(due_amount),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active' AND due_amount>0 AND due_date<?").get(biz, today).s),
    recentDocs: db.prepare('SELECT id, type, number, party_name, date, total, payment_status FROM documents WHERE business_id=? ORDER BY id DESC LIMIT 8').all(biz),
    salesSeries: days,
    topProducts: [...productSales.values()].sort((a, b) => b.value - a.value).slice(0, 5),
    topCustomers: topCustomers.map((c) => ({ ...c, s: round2(c.s) })),
    taxByRate: [...rateMap.values()].sort((a, b) => a.rate - b.rate),
    productCount: topProducts.length
  });
});

/** GSTR-1: B2B, B2C and HSN sections built from active sale invoices. */
router.get('/gstr1', (req, res) => {
  const { from, to } = period(req);
  const rows = db.prepare(`SELECT d.*, p.name AS party_display, p.gstin AS party_gstin_db, p.state_code AS party_state_code_db
    FROM documents d LEFT JOIN parties p ON p.id = d.party_id
    WHERE d.business_id = ? AND d.type='sale' AND d.status='active' AND d.date BETWEEN ? AND ? ORDER BY d.date`).all(req.business.id, from, to);

  const b2b = [];
  const b2cLarge = [];
  const b2cSmall = [];
  const allLines = [];
  rows.forEach((r) => {
    const items = JSON.parse(r.items);
    allLines.push(...items);
    const gstin = r.party_gstin || r.party_gstin_db || null;
    const stateCode = String(r.party_state_code || r.party_state_code_db || r.place_of_supply || '').padStart(2, '0');
    const base = {
      gstin, invNo: r.number, invDt: r.date, invVal: r.total, pos: stateCode,
      revCharge: 'N', irtcs: r.ewaybill_no ? 'Y' : 'N',
      txval: r.taxable_value, iamt: r.igst, camt: r.cgst, samt: r.sgst, csamt: r.cess,
      party: r.party_display || r.party_name
    };
    if (gstin && gstin !== 'URP') {
      b2b.push({ ...base, rate: items.map((i) => i.gstRate) });
    } else if (r.total > 250000) {
      b2cLarge.push(base);
    } else {
      b2cSmall.push(base);
    }
  });

  res.json({
    period: { from, to, financialYear: financialYear(from) },
    business: { name: req.business.name, gstin: req.business.gstin, state: req.business.state },
    b2b, b2cLarge, b2cSmall,
    hsn: hsnSummary(allLines, 'both'),
    docSeries: docSeries(req.business.id, from, to),
    totals: {
      invoices: rows.length,
      taxable: round2(rows.reduce((s, r) => s + r.taxable_value, 0)),
      igst: round2(rows.reduce((s, r) => s + r.igst, 0)),
      cgst: round2(rows.reduce((s, r) => s + r.cgst, 0)),
      sgst: round2(rows.reduce((s, r) => s + r.sgst, 0)),
      cess: round2(rows.reduce((s, r) => s + r.cess, 0)),
      total: round2(rows.reduce((s, r) => s + r.total, 0))
    }
  });
});

/** GSTR-3B summary: outward, inward, net payable, ITC available. */
router.get('/gstr3b', (req, res) => {
  const { from, to } = period(req);
  const sum = (type, field) => round2(db.prepare(`SELECT COALESCE(SUM(${field}),0) s FROM documents WHERE business_id=? AND type=? AND status='active' AND date BETWEEN ? AND ?`).get(req.business.id, type, from, to).s);

  const outward = {
    taxable: sum('sale', 'taxable_value'),
    igst: sum('sale', 'igst'), cgst: sum('sale', 'cgst'), sgst: sum('sale', 'sgst'), cess: sum('sale', 'cess'),
    total: sum('sale', 'total')
  };
  const inward = {
    taxable: sum('purchase', 'taxable_value'),
    igst: sum('purchase', 'igst'), cgst: sum('purchase', 'cgst'), sgst: sum('purchase', 'sgst'), cess: sum('purchase', 'cess'),
    total: sum('purchase', 'total')
  };
  const composition = round2(db.prepare("SELECT COALESCE(SUM(total),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active' AND date BETWEEN ? AND ? AND supply_type='intra' AND taxable_value = 0").get(req.business.id, from, to).s);
  const itc = { igst: inward.igst, cgst: inward.cgst, sgst: inward.sgst, cess: inward.cess, total: round2(inward.igst + inward.cgst + inward.sgst + inward.cess) };
  const net = {
    igst: round2(outward.igst - itc.igst),
    cgst: round2(outward.cgst - itc.cgst),
    sgst: round2(outward.sgst - itc.sgst),
    cess: round2(outward.cess - itc.cess)
  };
  res.json({
    period: { from, to, financialYear: financialYear(from) },
    business: { name: req.business.name, gstin: req.business.gstin, composition: !!req.business.composition_scheme },
    table3_1a: { outward },
    table3_1b: composition,
    table4: { itc, net },
    payableCash: round2(Math.max(0, net.igst) + Math.max(0, net.cgst) + Math.max(0, net.sgst) + Math.max(0, net.cess)),
    table5: b2cBreakdown(req.business.id, from, to),
    table6: round2(sum('sale', 'total') - sum('sale', 'cgst') - sum('sale', 'sgst') - sum('sale', 'igst') - sum('sale', 'cess'))
  });
});

/** Purchase register + input tax credit list (GST R2 reconciliation source). */
router.get('/purchases', (req, res) => {
  const { from, to } = period(req);
  const rows = db.prepare(`SELECT d.*, p.name AS party_display FROM documents d LEFT JOIN parties p ON p.id = d.party_id
    WHERE d.business_id=? AND d.type='purchase' AND d.status='active' AND d.date BETWEEN ? AND ? ORDER BY d.date DESC`).all(req.business.id, from, to);
  res.json({
    documents: rows.map((r) => ({ ...r, items: JSON.parse(r.items) })),
    totals: {
      count: rows.length,
      taxable: round2(rows.reduce((s, r) => s + r.taxable_value, 0)),
      tax: round2(rows.reduce((s, r) => s + r.cgst + r.sgst + r.igst + r.cess, 0)),
      total: round2(rows.reduce((s, r) => s + r.total, 0))
    }
  });
});

/** Profit & loss by month for the active business. */
router.get('/profit', (req, res) => {
  const { from, to } = period(req);
  const months = [];
  const cursor = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 7);
    if (!months.includes(key)) months.push(key);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const rows = months.map((m) => {
    const mFrom = m + '-01';
    const mTo = m + '-31';
    const sales = round2(db.prepare("SELECT COALESCE(SUM(taxable_value),0) s FROM documents WHERE business_id=? AND type='sale' AND status='active' AND date BETWEEN ? AND ?").get(req.business.id, mFrom, mTo).s);
    const purchases = round2(db.prepare("SELECT COALESCE(SUM(taxable_value),0) s FROM documents WHERE business_id=? AND type='purchase' AND status='active' AND date BETWEEN ? AND ?").get(req.business.id, mFrom, mTo).s);
    const expenses = round2(db.prepare("SELECT COALESCE(SUM(total),0) s FROM documents WHERE business_id=? AND type='expense' AND status='active' AND date BETWEEN ? AND ?").get(req.business.id, mFrom, mTo).s);
    return { month: m, sales, purchases, expenses, grossProfit: round2(sales - purchases), netProfit: round2(sales - purchases - expenses), margin: sales ? round2(((sales - purchases) / sales) * 100) : 0 };
  });
  const total = rows.reduce((a, r) => ({
    sales: round2(a.sales + r.sales), purchases: round2(a.purchases + r.purchases),
    expenses: round2(a.expenses + r.expenses), grossProfit: round2(a.grossProfit + r.grossProfit), netProfit: round2(a.netProfit + r.netProfit)
  }), { sales: 0, purchases: 0, expenses: 0, grossProfit: 0, netProfit: 0 });
  res.json({ period: { from, to }, rows, total });
});

/** Receivables ageing buckets (0-30, 31-60, 61-90, 90+ days). */
router.get('/aging', (req, res) => {
  const today = istToday();
  const rows = db.prepare(`SELECT d.*, COALESCE(p.name, d.party_name) party FROM documents d LEFT JOIN parties p ON p.id=d.party_id
    WHERE d.business_id=? AND d.type='sale' AND d.status='active' AND d.due_amount>0 ORDER BY d.date`).all(req.business.id);
  const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const items = rows.map((r) => {
    const age = r.due_date ? Math.floor((new Date(today) - new Date(r.due_date)) / 86400000) : Math.floor((new Date(today) - new Date(r.date)) / 86400000);
    const bucket = age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+';
    buckets[bucket] = round2(buckets[bucket] + r.due_amount);
    return { id: r.id, number: r.number, party: r.party, date: r.date, dueDate: r.due_date, total: r.total, due: r.due_amount, age, bucket };
  });
  res.json({ items, buckets, total: round2(rows.reduce((s, r) => s + r.due_amount, 0)) });
});

/** Day book: everything that happened on one date. */
router.get('/daybook', (req, res) => {
  const date = req.query.date || istToday();
  const docs = db.prepare('SELECT id, type, number, party_name, date, total, payment_status FROM documents WHERE business_id=? AND date=? AND status=? ORDER BY id').all(req.business.id, date, 'active');
  const txns = db.prepare(`SELECT t.*, p.name AS party_name FROM transactions t LEFT JOIN parties p ON p.id=t.party_id WHERE t.business_id=? AND t.date=? ORDER BY t.id`).all(req.business.id, date);
  const moves = db.prepare(`SELECT s.*, p.name AS product_name FROM stock_moves s LEFT JOIN products p ON p.id=s.product_id WHERE s.business_id=? AND s.date=? ORDER BY s.id`).all(req.business.id, date);
  res.json({
    date,
    docs, txns, moves,
    totals: {
      billing: round2(docs.filter((d) => d.type === 'sale').reduce((s, d) => s + d.total, 0)),
      purchases: round2(docs.filter((d) => d.type === 'purchase').reduce((s, d) => s + d.total, 0)),
      expenses: round2(docs.filter((d) => d.type === 'expense').reduce((s, d) => s + d.total, 0)),
      received: round2(txns.filter((t) => t.type === 'you_got').reduce((s, t) => s + t.amount, 0)),
      paid: round2(txns.filter((t) => t.type === 'you_gave').reduce((s, t) => s + t.amount, 0))
    }
  });
});

/** CSV export for any report the accountant can upload into Tally/ClearTax. */
router.get('/export/:report', (req, res) => {
  const { from, to } = period(req);
  const report = req.params.report;
  let filename = `${report}-${from}-to-${to}.csv`;
  let rows = [];
  if (report === 'gstr1') {
    const data = gstr1Rows(req.business.id, from, to);
    rows = data;
    filename = `GSTR1-${req.business.gstin || 'NA'}-${from.slice(0, 7)}.csv`;
  } else if (report === 'sales') {
    rows = [['Invoice No', 'Date', 'Party', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'CESS', 'Total', 'Paid', 'Due', 'Status']];
    db.prepare("SELECT d.*, COALESCE(p.name, d.party_name) party FROM documents d LEFT JOIN parties p ON p.id=d.party_id WHERE d.business_id=? AND d.type='sale' AND d.status='active' AND d.date BETWEEN ? AND ? ORDER BY d.date").all(req.business.id, from, to)
      .forEach((r) => rows.push([r.number, r.date, r.party, r.party_gstin || '', r.taxable_value, r.cgst, r.sgst, r.igst, r.cess, r.total, r.paid_amount, r.due_amount, r.payment_status]));
  } else if (report === 'purchases') {
    rows = [['Bill No', 'Date', 'Supplier', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'CESS', 'Total', 'Status']];
    db.prepare("SELECT d.*, COALESCE(p.name, d.party_name) party FROM documents d LEFT JOIN parties p ON p.id=d.party_id WHERE d.business_id=? AND d.type='purchase' AND d.status='active' AND d.date BETWEEN ? AND ? ORDER BY d.date").all(req.business.id, from, to)
      .forEach((r) => rows.push([r.number, r.date, r.party, r.party_gstin || '', r.taxable_value, r.cgst, r.sgst, r.igst, r.cess, r.total, r.payment_status]));
  } else if (report === 'hsn') {
    rows = [['HSN/SAC', 'Description', 'UQC', 'Total Qty', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'CESS']];
    const lines = [];
    db.prepare("SELECT items FROM documents WHERE business_id=? AND type='sale' AND status='active' AND date BETWEEN ? AND ?").all(req.business.id, from, to)
      .forEach((r) => lines.push(...JSON.parse(r.items)));
    hsnSummary(lines).forEach((h) => rows.push([h.hsn, h.desc, h.unit, h.qty, h.taxable, h.cgst, h.sgst, h.igst, h.cess]));
  } else if (report === 'stock') {
    rows = [['Product', 'SKU', 'HSN', 'Category', 'Unit', 'Stock', 'Purchase Price', 'Sale Price', 'GST %', 'Stock Value']];
    db.prepare('SELECT * FROM products WHERE business_id=? AND inactive=0 ORDER BY name').all(req.business.id)
      .forEach((p) => rows.push([p.name, p.sku || '', p.hsn || '', p.category || '', p.unit, p.stock, p.purchase_price, p.sale_price, p.gst_rate, round2(p.stock * p.purchase_price)]));
  } else if (report === 'parties') {
    rows = [['Name', 'Type', 'Phone', 'GSTIN', 'City', 'Balance', 'Direction', 'Credit Limit']];
    db.prepare('SELECT * FROM parties WHERE business_id=? AND inactive=0 ORDER BY name').all(req.business.id).forEach((p) => {
      const bal = partyRunningBalance(p.id);
      rows.push([p.name, p.type, p.phone || '', p.gstin || '', p.city || '', Math.abs(bal), bal >= 0 ? 'DR' : 'CR', p.credit_limit]);
    });
  } else {
    return res.status(400).json({ error: 'Unknown report. Use gstr1, sales, purchases, hsn, stock or parties.' });
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
});

function gstr1Rows(businessId, from, to) {
  const rows = [['GSTIN of recipient', 'Invoice No', 'Invoice Date', 'Invoice Value', 'POS', 'Reverse Charge', 'Invoice Type', 'Rate', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'CESS']];
  db.prepare("SELECT d.*, p.gstin AS pgstin, p.state_code AS pstate FROM documents d LEFT JOIN parties p ON p.id=d.party_id WHERE d.business_id=? AND d.type='sale' AND d.status='active' AND d.date BETWEEN ? AND ?").all(businessId, from, to)
    .forEach((d) => {
      JSON.parse(d.items).forEach((l) => {
        rows.push([d.party_gstin || d.pgstin || 'URP', d.number, d.date, d.total, String(d.party_state_code || d.pstate || '').padStart(2, '0'), 'N', (d.party_gstin || d.pgstin) ? 'Regular' : 'B2C', l.gstRate, l.taxable, l.igst, l.cgst, l.sgst, l.cess]);
      });
    });
  return rows;
}

function b2cBreakdown(businessId, from, to) {
  const rows = db.prepare("SELECT place_of_supply, SUM(taxable_value) txval, SUM(igst) iamt, SUM(cgst) camt, SUM(sgst) samt FROM documents WHERE business_id=? AND type='sale' AND status='active' AND date BETWEEN ? AND ? AND (party_gstin IS NULL OR party_gstin='URP') GROUP BY place_of_supply").all(businessId, from, to);
  return rows.map((r) => ({ pos: r.place_of_supply, state: stateName(r.place_of_supply), txval: round2(r.txval), iamt: round2(r.iamt), camt: round2(r.camt), samt: round2(r.samt) }));
}

function docSeries(businessId, from, to) {
  return db.prepare("SELECT type, MIN(number) from_no, MAX(number) to_no, COUNT(*) n FROM documents WHERE business_id=? AND status='active' AND date BETWEEN ? AND ? GROUP BY type").all(businessId, from, to);
}

function partyRunningBalance(partyId) {
  const p = db.prepare('SELECT opening_balance, balance_type FROM parties WHERE id = ?').get(partyId);
  const sign = p.balance_type === 'CR' ? -1 : 1;
  const sales = db.prepare("SELECT COALESCE(SUM(due_amount),0) s FROM documents WHERE party_id=? AND type='sale' AND status='active'").get(partyId).s;
  const purchases = db.prepare("SELECT COALESCE(SUM(paid_amount),0) s FROM documents WHERE party_id=? AND type='purchase' AND status='active'").get(partyId).s;
  const txns = db.prepare("SELECT COALESCE(SUM(CASE WHEN type='you_gave' THEN amount WHEN type='you_got' THEN -amount ELSE 0 END),0) s FROM transactions WHERE party_id=?").get(partyId).s;
  return round2(sign * p.opening_balance + sales + txns - purchases);
}

function period(req) {
  const today = istToday();
  const defaultTo = today;
  const defaultFrom = today.slice(0, 8) + '01';
  return { from: req.query.from || defaultFrom, to: req.query.to || defaultTo };
}

module.exports = { router };
