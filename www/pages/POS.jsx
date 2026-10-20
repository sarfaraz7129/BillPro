import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, money, pdfUrl, today } from '../src/api.js';
import { Icon } from '../src/ui.jsx';
import { Field, Modal, Empty, GstRateInput } from '../src/components.jsx';
import { totals } from '../src/DocumentEditor.jsx';
import ThermalReceiptModal from '../src/ThermalReceipt.jsx';
import WhatsAppModal from '../src/WhatsAppModal.jsx';

/** Counter-style billing: tap an item, adjust qty, take payment, done. */
export default function POS({ business, toast }) {
  const [products, setProducts] = useState([]);
  const [parties, setParties] = useState([]);
  const [party, setParty] = useState(null);
  const [lines, setLines] = useState([]);
  const [q, setQ] = useState('');
  const [barcode, setBarcode] = useState('');
  const [paid, setPaid] = useState(0);
  const [mode, setMode] = useState('upi');
  const [saving, setSaving] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [thermalDoc, setThermalDoc] = useState(null);
  const [whatsAppDoc, setWhatsAppDoc] = useState(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const scanRef = useRef(null);

  useEffect(() => {
    api.products().then((r) => setProducts(r.products)).catch(() => {});
    api.parties({ type: 'customer' }).then((r) => setParties(r.parties)).catch(() => {});
  }, [business.id]);

  const supplyType = party && party.state_code && String(party.state_code).padStart(2, '0') !== String(business.state_code || '').padStart(2, '0') ? 'inter' : 'intra';
  const t = useMemo(() => totals(lines, { discountValue: 0, discountType: 'flat', roundOff: true, supplyType }), [lines, supplyType]);

  const add = (p) => {
    setLines((old) => {
      const i = old.findIndex((l) => l.product_id === p.id);
      if (i >= 0) return old.map((l, idx) => (idx === i ? { ...l, qty: l.qty + 1 } : l));
      return [...old, { product_id: p.id, name: p.name, hsn: p.hsn, unit: p.unit, qty: 1, rate: Number(p.sale_price) || 0, gstRate: p.gst_rate, discountPct: 0 }];
    });
  };
  const setQty = (i, qty) => setLines((old) => old.map((l, idx) => (idx === i ? { ...l, qty: Number(qty) } : l)).filter((l) => l.qty > 0));
  const setRate = (i, rate) => setLines((old) => old.map((l, idx) => (idx === i ? { ...l, rate: Number(rate) } : l)));

  const scan = async (e) => {
    e.preventDefault();
    if (!barcode) return;
    try {
      const r = await api.byBarcode(barcode);
      add(r.product);
      setBarcode('');
    } catch (err) {
      toast(err.message, 'err');
    }
  };

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    if (!needle) return products.slice(0, 60);
    return products.filter((p) => [p.name, p.sku, p.barcode, p.category].some((f) => String(f || '').toLowerCase().includes(needle)));
  }, [q, products]);

  const save = async () => {
    if (!lines.length) return toast('Add at least one item', 'err');
    setSaving(true);
    try {
      const res = await api.createDocument({
        type: 'sale',
        partyId: party ? party.id : null,
        partyName: party ? party.name : 'Walk-in Customer',
        partyGstin: party ? party.gstin : '',
        partyStateCode: party ? party.state_code : '',
        date: today(),
        dueDate: '',
        items: lines,
        paidAmount: Math.min(paid, t.total),
        paymentMode: mode,
        supplyType,
        roundOff: true
      });
      setLastDoc(res.document);
      setCustomerPhone((party && party.phone) || '');
      setLines([]); setPaid(0); setQ('');
      api.products().then((r) => setProducts(r.products));
      api.parties({ type: 'customer' }).then((r) => setParties(r.parties));
      toast(`${res.document.number} · ${money(res.document.total)}`, 'ok');
      if (scanRef.current) scanRef.current.focus();
    } catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  };

  const shortcuts = [
    { k: 'F2', fn: () => document.getElementById('pos-scan') && document.getElementById('pos-scan').focus() },
    { k: 'F9', fn: save }
  ];
  useEffect(() => {
    const h = (e) => {
      const s = shortcuts.find((x) => x.k === e.key);
      if (s) { e.preventDefault(); s.fn(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lines, paid, party]);

  return (
    <>
      <div className="pos">
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-b">
              <div className="grid" style={{ gridTemplateColumns: '1fr 240px', gap: 10 }}>
                <div className="search">
                  <Icon.search size={15} />
                  <input className="input" placeholder="Search items by name, SKU or category…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
                </div>
                <form onSubmit={scan} className="search">
                  <Icon.barcode size={15} />
                  <input id="pos-scan" ref={scanRef} className="input" placeholder="Scan barcode + Enter" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                </form>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><Icon.box size={16} /><h3>Tap to add</h3>
              <div className="spacer" /><span className="pill grey">{filtered.length} items</span></div>
            <div className="card-b">
              {filtered.length === 0 ? <Empty title="No matching items" hint="Add products under Inventory to bill them here." /> : (
                <div className="quick-grid">
                  {filtered.map((p) => (
                    <button className="quick" key={p.id} onClick={() => add(p)}>
                      <b>{p.name}</b>
                      <span>{money(p.sale_price)} / {p.unit}</span>
                      <span className={`st ${p.stock <= (p.low_stock_at || 0) ? 'neg' : 'muted'}`}>{p.stock} {p.unit} in stock</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ position: 'sticky', top: 74 }}>
          <div className="card-h">
            <Icon.pos size={16} /><h3>Current bill</h3>
            <div className="spacer" />
            {lines.length > 0 && <button className="btn sm ghost" onClick={() => { setLines([]); setPaid(0); }}>Clear</button>}
          </div>
          <div className="card-b">
            <Field label="Customer">
              <select className="input" value={party ? party.id : ''} onChange={(e) => setParty(parties.find((p) => String(p.id) === e.target.value) || null)}>
                <option value="">Walk-in customer</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.balance ? ` (${p.balance > 0 ? 'Due ' + money(p.balance) : 'Adv ' + money(Math.abs(p.balance))})` : ''}{p.gstin ? ' [GST]' : ''}
                  </option>
                ))}
              </select>
            </Field>

            {party && (
              <div
                style={{
                  marginTop: 6,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: party.balance > 0 ? '#fef2f2' : party.balance < 0 ? '#f0fdf4' : '#f8fafc',
                  border: `1px solid ${party.balance > 0 ? '#fecaca' : party.balance < 0 ? '#bbf7d0' : '#e2e8f0'}`,
                  fontSize: 12
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{party.name}</div>
                  <span className={`pill sm ${party.balance > 0 ? 'red' : party.balance < 0 ? 'green' : 'grey'}`}>
                    {party.balance > 0 ? `To Collect: ${money(party.balance)}` : party.balance < 0 ? `Advance: ${money(Math.abs(party.balance))}` : 'Settled (₹0)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, color: '#64748b', fontSize: 11 }}>
                  <span>{party.phone ? `📞 ${party.phone}` : 'No phone'} · {party.city || party.gstin || 'Customer'}</span>
                  {party.credit_limit > 0 && (
                    <span>
                      Limit: {money(party.credit_limit)}
                      {party.overLimit && <span style={{ color: '#dc2626', fontWeight: 600, marginLeft: 3 }}>⚠️ Over</span>}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="pos-items" style={{ marginTop: 12 }}>
              {lines.length === 0 ? <div className="hint" style={{ padding: '18px 0', textAlign: 'center' }}>Search or tap an item to start the bill.</div> : (
                <table className="tbl">
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="strong" style={{ fontSize: 12.5 }}>{l.name}</div>
                            <button
                              type="button"
                              className="icon-btn danger sm"
                              style={{ width: 22, height: 22, padding: 0 }}
                              onClick={() => setLines((old) => old.filter((_, idx) => idx !== i))}
                              title="Remove item"
                            >
                              <Icon.trash size={12} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Rate:</span>
                            <input className="input" style={{ width: 72, padding: '3px 6px', fontSize: 12 }} type="number" value={l.rate} onChange={(e) => setRate(i, e.target.value)} />
                            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>GST:</span>
                            <GstRateInput
                              style={{ width: 84 }}
                              className="input"
                              value={l.gstRate}
                              onChange={(r) => setLines((old) => old.map((x, idx) => idx === i ? { ...x, gstRate: r } : x))}
                            />
                          </div>
                        </td>
                        <td style={{ width: 68, verticalAlign: 'top', paddingTop: 8 }}>
                          <input className="input" style={{ padding: '4px 6px', fontSize: 12 }} type="number" value={l.qty} onChange={(e) => setQty(i, e.target.value)} />
                        </td>
                        <td className="num strong" style={{ width: 84, verticalAlign: 'top', paddingTop: 10 }}>
                          {money(l.qty * l.rate * (1 + l.gstRate / 100))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pos-sum">
              <div className="kv"><span className="k">Taxable</span><span className="v">{money(t.taxableValue)}</span></div>
              {supplyType === 'inter'
                ? <div className="kv"><span className="k">IGST</span><span className="v">{money(t.igst)}</span></div>
                : <>
                  <div className="kv"><span className="k">CGST</span><span className="v">{money(t.cgst)}</span></div>
                  <div className="kv"><span className="k">SGST</span><span className="v">{money(t.sgst)}</span></div>
                </>}
              <div className="pos-total"><span style={{ fontWeight: 650 }}>Payable</span><span className="v">{money(t.total)}</span></div>
            </div>

            <div className="grid g2" style={{ marginTop: 12 }}>
              <Field label="Received"><input className="input" type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value))} /></Field>
              <Field label="Mode">
                <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                  {['upi', 'cash', 'card', 'bank', 'cheque'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                </select>
              </Field>
            </div>
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button className="btn sm" onClick={() => setPaid(t.total)}>Exact</button>
              {[100, 500, 1000].map((n) => <button key={n} className="btn sm" onClick={() => setPaid(Math.ceil(t.total / n) * n)}>Round {n}</button>)}
            </div>
            {paid > t.total && <div className="kv" style={{ marginTop: 8 }}><span className="k">Return change</span><span className="v pos">{money(paid - t.total)}</span></div>}

            {party && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px dashed var(--line)', fontSize: 11.5 }}>
                <div className="kv" style={{ marginBottom: 2 }}>
                  <span className="k">Previous Khata Balance</span>
                  <span className="v" style={{ fontWeight: 600, color: party.balance > 0 ? '#dc2626' : party.balance < 0 ? '#16a34a' : 'inherit' }}>
                    {party.balance > 0 ? `${money(party.balance)} (Dr Due)` : party.balance < 0 ? `${money(Math.abs(party.balance))} (Cr Adv)` : '₹0.00'}
                  </span>
                </div>
                <div className="kv" style={{ marginBottom: 2 }}>
                  <span className="k">+ Current Bill</span>
                  <span className="v">+{money(t.total)}</span>
                </div>
                {paid > 0 && (
                  <div className="kv" style={{ marginBottom: 2 }}>
                    <span className="k">- Receiving Now</span>
                    <span className="v pos">-{money(Math.min(paid, t.total))}</span>
                  </div>
                )}
                <div className="kv" style={{ fontWeight: 700, paddingTop: 3, borderTop: '1px solid var(--line)', marginTop: 3 }}>
                  <span className="k" style={{ color: 'var(--ink)' }}>Net Closing Khata</span>
                  <span className="v" style={{ color: ((party.balance || 0) + t.total - Math.min(paid, t.total)) > 0 ? '#dc2626' : ((party.balance || 0) + t.total - Math.min(paid, t.total)) < 0 ? '#16a34a' : 'inherit' }}>
                    {(() => {
                      const net = (party.balance || 0) + t.total - Math.min(paid, t.total);
                      return net > 0 ? `${money(net)} (Due)` : net < 0 ? `${money(Math.abs(net))} (Adv)` : '₹0.00 (Settled)';
                    })()}
                  </span>
                </div>
              </div>
            )}

            <button className="btn primary lg block" style={{ marginTop: 12 }} onClick={save} disabled={saving || !lines.length}>
              {saving ? 'Saving…' : `Save bill (F9) · ${money(t.total)}`}
            </button>
            <div className="hint" style={{ textAlign: 'center', marginTop: 8 }}>F2 focuses the barcode field · stock updates automatically</div>
          </div>
        </div>
      </div>

      {lastDoc && (
        <Modal
          title={`Bill saved · ${lastDoc.number}`}
          sub={`${money(lastDoc.total)} · ${lastDoc.party_name}`}
          onClose={() => setLastDoc(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setLastDoc(null)}>+ New bill (F2)</button>
              <button
                type="button"
                className="btn green"
                style={{ fontWeight: 650 }}
                onClick={() => setWhatsAppDoc(lastDoc)}
              >
                <Icon.whatsapp size={15} /> WhatsApp
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ fontWeight: 650 }}
                onClick={() => setThermalDoc(lastDoc)}
              >
                <Icon.print size={15} /> 🧾 Print Thermal Slip
              </button>
            </>
          }
        >
          <div className="grid g2" style={{ marginBottom: 12 }}>
            <div className="kv"><span className="k">Customer</span><span className="v">{lastDoc.party_name}</span></div>
            <div className="kv"><span className="k">Items</span><span className="v">{lastDoc.items.length}</span></div>
            <div className="kv"><span className="k">Paid</span><span className="v pos">{money(lastDoc.paid_amount)}</span></div>
            <div className="kv"><span className="k">Balance</span><span className="v neg">{money(lastDoc.due_amount)}</span></div>
          </div>
          {lastDoc.due_amount > 0 && (
            <div className="hint" style={{ marginBottom: 14 }}>
              The balance of {money(lastDoc.due_amount)} has been added to customer's khata.
            </div>
          )}

          {/* Quick WhatsApp Share Box directly in POS completion */}
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10,
            padding: '12px 14px', marginTop: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontWeight: 650, fontSize: 13, color: '#059669' }}>
              <Icon.whatsapp size={16} /> Send Bill to Customer's WhatsApp
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--surface)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)' }}>+91</span>
                <input
                  className="input"
                  placeholder="Enter 10-digit WhatsApp number"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  style={{ flex: 1, fontSize: 13, fontWeight: 600 }}
                />
              </div>
              <button
                type="button"
                className="btn green"
                style={{ whiteSpace: 'nowrap' }}
                onClick={() => {
                  const digits = customerPhone.replace(/\D/g, '');
                  if (!digits) {
                    setWhatsAppDoc(lastDoc);
                  } else {
                    const clean = digits.length === 10 ? '91' + digits : digits;
                    const pdfUrl = `${window.location.origin}/api/documents/${lastDoc.id}/pdf`;
                    const msg = `Dear ${lastDoc.party_name || 'Customer'},\n\nThank you for shopping at *${business.name}*!\nTax Invoice: *${lastDoc.number}*\nAmount: *${money(lastDoc.total)}*\n\n📄 View / Download Bill: ${pdfUrl}\n\nThank you! Visit again.`;
                    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
                    toast(`Opening WhatsApp for +${clean}`, 'ok');
                  }
                }}
              >
                <Icon.whatsapp size={14} /> Send WhatsApp
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn sm"
              onClick={() => window.open(pdfUrl(`invoice/${lastDoc.id}`), '_blank')}
            >
              <Icon.download size={13} /> Full A4 Tax Invoice (PDF)
            </button>
          </div>
        </Modal>
      )}

      {thermalDoc && (
        <ThermalReceiptModal
          doc={thermalDoc}
          business={business}
          onClose={() => setThermalDoc(null)}
          onWhatsApp={(d) => setWhatsAppDoc(d)}
          toast={toast}
        />
      )}

      {whatsAppDoc && (
        <WhatsAppModal
          doc={whatsAppDoc}
          party={party}
          business={business}
          onClose={() => setWhatsAppDoc(null)}
          toast={toast}
        />
      )}
    </>
  );
}
