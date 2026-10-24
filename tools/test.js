'use strict';
/**
 * End-to-end API test: boots the real Express app on an ephemeral port and
 * drives it over HTTP (login -> business switch -> invoice -> stock -> khata
 * -> reports -> PDF). Fails loudly on any mismatch.
 */
// The test DB is pointed at by BILLPRO_DB (set in package.json "test"); wipe it here.
if (process.env.BILLPRO_DB) {
  const fs = require('fs');
  const path = require('path');
  fs.rmSync(process.env.BILLPRO_DB, { force: true });
  fs.rmSync(process.env.BILLPRO_DB + '-wal', { force: true });
  fs.rmSync(process.env.BILLPRO_DB + '-shm', { force: true });
  process.env.BILLPRO_DATA_DIR = path.join(path.dirname(path.resolve(process.env.BILLPRO_DB)), 'test-registry-data');
  fs.rmSync(process.env.BILLPRO_DATA_DIR, { recursive: true, force: true });
}

const { seed, EMAIL, PASSWORD } = require('./seed-demo');
seed();
const { db } = require('../server/db');
const { loadRegistry, saveToRegistry, removeFromRegistry, syncPersistentClients } = require('../server/lib/persistent-clients');

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
  saveToRegistry({ name: 'Registry Test A', email: 'registry-a@test.invalid', phone: '9000011122', plan: 'lifetime', expires_at: null });
  saveToRegistry({ name: 'Registry Test B', email: 'registry-b@test.invalid', phone: '9000011122', plan: 'yearly', expires_at: '2027-10-23' });
  ok('registry keeps separate client accounts that share a phone number',
    loadRegistry().some((c) => c.email === 'registry-a@test.invalid') && loadRegistry().some((c) => c.email === 'registry-b@test.invalid'));
  removeFromRegistry('registry-a@test.invalid'); removeFromRegistry('registry-b@test.invalid');

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
  const blockedPartyDelete = await call('DELETE', `/api/parties/${kerala.id}`);
  ok('prevents deleting a customer with an active invoice balance', blockedPartyDelete.status === 409 && Array.isArray(blockedPartyDelete.body.dueInvoices) && blockedPartyDelete.body.dueInvoices.some((doc) => doc.id === d.id), blockedPartyDelete.body);
  ok('customer remains available after blocked delete', (await call('GET', `/api/parties/${kerala.id}`)).status === 200);
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
  ok('dashboard has cash & upi collection tracking', typeof dash.body.todayCash === 'number' && typeof dash.body.monthCash === 'number', dash.body);
  const pmts = await call('GET', '/api/reports/payments');
  ok('payments report returns cash and upi breakdown', pmts.status === 200 && typeof pmts.body.totals.cash === 'number' && typeof pmts.body.totals.upi === 'number', pmts.body.totals);
  ok('payments report total matches sum of modes', near(pmts.body.totals.cash + pmts.body.totals.upi + pmts.body.totals.bank + pmts.body.totals.card + pmts.body.totals.cheque + pmts.body.totals.other, pmts.body.totals.total), pmts.body.totals);
  const dayb = await call('GET', '/api/reports/daybook');
  ok('daybook tracks cash and upi received', dayb.status === 200 && typeof dayb.body.totals.cashReceived === 'number' && typeof dayb.body.totals.upiReceived === 'number', dayb.body.totals);
  const pmtCsv = await fetch(base + '/api/reports/export/payments', { headers: { Authorization: 'Bearer ' + token } });
  const pmtCsvText = await pmtCsv.text();
  ok('payments CSV export works', pmtCsv.status === 200 && pmtCsvText.includes('"Receipt ID"'), pmtCsvText.slice(0, 40));
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
  const subscriptionBeforeBusiness = db.prepare('SELECT plan FROM users WHERE lower(email)=lower(?)').get(EMAIL)?.plan;
  const nb = await call('POST', '/api/businesses', { name: 'Test Third Business', gstin: '29AAACT2727Q1ZQ', city: 'Bengaluru', state: 'Karnataka' });
  ok('creates a third business', nb.status === 201, nb.status);
  const subscriptionAfterBusiness = db.prepare('SELECT plan FROM users WHERE lower(email)=lower(?)').get(EMAIL)?.plan;
  ok('adding a business does not reset the account subscription plan', subscriptionAfterBusiness === subscriptionBeforeBusiness, { before: subscriptionBeforeBusiness, after: subscriptionAfterBusiness });
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

  console.log('\n--- customer onboarding & super admin licensing ---');
  // 1. Closed public registration test
  const blockedSignup = await fetch(base + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hacker User', email: 'intruder@example.com', password: 'password123' })
  });
  const blockedSignupBody = await blockedSignup.json();
  ok('public signup is disabled by default (403)', blockedSignup.status === 403 && blockedSignupBody.signup_disabled === true, blockedSignup.status);

  // 2. Submit sales / WhatsApp inquiry
  const submitInquiry = await fetch(base + '/api/auth/inquire', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Ramesh Patel',
      phone: '9876543210',
      email: 'ramesh@pateltraders.com',
      shop_name: 'Patel Supermarket',
      city: 'Ahmedabad',
      plan: 'yearly',
      message: 'Need GST billing with thermal printer support'
    })
  });
  const inquiryRes = await submitInquiry.json();
  ok('submits public inquiry with WhatsApp sales info', submitInquiry.status === 200 && inquiryRes.ok && Boolean(inquiryRes.inquiry_id));

  // 3. Super admin stats
  const adminStats = await call('GET', '/api/admin/stats');
  ok('super admin can view overall stats', adminStats.status === 200 && adminStats.body.users.total >= 1 && adminStats.body.inquiries.total >= 1);

  // 4. Convert inquiry to provisioned client
  const convertInquiry = await call('POST', `/api/admin/inquiries/${inquiryRes.inquiry_id}/convert`, {
    plan: 'yearly',
    password: 'Client@Pass123'
  });
  ok('converts inquiry to provisioned client with credentials', convertInquiry.status === 200 && convertInquiry.body.user.email === 'ramesh@pateltraders.com');

  // 5. Provisioned customer can sign in
  const clientLogin = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ramesh@pateltraders.com', password: 'Client@Pass123' })
  });
  const clientData = await clientLogin.json();
  ok('provisioned client logs in successfully with primary business', clientLogin.status === 200 && clientData.businesses.length >= 1 && clientData.user.plan === 'yearly');
  const foreignBusiness = (await call('GET', '/api/businesses?all=1')).body.businesses.find((b) => b.owner_id !== clientData.user.id);
  const crossTenantAttempt = await fetch(base + '/api/parties?type=customer', {
    headers: { Authorization: `Bearer ${clientData.token}`, 'X-Business-Id': String(foreignBusiness.id) }
  });
  ok('client cannot operate another account by supplying its business ID (403)', crossTenantAttempt.status === 403, crossTenantAttempt.status);

  // 6. Super Admin direct provisioning of Monthly client
  const directProvision = await call('POST', '/api/admin/users', {
    name: 'Priya Sharma',
    email: 'priya@sharmafashion.in',
    phone: '9811223344',
    business_name: 'Sharma Fashion Boutique',
    plan: 'monthly',
    password: 'Priya@Secure2026'
  });
  ok('super admin directly provisions new customer', directProvision.status === 200 && directProvision.body.user.plan === 'monthly' && Boolean(directProvision.body.user.expires_at));
  const testDataDir = process.env.BILLPRO_DATA_DIR;
  delete process.env.BILLPRO_DATA_DIR;
  const lockWithoutDisk = await call('POST', `/api/admin/users/${directProvision.body.user.id}/persist`);
  process.env.BILLPRO_DATA_DIR = testDataDir;
  ok('does not claim permanent lock on ephemeral storage', lockWithoutDisk.status === 409, lockWithoutDisk.body);

  // 7. Renew subscription (e.g. upgrade to lifetime)
  const renewClient = await call('POST', `/api/admin/users/${directProvision.body.user.id}/renew`, {
    plan: 'lifetime'
  });
  ok('renews and updates client subscription plan to lifetime', renewClient.status === 200 && renewClient.body.user.plan === 'lifetime' && renewClient.body.user.expires_at === null);
  const lifetimeRegistryEntry = loadRegistry().find((c) => c.email === 'priya@sharmafashion.in');
  ok('registry snapshot records lifetime with no expiry', lifetimeRegistryEntry?.plan === 'lifetime' && lifetimeRegistryEntry.expires_at === null, lifetimeRegistryEntry);
  // Simulate an older bundled registry copy left at yearly after the live account was upgraded.
  saveToRegistry({ email: 'priya@sharmafashion.in', plan: 'yearly', expires_at: '2028-12-31' });
  syncPersistentClients(db);
  const restoredLifetimeUser = db.prepare('SELECT plan, expires_at FROM users WHERE id = ?').get(directProvision.body.user.id);
  ok('startup sync preserves the live lifetime subscription against a stale yearly registry snapshot', restoredLifetimeUser.plan === 'lifetime' && restoredLifetimeUser.expires_at === null, restoredLifetimeUser);
  const diskLock = await call('POST', `/api/admin/users/${directProvision.body.user.id}/persist`);
  ok('permanent lock succeeds with configured persistent storage', diskLock.status === 200 && diskLock.body.storage === 'persistent', diskLock.body);
  db.prepare("UPDATE users SET expires_at = '2020-01-01' WHERE id = ?").run(directProvision.body.user.id);
  const lifetimeLogin = await call('POST', '/api/auth/login', { email: 'priya@sharmafashion.in', password: 'Priya@Secure2026' });
  ok('lifetime account is never marked expired even if an old expiry remains', lifetimeLogin.status === 200 && lifetimeLogin.body.user.is_expired === false);

  // 8. Suspend account and verify access blocked
  const suspendUser = await call('PUT', `/api/admin/users/${directProvision.body.user.id}`, {
    status: 'suspended'
  });
  ok('super admin can suspend client account', suspendUser.status === 200 && suspendUser.body.user.status === 'suspended');

  const suspendedAttempt = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'priya@sharmafashion.in', password: 'Priya@Secure2026' })
  });
  ok('suspended user is blocked from logging in (403)', suspendedAttempt.status === 403);

  // 9. Non-admin staff cannot access /api/admin
  const nonAdminCheck = await fetch(base + '/api/admin/stats', {
    headers: { 'Authorization': 'Bearer ' + staffJwt }
  });
  ok('non-superadmin is rejected from admin endpoints (403)', nonAdminCheck.status === 403);

  // 10. Dedicated 1-Click Demo Merchant User
  const demoUserLogin = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo.user@billpro.in', password: 'demo1234' })
  });
  const demoUserData = await demoUserLogin.json();
  ok('demo merchant logs in with sample store data', demoUserLogin.status === 200 && demoUserData.businesses.length >= 1);
  ok('demo merchant is NOT superadmin (is_superadmin=false)', demoUserData.user.is_superadmin === false);

  const demoAdminDeny = await fetch(base + '/api/admin/stats', {
    headers: { 'Authorization': 'Bearer ' + demoUserData.token }
  });
  ok('demo merchant is blocked from super admin endpoints (403)', demoAdminDeny.status === 403);

  console.log('\n--- dual billing mode (estimate bills vs official GST) ---');
  // 1. Create an Estimate Bill
  const estParty = parties.body.parties[0];
  const estProd = products.body.products[0];
  const initialEstStock = (await call('GET', '/api/products')).body.products.find((p) => p.id === estProd.id).stock;
  const initialEstPartyBal = (await call('GET', `/api/parties/${estParty.id}`)).body.party.balance;

  const estCreate = await call('POST', '/api/documents', {
    type: 'sale',
    is_estimate: 1,
    partyId: estParty.id,
    partyName: estParty.name,
    items: [{ product_id: estProd.id, name: estProd.name, qty: 3, rate: 200, gstRate: 18 }],
    paidAmount: 200,
    paymentMode: 'cash',
    otherCharges: 15
  });
  ok('creates an Estimate Bill', estCreate.status === 201 && estCreate.body.document.is_estimate === 1, estCreate.status);
  const estDocData = estCreate.body.document;
  ok('estimate bill uses EST-n series number', /^EST-\d+$/.test(estDocData.number), estDocData.number);
  ok('estimate bill has 0 GST taxes', estDocData.cgst === 0 && estDocData.sgst === 0 && estDocData.igst === 0, { cgst: estDocData.cgst, sgst: estDocData.sgst });
  ok('estimate bill total includes Other Charges (615)', estDocData.total === 615, estDocData.total);
  ok('estimate bill reduces inventory stock', (await call('GET', '/api/products')).body.products.find((p) => p.id === estProd.id).stock === initialEstStock - 3);
  ok('estimate bill updates customer khata (+415 due)', near((await call('GET', `/api/parties/${estParty.id}`)).body.party.balance, initialEstPartyBal + 415));

  // 2. Estimate excluded from GSTR-1 & GSTR-3B
  const gstr1EstCheck = await call('GET', '/api/reports/gstr1?from=2000-01-01&to=2099-12-31');
  const foundInGstr1 = (gstr1EstCheck.body.b2cs || []).some((b) => b.number === estDocData.number);
  ok('estimate bill is excluded from GSTR-1', !foundInGstr1);

  // 3. Document filter by is_estimate
  const estFilterList = await call('GET', '/api/documents?type=sale&is_estimate=1');
  ok('filter is_estimate=1 returns only estimate documents', estFilterList.body.documents.every((d) => d.is_estimate === 1) && estFilterList.body.documents.some((d) => d.id === estDocData.id));

  // 4. Convert Estimate to Official GST Invoice
  const convertAction = await call('POST', `/api/documents/${estDocData.id}/convert-to-gst`);
  ok('converts estimate to GST invoice', convertAction.status === 200, convertAction.status);
  const convertedGst = convertAction.body.document;
  ok('converted invoice has is_estimate=0', convertedGst.is_estimate === 0);
  ok('converted invoice gets sequential GST series number', !convertedGst.number.startsWith('EST-'), convertedGst.number);
  ok('converted invoice computes real GST splits (108 tax)', near(convertedGst.cgst + convertedGst.sgst + convertedGst.igst, 108), { cgst: convertedGst.cgst, sgst: convertedGst.sgst });
  ok('converted invoice total matches taxable + GST + charges (723)', convertedGst.total === 723, convertedGst.total);
  ok('converted invoice does not duplicate stock deduction', (await call('GET', '/api/products')).body.products.find((p) => p.id === estProd.id).stock === initialEstStock - 3);

  // 5. Clean PDF generation for estimate bills
  const estBill2 = await call('POST', '/api/documents', {
    type: 'sale',
    is_estimate: 1,
    partyName: 'Retail Walk-in Buyer',
    items: [{ name: 'Loose Dry Fruits 1kg', qty: 2, rate: 450, gstRate: 12 }]
  });
  const estPdfRes = await fetch(`${base}/api/pdf/invoice/${estBill2.body.document.id}`, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  ok('generates clean Estimate Bill PDF', estPdfRes.status === 200 && Number(estPdfRes.headers.get('content-length') || 0) > 1000);

  // Full restore verification with deliberately shifted source IDs, as happens on a fresh Render DB.
  const backupResponse = await call('GET', '/api/admin/backup');
  const backup = backupResponse.body;
  ok('authenticated JSON backup endpoint returns a complete snapshot', backupResponse.status === 200 && Array.isArray(backup.users) && Array.isArray(backup.businesses), { status: backupResponse.status, error: backup.error });
  const bump = (v) => v == null ? v : Number(v) + 50000;
  for (const u of backup.users || []) { u.id = bump(u.id); u.active_business_id = bump(u.active_business_id); }
  for (const b of backup.businesses || []) { b.id = bump(b.id); b.owner_id = bump(b.owner_id); }
  for (const p of backup.parties || []) { p.id = bump(p.id); p.business_id = bump(p.business_id); }
  for (const c of backup.product_categories || []) { c.id = bump(c.id); c.business_id = bump(c.business_id); }
  for (const p of backup.products || []) { p.id = bump(p.id); p.business_id = bump(p.business_id); }
  for (const d of backup.documents || []) {
    d.id = bump(d.id); d.business_id = bump(d.business_id); d.party_id = bump(d.party_id); d.created_by = bump(d.created_by);
    try { d.items = JSON.stringify(JSON.parse(d.items).map((line) => line.product_id ? { ...line, product_id: bump(line.product_id) } : line)); } catch (_) {}
  }
  for (const t of backup.transactions || []) { t.id = bump(t.id); t.business_id = bump(t.business_id); t.party_id = bump(t.party_id); t.document_id = bump(t.document_id); }
  for (const m of backup.stock_moves || []) { m.id = bump(m.id); m.business_id = bump(m.business_id); m.product_id = bump(m.product_id); m.document_id = bump(m.document_id); }
  for (const s of backup.staff || []) { s.id = bump(s.id); s.business_id = bump(s.business_id); }
  const countsBeforeRestore = {
    businesses: db.prepare('SELECT COUNT(*) n FROM businesses').get().n,
    parties: db.prepare('SELECT COUNT(*) n FROM parties').get().n,
    products: db.prepare('SELECT COUNT(*) n FROM products').get().n,
    documents: db.prepare('SELECT COUNT(*) n FROM documents').get().n,
    transactions: db.prepare('SELECT COUNT(*) n FROM transactions').get().n
  };
  const restoreRes = await call('POST', '/api/admin/restore', backup);
  ok('restores JSON backup despite shifted user/business/entity IDs', restoreRes.status === 200, restoreRes.body);
  const countsAfterRestore = {
    businesses: db.prepare('SELECT COUNT(*) n FROM businesses').get().n,
    parties: db.prepare('SELECT COUNT(*) n FROM parties').get().n,
    products: db.prepare('SELECT COUNT(*) n FROM products').get().n,
    documents: db.prepare('SELECT COUNT(*) n FROM documents').get().n,
    transactions: db.prepare('SELECT COUNT(*) n FROM transactions').get().n
  };
  ok('backup restore is idempotent and does not duplicate tenant records', JSON.stringify(countsBeforeRestore) === JSON.stringify(countsAfterRestore), { countsBeforeRestore, countsAfterRestore });

  server.close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error('TEST CRASH', e); process.exit(1); });
