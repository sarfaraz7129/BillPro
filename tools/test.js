'use strict';
/**
 * End-to-end API test: boots the real Express app on an ephemeral port and
 * drives it over HTTP (login -> business switch -> invoice -> stock -> khata
 * -> reports -> PDF). Fails loudly on any mismatch.
 */
// The test DB is pointed at by BILLPRO_DB (set in package.json "test"); wipe it here.
if (process.env.BILLPRO_DB) require('fs').rmSync(process.env.BILLPRO_DB, { force: true });

const { seed, EMAIL, PASSWORD } = require('./seed-demo');
seed();

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../server/middleware');
const { app } = require('../server/index');

let passed = 0;
let failed = 0;
const ok = (label, cond, extra) => {
  if (cond) { passed++; console.log('  PASS  ' + label); }
  else { failed++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011;

async function run() {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  let token = null;
  const call = async (method, path, body, headers = {}) => {
    const hasBody = body !== undefined && method !== 'GET' && method !== 'HEAD';
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body: hasBody ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };

  console.log('\n--- auth ---');
  const bad = await call('POST', '/api/auth/login', { email: EMAIL, password: 'wrong' });
  ok('rejects a wrong password', bad.status === 401, bad.status);
  const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  ok('logs in with the demo account', login.status === 200 && !!login.body.token, login.status);
  token = login.body.token;

  const noAuth = await fetch(base + '/api/businesses');
  ok('blocks unauthenticated API calls', noAuth.status === 401, noAuth.status);

  console.log('\n--- multi-business ---');
  const list = await call('GET', '/api/businesses');
  ok('lists 2 seeded businesses', list.body.businesses.length === 2, list.body.businesses.length);
  const [bizA, bizB] = list.body.businesses;
  const group = await call('GET', '/api/businesses/group/overview');
  ok('group overview aggregates both businesses', group.body.businesses.length === 2 && group.body.total.sales > 0, group.body.total);
  ok('group totals equal the sum of each business',
    near(group.body.total.sales, group.body.businesses.reduce((s, b) => s + b.sales, 0)),
    { total: group.body.total.sales, sum: group.body.businesses.reduce((s, b) => s + b.sales, 0) });

  const switchRes = await call('POST', `/api/auth/active-business/${bizB.id}`);
  ok('can switch the active business', switchRes.status === 200, switchRes.status);
  const bizBParties = await call('GET', '/api/parties?type=customer');
  ok('business B only sees its own customers', bizBParties.body.parties.every((p) => p.business_id === bizB.id), bizBParties.body.parties.map((p) => p.name));
  await call('POST', `/api/auth/active-business/${bizA.id}`);

  console.log('\n--- GST invoice maths ---');
  const parties = await call('GET', '/api/parties?type=customer');
  const kerala = parties.body.parties.find((p) => p.name === 'Kerala Coconut Exports');
  const products = await call('GET', '/api/products');
  const rice = products.body.products.find((p) => p.sku === 'CT-1001');
  const coffee = products.body.products.find((p) => p.sku === 'CT-1004');

  const inv = await call('POST', '/api/documents', {
    type: 'sale',
    partyId: kerala.id, partyName: kerala.name, partyGstin: kerala.gstin, partyStateCode: kerala.state_code,
    date: new Date().toISOString().slice(0, 10),
    items: [
      { product_id: rice.id, name: rice.name, hsn: rice.hsn, unit: rice.unit, qty: 10, rate: 2000, gstRate: 18 },
      { product_id: coffee.id, name: coffee.name, hsn: coffee.hsn, unit: coffee.unit, qty: 4, rate: 250, gstRate: 18, discountPct: 10 }
    ],
    roundOff: false,
    paidAmount: 5000, paymentMode: 'upi'
  });
  ok('creates an invoice', inv.status === 201 && !!inv.body.document.number, inv.status);
  const d = inv.body.document;
  // 10*2000 = 20000 ; 4*250=1000 -10% = 900 ; taxable 20900 ; IGST 18% = 3762
  ok('inter-state invoice charges IGST only', near(d.igst, 3762) && d.cgst === 0 && d.sgst === 0, { igst: d.igst, cgst: d.cgst, sgst: d.sgst });
  ok('taxable value nets off the line discount', near(d.taxable_value, 20900), d.taxable_value);
  ok('total = taxable + IGST', near(d.total, 24662), d.total);
  ok('partial payment sets payment_status=partial', d.payment_status === 'partial' && near(d.paid_amount, 5000) && near(d.due_amount, 19662), { s: d.payment_status, paid: d.paid_amount, due: d.due_amount });
  ok('amount in words is filled', /Rupees.*Only/.test(d.amount_in_words), d.amount_in_words);

  console.log('\n--- inventory posting ---');
  const after = await call('GET', '/api/products');
  const riceAfter = after.body.products.find((p) => p.id === rice.id);
  const coffeeAfter = after.body.products.find((p) => p.id === coffee.id);
  ok('sale reduces product stock', riceAfter.stock === rice.stock - 10, { before: rice.stock, after: riceAfter.stock });
  ok('second line also deducted', coffeeAfter.stock === coffee.stock - 4, { before: coffee.stock, after: coffeeAfter.stock });
  const lowRes = await call('GET', '/api/products?low=1');
  ok('low-stock filter returns only items at/below threshold', lowRes.body.products.every((p) => p.stock <= p.low_stock_at), lowRes.body.products.length);

  console.log('\n--- khata ---');
  const stmt = await call('GET', `/api/parties/${kerala.id}/statement`);
  const hasInvoice = stmt.body.entries.some((e) => e.reference === d.number);
  ok('statement includes the new invoice', hasInvoice, stmt.body.entries.length);
  ok('statement running balance matches the party balance', near(stmt.body.running, stmt.body.party.balance), { running: stmt.body.running, balance: stmt.body.party.balance });

  const pay = await call('POST', '/api/transactions', { partyId: kerala.id, type: 'you_got', amount: 4662, mode: 'upi', reference: 'UTR-TEST-1' });
  ok('records a payment', pay.status === 201, pay.status);
  const stmt2 = await call('GET', `/api/parties/${kerala.id}/statement`);
  ok('payment reduces the party balance by exactly the amount', near(stmt2.body.party.balance - stmt.body.party.balance, -4662), { before: stmt.body.party.balance, after: stmt2.body.party.balance });

  console.log('\n--- stock unwind on cancel ---');
  const beforeCancel = (await call('GET', '/api/products')).body.products.find((p) => p.id === rice.id).stock;
  const cancel = await call('POST', `/api/documents/${d.id}/cancel`);
  ok('cancels the invoice', cancel.status === 200 && cancel.body.document.status === 'cancelled', cancel.status);
  const afterCancel = (await call('GET', '/api/products')).body.products.find((p) => p.id === rice.id).stock;
  ok('cancelling restores the stock', afterCancel === beforeCancel + 10, { before: beforeCancel, after: afterCancel });
  const stmt3 = await call('GET', `/api/parties/${kerala.id}/statement`);
  ok('cancelled invoice no longer counted in the ledger', !stmt3.body.entries.some((e) => e.kind === 'invoice' && e.reference === d.number), stmt3.body.entries.length);

  console.log('\n--- e-way bill / e-invoice ---');
  const live = await call('POST', '/api/documents', {
    type: 'sale', partyId: kerala.id, partyName: kerala.name, partyGstin: kerala.gstin, partyStateCode: '32',
    items: [{ name: 'Coconut Oil 5L', hsn: '1513', unit: 'can', qty: 100, rate: 810, gstRate: 5 }],
    vehicleNo: 'KL07AB1234', transportDocNo: 'LR-556'
  });
  ok('creates a large inter-state invoice', live.status === 201, live.status);
  const ewb = await call('POST', `/api/documents/${live.body.document.id}/ewaybill`, { vehicleNo: 'KL07AB1234' });
  ok('generates an E-Way Bill with a 12-digit number', ewb.status === 200 && /^\d{12}$/.test(ewb.body.ewaybillNo), ewb.body.ewaybillNo);
  ok('E-Way Bill payload carries the vehicle', ewb.body.payload.vehicleDetails.vehicleNo === 'KL07AB1234', ewb.body.payload.vehicleDetails);
  const einv = await call('POST', `/api/documents/${live.body.document.id}/einvoice`);
  ok('generates an e-invoice IRN + ack', einv.status === 200 && !!einv.body.irn && !!einv.body.ackNo, { irn: einv.body.irn, ack: einv.body.ackNo });
  ok('e-invoice payload has ItemList and ValDtls', Array.isArray(einv.body.payload.ItemList) && einv.body.payload.ValDtls.TotInvVal > 0, einv.body.payload.ValDtls);

  console.log('\n--- sharing + PDF ---');
  const share = await call('GET', `/api/documents/${live.body.document.id}/share`);
  ok('share message contains the invoice number and amount', /UT-|CT-|PO-|EX-|INV-/.test(share.body.message) || share.body.message.includes(live.body.document.number), share.body.message.slice(0, 80));
  ok('whatsapp link is a wa.me deep link', !share.body.links.whatsapp || share.body.links.whatsapp.startsWith('https://wa.me/'), share.body.links.whatsapp);
  const pdf = await fetch(base + `/api/pdf/invoice/${live.body.document.id}`, { headers: { Authorization: 'Bearer ' + token } });
  const pdfBuf = Buffer.from(await pdf.arrayBuffer());
  ok('invoice PDF is generated', pdf.status === 200 && pdfBuf.slice(0, 5).toString() === '%PDF-', pdf.status);
  const pdfText = pdfBuf.toString('latin1');
  ok('invoice PDF has a page object', /\/Type\s*\/Page[^s]/.test(pdfText), pdfBuf.length);
  ok('invoice PDF is a plausible size (>4KB)', pdfBuf.length > 4000, pdfBuf.length);
  const stmtPdf = await fetch(base + `/api/pdf/statement/${kerala.id}`, { headers: { Authorization: 'Bearer ' + token } });
  ok('party statement PDF is generated', stmtPdf.status === 200, stmtPdf.status);
  const stockPdf = await fetch(base + '/api/pdf/stock', { headers: { Authorization: 'Bearer ' + token } });
  ok('stock report PDF is generated', stockPdf.status === 200, stockPdf.status);

  console.log('\n--- reports ---');
  const dash = await call('GET', '/api/reports/dashboard');
  ok('dashboard returns KPIs', typeof dash.body.monthSales === 'number' && Array.isArray(dash.body.salesSeries), Object.keys(dash.body).length);
  const g1 = await call('GET', '/api/reports/gstr1');
  ok('GSTR-1 has B2B rows', g1.body.b2b.length > 0, g1.body.b2b.length);
  ok('GSTR-1 HSN summary is populated', g1.body.hsn.length > 0, g1.body.hsn.length);
  const g3 = await call('GET', '/api/reports/gstr3b');
  ok('GSTR-3B computes net tax payable', typeof g3.body.payableCash === 'number', g3.body.payableCash);
  const csv = await fetch(base + '/api/reports/export/gstr1', { headers: { Authorization: 'Bearer ' + token } });
  const csvText = await csv.text();
  // note: fetch's res.text() strips the UTF-8 BOM per spec, so assert on the header row
  ok('GSTR-1 CSV export works', csv.status === 200 && csv.headers.get('content-type').includes('text/csv') && csvText.startsWith('"GSTIN of recipient"'), csvText.slice(0, 40));
  const aging = await call('GET', '/api/reports/aging');
  ok('aging buckets sum to the total receivable', near(aging.body.buckets['0-30'] + aging.body.buckets['31-60'] + aging.body.buckets['61-90'] + aging.body.buckets['90+'], aging.body.total), aging.body);

  console.log('\n--- reminders ---');
  const rem = await call('GET', '/api/documents/reminders/overdue');
  ok('overdue reminder endpoint responds', rem.status === 200 && typeof rem.body.totalDue === 'number', rem.status);

  console.log('\n--- new business isolation ---');
  const nb = await call('POST', '/api/businesses', { name: 'Test Third Business', gstin: '29AAACT2727Q1ZQ', city: 'Bengaluru', state: 'Karnataka' });
  ok('creates a third business', nb.status === 201, nb.status);
  ok('GSTIN state code is derived', nb.body.business.state_code === '29', nb.body.business.state_code);
  const badGstin = await call('POST', '/api/businesses', { name: 'Bad GSTIN', gstin: '29XX' });
  ok('rejects an invalid GSTIN', badGstin.status === 400, badGstin.status);
  const emptyB = await call('GET', '/api/documents?type=sale', undefined, { 'X-Business-Id': String(nb.body.business.id) });
  ok('a brand new business has no invoices (data isolation)', emptyB.body.documents.length === 0, emptyB.body.documents.length);
  const otherParty = await call('GET', `/api/parties/${kerala.id}`, undefined, { 'X-Business-Id': String(nb.body.business.id) });
  ok('cannot read another business\'s party', otherParty.status === 404, otherParty.status);

  console.log('\n--- Indian Standard Time (+5:30) & Bill Date Role Lock ---');
  const tApi = await call('GET', '/api/time');
  ok('/api/time returns offset +05:30', tApi.body.offset === '+05:30', tApi.body.offset);
  ok('/api/time returns Asia/Kolkata timezone', tApi.body.timezone === 'Asia/Kolkata', tApi.body.timezone);
  ok('API headers contain x-server-time', Boolean(tApi.headers.get('x-server-time')), tApi.headers.get('x-server-time'));
  ok('API headers contain x-ist-date', Boolean(tApi.headers.get('x-ist-date')), tApi.headers.get('x-ist-date'));

  // Invite a staff member (which creates user account with password in users table)
  const staffInvite = await call('POST', `/api/businesses/${bizA.id}/staff`, {
    name: 'Test Cashier', email: 'cashier@test.in', role: 'staff', permissions: ['billing'], password: 'password123'
  });
  ok('invites cashier staff member and creates account', staffInvite.status === 201, staffInvite.status);

  // Verify staff can log in with their created password
  const staffLogin = await call('POST', '/api/auth/login', { email: 'cashier@test.in', password: 'password123' });
  ok('staff can log in with created password', staffLogin.status === 200 && Boolean(staffLogin.body.token), staffLogin.status);
  const staffJwt = staffLogin.body.token;

  // Staff attempts backdated invoice -> 403 Forbidden
  const staffBackdate = await fetch(base + '/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + staffJwt, 'X-Business-Id': String(bizA.id) },
    body: JSON.stringify({ type: 'sale', date: '2024-01-01', items: [{ name: 'Rice', qty: 1, rate: 50, gstRate: 5 }] })
  });
  ok('staff forbidden from backdating bill date (403)', staffBackdate.status === 403, staffBackdate.status);

  // Staff creates bill with default date -> 201 OK and locked to IST date
  const staffNormal = await fetch(base + '/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + staffJwt, 'X-Business-Id': String(bizA.id) },
    body: JSON.stringify({ type: 'sale', items: [{ name: 'Rice', qty: 1, rate: 50, gstRate: 5 }] })
  });
  const staffDoc = await staffNormal.json();
  ok('staff bill succeeds and defaults to IST date', staffNormal.status === 201 && staffDoc.document.date === tApi.body.ist_date, staffDoc.document?.date);

  // Staff attempts to edit bill date of existing invoice -> 403 Forbidden
  const staffEditDate = await fetch(base + `/api/documents/${staffDoc.document.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + staffJwt, 'X-Business-Id': String(bizA.id) },
    body: JSON.stringify({ date: '2025-01-01', items: [{ name: 'Rice', qty: 1, rate: 50, gstRate: 5 }] })
  });
  ok('staff forbidden from editing existing bill date (403)', staffEditDate.status === 403, staffEditDate.status);

  // Admin/Owner can set custom date
  const adminCustom = await call('POST', '/api/documents', {
    type: 'sale', date: '2025-05-20', items: [{ name: 'Admin Custom Line', qty: 1, rate: 100, gstRate: 5 }]
  });
  ok('admin permitted to customize bill date', adminCustom.status === 201 && adminCustom.body.document.date === '2025-05-20', adminCustom.body.document?.date);

  console.log('\n--- category management ---');
  // Create a new category
  const createCat = await call('POST', '/api/products/categories', { name: 'Beverages' });
  ok('creates a new category', createCat.status === 201 && createCat.body.category.name === 'Beverages', createCat.body);

  // List categories
  const listCats = await call('GET', '/api/products/categories');
  const bevCat = (listCats.body.categories || []).find((c) => c.name === 'Beverages');
  ok('category list includes newly created category', !!bevCat, listCats.body.categories);

  // Create product in that category
  const createProdWithCat = await call('POST', '/api/products', {
    name: 'Cold Coffee 200ml',
    category: 'Beverages',
    sale_price: 60,
    unit: 'can'
  });
  ok('creates product assigned to category', createProdWithCat.status === 201 && createProdWithCat.body.product.category === 'Beverages');

  // Verify category product count
  const listCatsAfterProd = await call('GET', '/api/products/categories');
  const bevCatAfter = (listCatsAfterProd.body.categories || []).find((c) => c.name === 'Beverages');
  ok('category reflects product count', bevCatAfter && bevCatAfter.productCount >= 1, bevCatAfter);

  // Rename category
  const renameCat = await call('PUT', '/api/products/categories/rename', { from: 'Beverages', to: 'Drinks & Beverages' });
  ok('renames category', renameCat.status === 200 && renameCat.body.name === 'Drinks & Beverages');

  // Verify product now has renamed category
  const checkRenamedProd = await call('GET', `/api/products`);
  const renamedProd = checkRenamedProd.body.products.find((p) => p.name === 'Cold Coffee 200ml');
  ok('product updated to renamed category', renamedProd && renamedProd.category === 'Drinks & Beverages', renamedProd?.category);

  // Delete category
  const delCat = await call('DELETE', '/api/products/categories/Drinks%20%26%20Beverages');
  ok('deletes category', delCat.status === 200);

  // Verify product is now uncategorized
  const checkDeletedProd = await call('GET', `/api/products`);
  const deletedCatProd = checkDeletedProd.body.products.find((p) => p.name === 'Cold Coffee 200ml');
  ok('product category cleared on delete', deletedCatProd && !deletedCatProd.category, deletedCatProd?.category);

  server.close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error('TEST CRASH', e); process.exit(1); });
