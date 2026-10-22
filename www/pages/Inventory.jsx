import React, { useEffect, useState } from 'react';
import { api, money, moneyShort, fmtDate, pdfUrl, csvUrl, today } from '../src/api.js';
import { Icon } from '../src/ui.jsx';
import { Modal, Field, Empty, Confirm, GstRateInput } from '../src/components.jsx';
import ExcelImportModal from '../src/ExcelImportModal.jsx';
import { exportProductsToExcel } from '../src/excel.js';

const UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'box', 'pkt', 'bag', 'can', 'dozen', 'set', 'metre', 'sqft', 'lot'];

export default function Inventory({ business, toast }) {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [summary, setSummary] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [low, setLow] = useState(false);
  const [editor, setEditor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [moves, setMoves] = useState(null);
  const [stock, setStock] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [catMgrOpen, setCatMgrOpen] = useState(false);

  const load = async () => {
    try {
      const r = await api.products({ q, category: cat, low: low ? 1 : '' });
      setRows(r.products); setCats(r.categories); setSummary(r.summary);
    } catch (e) { toast(e.message, 'err'); }
  };
  useEffect(() => { load(); }, [q, cat, low, business.id]);

  return (
    <>
      {summary && (
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <Mini label="Products" value={summary.count} foot={`${cats.length} categories`} />
          <Mini label="Stock value (cost)" value={moneyShort(summary.stockValue)} foot="At purchase price" />
          <Mini label="Sale value" value={moneyShort(summary.saleValue)} foot="If everything sells" tone="pos" />
          <Mini label="Low / out of stock" value={`${summary.lowCount} / ${summary.outCount}`} foot="Needs reordering" tone={summary.lowCount ? 'neg' : ''} />
        </div>
      )}

      <div className="toolbar">
        <div className="grow search">
          <Icon.search size={15} />
          <input className="input" placeholder="Search name, SKU, barcode or HSN…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" style={{ width: 170 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn" onClick={() => setCatMgrOpen(true)} title="Manage product categories">
          <Icon.tag size={15} /> Categories
        </button>
        <label className="checkbox"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low stock only</label>
        <button className="btn" onClick={() => setImportOpen(true)} title="Bulk upload products from Excel/CSV">
          <Icon.upload size={15} /> Import Excel
        </button>
        <button className="btn" onClick={() => exportProductsToExcel(rows, business.name)} title="Export catalog to Excel">
          <Icon.download size={15} /> Export Excel
        </button>
        <button className="btn" onClick={() => window.open(pdfUrl('stock'), '_blank')}><Icon.print size={15} /> Stock PDF</button>
        <button className="btn primary" onClick={() => setEditor({})}><Icon.plus size={15} /> Add product</button>
      </div>

      <div className="card">
        <div className="card-b tight tbl-wrap">
          {rows.length === 0 ? (
            <Empty icon={Icon.box} title="No products yet"
              hint="Add your items with HSN, GST rate and stock so billing fills itself in and stock updates on every sale, or upload your existing catalog from Excel."
              action={
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary sm" onClick={() => setEditor({})}><Icon.plus size={14} /> Add product</button>
                  <button className="btn sm" onClick={() => setImportOpen(true)}><Icon.upload size={14} /> Import from Excel</button>
                </div>
              } />
          ) : (
            <>
              {/* Mobile App Product Cards List */}
              <div className="mobile-only mobile-cards-list">
                {rows.map((p) => (
                  <div key={p.id} className="mobile-product-card" onClick={() => setEditor(p)}>
                    <div className="mpc-top">
                      <div>
                        <div className="mpc-name">{p.name}</div>
                        <div className="mpc-sub">{[p.category, `GST ${p.gst_rate}%`, p.hsn ? `HSN ${p.hsn}` : null].filter(Boolean).join(' · ')}</div>
                      </div>
                      <b className="mpc-price">{money(p.sale_price)}</b>
                    </div>
                    <div className="mpc-mid">
                      <div className="mpc-stock-info">
                        <span className="mpc-label">Stock: </span>
                        <b className={p.out ? 'neg' : p.low ? 'neg' : 'pos'}>{p.stock} {p.unit}</b>
                        {p.out ? <span className="pill sm red" style={{ marginLeft: 6 }}>Out of stock</span> : p.low ? <span className="pill sm amber" style={{ marginLeft: 6 }}>Low stock</span> : null}
                      </div>
                      <div className="mpc-value">Value: {money(p.stockValue)}</div>
                    </div>
                    <div className="mpc-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn xs" onClick={() => setStock(p)}>
                        <Icon.swap size={13} /> Adjust stock
                      </button>
                      <button type="button" className="btn xs" onClick={() => api.productMoves(p.id).then(setMoves)}>
                        <Icon.clock size={13} /> History
                      </button>
                      <button type="button" className="btn xs" onClick={() => setEditor(p)}>
                        <Icon.edit size={13} /> Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <table className="tbl desktop-only">
                <thead>
                  <tr><th>Product</th><th>SKU / Barcode</th><th>HSN</th><th className="num">Stock</th>
                    <th className="num">Purchase</th><th className="num">Sale</th><th className="num">Margin</th>
                    <th className="num">Stock value</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="strong">{p.name}</div>
                        <div className="muted">{[p.category, `GST ${p.gst_rate}%`, p.tax_inclusive ? 'tax-inclusive' : ''].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="muted mono">{p.sku || '—'}{p.barcode && <div>{p.barcode}</div>}</td>
                      <td className="muted mono">{p.hsn || '—'}</td>
                      <td className="num">
                        <b className={p.out ? 'neg' : p.low ? 'neg' : ''}>{p.stock} {p.unit}</b>
                        {p.out ? <div><span className="pill red">Out</span></div> : p.low ? <div><span className="pill amber">Low</span></div> : null}
                      </td>
                      <td className="num muted">{money(p.purchase_price)}</td>
                      <td className="num">{money(p.sale_price)}</td>
                      <td className="num"><span className={`pill ${p.margin >= 20 ? 'green' : p.margin > 0 ? 'grey' : 'red'}`}>{p.margin}%</span></td>
                      <td className="num strong">{money(p.stockValue)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" title="Stock history" onClick={() => api.productMoves(p.id).then(setMoves)}><Icon.clock size={14} /></button>
                          <button className="icon-btn" title="Adjust stock" onClick={() => setStock(p)}><Icon.swap size={14} /></button>
                          <button className="icon-btn" title="Edit" onClick={() => setEditor(p)}><Icon.edit size={14} /></button>
                          <button className="icon-btn danger" title="Remove" onClick={() => setConfirm(p)}><Icon.trash size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3">Totals ({rows.length} items)</td>
                    <td className="num">{rows.reduce((s, p) => s + Number(p.stock), 0)} units</td>
                    <td colSpan="3" />
                    <td className="num">{money(rows.reduce((s, p) => s + p.stockValue, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </div>

      {editor && <ProductEditor business={business} product={editor.id ? editor : null} categories={cats} toast={toast}
        onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} onCategoriesChanged={() => load()} />}
      {catMgrOpen && <CategoryManagerModal business={business} onClose={() => setCatMgrOpen(false)} onCategoriesChanged={() => load()} toast={toast} />}
      {stock && <StockModal product={stock} onClose={() => setStock(null)} onSaved={() => { setStock(null); load(); }} toast={toast} />}
      {moves && (
        <Modal title={`Stock history · ${moves.product.name}`} onClose={() => setMoves(null)} size="wide">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Reason</th><th className="num">Qty</th><th className="num">Rate</th><th>Note</th></tr></thead>
            <tbody>
              {moves.moves.length === 0 && <tr><td colSpan="5"><Empty title="No stock movements" /></td></tr>}
              {moves.moves.map((m) => (
                <tr key={m.id}>
                  <td className="muted">{fmtDate(m.date)}</td>
                  <td><span className={`pill ${m.qty > 0 ? 'green' : 'red'}`}>{m.reason}</span></td>
                  <td className={`num ${m.qty > 0 ? 'pos' : 'neg'}`}>{m.qty > 0 ? '+' : ''}{m.qty}</td>
                  <td className="num muted">{money(m.rate)}</td>
                  <td className="muted">{m.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
      {confirm && <Confirm title={`Remove ${confirm.name}?`} message="The product is marked inactive and hidden from billing. Past invoices keep their details."
        onConfirm={async () => { try { await api.deleteProduct(confirm.id); toast('Removed', 'ok'); load(); } catch (e) { toast(e.message, 'err'); } }}
        onClose={() => setConfirm(null)} />}

      {importOpen && (
        <ExcelImportModal
          mode="products"
          business={business}
          onClose={() => setImportOpen(false)}
          onSuccess={() => load()}
          toast={toast}
        />
      )}
    </>
  );
}

function Mini({ label, value, foot, tone }) {
  return <div className="stat"><div className="lbl">{label}</div><div className={`val ${tone || ''}`} style={{ fontSize: 20 }}>{value}</div><div className="foot">{foot}</div></div>;
}

function ProductEditor({ business, product, categories = [], onClose, onSaved, onCategoriesChanged, toast }) {
  const [form, setForm] = useState(product ? { ...product } : {
    name: '', sku: '', barcode: '', category: '', unit: 'pcs', hsn: '', gst_rate: business.default_gst_rate,
    purchase_price: 0, sale_price: 0, stock: 0, low_stock_at: 0, tax_inclusive: 0
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [localCats, setLocalCats] = useState(categories);

  useEffect(() => {
    setLocalCats(categories);
  }, [categories]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleCreateInlineCat = async () => {
    const val = newCatInput.trim();
    if (!val) {
      setIsAddingNewCat(false);
      return;
    }
    try {
      await api.createCategory(val);
      if (!localCats.includes(val)) {
        setLocalCats((prev) => [...prev, val].sort((a, b) => a.localeCompare(b)));
      }
      set('category', val);
      setNewCatInput('');
      setIsAddingNewCat(false);
      toast(`Category "${val}" created and selected`, 'ok');
      if (onCategoriesChanged) onCategoriesChanged();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      if (product) await api.updateProduct(product.id, form);
      else await api.createProduct(form);
      toast(product ? 'Product updated' : `${form.name} added to inventory`, 'ok');
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const margin = form.sale_price ? (((form.sale_price - form.purchase_price) / form.sale_price) * 100).toFixed(1) : '0';

  return (
    <>
      <Modal title={product ? `Edit ${product.name}` : 'Add product'} onClose={onClose}
        footer={<>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
        </>}>
        {err && <div className="banner err"><Icon.alert size={15} />{err}</div>}
        <div className="form-grid">
          <Field label="Product / service name" req full><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
          <Field label="SKU code"><input className="input" value={form.sku || ''} onChange={(e) => set('sku', e.target.value)} /></Field>
          <Field label="Barcode"><input className="input" value={form.barcode || ''} onChange={(e) => set('barcode', e.target.value)} /></Field>

          {/* Category Selector with On-the-Fly Creation & Management */}
          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--ink)' }}>Category</label>
              <button
                type="button"
                className="link"
                onClick={() => setShowCatMgr(true)}
                style={{ fontSize: 11.5, background: 'none', border: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <Icon.tag size={12} /> Manage categories
              </button>
            </div>

            {isAddingNewCat ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  autoFocus
                  placeholder="Type new category name…"
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleCreateInlineCat(); }
                    if (e.key === 'Escape') { setIsAddingNewCat(false); }
                  }}
                />
                <button
                  type="button"
                  className="btn primary"
                  style={{ padding: '0 12px', height: 36 }}
                  onClick={handleCreateInlineCat}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '0 10px', height: 36 }}
                  onClick={() => setIsAddingNewCat(false)}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  className="input"
                  style={{ flex: 1 }}
                  value={form.category || ''}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      setIsAddingNewCat(true);
                    } else {
                      set('category', e.target.value);
                    }
                  }}
                >
                  <option value="">-- No Category (General) --</option>
                  {localCats.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__NEW__">+ Add new category…</option>
                </select>
                <button
                  type="button"
                  className="btn"
                  title="Add new category"
                  style={{ padding: '0 11px', height: 36, whiteSpace: 'nowrap' }}
                  onClick={() => setIsAddingNewCat(true)}
                >
                  <Icon.plus size={14} /> New
                </button>
              </div>
            )}

            {/* Quick Pick Chips */}
            {localCats.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Quick pick:</span>
                {localCats.slice(0, 6).map((c) => {
                  const isSelected = form.category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`pill sm ${isSelected ? 'primary' : 'grey'}`}
                      style={{
                        cursor: 'pointer',
                        padding: '2px 8px',
                        fontSize: 11,
                        background: isSelected ? 'var(--brand)' : 'var(--surface-2)',
                        color: isSelected ? '#fff' : 'var(--ink)',
                        borderColor: isSelected ? 'var(--brand)' : 'var(--line)'
                      }}
                      onClick={() => set('category', isSelected ? '' : c)}
                    >
                      {isSelected ? `✓ ${c}` : c}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Field label="Unit">
            <select className="input" value={form.unit} onChange={(e) => set('unit', e.target.value)}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="HSN / SAC" hint="Starts with 99 for services"><input className="input" value={form.hsn || ''} onChange={(e) => set('hsn', e.target.value)} /></Field>
          <Field label="GST rate" hint="Standard slab or custom percentage">
            <GstRateInput value={form.gst_rate} onChange={(r) => set('gst_rate', r)} />
          </Field>
          <Field label="Purchase price"><input className="input" type="number" value={form.purchase_price} onChange={(e) => set('purchase_price', Number(e.target.value))} /></Field>
          <Field label="Sale price"><input className="input" type="number" value={form.sale_price} onChange={(e) => set('sale_price', Number(e.target.value))} /></Field>
          {!product && <Field label="Opening stock"><input className="input" type="number" value={form.stock} onChange={(e) => set('stock', Number(e.target.value))} /></Field>}
          <Field label="Low stock alert at"><input className="input" type="number" value={form.low_stock_at} onChange={(e) => set('low_stock_at', Number(e.target.value))} /></Field>
          <div className="full">
            <label className="checkbox"><input type="checkbox" checked={!!form.tax_inclusive} onChange={(e) => set('tax_inclusive', e.target.checked ? 1 : 0)} /> Sale price already includes GST</label>
          </div>
          {product && (
            <div className="full banner info"><Icon.box size={15} />Current stock: <b>{product.stock} {product.unit}</b> · margin {margin}% · use “Adjust stock” to change quantity.</div>
          )}
        </div>
      </Modal>

      {showCatMgr && (
        <CategoryManagerModal
          business={business}
          onClose={() => setShowCatMgr(false)}
          onCategoriesChanged={async () => {
            const r = await api.categories();
            const names = (r.categories || []).map(x => x.name);
            setLocalCats(names);
            if (onCategoriesChanged) onCategoriesChanged();
          }}
          toast={toast}
        />
      )}
    </>
  );
}

export function CategoryManagerModal({ business, onClose, onCategoriesChanged, toast }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCat, setNewCat] = useState('');
  const [editing, setEditing] = useState(null); // { from, to }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadCats = async () => {
    setLoading(true);
    try {
      const r = await api.categories();
      setList(r.categories || []);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCats();
  }, [business.id]);

  const handleAdd = async (e) => {
    e && e.preventDefault();
    const name = newCat.trim();
    if (!name) return;
    setBusy(true);
    setErr('');
    try {
      await api.createCategory(name);
      setNewCat('');
      toast(`Category "${name}" created`, 'ok');
      await loadCats();
      if (onCategoriesChanged) onCategoriesChanged();
    } catch (err) {
      setErr(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (from, to) => {
    const toTrim = to.trim();
    if (!toTrim || toTrim === from) {
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      await api.renameCategory(from, toTrim);
      toast(`Category renamed to "${toTrim}"`, 'ok');
      setEditing(null);
      await loadCats();
      if (onCategoriesChanged) onCategoriesChanged();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (cat) => {
    const msg = cat.productCount > 0
      ? `Delete category "${cat.name}"? ${cat.productCount} products in this category will be set to uncategorized.`
      : `Delete category "${cat.name}"?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await api.deleteCategory(cat.name);
      toast(`Category "${cat.name}" deleted`, 'ok');
      await loadCats();
      if (onCategoriesChanged) onCategoriesChanged();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Manage Categories"
      sub="Organize products into categories for easy filtering, stock management, and 1-tap billing"
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Done</button>}
    >
      {err && <div className="banner err"><Icon.alert size={15} />{err}</div>}

      {/* Add Category Form */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="input"
          placeholder="New category name (e.g. Organic Spices, Beverages)"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          style={{ flex: 1 }}
          autoFocus
        />
        <button type="submit" className="btn primary" disabled={busy || !newCat.trim()}>
          <Icon.plus size={14} /> Add Category
        </button>
      </form>

      {/* Categories List */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Loading categories…</div>
        ) : list.length === 0 ? (
          <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No categories defined yet. Type a category name above to create your first category.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {list.map((c) => {
              const isEditing = editing && editing.from === c.name;
              return (
                <div
                  key={c.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--line-soft)',
                    gap: 10
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: 'var(--surface-2)', color: 'var(--brand)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Icon.tag size={16} />
                    </div>

                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                        <input
                          className="input sm"
                          value={editing.to}
                          onChange={(e) => setEditing({ ...editing, to: e.target.value })}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(editing.from, editing.to);
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          style={{ height: 30, fontSize: 13, flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn primary sm"
                          onClick={() => handleRename(editing.from, editing.to)}
                          style={{ padding: '0 8px', height: 30 }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => setEditing(null)}
                          style={{ padding: '0 8px', height: 30 }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--ink)' }}>
                          {c.name}
                        </div>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span className={`pill sm ${c.productCount > 0 ? 'grey' : 'amber'}`} style={{ fontSize: 11 }}>
                        {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
                      </span>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Rename category"
                        onClick={() => setEditing({ from: c.name, to: c.name })}
                      >
                        <Icon.edit size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Delete category"
                        onClick={() => handleDelete(c)}
                      >
                        <Icon.trash size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function StockModal({ product, onClose, onSaved, toast }) {
  const [form, setForm] = useState({ qty: 0, date: today(), notes: '', rate: product.purchase_price });
  const save = async () => {
    try {
      await api.adjustStock(product.id, { ...form, qty: Number(form.qty) });
      toast(`Stock updated to ${product.stock + Number(form.qty)} ${product.unit}`, 'ok');
      onSaved();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={`Adjust stock · ${product.name}`} sub={`Currently ${product.stock} ${product.unit}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Update stock</button></>}>
      <div className="form-grid">
        <Field label="Change in quantity" req hint="Use a negative number to remove stock (damage, wastage, count correction)">
          <input className="input" type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} autoFocus />
        </Field>
        <Field label="Date"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Rate (for valuation)"><input className="input" type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} /></Field>
        <Field label="Reason / note"><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Stock count correction" /></Field>
      </div>
      <div className="kv" style={{ marginTop: 12 }}><span className="k">New stock</span><span className="v">{product.stock + Number(form.qty || 0)} {product.unit}</span></div>
    </Modal>
  );
}
