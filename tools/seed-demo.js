'use strict';
/**
 * Seeds two demo businesses with realistic Indian GST data so the app is not empty
 * on first run. Safe to re-run: it wipes the demo owner's data and rebuilds it.
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const { db } = require('../server/db');
const { computeTotals, round2 } = require('../server/lib/gst');

const EMAIL = 'demo@billpro.in';
const PASSWORD = 'demo1234';

function reset() {
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
  if (u) db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  const demoUser = db.prepare("SELECT id FROM users WHERE email = 'demo.user@billpro.in'").get();
  if (demoUser) db.prepare('DELETE FROM users WHERE id = ?').run(demoUser.id);
  db.prepare("DELETE FROM users WHERE email IN ('priya@sharmafashion.in', 'ramesh@pateltraders.com', 'cashier@test.in', 'newclient@freshbiz.com')").run();
  db.prepare("DELETE FROM inquiries WHERE email IN ('ramesh@pateltraders.com', 'vikram@sharmaenterprises.in')").run();
}

function insert(table, obj) {
  const keys = Object.keys(obj);
  const info = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => obj[k]));
  return info.lastInsertRowid;
}

function dayOffset(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function seed() {
  reset();
  const userId = insert('users', {
    name: 'Super Admin', email: EMAIL, phone: '9845000000',
    password_hash: bcrypt.hashSync(PASSWORD, 10), role: 'owner',
    permissions: JSON.stringify(['dashboard', 'billing', 'khata', 'inventory', 'reports', 'settings', 'staff']),
    is_superadmin: 1, status: 'active', plan: 'lifetime'
  });

  const demoUserId = insert('users', {
    name: 'Demo Merchant', email: 'demo.user@billpro.in', phone: '9845011223',
    password_hash: bcrypt.hashSync('demo1234', 10), role: 'owner',
    permissions: JSON.stringify(['dashboard', 'billing', 'khata', 'inventory', 'reports', 'settings', 'staff']),
    is_superadmin: 0, status: 'active', plan: 'yearly', expires_at: '2028-12-31'
  });

  const bizA = insert('businesses', {
    owner_id: userId, name: 'Coastal Traders', legal_name: 'Coastal Traders Pvt Ltd',
    gstin: '29AAECC1234F1Z5', pan: 'AAECC1234F', address: '12 MG Road, Hampankatta',
    city: 'Mangaluru', state: 'Karnataka', state_code: '29', pincode: '575001',
    phone: '9845012345', email: 'sales@coastaltraders.in', website: 'coastaltraders.in',
    bank_name: 'Canara Bank', bank_account_no: '012345678901', bank_ifsc: 'CNRB0001234',
    bank_branch: 'Hampankatta', upi_id: 'coastaltraders@okaxis',
    invoice_prefix: 'CT', quoter_prefix: 'CQ', default_gst_rate: 18, credit_days: 30,
    color: '#4f46e5', invoice_theme: 'classic',
    terms: '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. charged on overdue bills.\n3. Subject to Mangaluru jurisdiction.\n4. E. & O. E.'
  });

  const bizB = insert('businesses', {
    owner_id: userId, name: 'Udupi Tiffin Supply', legal_name: 'Udupi Tiffin Supply',
    gstin: '29AAEFU5678K1Z2', pan: 'AAEFU5678K', address: 'Court Road, Brahmagiri',
    city: 'Udupi', state: 'Karnataka', state_code: '29', pincode: '576101',
    phone: '9900011223', email: 'orders@udupitiffin.in',
    bank_name: 'Karnataka Bank', bank_account_no: '998877665544', bank_ifsc: 'PKGB0010987',
    upi_id: 'udupitiffin@ybl', invoice_prefix: 'UT', quoter_prefix: 'UQ',
    default_gst_rate: 5, credit_days: 15, color: '#047857', invoice_theme: 'emerald'
  });

  const bizBharat = insert('businesses', {
    owner_id: demoUserId, name: 'Bharat Retail Mart', legal_name: 'Bharat Retail Mart Pvt Ltd',
    gstin: '29AABCB1234F1Z9', pan: 'AABCB1234F', address: 'Shop #14, Main Market Road, Malleshwaram',
    city: 'Bengaluru', state: 'Karnataka', state_code: '29', pincode: '560003',
    phone: '9880735072', email: 'orders@bharatretail.in',
    bank_name: 'State Bank of India', bank_account_no: '38920194821', bank_ifsc: 'SBIN0001234',
    bank_branch: 'Malleshwaram', upi_id: 'bharatretail@sbi',
    invoice_prefix: 'BRM', quoter_prefix: 'BRQ', default_gst_rate: 5, credit_days: 30,
    color: '#4f46e5'
  });

  db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(bizA, userId);
  db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(bizBharat, demoUserId);

  insert('staff', { business_id: bizA, name: 'Demo Merchant', email: 'demo.user@billpro.in', phone: '9845011223', role: 'admin', permissions: JSON.stringify(['dashboard', 'billing', 'khata', 'inventory', 'reports', 'settings']) });
  insert('staff', { business_id: bizB, name: 'Demo Merchant', email: 'demo.user@billpro.in', phone: '9845011223', role: 'admin', permissions: JSON.stringify(['dashboard', 'billing', 'khata', 'inventory', 'reports', 'settings']) });

  // Seed rich dataset for Bharat Retail Mart
  const { seedBharatRetail } = require('../server/lib/seed-bharat');
  seedBharatRetail(db, bizBharat, demoUserId);

  // Sync system settings
  const { initSystemSettings } = require('../server/lib/settings');
  initSystemSettings(db);

  // ---------- products ----------
  const prodA = [
    { sku: 'CT-1001', name: 'Basmati Rice 25kg', category: 'Grains', unit: 'bag', hsn: '1006', gst_rate: 5, purchase_price: 1850, sale_price: 2150, stock: 96, low_stock_at: 10, barcode: '8901234500011' },
    { sku: 'CT-1002', name: 'Sunflower Oil 15L', category: 'Oils', unit: 'can', hsn: '1512', gst_rate: 5, purchase_price: 1620, sale_price: 1820, stock: 50, low_stock_at: 12, barcode: '8901234500028' },
    { sku: 'CT-1003', name: 'Cashew W320 1kg', category: 'Dry Fruits', unit: 'kg', hsn: '0801', gst_rate: 5, purchase_price: 780, sale_price: 950, stock: 26, low_stock_at: 8, barcode: '8901234500035' },
    { sku: 'CT-1004', name: 'Filter Coffee Powder 500g', category: 'Beverages', unit: 'pkt', hsn: '0901', gst_rate: 18, purchase_price: 210, sale_price: 275, stock: 140, low_stock_at: 20, barcode: '8901234500042' },
    { sku: 'CT-1005', name: 'Coconut Oil 5L', category: 'Oils', unit: 'can', hsn: '1513', gst_rate: 5, purchase_price: 690, sale_price: 810, stock: 34, low_stock_at: 10, barcode: '8901234500059' },
    { sku: 'CT-SRV-01', name: 'Delivery & Handling', category: 'Services', unit: 'lot', hsn: '9965', gst_rate: 18, purchase_price: 0, sale_price: 250, stock: 0, low_stock_at: -1 }
  ].map((p) => insert('products', { business_id: bizA, opening_stock: p.stock, ...p }));

  const prodB = [
    { sku: 'UT-01', name: 'Idli Batter 5kg', category: 'Batter', unit: 'can', hsn: '1106', gst_rate: 5, purchase_price: 320, sale_price: 400, stock: 55, low_stock_at: 15 },
    { sku: 'UT-02', name: 'Dosa Batter 5kg', category: 'Batter', unit: 'can', hsn: '1106', gst_rate: 5, purchase_price: 310, sale_price: 390, stock: 61, low_stock_at: 15 },
    { sku: 'UT-03', name: 'Sambar Powder 1kg', category: 'Masala', unit: 'kg', hsn: '0910', gst_rate: 5, purchase_price: 180, sale_price: 240, stock: 12, low_stock_at: 15 },
    { sku: 'UT-04', name: 'Neer Dosa Kit', category: 'Kit', unit: 'kit', hsn: '1905', gst_rate: 5, purchase_price: 145, sale_price: 195, stock: 30, low_stock_at: 10 }
  ].map((p) => insert('products', { business_id: bizB, opening_stock: p.stock, ...p }));

  // ---------- parties ----------
  const custA = [
    { name: 'Hotel Ocean Pearl', contact_name: 'Rakesh Shetty', phone: '9845111222', gstin: '29AABCH1234K1ZP', address: 'Balmatta', city: 'Mangaluru', state: 'Karnataka', state_code: '29', pincode: '575003', opening_balance: 12500, balance_type: 'DR', credit_limit: 100000, credit_days: 30, tag: 'HORECA' },
    { name: 'Spice Junction Retail', contact_name: 'Anitha Rao', phone: '9845222333', gstin: '29AACCS5678M1ZQ', address: 'Kadri', city: 'Mangaluru', state: 'Karnataka', state_code: '29', pincode: '575002', opening_balance: 0, balance_type: 'DR', credit_limit: 50000, credit_days: 15, tag: 'Retail' },
    { name: 'Bengaluru Mart LLP', contact_name: 'Imran Khan', phone: '9845333444', gstin: '29AAFFB9012N1ZR', address: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', state_code: '29', pincode: '560038', opening_balance: 3400, balance_type: 'DR', credit_limit: 75000, tag: 'Wholesale' },
    { name: 'Kerala Coconut Exports', contact_name: 'Thomas Mathew', phone: '9845444555', gstin: '32AAECK3456P1ZT', address: 'MG Road', city: 'Kochi', state: 'Kerala', state_code: '32', pincode: '682016', opening_balance: 0, balance_type: 'DR', credit_limit: 200000, tag: 'Inter-state' },
    { name: 'Walk-in Customer', phone: '', credit_limit: 0, credit_days: 0 }
  ].map((p) => insert('parties', { business_id: bizA, type: 'customer', ...p }));

  const suppA = [
    { name: 'Raichur Grain Mills', contact_name: 'Basavaraj', phone: '9845555666', gstin: '29AACCR1111K1ZV', address: 'Raichur', city: 'Raichur', state: 'Karnataka', state_code: '29', pincode: '584101', credit_limit: 300000 },
    { name: 'Malnad Oil Extractors', contact_name: 'Prakash', phone: '9845666777', gstin: '29AABCM2222L1ZW', address: 'Shivamogga', city: 'Shivamogga', state: 'Karnataka', state_code: '29', pincode: '577201', credit_limit: 150000 }
  ].map((p) => insert('parties', { business_id: bizA, type: 'supplier', ...p }));

  const custB = [
    { name: 'Sri Krishna Vilas Hotel', contact_name: 'Ganesh K', phone: '9900111222', gstin: '29AAHCS3333M1ZX', address: 'Car Street', city: 'Udupi', state: 'Karnataka', state_code: '29', pincode: '576101', opening_balance: 5600, balance_type: 'DR', credit_limit: 40000 },
    { name: 'Manipal Cafeteria', contact_name: 'Divya', phone: '9900222333', gstin: '29AACCM4444N1ZY', address: 'Tigal Circle', city: 'Manipal', state: 'Karnataka', state_code: '29', pincode: '576104', opening_balance: 0, credit_limit: 25000 }
  ].map((p) => insert('parties', { business_id: bizB, type: 'customer', ...p }));

  // ---------- documents ----------
  function createDoc(businessId, type, { partyId, partyName, partyGstin, partyStateCode, daysAgo, items, paid = 0, mode = 'upi', dueDays = 30, prefix, counter, vehicleNo, transportDocNo }) {
    const date = dayOffset(daysAgo);
    const supplyType = partyStateCode && partyStateCode !== '29' ? 'inter' : 'intra';
    const t = computeTotals(items, { supplyType, roundOff: true });
    const dueDate = dueDays ? new Date(Date.now() - daysAgo * 86400000 + dueDays * 86400000).toISOString().slice(0, 10) : null;
    const paidAmt = Math.min(paid, t.total);
    const number = `${prefix}-${counter}`;
    const id = insert('documents', {
      business_id: businessId, type, number,
      party_id: partyId || null, party_name: partyName || 'Walk-in Customer',
      party_gstin: partyGstin || null, party_state_code: partyStateCode || '29',
      date, due_date: dueDate, place_of_supply: partyStateCode || '29', supply_type: supplyType,
      currency: 'INR', items: JSON.stringify(t.lines), subtotal: t.subtotal,
      discount_type: 'flat', discount_value: 0, discount_amount: t.discountAmount,
      taxable_value: t.taxableValue, cgst: t.cgst, sgst: t.sgst, igst: t.igst, cess: t.cess,
      round_off: t.roundOff, total: t.total, amount_in_words: t.amountInWords,
      paid_amount: paidAmt, due_amount: round2(t.total - paidAmt),
      payment_status: paidAmt <= 0 ? 'unpaid' : paidAmt >= t.total - 0.005 ? 'paid' : 'partial',
      payment_mode: paidAmt > 0 ? mode : null, status: 'active',
      vehicle_no: vehicleNo || null, transport_doc_no: transportDocNo || null, created_by: userId
    });
    if (type === 'sale' || type === 'purchase') {
      const dir = type === 'sale' ? -1 : 1;
      t.lines.forEach((l) => {
        if (!l.product_id) return;
        insert('stock_moves', { business_id: businessId, product_id: l.product_id, qty: l.qty * dir, date, reason: type, document_id: id, rate: l.rate, notes: number });
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(l.qty * dir, l.product_id);
      });
    }
    if (paidAmt > 0 && partyId) {
      insert('transactions', {
        business_id: businessId, party_id: partyId, type: type === 'sale' ? 'you_got' : 'you_gave',
        amount: paidAmt, date, mode, document_id: id, reference: null, notes: `Payment against ${number}`
      });
    }
    return id;
  }

  const P = (idx) => ({ product_id: prodA[idx] });
  createDoc(bizA, 'sale', { partyId: custA[0], partyName: 'Hotel Ocean Pearl', partyGstin: '29AABCH1234K1ZP', partyStateCode: '29', daysAgo: 42, prefix: 'CT', counter: 1001, dueDays: 30, paid: 25000, items: [{ ...P(0), name: 'Basmati Rice 25kg', hsn: '1006', unit: 'bag', qty: 20, rate: 2150, gstRate: 5 }, { ...P(2), name: 'Cashew W320 1kg', hsn: '0801', unit: 'kg', qty: 10, rate: 950, gstRate: 5 }] });
  createDoc(bizA, 'sale', { partyId: custA[1], partyName: 'Spice Junction Retail', partyGstin: '29AACCS5678M1ZQ', partyStateCode: '29', daysAgo: 35, prefix: 'CT', counter: 1002, dueDays: 15, paid: 0, items: [{ ...P(3), name: 'Filter Coffee Powder 500g', hsn: '0901', unit: 'pkt', qty: 40, rate: 275, gstRate: 18 }, { ...P(4), name: 'Coconut Oil 5L', hsn: '1513', unit: 'can', qty: 12, rate: 810, gstRate: 5 }] });
  createDoc(bizA, 'sale', { partyId: custA[3], partyName: 'Kerala Coconut Exports', partyGstin: '32AAECK3456P1ZT', partyStateCode: '32', daysAgo: 28, prefix: 'CT', counter: 1003, dueDays: 30, paid: 15000, vehicleNo: 'KA19AB4412', transportDocNo: 'LR-99231', items: [{ ...P(1), name: 'Sunflower Oil 15L', hsn: '1512', unit: 'can', qty: 25, rate: 1820, gstRate: 5 }, { ...P(4), name: 'Coconut Oil 5L', hsn: '1513', unit: 'can', qty: 20, rate: 810, gstRate: 5 }] });
  createDoc(bizA, 'sale', { partyId: custA[2], partyName: 'Bengaluru Mart LLP', partyGstin: '29AAFFB9012N1ZR', partyStateCode: '29', daysAgo: 18, prefix: 'CT', counter: 1004, dueDays: 30, paid: 0, items: [{ ...P(0), name: 'Basmati Rice 25kg', hsn: '1006', unit: 'bag', qty: 12, rate: 2150, gstRate: 5 }, { ...P(3), name: 'Filter Coffee Powder 500g', hsn: '0901', unit: 'pkt', qty: 24, rate: 275, gstRate: 18, discountPct: 5 }] });
  createDoc(bizA, 'sale', { partyId: custA[4], partyName: 'Walk-in Customer', partyStateCode: '29', daysAgo: 6, prefix: 'CT', counter: 1005, dueDays: 0, paid: 999999, items: [{ ...P(3), name: 'Filter Coffee Powder 500g', hsn: '0901', unit: 'pkt', qty: 2, rate: 275, gstRate: 18 }, { ...P(5), name: 'Delivery & Handling', hsn: '9965', unit: 'lot', qty: 1, rate: 250, gstRate: 18 }] });
  createDoc(bizA, 'sale', { partyId: custA[0], partyName: 'Hotel Ocean Pearl', partyGstin: '29AABCH1234K1ZP', partyStateCode: '29', daysAgo: 3, prefix: 'CT', counter: 1006, dueDays: 30, paid: 0, items: [{ ...P(2), name: 'Cashew W320 1kg', hsn: '0801', unit: 'kg', qty: 8, rate: 950, gstRate: 5 }, { ...P(0), name: 'Basmati Rice 25kg', hsn: '1006', unit: 'bag', qty: 6, rate: 2150, gstRate: 5 }] });
  createDoc(bizA, 'purchase', { partyId: suppA[0], partyName: 'Raichur Grain Mills', partyGstin: '29AACCR1111K1ZV', partyStateCode: '29', daysAgo: 22, prefix: 'PO', counter: 501, dueDays: 30, paid: 0, items: [{ ...P(0), name: 'Basmati Rice 25kg', hsn: '1006', unit: 'bag', qty: 50, rate: 1850, gstRate: 5 }] });
  createDoc(bizA, 'expense', { partyId: null, partyName: 'Diesel & Logistics', partyStateCode: '29', daysAgo: 12, prefix: 'EX', counter: 91, dueDays: 0, paid: 4300, items: [{ name: 'Vehicle diesel', hsn: '2710', unit: 'ltr', qty: 120, rate: 98.5, gstRate: 0 }] });

  insert('transactions', { business_id: bizA, party_id: custA[0], type: 'you_gave', amount: 3200, date: dayOffset(9), mode: 'cash', notes: 'Cash advance for next order' });
  insert('transactions', { business_id: bizA, party_id: custA[1], type: 'you_got', amount: 5000, date: dayOffset(4), mode: 'upi', reference: 'UTR889012', notes: 'Part payment' });
  insert('transactions', { business_id: bizA, party_id: custA[2], type: 'you_got', amount: 20000, date: dayOffset(2), mode: 'bank', reference: 'NEFT-77120', notes: 'Bank transfer' });

  const Q = (idx) => ({ product_id: prodB[idx] });
  createDoc(bizB, 'sale', { partyId: custB[0], partyName: 'Sri Krishna Vilas Hotel', partyGstin: '29AAHCS3333M1ZX', partyStateCode: '29', daysAgo: 20, prefix: 'UT', counter: 101, dueDays: 15, paid: 8000, items: [{ ...Q(0), name: 'Idli Batter 5kg', hsn: '1106', unit: 'can', qty: 30, rate: 400, gstRate: 5 }, { ...Q(1), name: 'Dosa Batter 5kg', hsn: '1106', unit: 'can', qty: 25, rate: 390, gstRate: 5 }] });
  createDoc(bizB, 'sale', { partyId: custB[1], partyName: 'Manipal Cafeteria', partyGstin: '29AACCM4444N1ZY', partyStateCode: '29', daysAgo: 9, prefix: 'UT', counter: 102, dueDays: 15, paid: 0, items: [{ ...Q(2), name: 'Sambar Powder 1kg', hsn: '0910', unit: 'kg', qty: 12, rate: 240, gstRate: 5 }, { ...Q(3), name: 'Neer Dosa Kit', hsn: '1905', unit: 'kit', qty: 10, rate: 195, gstRate: 5 }] });
  createDoc(bizB, 'sale', { partyId: custB[0], partyName: 'Sri Krishna Vilas Hotel', partyGstin: '29AAHCS3333M1ZX', partyStateCode: '29', daysAgo: 2, prefix: 'UT', counter: 103, dueDays: 15, paid: 0, items: [{ ...Q(0), name: 'Idli Batter 5kg', hsn: '1106', unit: 'can', qty: 18, rate: 400, gstRate: 5 }] });

  db.prepare('UPDATE businesses SET invoice_counter = 1006, quoter_counter = 100 WHERE id = ?').run(bizA);
  db.prepare('UPDATE businesses SET invoice_counter = 103, quoter_counter = 100 WHERE id = ?').run(bizB);

  insert('staff', { business_id: bizA, name: 'Priya Accountant', email: 'priya@ca-firm.in', phone: '9845099887', role: 'accountant', permissions: JSON.stringify(['dashboard', 'billing', 'khata', 'inventory', 'reports']), invited: 1 });
  insert('staff', { business_id: bizA, name: 'Suresh Counter Staff', email: 'suresh@coastaltraders.in', phone: '9845088776', role: 'staff', permissions: JSON.stringify(['dashboard', 'billing', 'khata']), invited: 1 });

  const counts = {
    businesses: db.prepare('SELECT COUNT(*) n FROM businesses').get().n,
    parties: db.prepare('SELECT COUNT(*) n FROM parties').get().n,
    products: db.prepare('SELECT COUNT(*) n FROM products').get().n,
    documents: db.prepare('SELECT COUNT(*) n FROM documents').get().n,
    transactions: db.prepare('SELECT COUNT(*) n FROM transactions').get().n,
    stockMoves: db.prepare('SELECT COUNT(*) n FROM stock_moves').get().n
  };
  console.log('Seeded:', counts);
  console.log(`Sign in with ${EMAIL} / ${PASSWORD}`);
}

if (require.main === module) seed();
module.exports = { seed, EMAIL, PASSWORD };
