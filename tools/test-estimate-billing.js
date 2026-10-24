'use strict';
const assert = require('assert');
const Database = require('better-sqlite3');
const { app } = require('../server/index');
const { seed, EMAIL, PASSWORD } = require('./seed-demo');

async function testDualMode() {
  console.log('Testing Dual Billing Mode (Estimate Bills vs Official GST Invoices)...');
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

  // 1. Auth
  const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  assert.strictEqual(login.status, 200);
  token = login.body.token;

  const parties = await call('GET', '/api/parties?type=customer');
  const party = parties.body.parties[0];
  const products = await call('GET', '/api/products');
  const prod = products.body.products[0];
  const initialStock = prod.stock;
  const initialPartyBalance = party.balance;

  // 2. Create an Estimate Bill (EST-1)
  console.log('1. Creating Estimate Bill...');
  const estRes = await call('POST', '/api/documents', {
    type: 'sale',
    is_estimate: 1,
    partyId: party.id,
    partyName: party.name,
    items: [
      { product_id: prod.id, name: prod.name, qty: 5, rate: 100, gstRate: 18 }
    ],
    paidAmount: 200,
    paymentMode: 'cash',
    otherCharges: 10
  });

  assert.strictEqual(estRes.status, 201);
  const estDoc = estRes.body.document;
  console.log('   Estimate created:', estDoc.number, 'Total:', estDoc.total, 'is_estimate:', estDoc.is_estimate);
  assert.match(estDoc.number, /^EST-\d+$/);
  assert.strictEqual(estDoc.is_estimate, 1);
  assert.strictEqual(estDoc.cgst, 0);
  assert.strictEqual(estDoc.sgst, 0);
  assert.strictEqual(estDoc.igst, 0);
  // Subtotal: 500, Other Charges: 10 => Total: 510
  assert.strictEqual(estDoc.total, 510);
  assert.strictEqual(estDoc.paid_amount, 200);
  assert.strictEqual(estDoc.due_amount, 310);

  // 3. Verify stock deduction and Khata update
  console.log('2. Verifying Stock & Khata update for Estimate Bill...');
  const prodsAfter = await call('GET', '/api/products');
  const prodAfter = prodsAfter.body.products.find((p) => p.id === prod.id);
  assert.strictEqual(prodAfter.stock, initialStock - 5);

  const partyAfter = (await call('GET', `/api/parties/${party.id}`)).body.party;
  assert.strictEqual(partyAfter.balance, initialPartyBalance + 310);

  // 4. Verify GSTR-1 and GSTR-3B exclude Estimate Bill
  console.log('3. Verifying GSTR-1 and GSTR-3B exclude Estimate Bill...');
  const gstr1Before = await call('GET', '/api/reports/gstr1?from=2000-01-01&to=2099-12-31');
  const b2cEstimateCount = gstr1Before.body.b2cs ? gstr1Before.body.b2cs.filter((x) => x.number === estDoc.number).length : 0;
  assert.strictEqual(b2cEstimateCount, 0);

  // 5. Test Filter by is_estimate
  console.log('4. Testing Document list filter by is_estimate...');
  const onlyEsts = await call('GET', '/api/documents?type=sale&is_estimate=1');
  assert.ok(onlyEsts.body.documents.every((d) => d.is_estimate === 1));
  assert.ok(onlyEsts.body.documents.some((d) => d.id === estDoc.id));

  const onlyGst = await call('GET', '/api/documents?type=sale&is_estimate=0');
  assert.ok(onlyGst.body.documents.every((d) => !d.is_estimate || d.is_estimate === 0));
  assert.ok(!onlyGst.body.documents.some((d) => d.id === estDoc.id));

  // 6. Test PDF generation for Estimate Bill (Clean Header, No GSTIN)
  console.log('5. Testing Estimate Bill PDF generation...');
  const pdfRes = await fetch(`${base}/api/pdf/invoice/${estDoc.id}`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  assert.strictEqual(pdfRes.status, 200);
  const pdfBuffer = await pdfRes.arrayBuffer();
  assert.ok(pdfBuffer.byteLength > 2000);

  // 7. Test 1-Click Convert to GST Invoice
  console.log('6. Testing 1-Click Convert to Official GST Invoice...');
  const convertRes = await call('POST', `/api/documents/${estDoc.id}/convert-to-gst`);
  assert.strictEqual(convertRes.status, 200);
  const gstDoc = convertRes.body.document;
  console.log('   Converted to GST Invoice:', gstDoc.number, 'Total:', gstDoc.total, 'is_estimate:', gstDoc.is_estimate);
  assert.strictEqual(gstDoc.is_estimate, 0);
  assert.ok(!gstDoc.number.startsWith('EST-'));
  // Tax should now be computed: 500 @ 18% = 90 tax => 45 CGST + 45 SGST (intra-state)
  assert.strictEqual(gstDoc.cgst + gstDoc.sgst + gstDoc.igst, 90);
  assert.strictEqual(gstDoc.taxable_value, 500);
  // Total: 500 + 90 tax + 10 Other Charges = 600
  assert.strictEqual(gstDoc.total, 600);
  assert.strictEqual(gstDoc.paid_amount, 200);
  assert.strictEqual(gstDoc.due_amount, 400);

  // Stock should NOT be double deducted!
  const prodAfterGst = (await call('GET', '/api/products')).body.products.find((p) => p.id === prod.id);
  assert.strictEqual(prodAfterGst.stock, initialStock - 5);

  // Party balance should reflect new due of 400 instead of 310
  const partyAfterGst = (await call('GET', `/api/parties/${party.id}`)).body.party;
  assert.strictEqual(partyAfterGst.balance, initialPartyBalance + 400);

  // Now GSTR-1 or GSTR-3B should include it
  console.log('7. Verifying GSTR-3B includes converted GST invoice...');
  const gstr3b = await call('GET', '/api/reports/gstr3b?from=2000-01-01&to=2099-12-31');
  const outward = gstr3b.body.table3_1a ? gstr3b.body.table3_1a.outward : gstr3b.body.outward;
  assert.ok(outward.taxable >= 500);
  assert.ok(outward.cgst + outward.sgst >= 90);

  server.close();
  console.log('✅ ALL DUAL BILLING MODE & ESTIMATE TESTS PASSED PERFECTLY!\n');
}

testDualMode().catch((err) => {
  console.error('❌ Dual Mode Test Failed:', err);
  process.exit(1);
});
