'use strict';
/**
 * Seeds rich, realistic test data for Bharat Retail Mart (demo.user@billpro.in)
 * so prospective users and trial clients immediately see populated dashboards,
 * active khata ledgers, low stock alerts, GST reports, and counter POS billing.
 */
const { computeTotals, round2 } = require('./gst');

function dayOffset(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function seedBharatRetail(db, bizId, userId) {
  // Update business profile details
  db.prepare(`
    UPDATE businesses SET
      legal_name = 'Bharat Retail Mart Pvt Ltd',
      gstin = '29AABCB1234F1Z9',
      pan = 'AABCB1234F',
      address = 'Shop #14, Main Market Road, Malleshwaram',
      city = 'Bengaluru',
      state = 'Karnataka',
      state_code = '29',
      pincode = '560003',
      phone = '9880735072',
      email = 'orders@bharatretail.in',
      bank_name = 'State Bank of India',
      bank_account_no = '38920194821',
      bank_ifsc = 'SBIN0001234',
      bank_branch = 'Malleshwaram',
      upi_id = 'bharatretail@sbi',
      invoice_prefix = 'BRM',
      quoter_prefix = 'BRQ',
      default_gst_rate = 5,
      credit_days = 30,
      color = '#4f46e5',
      terms = '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. charged on overdue bills.\n3. Subject to Bengaluru jurisdiction.'
    WHERE id = ?
  `).run(bizId);

  // Clear existing items if any
  db.prepare('DELETE FROM documents WHERE business_id = ?').run(bizId);
  db.prepare('DELETE FROM stock_moves WHERE business_id = ?').run(bizId);
  db.prepare('DELETE FROM parties WHERE business_id = ?').run(bizId);
  db.prepare('DELETE FROM products WHERE business_id = ?').run(bizId);
  db.prepare('DELETE FROM transactions WHERE business_id = ?').run(bizId);

  const insert = (table, obj) => {
    const keys = Object.keys(obj);
    const info = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => obj[k]));
    return info.lastInsertRowid;
  };

  // Products
  const prods = [
    { sku: 'BRM-101', name: 'Sharbati Wheat Flour 10kg', category: 'Grains & Flours', unit: 'bag', hsn: '1101', gst_rate: 5, purchase_price: 380, sale_price: 460, stock: 45, low_stock_at: 10, barcode: '890103000101' },
    { sku: 'BRM-102', name: 'Sona Masoori Rice 25kg', category: 'Grains & Flours', unit: 'bag', hsn: '1006', gst_rate: 5, purchase_price: 1200, sale_price: 1450, stock: 32, low_stock_at: 8, barcode: '890103000102' },
    { sku: 'BRM-103', name: 'Toor Dal Premium 1kg', category: 'Grains & Flours', unit: 'kg', hsn: '0713', gst_rate: 5, purchase_price: 130, sale_price: 165, stock: 85, low_stock_at: 15, barcode: '890103000103' },
    { sku: 'BRM-104', name: 'Sunpure Sunflower Oil 1L', category: 'Edible Oils & Ghee', unit: 'pouch', hsn: '1512', gst_rate: 5, purchase_price: 115, sale_price: 140, stock: 120, low_stock_at: 20, barcode: '890103000104' },
    { sku: 'BRM-105', name: 'Amul Pure Ghee 1L', category: 'Edible Oils & Ghee', unit: 'tin', hsn: '0405', gst_rate: 12, purchase_price: 520, sale_price: 630, stock: 28, low_stock_at: 6, barcode: '890103000105' },
    { sku: 'BRM-106', name: 'Nandini Toned Milk 500ml', category: 'Dairy & Beverages', unit: 'pkt', hsn: '0401', gst_rate: 5, purchase_price: 22, sale_price: 26, stock: 60, low_stock_at: 15, barcode: '890103000106' },
    { sku: 'BRM-107', name: 'Tata Tea Gold 500g', category: 'Dairy & Beverages', unit: 'pkt', hsn: '0902', gst_rate: 5, purchase_price: 280, sale_price: 340, stock: 40, low_stock_at: 10, barcode: '890103000107' },
    { sku: 'BRM-108', name: 'Bru Instant Coffee 200g', category: 'Dairy & Beverages', unit: 'jar', hsn: '2101', gst_rate: 18, purchase_price: 290, sale_price: 360, stock: 18, low_stock_at: 5, barcode: '890103000108' },
    { sku: 'BRM-109', name: 'Cadbury Dairy Milk Silk 60g', category: 'Packaged Foods & Snacks', unit: 'bar', hsn: '1806', gst_rate: 18, purchase_price: 65, sale_price: 85, stock: 50, low_stock_at: 12, barcode: '890103000109' },
    { sku: 'BRM-110', name: 'Parle-G Gold Biscuits 1kg Box', category: 'Packaged Foods & Snacks', unit: 'box', hsn: '1905', gst_rate: 18, purchase_price: 110, sale_price: 140, stock: 4, low_stock_at: 10, barcode: '890103000110' }, // LOW STOCK
    { sku: 'BRM-111', name: 'Dettol Original Soap 125g (Pack of 4)', category: 'Household & Personal Care', unit: 'pack', hsn: '3401', gst_rate: 18, purchase_price: 145, sale_price: 190, stock: 2, low_stock_at: 8, barcode: '890103000111' }, // LOW STOCK
    { sku: 'BRM-112', name: 'Surf Excel Easy Wash 1kg', category: 'Household & Personal Care', unit: 'pkt', hsn: '3402', gst_rate: 18, purchase_price: 115, sale_price: 145, stock: 0, low_stock_at: 10, barcode: '890103000112' } // OUT OF STOCK
  ].map((p) => insert('products', { business_id: bizId, opening_stock: p.stock, ...p }));

  // Customers
  const custRamesh = insert('parties', {
    business_id: bizId, type: 'customer', name: 'Ramesh Provision Store', contact_name: 'Ramesh Kumar',
    phone: '9845012399', gstin: '29AAAFR1122D1Z4', address: '18 4th Cross, Malleshwaram', city: 'Bengaluru',
    state: 'Karnataka', state_code: '29', pincode: '560003', opening_balance: 6000, balance_type: 'DR',
    credit_limit: 50000, credit_days: 30, tag: 'Retail'
  });

  const custLakshmi = insert('parties', {
    business_id: bizId, type: 'customer', name: 'Lakshmi Cafe & Tiffin', contact_name: 'Venkatesh',
    phone: '9845088771', address: '55 1st Block, Rajajinagar', city: 'Bengaluru',
    state: 'Karnataka', state_code: '29', pincode: '560010', opening_balance: 0, balance_type: 'DR',
    credit_limit: 30000, credit_days: 15, tag: 'HORECA'
  });

  const custAnand = insert('parties', {
    business_id: bizId, type: 'customer', name: 'Anand Sweet & Bakery', contact_name: 'Anand Lal',
    phone: '9822033441', gstin: '29AABCA9988E1Z1', address: 'Market Yard, Yeshwanthpur', city: 'Bengaluru',
    state: 'Karnataka', state_code: '29', pincode: '560022', opening_balance: 0, balance_type: 'DR',
    credit_limit: 40000, credit_days: 30, tag: 'Bakery'
  });

  const custGreenLeaf = insert('parties', {
    business_id: bizId, type: 'customer', name: 'Green Leaf Restaurant', contact_name: 'Suresh Rao',
    phone: '9900118822', address: 'Koramangala 5th Block', city: 'Bengaluru',
    state: 'Karnataka', state_code: '29', pincode: '560034', opening_balance: -2500, balance_type: 'CR',
    credit_limit: 50000, credit_days: 30, tag: 'Restaurant'
  });

  const custWalkIn = insert('parties', {
    business_id: bizId, type: 'customer', name: 'Walk-in Customer', phone: '', credit_limit: 0, credit_days: 0
  });

  // Suppliers
  const suppMetro = insert('parties', {
    business_id: bizId, type: 'supplier', name: 'Metro Wholesalers Karnataka', contact_name: 'Mahesh Nair',
    phone: '9880011223', gstin: '29AAACM5544K1Z3', address: 'Plot 45, Peenya Industrial Area', city: 'Bengaluru',
    state: 'Karnataka', state_code: '29', pincode: '560058', credit_limit: 300000, opening_balance: 0
  });

  const suppHindustan = insert('parties', {
    business_id: bizId, type: 'supplier', name: 'Hindustan Agro Trading Co', contact_name: 'Sunil Gupta',
    phone: '9844099881', gstin: '29AAACH8877M1Z8', address: 'APMC Yard, Yeshwanthpur', city: 'Bengaluru',
    state: 'Karnataka', state_code: '29', pincode: '560022', credit_limit: 200000, opening_balance: 0
  });

  // Helper to create documents
  function createDoc(type, { partyId, partyName, partyGstin, partyStateCode, daysAgo, items, paid = 0, mode = 'upi', dueDays = 30, number, ewaybillNo, irn }) {
    const date = dayOffset(daysAgo);
    const supplyType = partyStateCode && partyStateCode !== '29' ? 'inter' : 'intra';
    const t = computeTotals(items, { supplyType, roundOff: true });
    const dueDate = dueDays ? new Date(Date.now() - daysAgo * 86400000 + dueDays * 86400000).toISOString().slice(0, 10) : null;
    const paidAmt = Math.min(paid, t.total);
    const id = insert('documents', {
      business_id: bizId, type, number,
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
      ewaybill_no: ewaybillNo || null, irn: irn || null, created_by: userId
    });

    if (type === 'sale' || type === 'purchase') {
      const dir = type === 'sale' ? -1 : 1;
      t.lines.forEach((l) => {
        if (!l.product_id) return;
        insert('stock_moves', { business_id: bizId, product_id: l.product_id, qty: l.qty * dir, date, reason: type, document_id: id, rate: l.rate, notes: number });
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(l.qty * dir, l.product_id);
      });
    }

    return id;
  }

  // 1. Sale Invoices
  createDoc('sale', {
    number: 'BRM-1001', partyId: custRamesh, partyName: 'Ramesh Provision Store', partyGstin: '29AAAFR1122D1Z4',
    daysAgo: 5, dueDays: 15, paid: 0,
    items: [
      { product_id: prods[0], name: 'Sharbati Wheat Flour 10kg', hsn: '1101', unit: 'bag', qty: 10, rate: 460, gstRate: 5, discountPct: 0 },
      { product_id: prods[3], name: 'Sunpure Sunflower Oil 1L', hsn: '1512', unit: 'pouch', qty: 50, rate: 140, gstRate: 5, discountPct: 0 }
    ]
  });

  createDoc('sale', {
    number: 'BRM-1002', partyId: custLakshmi, partyName: 'Lakshmi Cafe & Tiffin',
    daysAgo: 3, dueDays: 7, paid: 0,
    items: [
      { product_id: prods[1], name: 'Sona Masoori Rice 25kg', hsn: '1006', unit: 'bag', qty: 5, rate: 1450, gstRate: 5, discountPct: 0 },
      { product_id: prods[4], name: 'Amul Pure Ghee 1L', hsn: '0405', unit: 'tin', qty: 3, rate: 630, gstRate: 12, discountPct: 0 }
    ]
  });

  createDoc('sale', {
    number: 'BRM-1003', partyId: custWalkIn, partyName: 'Walk-in Customer',
    daysAgo: 2, dueDays: 0, paid: 2480, mode: 'upi',
    items: [
      { product_id: prods[5], name: 'Nandini Toned Milk 500ml', hsn: '0401', unit: 'pkt', qty: 10, rate: 26, gstRate: 5, discountPct: 0 },
      { product_id: prods[6], name: 'Tata Tea Gold 500g', hsn: '0902', unit: 'pkt', qty: 4, rate: 340, gstRate: 5, discountPct: 0 },
      { product_id: prods[8], name: 'Cadbury Dairy Milk Silk 60g', hsn: '1806', unit: 'bar', qty: 10, rate: 85, gstRate: 18, discountPct: 0 }
    ]
  });

  createDoc('sale', {
    number: 'BRM-1004', partyId: custAnand, partyName: 'Anand Sweet & Bakery', partyGstin: '29AABCA9988E1Z1',
    daysAgo: 1, dueDays: 30, paid: 0, ewaybillNo: '662607200889', irn: 'a9b8c7d6e5f41234567890abcdef1234567890abcdef1234567890abcdef1234',
    items: [
      { product_id: prods[4], name: 'Amul Pure Ghee 1L', hsn: '0405', unit: 'tin', qty: 15, rate: 630, gstRate: 12, discountPct: 0 },
      { product_id: prods[2], name: 'Toor Dal Premium 1kg', hsn: '0713', unit: 'kg', qty: 25, rate: 165, gstRate: 5, discountPct: 0 }
    ]
  });

  createDoc('sale', {
    number: 'BRM-1005', partyId: custWalkIn, partyName: 'Walk-in Customer',
    daysAgo: 0, dueDays: 0, paid: 1850, mode: 'cash',
    items: [
      { product_id: prods[7], name: 'Bru Instant Coffee 200g', hsn: '2101', unit: 'jar', qty: 3, rate: 360, gstRate: 18, discountPct: 0 },
      { product_id: prods[9], name: 'Parle-G Gold Biscuits 1kg Box', hsn: '1905', unit: 'box', qty: 5, rate: 140, gstRate: 18, discountPct: 0 }
    ]
  });

  // 2. Purchase Bills
  createDoc('purchase', {
    number: 'PO-201', partyId: suppMetro, partyName: 'Metro Wholesalers Karnataka', partyGstin: '29AAACM5544K1Z3',
    daysAgo: 8, dueDays: 30, paid: 0,
    items: [
      { product_id: prods[3], name: 'Sunpure Sunflower Oil 1L', hsn: '1512', unit: 'pouch', qty: 150, rate: 115, gstRate: 5, discountPct: 0 },
      { product_id: prods[4], name: 'Amul Pure Ghee 1L', hsn: '0405', unit: 'tin', qty: 40, rate: 520, gstRate: 12, discountPct: 0 }
    ]
  });

  createDoc('purchase', {
    number: 'PO-202', partyId: suppHindustan, partyName: 'Hindustan Agro Trading Co', partyGstin: '29AAACH8877M1Z8',
    daysAgo: 4, dueDays: 20, paid: 0,
    items: [
      { product_id: prods[0], name: 'Sharbati Wheat Flour 10kg', hsn: '1101', unit: 'bag', qty: 40, rate: 380, gstRate: 5, discountPct: 0 },
      { product_id: prods[1], name: 'Sona Masoori Rice 25kg', hsn: '1006', unit: 'bag', qty: 10, rate: 1200, gstRate: 5, discountPct: 0 }
    ]
  });

  // 3. Expense
  insert('documents', {
    business_id: bizId, type: 'expense', number: 'EX-101',
    party_id: null, party_name: 'Malleshwaram Commercial Properties',
    date: dayOffset(3), due_date: null, place_of_supply: '29', supply_type: 'intra',
    currency: 'INR', items: JSON.stringify([{ name: 'Shop Monthly Rent & Maintenance', qty: 1, rate: 15000, gstRate: 0 }]),
    subtotal: 15000, discount_amount: 0, taxable_value: 15000,
    cgst: 0, sgst: 0, igst: 0, cess: 0, round_off: 0, total: 15000,
    amount_in_words: 'Fifteen Thousand Rupees Only', paid_amount: 15000, due_amount: 0,
    payment_status: 'paid', payment_mode: 'bank', status: 'active', created_by: userId
  });

  // 4. Quotation
  insert('documents', {
    business_id: bizId, type: 'quotation', number: 'BRQ-101',
    party_id: custGreenLeaf, party_name: 'Green Leaf Restaurant',
    date: dayOffset(1), due_date: dayOffset(-14), place_of_supply: '29', supply_type: 'intra',
    currency: 'INR', items: JSON.stringify([
      { product_id: prods[1], name: 'Sona Masoori Rice 25kg', qty: 20, rate: 1450, gstRate: 5 },
      { product_id: prods[4], name: 'Amul Pure Ghee 1L', qty: 10, rate: 630, gstRate: 12 }
    ]),
    subtotal: 35300, discount_amount: 0, taxable_value: 35300,
    cgst: 1103, sgst: 1103, igst: 0, cess: 0, round_off: 0, total: 37506,
    amount_in_words: 'Thirty Seven Thousand Five Hundred Six Rupees Only',
    paid_amount: 0, due_amount: 37506, payment_status: 'unpaid', status: 'active', created_by: userId
  });

  // 5. Khata Transactions
  insert('transactions', { business_id: bizId, party_id: custRamesh, type: 'you_got', amount: 5000, date: dayOffset(2), mode: 'upi', reference: 'UPI-882910', notes: 'Part payment' });
  insert('transactions', { business_id: bizId, party_id: custLakshmi, type: 'you_got', amount: 3000, date: dayOffset(1), mode: 'cash', reference: '', notes: 'Cash advance settlement' });
  insert('transactions', { business_id: bizId, party_id: suppMetro, type: 'you_gave', amount: 15000, date: dayOffset(3), mode: 'bank', reference: 'IMPS-449120', notes: 'Supplier advance transfer' });

  // Update invoice counters
  db.prepare('UPDATE businesses SET invoice_counter = 1006, quoter_counter = 102 WHERE id = ?').run(bizId);
}

module.exports = { seedBharatRetail };
