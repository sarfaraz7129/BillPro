import React, { useEffect, useMemo, useState } from 'react';
import { api, money, today, pdfUrl } from '../src/api.js';
import { Icon } from '../src/ui.jsx';
import { Field, Picker, Modal, GstRateInput } from '../src/components.jsx';

const blank = (business, type) => ({
  type,
  date: today(),
  dueDate: type === 'expense' ? '' : new Date(Date.now() + (business.credit_days || 30) * 86400000).toISOString().slice(0, 10),
  partyId: null, partyName: '', partyGstin: '', partyStateCode: '',
  items: [{ name: '', hsn: '', unit: 'pcs', qty: 1, rate: 0, gstRate: business.default_gst_rate, discountPct: 0, product_id: null }],
  discountType: 'flat', discountValue: 0, roundOff: true,
  paidAmount: 0, paymentMode: 'upi', notes: '', vehicleNo: '', transportDocNo: '', ewaybillNo: ''
});

/**
 * Full GST document editor used for invoices, purchase bills, quotations and expenses.
 * Mirrors the server-side totals maths so the preview matches the saved invoice exactly.
 */
export default function DocumentEditor({ business, type, doc, onClose, onSaved, toast }) {
  const [form, setForm] = useState(() => {
    if (!doc) return blank(business, type);
    return {
      ...blank(business, doc.type),
      ...doc,
      items: doc.items.map((l) => ({ ...l, discountFlat: l.discount || 0, discountPct: 0 })),
      discountValue: doc.discount_value || 0,
      discountType: doc.discount_type || 'flat',
      paidAmount: doc.paid_amount || 0,
      dueDate: doc.due_date || '',
      vehicleNo: doc.vehicle_no || '', transportDocNo: doc.transport_doc_no || '', ewaybillNo: doc.ewaybill_no || '',
      partyName: doc.party_name || '',
      partyId: doc.party_id || doc.partyId || null,
      partyGstin: doc.party_gstin || '',
      partyStateCode: doc.party_state_code || ''
    };
  });
  const [parties, setParties] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showEwb, setShowEwb] = useState(!!doc?.ewaybill_no || false);

  useEffect(() => {
    api.parties({ type: type === 'purchase' ? 'supplier' : 'customer' }).then((r) => setParties(r.parties)).catch(() => {});
    api.products().then((r) => setProducts(r.products)).catch(() => {});
  }, [type]);

  const selectedParty = useMemo(() => {
    if (!form.partyId) return null;
    return parties.find((p) => p.id === form.partyId) || null;
  }, [parties, form.partyId]);

  useEffect(() => {
    if (form.partyId && !parties.find((p) => p.id === form.partyId)) {
      api.party(form.partyId).then((r) => {
        if (r && r.party) setParties((old) => [...old, r.party]);
      }).catch(() => {});
    }
  }, [form.partyId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (i, k, v) => setForm((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)) }));
  const addLine = () => setForm((f) => ({ ...f, items: [...f.items, { name: '', hsn: '', unit: 'pcs', qty: 1, rate: 0, gstRate: business.default_gst_rate, discountPct: 0, product_id: null }] }));
  const dropLine = (i) => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, idx) => idx !== i) : f.items }));

  const supplyType = useMemo(() => {
    const code = String(form.partyStateCode || '').padStart(2, '0');
    const own = String(business.state_code || '').padStart(2, '0');
    if (!code || !own) return 'intra';
    return code === own ? 'intra' : 'inter';
  }, [form.partyStateCode, business.state_code]);

  const t = useMemo(() => totals(form.items, { ...form, supplyType }), [form.items, form.discountType, form.discountValue, form.roundOff, supplyType]);

  const pickProduct = (i, p) => {
    if (!p) return setItem(i, 'product_id', null);
    setForm((f) => ({
      ...f,
      items: f.items.map((it, idx) => idx === i ? {
        ...it, product_id: p.id, name: p.name, hsn: p.hsn || it.hsn, unit: p.unit || it.unit,
        rate: Number(p.sale_price) || Number(p.purchase_price) || it.rate, gstRate: p.gst_rate ?? it.gstRate
      } : it)
    }));
  };

  const chooseParty = (p) => {
    if (!p) return setForm((f) => ({ ...f, partyId: null, partyGstin: '', partyStateCode: '', partyName: '' }));
    setForm((f) => ({
      ...f, partyId: p.id, partyName: p.name, partyGstin: p.gstin || '',
      partyStateCode: p.state_code || '', dueDate: f.dueDate || new Date(Date.now() + (p.credit_days || business.credit_days || 30) * 86400000).toISOString().slice(0, 10)
    }));
  };

  const save = async (opts = {}) => {
    const andPrint = opts && opts.andPrint;
    setErr('');
    const valid = form.items.filter((l) => l.name && Number(l.qty) > 0 && Number(l.rate) >= 0);
    if (!valid.length) return setErr('Add at least one line item with a name, quantity and rate.');
    if (type !== 'expense' && !form.partyId && !form.partyName) return setErr('Choose a customer/supplier, or type a name for a walk-in party.');
    setSaving(true);
    try {
      const payload = { ...form, items: valid, supplyType };
      const res = doc ? await api.updateDocument(doc.id, payload) : await api.createDocument(payload);
      const savedDoc = res.document;
      if (andPrint && savedDoc && savedDoc.id) {
        window.open(pdfUrl(`invoice/${savedDoc.id}`), '_blank');
      }
      onSaved(savedDoc);
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const title = doc
    ? `Edit ${TYPE_LABEL[doc.type]} ${doc.number}`
    : `New ${TYPE_LABEL[type]}`;

  return (
    <Modal
      title={title}
      sub={`${business.name}${business.gstin ? ' · GSTIN ' + business.gstin : ''}`}
      size="xwide"
      onClose={onClose}
      footer={
        <>
          <div style={{ flex: 1, color: 'var(--muted)', fontSize: 12 }}>
            {type !== 'expense' && (supplyType === 'inter' ? 'Inter-state supply - IGST applies' : 'Intra-state supply - CGST + SGST apply')}
          </div>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 650, color: 'var(--brand)', borderColor: 'var(--brand)' }}
            onClick={() => save({ andPrint: true })}
            disabled={saving}
            title="Save this document and immediately open print-ready A4 PDF"
          >
            <Icon.print size={15} /> {saving ? 'Saving…' : 'Save & Print'}
          </button>
          <button type="button" className="btn primary" onClick={() => save({ andPrint: false })} disabled={saving}>
            {saving ? 'Saving…' : doc ? 'Save changes' : 'Save & generate'}
          </button>
        </>
      }
    >
      {err && <div className="banner err"><Icon.alert size={15} />{err}</div>}

      <div className="form-grid c3">
        <Field label={type === 'purchase' ? 'Supplier' : type === 'expense' ? 'Expense head' : 'Billed to'} req={type !== 'expense'}>
          {type === 'expense'
            ? <input className="input" value={form.partyName} onChange={(e) => set('partyName', e.target.value)} placeholder="e.g. Diesel & Logistics" />
            : (
              <>
                <Picker items={parties} value={form.partyId ? { id: form.partyId, name: form.partyName } : null} onChange={chooseParty}
                  placeholder="Search party name or phone…"
                  onAddNew={async (name) => {
                    const p = await api.createParty({ name, type: type === 'purchase' ? 'supplier' : 'customer' });
                    setParties((old) => [...old, p.party]);
                    chooseParty(p.party);
                    toast(`Added ${name}`, 'ok');
                  }}
                  render={(p) => (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{[p.phone, p.gstin].filter(Boolean).join(' · ') || 'No GSTIN'}</div>
                      </div>
                      {p.balance !== undefined && (
                        <span className={`pill ${p.balance > 0 ? 'red' : p.balance < 0 ? 'green' : 'grey'}`}>
                          {p.balance > 0 ? `Due: ${money(p.balance)}` : p.balance < 0 ? `Adv: ${money(Math.abs(p.balance))}` : 'Settled'}
                        </span>
                      )}
                    </>
                  )} />

                {selectedParty && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: selectedParty.balance > 0 ? '#fef2f2' : selectedParty.balance < 0 ? '#f0fdf4' : '#f8fafc',
                      border: `1px solid ${selectedParty.balance > 0 ? '#fecaca' : selectedParty.balance < 0 ? '#bbf7d0' : '#e2e8f0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 6,
                      fontSize: 12
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>
                        {selectedParty.name}
                        {selectedParty.phone && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 4 }}>· 📞 {selectedParty.phone}</span>}
                      </div>
                      {selectedParty.credit_limit > 0 && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          Credit limit: {money(selectedParty.credit_limit)}
                          {selectedParty.overLimit && <span style={{ color: '#dc2626', fontWeight: 600, marginLeft: 4 }}>⚠️ Over Limit</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10.5, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                        Outstanding Balance
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: selectedParty.balance > 0 ? '#dc2626' : selectedParty.balance < 0 ? '#16a34a' : '#475569' }}>
                        {selectedParty.balance > 0
                          ? `${money(selectedParty.balance)} (To Collect)`
                          : selectedParty.balance < 0
                          ? `${money(Math.abs(selectedParty.balance))} (Advance)`
                          : '₹0.00 (Settled)'}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
        </Field>
        <Field label="Document date"><input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
        {type !== 'expense' && <Field label="Due date"><input type="date" className="input" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>}
        {type !== 'expense' && (
          <>
            <Field label="GSTIN (party)"><input className="input" value={form.partyGstin} onChange={(e) => set('partyGstin', e.target.value.toUpperCase())} placeholder="29AAAAA1111A1Z1" /></Field>
            <Field label="Place of supply"><input className="input" value={form.partyStateCode} onChange={(e) => set('partyStateCode', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="29 (State code)" title="Different from your state triggers IGST" /></Field>
            <Field label="Payment mode">
              <select className="input" value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value)}>
                {['upi', 'cash', 'bank', 'card', 'cheque', 'credit'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </Field>
          </>
        )}
      </div>

      <hr className="divider" style={{ margin: '8px 0' }} />

      <div className="lines">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h3 style={{ fontSize: 13.5 }}>Items</h3>
          <div className="spacer" />
          <button className="btn sm" onClick={addLine}><Icon.plus size={14} /> Add line</button>
        </div>
        <div className="doc-tbl-wrap">
          <table className="tbl doc-tbl">
            <thead>
              <tr>
                <th style={{ width: '26%' }}>Item / service</th>
                <th style={{ width: 78 }}>HSN/SAC</th>
                <th style={{ width: 66 }}>Qty</th>
                <th style={{ width: 62 }}>Unit</th>
                <th style={{ width: 92 }}>Rate</th>
                <th style={{ width: 62 }}>Disc %</th>
                <th style={{ width: 76 }}>GST %</th>
                <th className="num" style={{ width: 96 }}>Amount</th>
                <th style={{ width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {form.items.map((it, i) => {
                const gross = (Number(it.qty) || 0) * (Number(it.rate) || 0);
                const afterDisc = gross - (gross * (Number(it.discountPct) || 0)) / 100 - (Number(it.discountFlat) || 0);
                const withTax = afterDisc * (1 + (Number(it.gstRate) || 0) / 100);
                return (
                  <tr key={i} style={{ position: 'relative', zIndex: form.items.length - i + 10 }}>
                    <td>
                      <Picker items={products} value={it.product_id ? { id: it.product_id, name: it.name } : null}
                        onChange={(p) => pickProduct(i, p)} placeholder="Type or pick an item…"
                        onAddNew={async (name) => {
                          const p = await api.createProduct({ name, gst_rate: business.default_gst_rate });
                          setProducts((old) => [...old, p.product]);
                          pickProduct(i, p.product);
                          toast(`Added ${name} to inventory`, 'ok');
                        }}
                        render={(p) => (
                          <>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{money(p.sale_price)} · stock {p.stock} {p.unit}</div>
                            </div>
                          </>
                        )} />
                    </td>
                    <td><input className="input" value={it.hsn || ''} onChange={(e) => setItem(i, 'hsn', e.target.value)} /></td>
                    <td><input className="input" type="number" value={it.qty} onChange={(e) => setItem(i, 'qty', Number(e.target.value))} /></td>
                    <td><input className="input" value={it.unit || ''} onChange={(e) => setItem(i, 'unit', e.target.value)} /></td>
                    <td><input className="input" type="number" value={it.rate} onChange={(e) => setItem(i, 'rate', Number(e.target.value))} /></td>
                    <td><input className="input" type="number" value={it.discountPct || ''} onChange={(e) => setItem(i, 'discountPct', Number(e.target.value))} /></td>
                    <td style={{ minWidth: 96 }}>
                      <GstRateInput value={it.gstRate} onChange={(r) => setItem(i, 'gstRate', r)} />
                    </td>
                    <td className="num strong">{money(withTax)}</td>
                    <td><button className="icon-btn danger" onClick={() => dropLine(i)}><Icon.trash size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 320px', marginTop: 10, gap: 14 }}>
        <div>
          <div className="form-grid">
            <Field label="Discount on the whole bill">
              <div style={{ display: 'flex', gap: 6 }}>
                <select className="input" style={{ width: 84 }} value={form.discountType} onChange={(e) => set('discountType', e.target.value)}>
                  <option value="flat">Flat</option><option value="pct">%</option>
                </select>
                <input className="input" type="number" min="0" value={form.discountValue} onChange={(e) => set('discountValue', Number(e.target.value))} />
              </div>
            </Field>
            <Field label="Notes / terms shown on the PDF" full>
              <textarea className="input" rows={2} style={{ resize: 'vertical' }} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Terms & conditions, bank details, delivery note, etc." />
            </Field>
          </div>

          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setShowEwb(!showEwb)}>
            <Icon.truck size={14} /> E-Way Bill / transport details
          </button>
          {showEwb && (
            <div className="form-grid c3" style={{ marginTop: 8 }}>
              <Field label="E-Way Bill no"><input className="input" value={form.ewaybillNo} onChange={(e) => set('ewaybillNo', e.target.value)} placeholder="Leave blank to generate after saving" /></Field>
              <Field label="Vehicle no"><input className="input" value={form.vehicleNo} onChange={(e) => set('vehicleNo', e.target.value)} placeholder="KA19AB1234" /></Field>
              <Field label="LR / transport doc no"><input className="input" value={form.transportDocNo} onChange={(e) => set('transportDocNo', e.target.value)} /></Field>
            </div>
          )}
        </div>

        <div className="tot-box">
          <Row label="Subtotal" value={t.subtotal} />
          {t.lineDiscount > 0 && <Row label="Line discount" value={-t.lineDiscount} />}
          {t.docDiscount > 0 && <Row label={`Bill discount (${form.discountType === 'pct' ? form.discountValue + '%' : 'flat'})`} value={-t.docDiscount} />}
          <Row label="Taxable value" value={t.taxableValue} strong />
          {supplyType === 'inter'
            ? <Row label="IGST" value={t.igst} />
            : <><Row label="CGST" value={t.cgst} /><Row label="SGST / UTGST" value={t.sgst} /></>}
          {form.roundOff && <Row label="Round off" value={t.roundOff} />}
          <div className="grand" style={{ paddingTop: 6, marginTop: 4 }}><span style={{ fontWeight: 700 }}>Total</span><span className="v">{money(t.total)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3, fontSize: 11, color: 'var(--muted)' }}>
            <span style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.amountInWords}>{t.amountInWords}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11 }}>
              <input type="checkbox" checked={!!form.roundOff} onChange={(e) => set('roundOff', e.target.checked)} style={{ width: 13, height: 13 }} />
              <span>Round off</span>
            </label>
          </div>

          {/* Amount received now - shown right beside/under the Total column */}
          <div style={{
            marginTop: 8,
            padding: '8px 10px',
            background: 'var(--surface-2)',
            border: '1.5px solid var(--brand)',
            borderRadius: 9
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>
                {type === 'expense' ? 'Amount Paid' : type === 'purchase' ? 'Amount Paid' : 'Amount Received'}
              </label>
              <div style={{ display: 'flex', gap: 3 }}>
                <button
                  type="button"
                  className="btn xs"
                  style={{ fontSize: 10, padding: '1px 5px', height: 20 }}
                  onClick={() => set('paidAmount', 0)}
                  title="Unpaid / Credit bill"
                >
                  ₹0
                </button>
                <button
                  type="button"
                  className="btn xs"
                  style={{ fontSize: 10, padding: '1px 5px', height: 20, background: 'var(--brand-soft)', color: 'var(--brand)', borderColor: 'var(--brand)', fontWeight: 650 }}
                  onClick={() => set('paidAmount', t.total)}
                  title="Mark fully paid"
                >
                  Full (₹{t.total})
                </button>
              </div>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 8, fontWeight: 700, color: 'var(--muted)', fontSize: 13 }}>₹</span>
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                style={{ paddingLeft: 22, height: 30, fontWeight: 700, fontSize: 13, color: 'var(--ink)', width: '100%' }}
                value={form.paidAmount === 0 && form.paidAmount !== '' ? '0' : (form.paidAmount ?? '')}
                onChange={(e) => set('paidAmount', e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: 11.5, paddingTop: 4, borderTop: '1px dashed var(--line)' }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Balance due:</span>
              <span style={{
                fontWeight: 750,
                fontSize: 12,
                color: (t.total - (Number(form.paidAmount) || 0)) > 0.005 ? '#dc2626' : '#16a34a'
              }}>
                {(t.total - (Number(form.paidAmount) || 0)) > 0.005
                  ? `${money(Math.max(0, t.total - (Number(form.paidAmount) || 0)))} (Due)`
                  : '₹0.00 (Fully Paid)'}
              </span>
            </div>
          </div>

          {selectedParty && type === 'sale' && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)', fontSize: 12 }}>
              <div style={{ fontWeight: 650, color: 'var(--ink)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Khata Impact</span>
                <span className={`pill sm ${selectedParty.balance > 0 ? 'red' : selectedParty.balance < 0 ? 'green' : 'grey'}`} style={{ fontSize: 10 }}>
                  {selectedParty.balance > 0 ? `Prev Due: ${money(selectedParty.balance)}` : selectedParty.balance < 0 ? `Adv: ${money(Math.abs(selectedParty.balance))}` : 'Settled'}
                </span>
              </div>
              <div className="kv" style={{ fontSize: 11.5, marginBottom: 3 }}>
                <span className="k">Previous Balance</span>
                <span className="v" style={{ fontWeight: 600, color: selectedParty.balance > 0 ? '#dc2626' : selectedParty.balance < 0 ? '#16a34a' : 'inherit' }}>
                  {selectedParty.balance > 0 ? `${money(selectedParty.balance)} (Dr)` : selectedParty.balance < 0 ? `${money(Math.abs(selectedParty.balance))} (Cr)` : '₹0.00'}
                </span>
              </div>
              <div className="kv" style={{ fontSize: 11.5, marginBottom: 3 }}>
                <span className="k">+ Current Bill</span>
                <span className="v">+{money(t.total)}</span>
              </div>
              {Number(form.paidAmount) > 0 && (
                <div className="kv" style={{ fontSize: 11.5, marginBottom: 3 }}>
                  <span className="k">- Received Now</span>
                  <span className="v pos">-{money(Number(form.paidAmount))}</span>
                </div>
              )}
              {!doc && (
                <div className="kv" style={{ fontSize: 12, fontWeight: 700, marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  <span className="k" style={{ color: 'var(--ink)' }}>Net Closing Balance</span>
                  <span className="v" style={{ color: ((Number(selectedParty.balance) || 0) + t.total - (Number(form.paidAmount) || 0)) > 0 ? '#dc2626' : ((Number(selectedParty.balance) || 0) + t.total - (Number(form.paidAmount) || 0)) < 0 ? '#16a34a' : 'inherit' }}>
                    {(() => {
                      const closing = (Number(selectedParty.balance) || 0) + t.total - (Number(form.paidAmount) || 0);
                      return closing > 0 ? `${money(closing)} (Dr Due)` : closing < 0 ? `${money(Math.abs(closing))} (Cr Adv)` : '₹0.00 (Settled)';
                    })()}
                  </span>
                </div>
              )}
            </div>
          )}

          {selectedParty && type === 'purchase' && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)', fontSize: 12 }}>
              <div style={{ fontWeight: 650, color: 'var(--ink)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Supplier Balance</span>
                <span className={`pill sm ${selectedParty.balance < 0 ? 'red' : selectedParty.balance > 0 ? 'green' : 'grey'}`} style={{ fontSize: 10 }}>
                  {selectedParty.balance < 0 ? `Payable: ${money(Math.abs(selectedParty.balance))}` : selectedParty.balance > 0 ? `Advance: ${money(selectedParty.balance)}` : 'Settled'}
                </span>
              </div>
              <div className="kv" style={{ fontSize: 11.5 }}>
                <span className="k">Current Balance</span>
                <span className="v" style={{ fontWeight: 600, color: selectedParty.balance < 0 ? '#dc2626' : '#16a34a' }}>
                  {selectedParty.balance < 0 ? `${money(Math.abs(selectedParty.balance))} (To Pay)` : selectedParty.balance > 0 ? `${money(selectedParty.balance)} (Advance)` : '₹0.00'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export const TYPE_LABEL = { sale: 'Invoice', purchase: 'Purchase Bill', quotation: 'Quotation', expense: 'Expense' };

function Row({ label, value, strong }) {
  return (
    <div className="kv">
      <span className="k" style={strong ? { color: 'var(--ink)', fontWeight: 650 } : {}}>{label}</span>
      <span className="v">{money(value)}</span>
    </div>
  );
}

/** Client-side mirror of the server totals, so the preview never disagrees with the saved invoice. */
export function totals(items, opts) {
  const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
  const lines = (items || []).filter((i) => i && i.name).map((raw) => {
    const qty = Number(raw.qty) || 0;
    const gstRate = Number(raw.gstRate || 0);
    const rate = Number(raw.rate) || 0;
    const gross = r2(qty * rate);
    const disc = r2((gross * (Number(raw.discountPct) || 0)) / 100 + (Number(raw.discountFlat) || 0));
    return { gross, disc, taxable: r2(Math.max(0, gross - disc)), gstRate };
  });
  const subtotal = r2(lines.reduce((s, l) => s + l.gross, 0));
  const lineDiscount = r2(lines.reduce((s, l) => s + l.disc, 0));
  const afterLine = r2(subtotal - lineDiscount);
  let docDiscount = 0;
  if (Number(opts.discountValue)) {
    docDiscount = r2(opts.discountType === 'pct' ? (afterLine * Number(opts.discountValue)) / 100 : Number(opts.discountValue));
    docDiscount = Math.min(docDiscount, afterLine);
  }
  const taxableValue = r2(Math.max(0, afterLine - docDiscount));
  const isInter = opts.supplyType === 'inter';
  const taxTotal = r2((taxableValue * weightedRate(lines, taxableValue)) / 100);
  const cgst = isInter ? 0 : r2(taxTotal / 2);
  const sgst = isInter ? 0 : r2(taxTotal / 2);
  const igst = isInter ? taxTotal : 0;
  const preTotal = r2(taxableValue + taxTotal);
  const total = opts.roundOff ? Math.round(preTotal) : preTotal;
  return {
    subtotal, lineDiscount, docDiscount, taxableValue, cgst, sgst, igst,
    roundOff: r2(total - preTotal), total,
    amountInWords: words(total)
  };
}

const weightedRate = (lines, taxableValue) => {
  if (!taxableValue) return 0;
  const ratio = lines.reduce((s, l) => s + l.taxable, 0) || 1;
  return lines.reduce((s, l) => s + (l.taxable / ratio) * l.gstRate, 0);
};

const words = (n) => {
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x) => (x < 20 ? ONES[x] : TENS[Math.floor(x / 10)] + (x % 10 ? ' ' + ONES[x % 10] : ''));
  const three = (x) => (x > 99 ? `${ONES[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
  const indian = (num) => {
    if (!num) return 'Zero';
    const out = [];
    const crore = Math.floor(num / 10000000); num %= 10000000;
    const lakh = Math.floor(num / 100000); num %= 100000;
    const thou = Math.floor(num / 1000); num %= 1000;
    if (crore) out.push(`${three(crore)} Crore`);
    if (lakh) out.push(`${three(lakh)} Lakh`);
    if (thou) out.push(`${three(thou)} Thousand`);
    if (num) out.push(three(num));
    return out.join(' ');
  };
  const rupees = Math.floor(Math.abs(n));
  return `${indian(rupees)} Rupees Only`;
};
