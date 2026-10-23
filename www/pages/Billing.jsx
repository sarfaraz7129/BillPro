import React, { useEffect, useState } from 'react';
import { api, money, fmtDate, pdfUrl, today } from '../src/api.js';
import { Icon } from '../src/ui.jsx';
import { Modal, PayPill, Empty, Confirm, DateRange, Field } from '../src/components.jsx';
import DocumentEditor, { TYPE_LABEL } from '../src/DocumentEditor.jsx';
import ThermalReceiptModal from '../src/ThermalReceipt.jsx';
import WhatsAppModal from '../src/WhatsAppModal.jsx';

const TABS = [
  { id: 'sale', label: 'Invoices', icon: 'invoice' },
  { id: 'purchase', label: 'Purchases', icon: 'bill' },
  { id: 'quotation', label: 'Quotations', icon: 'file' },
  { id: 'expense', label: 'Expenses', icon: 'wallet' }
];

export default function Billing({ business, user, initialType, initialDocId, goto, toast }) {
  const [type, setType] = useState(initialType || 'sale');
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [range, setRange] = useState({ from: '2000-01-01', to: '2999-12-31' });
  const [editor, setEditor] = useState(null);
  const [view, setView] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [share, setShare] = useState(null);
  const [thermalDoc, setThermalDoc] = useState(null);
  const [thermalParty, setThermalParty] = useState(null);
  const [thermalWidth, setThermalWidth] = useState('80');
  const [whatsAppModal, setWhatsAppModal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (initialType) setType(initialType); }, [initialType]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.documents({ type, q, status, from: range.from, to: range.to });
      setRows(r.documents);
      setTotals(r.totals);
    } catch (e) { toast(e.message, 'err'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [type, q, status, range.from, range.to, business.id]);

  useEffect(() => {
    if (initialDocId && initialDocId !== 'new' && !view) {
      api.document(initialDocId).then(setView).catch(() => {});
    }
    if (initialDocId === 'new' && !editor) setEditor({ type });
  }, [initialDocId]);

  const remove = async (doc) => {
    try {
      if (doc.type === 'sale') await api.cancelDocument(doc.id);
      else await api.deleteDocument(doc.id);
      toast(doc.type === 'sale' ? `${doc.number} cancelled - stock restored` : `${doc.number} deleted`, 'ok');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          {TABS.map((t) => {
            const I = Icon[t.icon];
            return <button key={t.id} className={type === t.id ? 'on' : ''} onClick={() => setType(t.id)}><I size={13} /> {t.label}</button>;
          })}
        </div>
        <div className="grow search">
          <Icon.search size={15} />
          <input className="input" placeholder="Search by number, party or GSTIN…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {type !== 'expense' && (
          <select className="input" style={{ width: 140 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option>
          </select>
        )}
        <DateRange from={range.from === '2000-01-01' ? '' : range.from} to={range.to === '2999-12-31' ? '' : range.to} onChange={(r) => setRange({ from: r.from || '2000-01-01', to: r.to || '2999-12-31' })} />
        <button className="btn primary" onClick={() => setEditor({ type })}><Icon.plus size={15} /> New {TYPE_LABEL[type].toLowerCase()}</button>
      </div>

      {totals && rows.length > 0 && (
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <MiniStat label={`${rows.length} ${TABS.find((t) => t.id === type).label.toLowerCase()}`} value={money(totals.billed)} />
          {type !== 'expense' && <MiniStat label="Outstanding" value={money(totals.due)} tone={totals.due > 0 ? 'neg' : ''} />}
          {type !== 'expense' && <MiniStat label="Tax on these" value={money(totals.tax)} />}
          {type !== 'expense' && <MiniStat label="Paid / partial / unpaid" value={`${totals.paid} / ${totals.partial} / ${totals.unpaid}`} />}
          {type === 'expense' && <MiniStat label="Total spent" value={money(totals.billed)} tone="neg" />}
        </div>
      )}

      <div className="card">
        <div className="card-b tight tbl-wrap">
          {loading ? <div className="empty">Loading…</div> : rows.length === 0 ? (
            <Empty
              icon={Icon[TABS.find((t) => t.id === type).icon]}
              title={`No ${TABS.find((t) => t.id === type).label.toLowerCase()} yet`}
              hint="Create one and it will appear here with its GST breakup, payment status and PDF."
              action={<button className="btn primary sm" onClick={() => setEditor({ type })}><Icon.plus size={14} /> New {TYPE_LABEL[type].toLowerCase()}</button>}
            />
          ) : (
            <>
              {/* Mobile App Document Cards List */}
              <div className="mobile-only mobile-cards-list">
                {rows.map((r) => (
                  <div key={r.id} className="mobile-invoice-card" onClick={() => api.document(r.id).then(setView)}>
                    <div className="mic-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="mic-number">{r.number}</span>
                        {r.status === 'cancelled' ? (
                          <span className="pill sm red">Cancelled</span>
                        ) : type === 'expense' ? (
                          <span className="pill sm grey">—</span>
                        ) : (
                          <PayPill status={r.payment_status} />
                        )}
                      </div>
                      <b className="mic-total">{money(r.total)}</b>
                    </div>
                    <div className="mic-body">
                      <div className="mic-party">{r.party_display || r.party_name || 'Walk-in Customer'}</div>
                      <div className="mic-date">{fmtDate(r.date)}{r.due_date ? ` · Due ${fmtDate(r.due_date)}` : ''}</div>
                    </div>
                    {(r.ewaybill_no || r.irn) && (
                      <div className="mic-badges" style={{ marginTop: 6, display: 'flex', gap: 5 }}>
                        {r.ewaybill_no && <span className="pill sm blue">EWB {r.ewaybill_no}</span>}
                        {r.irn && <span className="pill sm brand">e-Invoice</span>}
                      </div>
                    )}
                    <div className="mic-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn xs"
                        style={{ color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5' }}
                        onClick={() => api.document(r.id).then((d) => setWhatsAppModal({ doc: d.document, party: d.party }))}
                      >
                        <Icon.whatsapp size={13} /> WhatsApp
                      </button>
                      <button
                        type="button"
                        className="btn xs"
                        onClick={() => api.document(r.id).then((d) => setEditor({ type: d.document.type, doc: d.document }))}
                      >
                        <Icon.edit size={13} /> Edit
                      </button>
                      <a
                        className="btn xs"
                        href={pdfUrl(`invoice/${r.id}`, true)}
                        download={`${r.number}.pdf`}
                      >
                        <Icon.download size={13} /> PDF
                      </a>
                      <button
                        type="button"
                        className="btn xs"
                        onClick={() => api.document(r.id).then((d) => {
                          setThermalDoc(d.document);
                          setThermalParty(d.party);
                        })}
                      >
                        <Icon.file size={13} /> Thermal
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <table className="tbl desktop-only">
                <thead>
                  <tr>
                    <th>Number</th><th>Party</th><th>Date</th>{type !== 'expense' && <th>Due date</th>}
                    <th className="num">Taxable</th><th className="num">Tax</th><th className="num">Total</th>
                    <th>Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => api.document(r.id).then(setView)}>
                      <td>
                        <div className="strong">{r.number}</div>
                        {r.ewaybill_no && <span className="pill blue" style={{ marginTop: 3 }}>EWB {r.ewaybill_no}</span>}
                        {r.irn && <span className="pill brand" style={{ marginTop: 3, marginLeft: 4 }}>e-Invoice</span>}
                        {r.status === 'cancelled' && <span className="pill red" style={{ marginTop: 3, marginLeft: 4 }}>Cancelled</span>}
                      </td>
                      <td>
                        <div>{r.party_display || r.party_name}</div>
                        <div className="muted">{r.party_gstin || (r.supply_type === 'inter' ? 'Inter-state' : 'Intra-state')}</div>
                      </td>
                      <td className="muted">{fmtDate(r.date)}</td>
                      {type !== 'expense' && <td className="muted">{r.due_date ? fmtDate(r.due_date) : '—'}</td>}
                      <td className="num">{money(r.taxable_value)}</td>
                      <td className="num muted">{money(r.cgst + r.sgst + r.igst + r.cess)}</td>
                      <td className="num strong">{money(r.total)}</td>
                      <td>{r.status === 'cancelled' ? <span className="pill grey">Cancelled</span> : type === 'expense' ? <span className="pill grey">—</span> : <PayPill status={r.payment_status} />}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          <button
                            className="icon-btn"
                            style={{ color: '#059669' }}
                            title="Send to WhatsApp"
                            onClick={() => api.document(r.id).then((d) => setWhatsAppModal({ doc: d.document, party: d.party }))}
                          >
                            <Icon.whatsapp size={14} />
                          </button>
                          <button
                            className="icon-btn"
                            title="Print Slip (Epson LQ-50 6-inch / Thermal 58/80mm)"
                            onClick={() => api.document(r.id).then((d) => {
                              setThermalDoc(d.document);
                              setThermalParty(d.party);
                              setThermalWidth(localStorage.getItem('billpro.receipt_width') || '150');
                            })}
                          >
                            <Icon.file size={14} />
                          </button>
                          <a className="icon-btn" title="Download PDF" href={pdfUrl(`invoice/${r.id}`, true)} download={`${r.number}.pdf`}><Icon.download size={14} /></a>
                          <button className="icon-btn" title="Open A4 PDF" onClick={() => window.open(pdfUrl(`invoice/${r.id}`), '_blank')}><Icon.print size={14} /></button>
                          <button className="icon-btn" title="Edit" onClick={() => api.document(r.id).then((d) => setEditor({ type: d.document.type, doc: d.document }))}><Icon.edit size={14} /></button>
                          <button className="icon-btn danger" title={r.type === 'sale' ? 'Cancel' : 'Delete'} onClick={() => setConfirm(r)}><Icon.trash size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={type !== 'expense' ? 4 : 3}>Total</td>
                    <td className="num">{money(rows.reduce((s, r) => s + r.taxable_value, 0))}</td>
                    <td className="num">{money(rows.reduce((s, r) => s + r.cgst + r.sgst + r.igst + r.cess, 0))}</td>
                    <td className="num">{money(rows.reduce((s, r) => s + r.total, 0))}</td>
                    <td colSpan="2" />
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </div>

      {editor && (
        <DocumentEditor
          business={business} type={editor.type} doc={editor.doc} user={user} toast={toast}
          onClose={() => setEditor(null)}
          onSaved={(doc) => { setEditor(null); setView(null); toast(`${TYPE_LABEL[doc.type]} ${doc.number} saved`, 'ok'); load(); api.document(doc.id).then(setView); }}
        />
      )}

      {view && <DocViewer doc={view.document} party={view.party} payments={view.payments} business={business}
        onClose={() => { setView(null); load(); }}
        onEdit={(d) => { setView(null); setEditor({ type: d.type, doc: d }); }}
        onShare={(d) => setWhatsAppModal({ doc: d, party: view?.party })}
        onWhatsApp={(d, p) => setWhatsAppModal({ doc: d, party: p || view?.party })}
        onThermal={(d, p, w) => {
          setThermalDoc(d);
          setThermalParty(p || view?.party || null);
          setThermalWidth(w || localStorage.getItem('billpro.receipt_width') || '80');
        }}
        onPaid={async (d, amount, mode) => { try { await api.payDocument(d.id, { amount, mode }); toast('Payment recorded', 'ok'); const fresh = await api.document(d.id); setView(fresh); load(); } catch (e) { toast(e.message, 'err'); } }}
        onEwb={async (d, body) => { try { const r = await api.ewaybill(d.id, body); toast(`E-Way Bill ${r.ewaybillNo} generated`, 'ok'); setView(await api.document(d.id)); } catch (e) { toast(e.message, 'err'); } }}
        onEinv={async (d) => { try { const r = await api.einvoice(d.id); toast(`e-Invoice IRN generated: ${r.ackNo}`, 'ok'); setView(await api.document(d.id)); } catch (e) { toast(e.message, 'err'); } }}
        onDuplicate={async (d) => { try { const r = await api.duplicateDocument(d.id); toast(`Copied to ${r.document.number}`, 'ok'); setView(r); load(); } catch (e) { toast(e.message, 'err'); } }}
        toast={toast} />}

      {thermalDoc && (
        <ThermalReceiptModal
          doc={thermalDoc}
          party={thermalParty}
          business={business}
          initialWidth={thermalWidth}
          onClose={() => { setThermalDoc(null); setThermalParty(null); }}
          onWhatsApp={(d) => setWhatsAppModal({ doc: d, party: thermalParty || view?.party })}
          toast={toast}
        />
      )}

      {whatsAppModal && (
        <WhatsAppModal
          doc={whatsAppModal.doc}
          party={whatsAppModal.party}
          business={business}
          onClose={() => setWhatsAppModal(null)}
          toast={toast}
        />
      )}

      {share && <ShareModal share={share} onClose={() => setShare(null)} />}
      {confirm && (
        <Confirm
          title={confirm.type === 'sale' ? `Cancel ${confirm.number}?` : `Delete ${confirm.number}?`}
          message={confirm.type === 'sale'
            ? 'The invoice number stays reserved (GST does not allow reusing numbers), stock goes back to inventory and the khata balance is updated.'
            : 'This removes the document permanently and reverses its stock effect.'}
          confirmLabel={confirm.type === 'sale' ? 'Cancel invoice' : 'Delete'}
          onConfirm={() => remove(confirm)} onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function MiniStat({ label, value, tone }) {
  return <div className="stat" style={{ padding: '12px 14px' }}><div className="lbl">{label}</div><div className={`val ${tone}`} style={{ fontSize: 18 }}>{value}</div></div>;
}

/* ---------------- invoice viewer ---------------- */
function DocViewer({ doc, party, payments, business, onClose, onEdit, onShare, onWhatsApp, onThermal, onPaid, onEwb, onEinv, onDuplicate, toast }) {
  const [payOpen, setPayOpen] = useState(false);
  const [ewbOpen, setEwbOpen] = useState(false);
  const [payAmt, setPayAmt] = useState(doc.due_amount || 0);
  const [payMode, setPayMode] = useState('upi');
  const [ewb, setEwb] = useState({ vehicleNo: doc.vehicle_no || '', transportDocNo: doc.transport_doc_no || '', validDays: 4 });
  const isSale = doc.type === 'sale';

  return (
    <>
      <Modal
        title={`${TYPE_LABEL[doc.type]} ${doc.number}`}
        sub={`${doc.party_name}${party && party.gstin ? ' · ' + party.gstin : ''}`}
        size="wide" onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose} style={{ fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon.arrowLeft size={14} /> Back to Invoices
            </button>
            {isSale && doc.due_amount > 0 && doc.status === 'active' && <button className="btn green" onClick={() => setPayOpen(true)}><Icon.rupee size={14} /> Receive payment</button>}
            <button className="btn" onClick={() => onDuplicate(doc)}><Icon.copy size={14} /> Duplicate</button>
            <button className="btn" onClick={() => onEdit(doc)}><Icon.edit size={14} /> Edit</button>
            <button
              type="button"
              className="btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 650, color: '#4338ca', borderColor: '#c7d2fe', background: '#eef2ff' }}
              onClick={() => onThermal && onThermal(doc, party, '150')}
              title="Print directly formatted for 6-inch Epson LQ-50 Dot Matrix printer"
            >
              <Icon.print size={14} /> 🖨️ 6" LQ-50 Print
            </button>
            <a href={pdfUrl(`invoice/${doc.id}`, true)} download={`${doc.number}.pdf`} className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon.download size={14} /> Download PDF</a>
            <a href={pdfUrl(`invoice/${doc.id}`)} target="_blank" rel="noreferrer" className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Open print-ready PDF in new tab"><Icon.print size={14} /> Print (A4)</a>
          </>
        }
      >
        {/* Prominent Back to Invoices Header Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.22)',
          borderRadius: 10,
          padding: '8px 12px',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 8
        }}>
          <button
            type="button"
            className="btn primary sm"
            onClick={onClose}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            <Icon.arrowLeft size={16} /> Back to Invoices
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 600 }}>
              Viewing {TYPE_LABEL[doc.type] || 'Invoice'} #{doc.number}
            </span>
            <button
              type="button"
              className="btn sm"
              onClick={onClose}
              style={{ fontWeight: 650, background: 'var(--surface)' }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Business Branding Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: '11px 15px',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {business.logo_url ? (
              <div style={{
                width: 48, height: 48, borderRadius: 8, background: '#fff',
                border: '1px solid var(--line)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: 3, flexShrink: 0
              }}>
                <img src={business.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            ) : (
              <div style={{
                width: 44, height: 44, borderRadius: 8, background: business.color || '#4f46e5',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700, flexShrink: 0
              }}>
                {(business.name || 'B').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{business.legal_name || business.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                {[business.address, business.city, business.state].filter(Boolean).join(', ')}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 1, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {business.gstin && <span><b>GSTIN:</b> {business.gstin}</span>}
                {business.phone && <span><b>Ph:</b> {business.phone}</span>}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: business.color || 'var(--brand)' }}>
              {TYPE_LABEL[doc.type] || 'TAX INVOICE'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{doc.number}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Date: {fmtDate(doc.date)}</div>
            {doc.bags_count ? <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--brand)', marginTop: 2 }}>📦 Bags: {doc.bags_count}</div> : null}
          </div>
        </div>

        <div className="grid g4" style={{ marginBottom: 14 }}>
          <MiniStat label="Invoice total" value={money(doc.total)} />
          <MiniStat label="Paid" value={money(doc.paid_amount)} tone="pos" />
          <MiniStat label="Balance" value={money(doc.due_amount)} tone={doc.due_amount > 0 ? 'neg' : ''} />
          <MiniStat label="Status" value={<PayPill status={doc.payment_status} />} />
        </div>

        {party && (
          <div style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 8,
            background: party.balance > 0 ? '#fef2f2' : party.balance < 0 ? '#f0fdf4' : '#f8fafc',
            border: `1px solid ${party.balance > 0 ? '#fecaca' : party.balance < 0 ? '#bbf7d0' : '#e2e8f0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            fontSize: 12.5
          }}>
            <div>
              <span style={{ fontWeight: 650, color: '#0f172a' }}>👤 {party.name}</span>
              {party.phone && <span style={{ color: '#64748b', marginLeft: 8 }}>📞 {party.phone}</span>}
              {party.creditLimit > 0 && (
                <span style={{ color: '#64748b', marginLeft: 8 }}>
                  Limit: {money(party.creditLimit)}
                  {party.overLimit && <span style={{ color: '#dc2626', fontWeight: 600, marginLeft: 4 }}>⚠️ Over Limit</span>}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#64748b' }}>Total Khata Balance:</span>
              <span className={`pill ${party.balance > 0 ? 'red' : party.balance < 0 ? 'green' : 'grey'}`} style={{ fontWeight: 700 }}>
                {party.balance > 0 ? `${money(party.balance)} (To Collect)` : party.balance < 0 ? `${money(Math.abs(party.balance))} (Advance)` : 'Settled (₹0.00)'}
              </span>
            </div>
          </div>
        )}

        <div className="btn-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn sm" style={{ color: '#059669', fontWeight: 600, borderColor: '#a7f3d0' }} onClick={() => (onWhatsApp ? onWhatsApp(doc, party) : onShare(doc))}><Icon.whatsapp size={14} /> Send on WhatsApp</button>
          <button className="btn sm" style={{ fontWeight: 650, color: '#4338ca', borderColor: '#c7d2fe', background: '#eef2ff' }} onClick={() => onThermal && onThermal(doc, party, '150')} title="Print formatted for 6-inch Epson LQ-50 Dot Matrix printer"><Icon.print size={14} /> 🖨️ Epson LQ-50 (6" Print)</button>
          <button className="btn sm" style={{ fontWeight: 600 }} onClick={() => onThermal && onThermal(doc, party, '80')}><Icon.print size={14} /> 🧾 Thermal (58/80mm)</button>
          {isSale && (doc.irn
            ? <span className="pill brand"><Icon.stamp size={12} /> IRN {String(doc.irn).slice(0, 16)}…</span>
            : <button className="btn sm" onClick={() => onEinv(doc)}><Icon.stamp size={14} /> Generate e-Invoice (IRN)</button>)}
          {isSale && (doc.ewaybill_no
            ? <span className="pill blue"><Icon.truck size={12} /> EWB {doc.ewaybill_no} valid to {fmtDate(doc.ewaybill_valid_upto)}</span>
            : <button className="btn sm" onClick={() => setEwbOpen(true)}><Icon.truck size={14} /> Generate E-Way Bill</button>)}
          {party && party.id && <button className="btn sm" onClick={() => { onClose(); }}><Icon.khata size={14} /> Open khata</button>}
        </div>

        <div className="card" style={{ boxShadow: 'none' }}>
          <div className="card-b tight tbl-wrap">
            <table className="tbl">
              <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Taxable</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {doc.items.map((l, i) => (
                  <tr key={i}>
                    <td className="muted">{i + 1}</td>
                    <td><div className="strong">{l.name}</div><div className="muted">HSN {l.hsn || '-'}</div></td>
                    <td className="num">{l.qty} {l.unit}</td>
                    <td className="num">{money(l.rate)}</td>
                    <td className="num">{money(l.taxable)}</td>
                    <td className="num muted">{l.gstRate}% · {money(l.cgst + l.sgst + l.igst)}</td>
                    <td className="num strong">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid g2" style={{ marginTop: 14 }}>
          <div className="tot-box">
            <div className="kv"><span className="k">Subtotal</span><span className="v">{money(doc.subtotal)}</span></div>
            {doc.discount_amount > 0 && <div className="kv"><span className="k">Discount</span><span className="v neg">-{money(doc.discount_amount)}</span></div>}
            <div className="kv"><span className="k">Taxable value</span><span className="v">{money(doc.taxable_value)}</span></div>
            {doc.supply_type === 'inter'
              ? <div className="kv"><span className="k">IGST</span><span className="v">{money(doc.igst)}</span></div>
              : <>
                <div className="kv"><span className="k">CGST</span><span className="v">{money(doc.cgst)}</span></div>
                <div className="kv"><span className="k">SGST</span><span className="v">{money(doc.sgst)}</span></div>
              </>}
            {Number(doc.transportation) > 0 && <div className="kv"><span className="k">Transportation</span><span className="v">{money(doc.transportation)}</span></div>}
            {Number(doc.loading_charges) > 0 && <div className="kv"><span className="k">Loading charges</span><span className="v">{money(doc.loading_charges)}</span></div>}
            {Number(doc.extra_charges) > 0 && <div className="kv"><span className="k">Extra charges</span><span className="v">{money(doc.extra_charges)}</span></div>}
            <div className="grand"><span style={{ fontWeight: 700 }}>Current Bill Total</span><span className="v">{money(doc.total)}</span></div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>{doc.amount_in_words}</div>

            {/* Payment & Net Balance Breakdown */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
              {party && party.balance !== undefined ? (() => {
                const netBal = Number(party.balance) || 0;
                const paid = Number(doc.paid_amount || 0);
                const prevBal = Math.round((netBal - (Number(doc.total) - paid)) * 100) / 100;
                return (
                  <>
                    {Math.abs(prevBal) > 0.01 && (
                      <div className="kv">
                        <span className="k">{prevBal > 0 ? 'Previous Due' : 'Previous Advance'}</span>
                        <span className={`v ${prevBal > 0 ? 'neg' : 'pos'}`}>{money(Math.abs(prevBal))}</span>
                      </div>
                    )}
                    <div className="kv">
                      <span className="k">Amount Received</span>
                      <span className="v pos">{money(paid)}</span>
                    </div>
                    <div style={{
                      marginTop: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: netBal > 0 ? '#fef2f2' : (netBal < 0 ? '#f0fdf4' : 'var(--surface-2)'),
                      border: `1px solid ${netBal > 0 ? '#fecaca' : (netBal < 0 ? '#bbf7d0' : 'var(--line)')}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontWeight: 700,
                      fontSize: 13
                    }}>
                      <span style={{ color: netBal > 0 ? '#b91c1c' : (netBal < 0 ? '#15803d' : 'var(--ink)') }}>
                        {netBal > 0 ? 'Net Balance Due:' : (netBal < 0 ? 'Net Advance Balance:' : 'Net Balance:')}
                      </span>
                      <span style={{ color: netBal > 0 ? '#b91c1c' : (netBal < 0 ? '#15803d' : 'var(--ink)') }}>
                        {money(Math.abs(netBal))}
                      </span>
                    </div>
                  </>
                );
              })() : (
                <>
                  <div className="kv">
                    <span className="k">Amount Received</span>
                    <span className="v pos">{money(doc.paid_amount || 0)}</span>
                  </div>
                  {doc.due_amount > 0 && (
                    <div style={{
                      marginTop: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontWeight: 700,
                      fontSize: 13,
                      color: '#b91c1c'
                    }}>
                      <span>Net Balance Due:</span>
                      <span>{money(doc.due_amount)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>Payments on this document</h3>
            {payments.length === 0 ? <div className="hint">No payment recorded yet.</div> : payments.map((p) => (
              <div className="kv" key={p.id}>
                <span className="k">{fmtDate(p.date)} · {String(p.mode || '').toUpperCase()}{p.reference ? ' · ' + p.reference : ''}</span>
                <span className="v pos">{money(p.amount)}</span>
              </div>
            ))}
            {doc.notes && <><hr className="divider" /><div className="hint"><b>Notes:</b> {doc.notes}</div></>}
            {doc.ewaybill_no && <div className="hint" style={{ marginTop: 8 }}><b>E-Way Bill:</b> {doc.ewaybill_no}, vehicle {doc.vehicle_no || '—'}, valid till {fmtDate(doc.ewaybill_valid_upto)}</div>}
          </div>
        </div>
      </Modal>

      {payOpen && (
        <Modal title="Receive payment" sub={`${doc.party_name} · balance ${money(doc.due_amount)}`} onClose={() => setPayOpen(false)}
          footer={<>
            <button className="btn" onClick={() => setPayOpen(false)}>Cancel</button>
            <button className="btn green" onClick={() => { onPaid(doc, payAmt, payMode); setPayOpen(false); }}>Save payment</button>
          </>}>
          <div className="form-grid">
            <Field label="Amount" req><input className="input" type="number" value={payAmt} onChange={(e) => setPayAmt(Number(e.target.value))} /></Field>
            <Field label="Mode">
              <select className="input" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                {['upi', 'cash', 'bank', 'card', 'cheque'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </Field>
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            {[0.25, 0.5, 1].map((f) => (
              <button key={f} className="btn sm" onClick={() => setPayAmt(Math.round(doc.due_amount * f * 100) / 100)}>
                {f === 1 ? 'Full balance' : `${f * 100}%`}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {ewbOpen && (
        <Modal title="Generate E-Way Bill" sub="Part-A details; a 12-digit EWB number is issued" onClose={() => setEwbOpen(false)}
          footer={<>
            <button className="btn" onClick={() => setEwbOpen(false)}>Cancel</button>
            <button className="btn primary" onClick={() => { onEwb(doc, ewb); setEwbOpen(false); }}>Generate</button>
          </>}>
          <div className="form-grid">
            <Field label="Vehicle number" req><input className="input" value={ewb.vehicleNo} onChange={(e) => setEwb({ ...ewb, vehicleNo: e.target.value.toUpperCase() })} placeholder="KA19AB1234" /></Field>
            <Field label="Transport doc / LR no"><input className="input" value={ewb.transportDocNo} onChange={(e) => setEwb({ ...ewb, transportDocNo: e.target.value })} /></Field>
            <Field label="Validity (days)" hint="4 days for consignments over ₹50,000">
              <input className="input" type="number" value={ewb.validDays} onChange={(e) => setEwb({ ...ewb, validDays: Number(e.target.value) })} />
            </Field>
          </div>
          {!business.gstin && <div className="banner warn" style={{ marginTop: 10 }}>Add your GSTIN in Settings first - the portal needs it.</div>}
        </Modal>
      )}
    </>
  );
}

function ShareModal({ share, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(share.message); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch (e) {}
  };
  return (
    <Modal title="Share this document" sub={share.party ? `${share.party.name}${share.party.phone ? ' · ' + share.party.phone : ''}` : ''} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={copy}>{copied ? 'Copied!' : 'Copy message'}</button></>}>
      <textarea className="input" rows={7} value={share.message} readOnly />
      <div className="btn-row" style={{ marginTop: 12 }}>
        {share.links.whatsapp && <a className="btn green" href={share.links.whatsapp} target="_blank" rel="noreferrer"><Icon.whatsapp size={15} /> WhatsApp</a>}
        {share.links.sms && <a className="btn" href={share.links.sms}><Icon.phone size={15} /> SMS</a>}
        {share.links.email && <a className="btn" href={share.links.email}><Icon.mail size={15} /> Email</a>}
        <a className="btn" href={share.links.pdf} target="_blank" rel="noreferrer"><Icon.print size={15} /> PDF link</a>
      </div>
      {!share.links.whatsapp && <div className="hint" style={{ marginTop: 8 }}>Add the party's mobile number to enable the WhatsApp button.</div>}
    </Modal>
  );
}
