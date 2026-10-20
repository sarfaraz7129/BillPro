const assert = require('assert');
const { db } = require('../server/db');

async function testBulk() {
  const http = require('http');
  const { app } = require('../server/index');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Login
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@billpro.in', password: 'demo1234' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  const bizId = loginData.businesses?.[0]?.id || loginData.user?.business_id;

  // 1. Test Bulk Products
  const prodItems = [
    {
      name: 'Excel Test Basmati Rice 5kg',
      barcode: '9901002003001',
      category: 'Grains',
      unit: 'bag',
      sale_price: 450,
      purchase_price: 390,
      gst_rate: 5,
      hsn: '1006',
      stock: 25,
      low_stock_at: 5
    },
    {
      name: 'Excel Test Handcrafted Wooden Spoon',
      barcode: '9901002003002',
      category: 'Handicrafts',
      unit: 'pcs',
      sale_price: 180,
      purchase_price: 110,
      gst_rate: 7.5, // Custom GST rate!
      hsn: '4419',
      stock: 50,
      low_stock_at: 10
    }
  ];

  const prodRes = await fetch(`${baseUrl}/api/products/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Business-Id': String(bizId)
    },
    body: JSON.stringify({ items: prodItems, updateExisting: true })
  });
  const prodData = await prodRes.json();
  assert.strictEqual(prodData.success, true);
  assert.strictEqual(prodData.created, 2);
  console.log('PASS: Bulk imported 2 new products (including custom 7.5% GST)');

  // Test updating one existing item
  const updateItems = [
    {
      name: 'Excel Test Basmati Rice 5kg',
      barcode: '9901002003001',
      sale_price: 475,
      purchase_price: 400,
      gst_rate: 5,
      stock: 30
    }
  ];
  const updateRes = await fetch(`${baseUrl}/api/products/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Business-Id': String(bizId)
    },
    body: JSON.stringify({ items: updateItems, updateExisting: true })
  });
  const updateData = await updateRes.json();
  assert.strictEqual(updateData.success, true);
  assert.strictEqual(updateData.updated, 1);
  console.log('PASS: Updated existing product via bulk import with price & stock sync');

  // 2. Test Bulk Parties
  const partyItems = [
    {
      name: 'Excel Test Supermart Udupi',
      type: 'customer',
      contact_name: 'Suresh Bhat',
      phone: '9845112233',
      email: 'suresh@supermart.in',
      gstin: '29AAAAA0000A1Z5',
      city: 'Udupi',
      state: 'Karnataka',
      opening_balance: 15000,
      balance_type: 'DR',
      credit_limit: 50000
    },
    {
      name: 'Excel Test Spices Wholesale Supplier',
      type: 'supplier',
      contact_name: 'Ravi Rao',
      phone: '9845998877',
      city: 'Mangalore',
      opening_balance: 28000,
      balance_type: 'CR',
      credit_limit: 100000
    }
  ];

  const partyRes = await fetch(`${baseUrl}/api/parties/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Business-Id': String(bizId)
    },
    body: JSON.stringify({ parties: partyItems, updateExisting: true })
  });
  const partyData = await partyRes.json();
  assert.strictEqual(partyData.success, true);
  assert.strictEqual(partyData.created, 2);
  console.log('PASS: Bulk imported 2 parties (customer & supplier) with opening balances');

  server.close();
  console.log('ALL BULK IMPORT API TESTS PASSED!');
}

testBulk().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
