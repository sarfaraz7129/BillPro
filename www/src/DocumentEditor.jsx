import React, { useEffect, useMemo, useState } from 'react';
import { api, money, today, pdfUrl, isAdmin } from '../src/api.js';
import { Icon } from '../src/ui.jsx';
import { Field, Picker, Modal, GstRateInput } from '../src/components.jsx';

const blank = (business, type) => ({
  type,
  isEstimate: (type === 'invoice' || type === 'sale') ? (business.default_bill_mode !== 'gst') : false,
  date: today(),
  dueDate: type === 'expense' ? '' : new Date(Date.now() + (business.credit_days || 30) * 86400000).toISOString().slice(0, 10),
  partyId: null, partyName: '', partyGstin: '', partyStateCode: '',
  items: [{ name: '', hsn: '', unit: 'pcs', qty: 1, rate: 0, gstRate: business.default_gst_rate, discountPct: 0, product_id: null, isReturn: false }],
  discountType: 'flat', discountValue: 0, roundOff: true,
  transportation: 0, loadingCharges: 0, otherCharges: 0,
  paidAmount: 0, paymentMode: 'upi', notes: '', vehicleNo: '', transportDocNo: '', ewaybillNo: ''
});

/**
 * Full GST document editor used for invoices, purchase bills, quotations, expenses and returns.
 * Mirrors the server-side totals maths so the preview matches the saved invoice exactly.
 */
export default function DocumentEditor({ business, type, doc, user, onClose, onSaved, toast }) {
  const isUserAdmin = isAdmin(user);
  const [form, setForm] = useState(() => {
    if (!doc) return blank(business, type);
    const docItems = Array.isArray(doc.items)
      ? doc.items
      : (typeof doc.items === 'string' ? JSON.parse(doc.items || '[]') : []);
    return {
      ...blank(business, doc.type || type),
      ...doc,
      isEstimate: doc.is_estimate !== undefined
        ? Boolean(doc.is_estimate)
        : (['invoice', 'sale'].includes(doc.type || type) ? business.default_bill_mode !== 'gst' : false),
      transportation: Number(doc.transportation) || 0,
      loadingCharges: Number(doc.loading_charges || doc.loadingCharges) || 0,
      otherCharges: Number(doc.other_charges ?? doc.bag_charges ?? doc.otherCharges ?? doc.bagCharges ?? doc.bags_charges) || 0,
      items: docItems.length
        ? docItems.map((l) => ({
            ...l,
            product_id: l.product_id || null,
            name: l.name || '',
            hsn: l.hsn || '',
            unit: l.unit || 'pcs',
            qty: Math.abs(Number(l.qty)) || 1,
            rate: Number(l.rate) || 0,
            gstRate: l.gstRate !== undefined ? Number(l.gstRate) : (l.gst_rate !== undefined ? Number(l.gst_rate) : (business.default_gst_rate || 0)),
            discountPct: Number(l.discountPct) || 0,
            discountFlat: Number(l.discountFlat) || Number(l.discount) || 0,
            isReturn: !!(l.isReturn || l.is_return || (Number(l.qty) < 0))
          }))
        : [{ name: '', hsn: '', unit: 'pcs', qty: 1, rate: 0, gstRate: business.default_gst_rate || 0, discountPct: 0, product_id: null, isReturn: false }],
      discountValue: doc.discount_value !== undefined ? Number(doc.discount_value) : (doc.discountValue || 0),
      discountType: doc.discount_type || doc.discountType || 'flat',
      paidAmount: doc.paid_amount !== undefined ? Number(doc.paid_amount) : (doc.paidAmount || 0),
      dueDate: doc.due_date || doc.dueDate || '',
      vehicleNo: doc.vehicle_no || doc.vehicleNo || '',
      transportDocNo: doc.transport_doc_no || doc.transportDocNo || '',
      ewaybillNo: doc.ewaybill_no || doc.ewaybillNo || '',
      partyName: doc.party_name || doc.partyName || '',
      partyId: doc.party_id !== undefined ? doc.party_id : (doc.partyId || null),
      partyGstin: doc.party_gstin || doc.partyGstin || '',
      partyStateCode: doc.party_state_code || doc.partyStateCode || ''
    };
  });
  const [parties, setParties] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showEwb, setShowEwb] = useState(!!doc?.ewaybill_no || false);
  const [showLineDetails, setShowLineDetails] = useState(false);
  const [focusItemIndex, setFocusItemIndex] = useState(null);
  const qtyInputRefs = React.useRef({});
  const rateInputRefs = React.useRef({});

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
  const addLine = () => setForm((f) => ({ ...f, items: [...f.items, { name: '', hsn: '', unit: 'pcs', qty: 1, rate: 0, gstRate: business.default_gst_rate, discountPct: 0, product_id: null, isReturn: false }] }));
  const isDesktopKeyboard = () => typeof window !== 'undefined' && window.innerWidth > 680 && window.matchMedia('(pointer: fine)').matches;
  const focusQtyForDesktop = (index) => {
    if (isDesktopKeyboard()) window.setTimeout(() => { qtyInputRefs.current[index]?.focus(); qtyInputRefs.current[index]?.select(); }, 40);
  };
  const focusItemSearch = (index) => {
    const input = document.getElementById(`doc-item-search-${index}`);
    if (input) { input.focus(); input.click(); }
  };
  useEffect(() => {
    if (focusItemIndex == null || form.items.length <= focusItemIndex) return;
    focusItemSearch(focusItemIndex);
    setFocusItemIndex(null);
  }, [focusItemIndex, form.items.length]);
  const appendAndFocusNextItem = (index) => {
    const nextIndex = index + 1;
    if (nextIndex < form.items.length) focusItemSearch(nextIndex);
    else { setFocusItemIndex(nextIndex); addLine(); }
  };
  const addReturnLine = () => setForm((f) => ({ ...f, items: [...f.items, { name: '', hsn: '', unit: 'pcs', qty: 1, rate: 0, gstRate: business.default_gst_rate, discountPct: 0, product_id: null, isReturn: true }] }));
  const toggleReturn = (i) => setForm((f) => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, isReturn: !it.isReturn } : it) }));
  const dropLine = (i) => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, idx) => idx !== i) : f.items }));

  const supplyType = useMemo(() => {
    const code = String(form.partyStateCode || '').padStart(2, '0');
    const own = String(business.state_code || '').padStart(2, '0');
    if (!code || !own) return 'intra';
    return code === own ? 'intra' : 'inter';
  }, [form.partyStateCode, business.state_code]);

  const t = useMemo(() => totals(form.items, { ...form, supplyType, isEstimate: form.isEstimate }), [
    form.items, form.discountType, form.discountValue, form.roundOff,
    form.transportation, form.loadingCharges, form.otherCharges,
    form.isEstimate,
    supplyType
  ]);

  const pickProduct = (i, p) => {
    if (!p) return setForm((f) => ({
      ...f,
      items: f.items.map((it, idx) => idx === i ? { ...it, product_id: null } : it)
    }));
    setForm((f) => ({
      ...f,
      items: f.items.map((it, idx) => idx === i ? {
        ...it,
        product_id: p.id,
        name: p.name,
        hsn: p.hsn || it.hsn,
        unit: p.unit || it.unit,
        rate: Number(p.sale_price) || Number(p.purchase_price) || it.rate,
        gstRate: p.gst_rate !== undefined ? Number(p.gst_rate) : it.gstRate
      } : it)
    }));
  };

  const chooseParty = (p) => {
    if (!p) return setForm((f) => ({ ...f, partyId: null, partyGstin: '', partyStateCode: '', partyName: '' }));
    setForm((f) => ({
      ...f,
      partyId: p.id || null,
      partyName: p.name || '',
      partyGstin: p.gstin || '',
      partyStateCode: p.state_code || '',
      dueDate: f.dueDate || (p.credit_days || business.credit_days ? new Date(Date.now() + (p.credit_days || business.credit_days) * 86400000).toISOString().slice(0, 10) : '')
    }));
  };

  const save = async (opts = {}) => {
    const andPrint = opts && opts.andPrint;
    setErr('');
    const valid = form.items.filter((l) => String(l.name || '').trim() && Math.abs(Number(l.qty)) > 0 && Number(l.rate) >= 0);
    if (!valid.length) return setErr('Add at least one line item with a name, quantity and rate.');
    if (type !== 'expense' && !form.partyId && !String(form.partyName || '').trim()) {
      return setErr('Choose a customer/supplier, or type a name for a walk-in party.');
    }
    setSaving(true);
    try {
      const finalDate = isUserAdmin ? form.date : (doc ? doc.date : today());
      const payload = {
        ...form,
        is_estimate: form.isEstimate ? 1 : 0,
        partyId: form.partyId || null,
        partyName: String(form.partyName || '').trim() || (type === 'expense' ? '' : 'Walk-in Customer'),
        partyGstin: form.partyGstin || '',
        partyStateCode: form.partyStateCode || '',
        date: finalDate,
        transportation: Number(form.transportation) || 0,
        loadingCharges: Number(form.loadingCharges) || 0,
        otherCharges: Number(form.otherCharges) || 0,
        items: valid.map((l) => ({
          product_id: l.product_id || null,
          name: String(l.name || '').trim(),
          hsn: l.hsn || '',
          unit: l.unit || 'pcs',
          qty: Math.abs(Number(l.qty)) || 1,
          rate: Number(l.rate) || 0,
          gstRate: Number(l.gstRate) || 0,
          discountPct: Number(l.discountPct) || 0,
          discountFlat: Number(l.discountFlat) || 0,
          isReturn: !!l.isReturn
        })),
        supplyType
      };
      const res = doc ? await api.updateDocument(doc.id, payload) : await api.createDocument(payload);
      const savedDoc = res.document;
      if (andPrint && savedDoc && savedDoc.id) {
        window.open(pdfUrl(`invoice/${savedDoc.id}`), '_blank');
      }
      onSaved(savedDoc);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const isInvoiceType = type === 'invoice' || type === 'sale' || (doc && (doc.type === 'invoice' || doc.type === 'sale'));
  const title = doc
    ? (form.isEstimate ? `Edit Estimate Bill ${doc.number}` : `Edit ${TYPE_LABEL[doc.type]} ${doc.number}`)
    : (form.isEstimate && isInvoiceType ? 'New Estimate Bill' : `New ${TYPE_LABEL[type]}`);

  return (
    <Modal
      title={title}
      sub={form.isEstimate && isInvoiceType
        ? 'Retail Cash Memo / Non-GST Estimate · Stock & Khata updated'
        : `${business.name}${business.gstin ? ' · GSTIN ' + business.gstin : ''}`}
      size="xwide"
      onClose={onClose}
      footer={
        <div className="doc-modal-footer">
          <div className="doc-footer-hint">
            {type !== 'expense' && (
              form.isEstimate
                ? '📋 Estimate Bill · Clean format · Real-world stock & khata tracking · Excluded from GSTR-1/3B'
                : (supplyType === 'inter' ? 'Inter-state supply · IGST applies' : 'Intra-state supply · CGST + SGST apply')
            )}
          </div>
          <div className="doc-footer-buttons">
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
          </div>
        </div>
      }
    >
      {err && <div className="banner err"><Icon.alert size={15} />{err}</div>}

      {/* Dual Billing Mode Selector (~80% Estimate, ~20% Official GST) */}
      {isInvoiceType && (
        <div
          style={{
            marginBottom: 12,
            padding: '9px 12px',
            borderRadius: 10,
            background: form.isEstimate ? '#f8fafc' : '#eff6ff',
            border: `1.5px solid ${form.isEstimate ? '#cbd5e1' : '#3b82f6'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Billing Mode:</span>
            <div style={{ display: 'inline-flex', borderRadius: 8, padding: 2, background: '#e2e8f0' }}>
              <button
                type="button"
                onClick={() => set('isEstimate', true)}
                style={{
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  background: form.isEstimate ? '#ffffff' : 'transparent',
                  color: form.isEstimate ? '#0f172a' : '#64748b',
                  boxShadow: form.isEstimate ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                📋 Estimate Bill (~80%)
              </button>
              <button
                type="button"
                onClick={() => set('isEstimate', false)}
                style={{
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  background: !form.isEstimate ? '#2563eb' : 'transparent',
                  color: !form.isEstimate ? '#ffffff' : '#64748b',
                  boxShadow: !form.isEstimate ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                🏛️ Official GST Bill (~20%)
              </button>
            </div>

            <span style={{ fontSize: 12, color: form.isEstimate ? '#64748b' : '#1d4ed8', fontWeight: 500 }}>
              {form.isEstimate
                ? 'Series: EST-1, EST-2... · Clean print without business name/GSTIN'
                : `Series: ${business.invoice_prefix || 'INV-'}... · Official Tax Invoice with GSTIN`}
            </span>
          </div>

          <span
            className="badge sm"
            style={{
              background: form.isEstimate ? '#f1f5f9' : '#dbeafe',
              color: form.isEstimate ? '#475569' : '#1e40af',
              border: `1px solid ${form.isEstimate ? '#cbd5e1' : '#93c5fd'}`,
              fontWeight: 650
            }}
          >
            {form.isEstimate ? 'Estimate Mode · Non-GST' : 'Official GST Invoice'}
          </span>
        </div>
      )}

      <div className="form-grid c3">
        <Field label={type === 'purchase' ? 'Supplier' : type === 'expense' ? 'Expense head' : 'Billed to'} req={type !== 'expense'}>
          {type === 'expense'
            ? <input className="input" value={form.partyName} onChange={(e) => set('partyName', e.target.value)} placeholder="e.g. Diesel & Logistics" />
            : (
              <>
                <Picker
                  items={parties}
                  value={form.partyName ? { id: form.partyId, name: form.partyName } : (form.partyId ? { id: form.partyId, name: '' } : null)}
                  onChange={chooseParty}
                  onTextChange={(text) => setForm((f) => ({ ...f, partyName: text, partyId: null }))}
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
        <Field
          label={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>Document date</span>
              {!isUserAdmin && (
                <span className="badge sm warn" style={{ fontSize: 10, padding: '1px 6px', fontWeight: 650 }}>
                  🔒 Locked · Admin only
                </span>
              )}
            </div>
          }
          hint={
            isUserAdmin
              ? 'Admin authorized · Indian Standard Time (+5:30)'
              : 'Indian Standard Time (+5:30) · Client system clock sync disabled'
          }
        >
          <input
            type="date"
            className="input"
            value={form.date}
            disabled={!isUserAdmin}
            readOnly={!isUserAdmin}
            onChange={(e) => isUserAdmin && set('date', e.target.value)}
            style={!isUserAdmin ? { backgroundColor: 'var(--bg-subtle, #f8fafc)', cursor: 'not-allowed', opacity: 0.85, fontWeight: 600 } : {}}
            title={!isUserAdmin ? 'Only Admin can edit or backdate bill date. Region: Indian Standard Time (+5:30).' : 'Indian Standard Time (+5:30)'}
          />
        </Field>
        {type !== 'expense' && (
          <Field label="GSTIN (party)" hint="Optional for B2B invoices">
            <input className="input" value={form.partyGstin} onChange={(e) => set('partyGstin', e.target.value.toUpperCase())} placeholder="29AAAAA1111A1Z1" />
          </Field>
        )}
      </div>

      <hr className="divider" style={{ margin: '8px 0' }} />

      <div className="lines">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 13.5 }}>Items</h3>
          <div className="spacer" />
          <button type="button" className="btn sm" onClick={() => { const index = form.items.length; if (isDesktopKeyboard()) setFocusItemIndex(index); addLine(); }}><Icon.plus size={14} /> Add line</button>
          <button type="button" className={`btn sm ${showLineDetails ? 'primary' : ''}`} onClick={() => setShowLineDetails((v) => !v)} title="Show or hide optional HSN/SAC, unit and discount fields">
            {showLineDetails ? 'Hide optional fields' : 'More item fields'}
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={addReturnLine}
            style={{ color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2', fontWeight: 650 }}
            title="Customer returned goods - amount is deducted (less) from the bill and restocked"
          >
            ↩ Add Return / Less item
          </button>
        </div>
        <div className={`doc-tbl-wrap ${showLineDetails ? '' : 'quick-entry'}`}>
          <table className="tbl doc-tbl">
            <thead>
              <tr>
                <th style={{ width: showLineDetails ? '28%' : '38%' }}>Item / service</th>
                {showLineDetails && <th style={{ width: 78 }}>HSN/SAC</th>}
                <th style={{ width: 66 }}>Qty</th>
                {showLineDetails && <th style={{ width: 62 }}>Unit</th>}
                <th style={{ width: 92 }}>Rate</th>
                {showLineDetails && <th style={{ width: 62 }}>Disc %</th>}
                <th style={{ width: 76 }}>{form.isEstimate ? 'Tax' : 'GST %'}</th>
                <th className="num" style={{ width: 96 }}>Amount</th>
                <th style={{ width: 34 }} />
              </tr>
            </thead>
            <tbody>
              {form.items.map((it, i) => {
                const isRet = !!it.isReturn;
                const absQty = Math.abs(Number(it.qty)) || 0;
                const gross = absQty * (Number(it.rate) || 0);
                const afterDisc = isRet ? gross : (gross - (gross * (Number(it.discountPct) || 0)) / 100 - (Number(it.discountFlat) || 0));
                const lineAmount = form.isEstimate ? afterDisc : (afterDisc * (1 + (Number(it.gstRate) || 0) / 100));
                return (
                  <tr key={i} style={{ position: 'relative', zIndex: form.items.length - i + 10, background: isRet ? 'rgba(239, 68, 68, 0.05)' : 'inherit' }}>
                    <td data-label="Item / service">
                      <Picker
                        items={products}
                        inputId={`doc-item-search-${i}`}
                        value={it.name ? { id: it.product_id, name: it.name } : null}
                        onChange={(p) => {
                          pickProduct(i, p);
                          focusQtyForDesktop(i);
                        }}
                        onTextChange={(text) => setItem(i, 'name', text)}
                        placeholder="Type or pick an item…"
                        onAddNew={async (name) => {
                          const p = await api.createProduct({ name, gst_rate: business.default_gst_rate });
                          setProducts((old) => [...old, p.product]);
                          pickProduct(i, p.product);
                          focusQtyForDesktop(i);
                          toast(`Added ${name} to inventory`, 'ok');
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <button
                          type="button"
                          className="btn xs"
                          style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            height: 20,
                            borderRadius: 4,
                            color: isRet ? '#dc2626' : 'var(--muted)',
                            borderColor: isRet ? '#f87171' : 'var(--line)',
                            background: isRet ? '#fee2e2' : 'transparent',
                            fontWeight: isRet ? 700 : 500
                          }}
                          onClick={() => toggleReturn(i)}
                          title="Click to toggle between normal sale item and customer return"
                        >
                          {isRet ? '↩ Return (Deducted)' : '+ Normal item'}
                        </button>
                        {isRet && (
                          <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 650 }}>
                            Less from bill & restocks +{absQty}
                          </span>
                        )}
                      </div>
                    </td>
                    {showLineDetails && <td data-label="HSN/SAC"><input className="input" value={it.hsn || ''} onChange={(e) => setItem(i, 'hsn', e.target.value)} /></td>}
                    <td data-label="Qty">
                      <input
                        ref={(el) => { qtyInputRefs.current[i] = el; }}
                        id={`doc-item-qty-${i}`}
                        className="input"
                        type="number"
                        min="1"
                        value={absQty}
                        onChange={(e) => setItem(i, 'qty', Math.abs(Number(e.target.value)))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && isDesktopKeyboard()) { e.preventDefault(); rateInputRefs.current[i]?.focus(); rateInputRefs.current[i]?.select(); } }}
                        style={isRet ? { color: '#dc2626', fontWeight: 600 } : {}}
                      />
                    </td>
                    {showLineDetails && <td data-label="Unit"><input className="input" value={it.unit || ''} onChange={(e) => setItem(i, 'unit', e.target.value)} /></td>}
                    <td data-label="Rate"><input
                      ref={(el) => { rateInputRefs.current[i] = el; }}
                      id={`doc-item-rate-${i}`}
                      className="input"
                      type="number"
                      value={it.rate}
                      onChange={(e) => setItem(i, 'rate', Number(e.target.value))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && isDesktopKeyboard()) { e.preventDefault(); appendAndFocusNextItem(i); } }}
                    /></td>
                    {showLineDetails && <td data-label="Discount"><input className="input" type="number" disabled={isRet} value={isRet ? '' : (it.discountPct || '')} onChange={(e) => setItem(i, 'discountPct', Number(e.target.value))} /></td>}
                    <td data-label={form.isEstimate ? 'Tax' : 'GST'} style={{ minWidth: 96 }}>
                      {form.isEstimate ? (
                        <span className="badge sm" style={{ background: '#f1f5f9', color: '#64748b', fontSize: 11, padding: '3px 6px' }}>
                          0% Non-GST
                        </span>
                      ) : (
                        <GstRateInput value={it.gstRate} onChange={(r) => setItem(i, 'gstRate', r)} />
                      )}
                    </td>
                    <td data-label="Amount" className="num strong" style={{ color: isRet ? '#dc2626' : 'inherit' }}>
                      {isRet ? '-' : ''}{money(lineAmount)}
                    </td>
                    <td data-label="Remove"><button className="icon-btn danger" onClick={() => dropLine(i)}><Icon.trash size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="doc-summary-grid">
        <div>
          {/* Logistics & Other Charges */}
          <div style={{
            background: 'var(--surface-2)',
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid var(--line)',
            marginBottom: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', marginBottom: 8 }}>
              <Icon.truck size={15} style={{ color: 'var(--brand)' }} />
              Logistics & Other Charges
            </div>
            <div className="form-grid c3">
              <Field label="Transportation (₹)" hint="Freight">
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="input"
                  value={form.transportation || ''}
                  onChange={(e) => set('transportation', e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Loading Charges (₹)" hint="Hamali">
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="input"
                  value={form.loadingCharges || ''}
                  onChange={(e) => set('loadingCharges', e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Other Charges (₹)" hint="Enter amount only">
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="input"
                  value={form.otherCharges || ''}
                  onChange={(e) => set('otherCharges', e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="0.00"
                />
              </Field>
            </div>
          </div>

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

          <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => setShowEwb(!showEwb)}>
            <Icon.truck size={14} /> {showEwb ? 'Hide additional / transport options' : 'Additional options (E-Way Bill, Transport, Due date, State code)'}
          </button>
          {showEwb && (
            <div className="form-grid c3" style={{ marginTop: 8 }}>
              <Field label="E-Way Bill no"><input className="input" value={form.ewaybillNo} onChange={(e) => set('ewaybillNo', e.target.value)} placeholder="Leave blank to generate after saving" /></Field>
              <Field label="Vehicle no"><input className="input" value={form.vehicleNo} onChange={(e) => set('vehicleNo', e.target.value)} placeholder="KA19AB1234" /></Field>
              <Field label="LR / transport doc no"><input className="input" value={form.transportDocNo} onChange={(e) => set('transportDocNo', e.target.value)} /></Field>
              {type !== 'expense' && <Field label="Due date"><input type="date" className="input" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>}
              {type !== 'expense' && <Field label="Place of supply (State code)"><input className="input" value={form.partyStateCode} onChange={(e) => set('partyStateCode', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Auto-detected" title="Auto-detected from customer GSTIN or state" /></Field>}
            </div>
          )}
        </div>

        <div className="tot-box">
          <Row label="Subtotal" value={t.subtotal} />
          {t.returnAmount > 0 && (
            <div className="kv" style={{ color: '#dc2626' }}>
              <span className="k" style={{ fontWeight: 650 }}>↩ Returned items (Less)</span>
              <span className="v" style={{ fontWeight: 700 }}>-{money(t.returnAmount)}</span>
            </div>
          )}
          {t.lineDiscount > 0 && <Row label="Line discount" value={-t.lineDiscount} />}
          {t.docDiscount > 0 && <Row label={`Bill discount (${form.discountType === 'pct' ? form.discountValue + '%' : 'flat'})`} value={-t.docDiscount} />}
          {!form.isEstimate ? (
            <>
              <Row label="Taxable value" value={t.taxableValue} strong />
              {supplyType === 'inter'
                ? <Row label="IGST" value={t.igst} />
                : <><Row label="CGST" value={t.cgst} /><Row label="SGST / UTGST" value={t.sgst} /></>}
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#64748b', padding: '3px 0' }}>
              <span>GST (0% Non-GST Estimate):</span>
              <span style={{ fontWeight: 600 }}>₹0.00</span>
            </div>
          )}
          {Number(form.transportation) > 0 && <Row label="Transportation" value={Number(form.transportation)} />}
          {Number(form.loadingCharges) > 0 && <Row label="Loading charges" value={Number(form.loadingCharges)} />}
          {Number(form.otherCharges) > 0 && <Row label="Other charges" value={Number(form.otherCharges)} />}
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
                  title="Mark current bill fully paid"
                >
                  Bill ({money(t.total)})
                </button>
                {selectedParty && Number(selectedParty.balance) > 0.01 && (
                  <button
                    type="button"
                    className="btn xs"
                    style={{ fontSize: 10, padding: '1px 5px', height: 20, background: '#fef2f2', color: '#b91c1c', borderColor: '#fca5a5', fontWeight: 650 }}
                    onClick={() => set('paidAmount', Math.round((t.total + Number(selectedParty.balance)) * 100) / 100)}
                    title="Pay Current Bill + Full Previous Balance"
                  >
                    All ({money(t.total + Number(selectedParty.balance))})
                  </button>
                )}
              </div>
            </div>
            {/* Amount received and Payment Type placed right beside each other near Total */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 6, alignItems: 'center' }}>
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

              <div>
                <select
                  className="input"
                  style={{ height: 30, fontSize: 11.5, fontWeight: 600, padding: '2px 6px', width: '100%' }}
                  value={form.paymentMode}
                  onChange={(e) => set('paymentMode', e.target.value)}
                  title="Payment Type"
                >
                  <option value="upi">UPI / QR</option>
                  <option value="cash">CASH</option>
                  <option value="bank">NET BANKING</option>
                  <option value="card">CARD</option>
                  <option value="cheque">CHEQUE</option>
                  <option value="credit">CREDIT</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: 11.5, paddingTop: 4, borderTop: '1px dashed var(--line)' }}>
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}>This bill due:</span>
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
            {Number(form.paidAmount) > t.total + 0.005 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                <span>Paid towards previous due:</span>
                <span>+{money(Number(form.paidAmount) - t.total)}</span>
              </div>
            )}
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

export const TYPE_LABEL = { sale: 'Invoice', purchase: 'Purchase Bill', quotation: 'Quotation', expense: 'Expense', sale_return: 'Sales Return (Credit Note)' };

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
  const isEstimate = Boolean(opts && (opts.isEstimate || opts.is_estimate));
  let returnAmount = 0;
  const lines = (items || []).filter((i) => i && i.name).map((raw) => {
    const isReturn = !!(raw.isReturn || raw.is_return || (Number(raw.qty) < 0));
    const qty = isReturn ? Math.abs(Number(raw.qty) || 0) : (Number(raw.qty) || 0);
    const gstRate = isEstimate ? 0 : Number(raw.gstRate || 0);
    const rate = Number(raw.rate) || 0;
    const absGross = r2(qty * rate);
    const gross = isReturn ? -absGross : absGross;
    const disc = isReturn ? 0 : r2((absGross * (Number(raw.discountPct) || 0)) / 100 + (Number(raw.discountFlat) || 0));
    const taxable = isReturn ? -absGross : r2(Math.max(0, gross - disc));
    if (isReturn) {
      returnAmount = r2(returnAmount + absGross * (isEstimate ? 1 : (1 + (Number(raw.gstRate || 0)) / 100)));
    }
    return { isReturn, gross, disc, taxable, gstRate, rate, qty };
  });

  const posLines = lines.filter((l) => !l.isReturn);
  const posSubtotal = r2(posLines.reduce((s, l) => s + l.gross, 0));
  const lineDiscount = r2(posLines.reduce((s, l) => s + l.disc, 0));
  const afterLine = r2(posSubtotal - lineDiscount);

  let docDiscount = 0;
  if (Number(opts.discountValue) && afterLine > 0) {
    docDiscount = r2(opts.discountType === 'pct' ? (afterLine * Number(opts.discountValue)) / 100 : Number(opts.discountValue));
    docDiscount = Math.min(docDiscount, afterLine);
  }

  const subtotal = r2(lines.reduce((s, l) => s + l.gross, 0));
  const netDiscounted = r2(lines.reduce((s, l) => s + l.taxable, 0) - docDiscount);
  const taxableValue = isEstimate ? 0 : netDiscounted;
  const isInter = opts.supplyType === 'inter';
  const taxTotal = isEstimate ? 0 : r2((taxableValue * weightedRate(lines, taxableValue)) / 100);
  const cgst = (isEstimate || isInter) ? 0 : r2(taxTotal / 2);
  const sgst = (isEstimate || isInter) ? 0 : r2(taxTotal / 2);
  const igst = (isEstimate || !isInter) ? 0 : taxTotal;
  const transportation = r2(Number(opts.transportation) || 0);
  const loadingCharges = r2(Number(opts.loadingCharges || opts.loading_charges) || 0);
  const otherCharges = r2(Number(opts.otherCharges ?? opts.other_charges ?? opts.bagCharges ?? opts.bag_charges ?? opts.bags_charges) || 0);
  const preTotal = isEstimate
    ? r2(netDiscounted + transportation + loadingCharges + otherCharges)
    : r2(taxableValue + taxTotal + transportation + loadingCharges + otherCharges);
  const total = opts.roundOff ? Math.round(preTotal) : preTotal;
  return {
    subtotal, lineDiscount, docDiscount, taxableValue, cgst, sgst, igst,
    transportation, loadingCharges, otherCharges, returnAmount,
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
