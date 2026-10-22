'use strict';
const express = require('express');
const { db } = require('../db');
const { auth, loadBusiness } = require('../middleware');
const { round2 } = require('../lib/gst');
const { logActivity } = require('../lib/service');
const { istToday } = require('../lib/time');

const router = express.Router();
router.use(auth, loadBusiness);

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  const category = req.query.category || '';
  const lowOnly = req.query.low === '1';
  let rows = db.prepare('SELECT * FROM products WHERE business_id = ? AND inactive = 0 ORDER BY name').all(req.business.id);
  if (q) rows = rows.filter((p) => [p.name, p.sku, p.barcode, p.category, p.hsn].some((f) => String(f || '').toLowerCase().includes(q)));
  if (category) rows = rows.filter((p) => p.category === category);
  if (lowOnly) rows = rows.filter((p) => p.low_stock_at > 0 && p.stock <= p.low_stock_at);
  const enriched = rows.map((p) => ({
    ...p,
    stockValue: round2(p.stock * p.purchase_price),
    saleValue: round2(p.stock * p.sale_price),
    margin: p.sale_price ? round2(((p.sale_price - p.purchase_price) / p.sale_price) * 100) : 0,
    low: p.low_stock_at > 0 && p.stock <= p.low_stock_at,
    out: p.stock <= 0
  }));
  const catRows = db.prepare(`
    SELECT DISTINCT category as c FROM products WHERE business_id = ? AND inactive = 0 AND category IS NOT NULL AND TRIM(category) != ''
    UNION
    SELECT name as c FROM product_categories WHERE business_id = ?
    ORDER BY c COLLATE NOCASE
  `).all(req.business.id, req.business.id);
  const categories = catRows.map((r) => r.c);
  const summary = {
    count: enriched.length,
    stockValue: round2(enriched.reduce((s, p) => s + p.stockValue, 0)),
    saleValue: round2(enriched.reduce((s, p) => s + p.saleValue, 0)),
    lowCount: enriched.filter((p) => p.low).length,
    outCount: enriched.filter((p) => p.out).length
  };
  res.json({ products: enriched, categories, summary });
});

/** Manage product categories (list, create, rename, delete) */
router.get('/categories', (req, res) => {
  const explicit = db.prepare('SELECT id, name FROM product_categories WHERE business_id = ? ORDER BY name COLLATE NOCASE').all(req.business.id);
  const fromProducts = db.prepare(`
    SELECT category as name, count(*) as count
    FROM products
    WHERE business_id = ? AND inactive = 0 AND category IS NOT NULL AND TRIM(category) != ''
    GROUP BY category
  `).all(req.business.id);

  const map = new Map();
  fromProducts.forEach((r) => {
    const nm = r.name.trim();
    map.set(nm.toLowerCase(), { id: null, name: nm, productCount: r.count });
  });

  explicit.forEach((r) => {
    const nm = r.name.trim();
    const key = nm.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.id = r.id;
    } else {
      map.set(key, { id: r.id, name: nm, productCount: 0 });
    }
  });

  const sorted = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ categories: sorted });
});

router.post('/categories', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const existing = db.prepare('SELECT * FROM product_categories WHERE business_id = ? AND LOWER(name) = LOWER(?)').get(req.business.id, name);
  if (existing) {
    return res.json({ category: existing });
  }
  const info = db.prepare('INSERT INTO product_categories (business_id, name) VALUES (?, ?)').run(req.business.id, name);
  const created = db.prepare('SELECT * FROM product_categories WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ category: created });
});

router.put('/categories/rename', (req, res) => {
  const from = String(req.body?.from || '').trim();
  const to = String(req.body?.to || '').trim();
  if (!from || !to) return res.status(400).json({ error: 'Both current and new category names are required' });
  const tx = db.transaction(() => {
    db.prepare('UPDATE products SET category = ? WHERE business_id = ? AND category = ?').run(to, req.business.id, from);
    const catRow = db.prepare('SELECT * FROM product_categories WHERE business_id = ? AND LOWER(name) = LOWER(?)').get(req.business.id, from);
    if (catRow) {
      db.prepare('UPDATE product_categories SET name = ? WHERE id = ?').run(to, catRow.id);
    } else {
      db.prepare('INSERT OR IGNORE INTO product_categories (business_id, name) VALUES (?, ?)').run(req.business.id, to);
    }
  });
  tx();
  res.json({ ok: true, name: to });
});

router.delete('/categories/:name', (req, res) => {
  const name = String(req.params.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const tx = db.transaction(() => {
    db.prepare('UPDATE products SET category = NULL WHERE business_id = ? AND category = ?').run(req.business.id, name);
    db.prepare('DELETE FROM product_categories WHERE business_id = ? AND LOWER(name) = LOWER(?)').run(req.business.id, name);
  });
  tx();
  res.json({ ok: true });
});

/** Barcode lookup used by the POS scanner field. */
router.get('/by-barcode/:code', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE business_id = ? AND (barcode = ? OR sku = ?)').get(req.business.id, req.params.code, req.params.code);
  if (!p) return res.status(404).json({ error: 'No product with that barcode or SKU' });
  res.json({ product: p });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Product name is required' });
  const info = db.prepare(`INSERT INTO products (business_id, sku, barcode, name, category, unit, hsn, gst_rate,
    purchase_price, sale_price, stock, opening_stock, low_stock_at, tax_inclusive)
    VALUES (@business_id,@sku,@barcode,@name,@category,@unit,@hsn,@gst_rate,@purchase_price,@sale_price,@stock,@opening_stock,@low_stock_at,@tax_inclusive)`)
    .run({
      business_id: req.business.id,
      sku: b.sku || null,
      barcode: b.barcode || null,
      name: b.name.trim(),
      category: b.category || null,
      unit: b.unit || 'pcs',
      hsn: b.hsn || null,
      gst_rate: b.gst_rate !== undefined ? Number(b.gst_rate) : req.business.default_gst_rate,
      purchase_price: Number(b.purchase_price) || 0,
      sale_price: Number(b.sale_price) || 0,
      stock: Number(b.stock) || 0,
      opening_stock: Number(b.opening_stock ?? b.stock) || 0,
      low_stock_at: Number(b.low_stock_at) || 0,
      tax_inclusive: b.tax_inclusive ? 1 : 0
    });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  if (Number(b.stock)) {
    db.prepare('INSERT INTO stock_moves (business_id, product_id, qty, date, reason, rate, notes) VALUES (?,?,?,?,?,?,?)')
      .run(req.business.id, product.id, Number(b.stock), istToday(), 'opening', product.purchase_price, 'Opening stock');
  }
  if (b.category && typeof b.category === 'string' && b.category.trim()) {
    try {
      db.prepare('INSERT OR IGNORE INTO product_categories (business_id, name) VALUES (?, ?)').run(req.business.id, b.category.trim());
    } catch (_) {}
  }
  logActivity(req.business.id, req.user.id, 'product.created', b.name);
  res.status(201).json({ product });
});

router.put('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const b = req.body || {};
  if (b.category && typeof b.category === 'string' && b.category.trim()) {
    try {
      db.prepare('INSERT OR IGNORE INTO product_categories (business_id, name) VALUES (?, ?)').run(req.business.id, b.category.trim());
    } catch (_) {}
  }
  db.prepare(`UPDATE products SET sku=@sku, barcode=@barcode, name=@name, category=@category, unit=@unit, hsn=@hsn,
    gst_rate=@gst_rate, purchase_price=@purchase_price, sale_price=@sale_price, low_stock_at=@low_stock_at,
    tax_inclusive=@tax_inclusive, inactive=@inactive WHERE id=@id`)
    .run({
      id: p.id,
      sku: b.sku ?? p.sku,
      barcode: b.barcode ?? p.barcode,
      name: b.name ?? p.name,
      category: b.category ?? p.category,
      unit: b.unit ?? p.unit,
      hsn: b.hsn ?? p.hsn,
      gst_rate: b.gst_rate !== undefined ? Number(b.gst_rate) : p.gst_rate,
      purchase_price: b.purchase_price !== undefined ? Number(b.purchase_price) : p.purchase_price,
      sale_price: b.sale_price !== undefined ? Number(b.sale_price) : p.sale_price,
      low_stock_at: b.low_stock_at !== undefined ? Number(b.low_stock_at) : p.low_stock_at,
      tax_inclusive: b.tax_inclusive !== undefined ? (b.tax_inclusive ? 1 : 0) : p.tax_inclusive,
      inactive: b.inactive !== undefined ? (b.inactive ? 1 : 0) : p.inactive
    });
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(p.id) });
});

router.delete('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  db.prepare('UPDATE products SET inactive = 1 WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

/** Manual stock adjustment (damage, count correction, opening entry). */
router.post('/:id/stock', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const delta = Number(req.body?.qty);
  if (!delta) return res.status(400).json({ error: 'Quantity must be a non-zero number (use a negative number to remove stock)' });
  const date = req.body?.date || istToday();
  db.prepare('INSERT INTO stock_moves (business_id, product_id, qty, date, reason, rate, notes) VALUES (?,?,?,?,?,?,?)')
    .run(req.business.id, p.id, delta, date, 'adjustment', Number(req.body?.rate) || p.purchase_price, req.body?.notes || 'Stock adjustment');
  db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(delta, p.id);
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(p.id) });
});

router.get('/:id/moves', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND business_id = ?').get(req.params.id, req.business.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json({ product: p, moves: db.prepare('SELECT * FROM stock_moves WHERE product_id = ? ORDER BY date DESC, id DESC LIMIT 200').all(p.id) });
});

router.post('/bulk', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const updateExisting = req.body?.updateExisting !== false;
  if (!items.length) {
    return res.status(400).json({ error: 'No items provided for import' });
  }

  const findExisting = db.prepare(`
    SELECT * FROM products
    WHERE business_id = ? AND inactive = 0
      AND (
        (barcode IS NOT NULL AND barcode != '' AND barcode = ?)
        OR (sku IS NOT NULL AND sku != '' AND sku = ?)
        OR LOWER(name) = LOWER(?)
      )
    LIMIT 1
  `);

  const insertProduct = db.prepare(`
    INSERT INTO products (
      business_id, sku, barcode, name, category, unit, hsn, gst_rate,
      purchase_price, sale_price, stock, opening_stock, low_stock_at, tax_inclusive
    ) VALUES (
      @business_id, @sku, @barcode, @name, @category, @unit, @hsn, @gst_rate,
      @purchase_price, @sale_price, @stock, @opening_stock, @low_stock_at, @tax_inclusive
    )
  `);

  const updateProduct = db.prepare(`
    UPDATE products SET
      sku = COALESCE(@sku, sku),
      barcode = COALESCE(@barcode, barcode),
      category = COALESCE(@category, category),
      unit = COALESCE(@unit, unit),
      hsn = COALESCE(@hsn, hsn),
      gst_rate = @gst_rate,
      purchase_price = @purchase_price,
      sale_price = @sale_price,
      low_stock_at = @low_stock_at,
      tax_inclusive = @tax_inclusive
    WHERE id = @id
  `);

  const adjustStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
  const recordMove = db.prepare('INSERT INTO stock_moves (business_id, product_id, qty, date, reason, rate, notes) VALUES (?,?,?,?,?,?,?)');

  let created = 0;
  let updated = 0;
  const errors = [];
  const todayDate = istToday();

  const tx = db.transaction(() => {
    items.forEach((raw, idx) => {
      const rowNum = idx + 1;
      const name = String(raw.name || raw.itemName || raw.item_name || '').trim();
      if (!name) {
        errors.push({ row: rowNum, error: 'Product name is required' });
        return;
      }

      const barcode = raw.barcode ? String(raw.barcode).trim() : null;
      const sku = raw.sku ? String(raw.sku).trim() : null;
      const category = raw.category ? String(raw.category).trim() : null;
      const unit = String(raw.unit || 'pcs').trim().toLowerCase();
      const hsn = raw.hsn ? String(raw.hsn).trim() : null;
      const gst_rate = raw.gst_rate !== undefined && raw.gst_rate !== null && raw.gst_rate !== ''
        ? Number(raw.gst_rate)
        : req.business.default_gst_rate;
      const purchase_price = Number(raw.purchase_price) || 0;
      const sale_price = Number(raw.sale_price) || 0;
      const stock = Number(raw.stock ?? raw.opening_stock) || 0;
      const opening_stock = stock;
      const low_stock_at = Number(raw.low_stock_at) || 0;
      const tax_inclusive = raw.tax_inclusive ? 1 : 0;

      const existing = findExisting.get(req.business.id, barcode || '', sku || '', name);

      if (existing) {
        if (updateExisting) {
          updateProduct.run({
            id: existing.id,
            sku: sku || existing.sku,
            barcode: barcode || existing.barcode,
            category: category || existing.category,
            unit: unit || existing.unit,
            hsn: hsn || existing.hsn,
            gst_rate: isNaN(gst_rate) ? existing.gst_rate : gst_rate,
            purchase_price: purchase_price || existing.purchase_price,
            sale_price: sale_price || existing.sale_price,
            low_stock_at: low_stock_at || existing.low_stock_at,
            tax_inclusive: tax_inclusive
          });
          if (stock > 0 && stock !== existing.stock) {
            const diff = stock - existing.stock;
            adjustStock.run(diff, existing.id);
            recordMove.run(req.business.id, existing.id, diff, todayDate, 'adjustment', purchase_price || existing.purchase_price, 'Excel import stock sync');
          }
          updated++;
        }
      } else {
        const info = insertProduct.run({
          business_id: req.business.id,
          sku,
          barcode,
          name,
          category,
          unit,
          hsn,
          gst_rate: isNaN(gst_rate) ? req.business.default_gst_rate : gst_rate,
          purchase_price,
          sale_price,
          stock,
          opening_stock,
          low_stock_at,
          tax_inclusive
        });
        if (stock > 0) {
          recordMove.run(req.business.id, info.lastInsertRowid, stock, todayDate, 'opening', purchase_price, 'Opening stock from Excel import');
        }
        created++;
      }
    });
  });

  try {
    tx();
    logActivity(req.business.id, req.user.id, 'import', `Imported ${created + updated} products (${created} created, ${updated} updated) from Excel`);
    res.json({
      success: true,
      created,
      updated,
      total: items.length,
      errors
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import products: ' + err.message });
  }
});

module.exports = { router };
