import React, { useEffect, useMemo, useState } from 'react';
import { api, money, moneyShort, fmtDate, pdfUrl, today } from '../src/api.js';
import { Icon, colorFor } from '../src/ui.jsx';
import { Modal, Field, Empty, Confirm, Avatar } from '../src/components.jsx';
import ExcelImportModal from '../src/ExcelImportModal.jsx';
import { exportPartiesToExcel } from '../src/excel.js';

export default function Khata({ business, initialType, initialPartyId, toast }) {
  const [type, setType] = useState(initialType || 'customer');
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [editor, setEditor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [totals, setTotals] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => { if (initialType) setType(initialType); }, [initialType]);

  const load = async () => {
    try {
      const r = await api.parties({ type, q });
      setRows(r.parties);
      setTotals(r.totals);
    } catch (e) { toast(e.message, 'err'); }
  };
  useEffect(() => { load(); }, [type, q, business.id]);

  useEffect(() => {
    if (initialPartyId) api.party(initialPartyId).then((r) => setOpen({ party: r.party })).catch(() => {});
  }, [initialPartyId]);

  return (
    <>
      <div className="khata-hero">
        <div className="khata-card" style={{ background: 'linear-gradient(135deg,#dc2626,#f97316)' }}>
          <div className="lbl">You will get</div>
          <div className="val">{money(totals ? totals.toCollect : 0)}</div>
          <div className="foot">Outstanding from {rows.filter((r) => r.balance > 0).length} parties</div>
        </div>
        <div className="khata-card" style={{ background: 'linear-gradient(135deg,#047857,#10b981)' }}>
          <div className="lbl">You will give</div>
          <div className="val">{money(totals ? totals.toPay : 0)}</div>
          <div className="foot">Advance paid / credit balances</div>
        </div>
        <div className="khata-card" style={{ background: 'linear-gradient(135deg,#4f46e5,#8b5cf6)' }}>
          <div className="lbl">{type === 'customer' ? 'Customers' : 'Suppliers'}</div>
          <div className="val">{totals ? totals.count : 0}</div>
          <div className="foot">{totals && totals.overLimit ? `${totals.overLimit} over their credit limit` : 'All within credit limits'}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="tabs">
          <button className={type === 'customer' ? 'on' : ''} onClick={() => setType('customer')}>Customers</button>
          <button className={type === 'supplier' ? 'on' : ''} onClick={() => setType('supplier')}>Suppliers</button>
        </div>
        <div className="grow search">
          <Icon.search size={15} />
          <input className="input" placeholder="Search name, phone, GSTIN or city…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn" onClick={() => setImportOpen(true)} title={`Bulk upload ${type}s from Excel`}>
          <Icon.upload size={15} /> Import Excel
        </button>
        <button className="btn" onClick={() => exportPartiesToExcel(rows, type, business.name)} title={`Export ${type}s to Excel`}>
          <Icon.download size={15} /> Export Excel
        </button>
        <button className="btn" onClick={() => window.open(pdfUrl('outstanding?type=' + type), '_blank')}><Icon.download size={15} /> Outstanding PDF</button>
        <button className="btn primary" onClick={() => setEditor({ type })}><Icon.plus size={15} /> Add {type}</button>
      </div>

      <div className="card">
        <div className="card-b tight tbl-wrap">
          {rows.length === 0 ? (
            <Empty icon={Icon.users} title={`No ${type}s yet`}
              hint={`Add a party to start their khata, or upload your existing ${type} list directly from Excel/CSV.`}
              action={
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary sm" onClick={() => setEditor({ type })}><Icon.plus size={14} /> Add {type}</button>
                  <button className="btn sm" onClick={() => setImportOpen(true)}><Icon.upload size={14} /> Import from Excel</button>
                </div>
              } />
          ) : (
            <>
              {/* Mobile App Khata Party List */}
              <div className="mobile-only mobile-cards-list">
                {rows.map((p) => (
                  <div key={p.id} className="mobile-party-card" style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
                    <div className="mobile-trans-item" role="button" tabIndex={0} onClick={() => setOpen({ party: p })} onKeyDown={(e) => { if (e.key === 'Enter') setOpen({ party: p }); }}>
                      <div className="mti-left">
                        <Avatar name={p.name} size={38} color={p.tag ? colorFor(p.tag) : undefined} />
                        <div className="mti-meta">
                          <b className="mti-party">{p.name}</b>
                          <div className="mti-sub">{p.phone || p.city || 'No contact'} · {p.lastTransaction ? fmtDate(p.lastTransaction) : 'No txn'}</div>
                        </div>
                      </div>
                      <div className="mti-right">
                        <div className={`mti-amount ${p.balance > 0 ? 'neg' : p.balance < 0 ? 'pos' : ''}`}>
                          {money(Math.abs(p.balance))}
                        </div>
                        <div className="mti-pill">
                          {p.balance > 0 ? <span className="pill sm red">You'll get</span> : p.balance < 0 ? <span className="pill sm green">You'll give</span> : <span className="pill sm grey">Settled</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px', justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => setOpen({ party: p })}><Icon.book size={14} /> Ledger</button>
                      <button className="btn sm" onClick={() => setEditor({ type, party: p })}><Icon.edit size={14} /> Edit</button>
                      <button className="btn sm red" onClick={() => setConfirm(p)}><Icon.trash size={14} /> Delete</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <table className="tbl desktop-only">
                <thead>
                  <tr><th>{type === 'customer' ? 'Customer' : 'Supplier'}</th><th>Contact</th><th>GSTIN</th>
                    <th className="num">Credit limit</th><th className="num">Balance</th><th>Last activity</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="clickable" onClick={() => setOpen({ party: p })}>
                      <td>
                        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                          <Avatar name={p.name} size={30} color={p.tag ? colorFor(p.tag) : undefined} />
                          <div>
                            <div className="strong">{p.name}</div>
                            <div className="muted">{[p.city, p.tag].filter(Boolean).join(' · ') || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="muted">{[p.contact_name, p.phone].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="muted mono">{p.gstin || '—'}</td>
                      <td className="num muted">{p.credit_limit ? money(p.credit_limit) : '—'}</td>
                      <td className="num">
                        <b className={p.balance > 0 ? 'neg' : p.balance < 0 ? 'pos' : ''}>{money(Math.abs(p.balance))}</b>
                        <div>{p.balance > 0 ? <span className="pill red">You'll get</span> : p.balance < 0 ? <span className="pill green">You'll give</span> : <span className="pill grey">Settled</span>}</div>
                        {p.overLimit && <span className="pill amber" style={{ marginTop: 3 }}>Over limit</span>}
                      </td>
                      <td className="muted">{p.lastTransaction || '—'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          <button className="icon-btn" title="Statement PDF" onClick={() => window.open(pdfUrl(`statement/${p.id}`), '_blank')}><Icon.print size={14} /></button>
                          <button className="icon-btn" title="Edit" onClick={() => setEditor({ type, party: p })}><Icon.edit size={14} /></button>
                          <button className="icon-btn danger" title="Delete" onClick={() => setConfirm(p)}><Icon.trash size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {open && <Ledger partyId={open.party.id} business={business} onClose={() => { setOpen(null); load(); }} onEdit={(party) => { setOpen(null); setEditor({ type, party }); }} onChanged={load} toast={toast} />}
      {editor && <PartyEditor business={business} type={editor.type} party={editor.party} toast={toast}
        onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
      {confirm && <Confirm title={`Delete ${confirm.name}?`} message="This permanently deletes the party and its khata transactions. Existing invoices are retained, but will no longer be linked to this party. This cannot be undone."
        onConfirm={async () => { try { await api.deleteParty(confirm.id); toast('Deleted', 'ok'); load(); } catch (e) { toast(e.message, 'err'); } }}
        onClose={() => setConfirm(null)} />}

      {importOpen && (
        <ExcelImportModal
          mode="parties"
          partyType={type}
          business={business}
          onClose={() => setImportOpen(false)}
          onSuccess={() => load()}
          toast={toast}
        />
      )}
    </>
  );
}

/* ---------------- party ledger ---------------- */
function Ledger({ partyId, business, onClose, onEdit, onChanged, toast }) {
  const [data, setData] = useState(null);
  const [pay, setPay] = useState(null);
  const [txnEditor, setTxnEditor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [intOpen, setIntOpen] = useState(false);
  const [interest, setInterest] = useState({ rate: 18, days: 30 });

  const load = () => api.statement(partyId).then(setData).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, [partyId]);
  if (!data) return null;
  const p = data.party;

  return (
    <Modal
      title={p.name}
      sub={[p.contact_name, p.phone, p.gstin, p.city].filter(Boolean).join(' · ')}
      size="wide" onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => onEdit(p)}><Icon.edit size={14} /> Edit details</button>
        <button className="btn" onClick={() => window.open(pdfUrl(`statement/${p.id}`), '_blank')}><Icon.print size={14} /> Statement PDF</button>
        <button className="btn green" onClick={() => setPay('you_got')}><Icon.arrowDown size={14} /> You got</button>
        <button className="btn red" onClick={() => setPay('you_gave')}><Icon.arrowUp size={14} /> You gave</button>
      </>}
    >
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Mini label="Total balance" value={money(Math.abs(p.balance))} tone={p.balance > 0 ? 'neg' : p.balance < 0 ? 'pos' : ''} />
        <Mini label={p.balance >= 0 ? "You'll get" : "You'll give"} value={<span className={`pill ${p.balance >= 0 ? 'red' : 'green'}`}>{p.balance >= 0 ? 'Receivable' : 'Payable'}</span>} />
        <Mini label="Credit limit" value={p.credit_limit ? money(p.credit_limit) : 'Not set'} />
        <Mini label="Available credit" value={p.creditAvailable !== null ? money(p.creditAvailable) : '—'} tone={p.overLimit ? 'neg' : ''} />
      </div>

      {p.overLimit && <div className="banner warn"><Icon.alert size={15} />This party has crossed their credit limit by {money(p.balance - p.credit_limit)}. Consider collecting before billing more.</div>}

      <div className="btn-row" style={{ marginBottom: 10 }}>
        <button className="btn sm" onClick={() => setIntOpen(true)}><Icon.clock size={14} /> Charge interest</button>
        <span className="spacer" />
        <span className="hint">Debit total {money(data.totals.debit)} · Credit total {money(data.totals.credit)}</span>
      </div>

      <div className="card" style={{ boxShadow: 'none' }}>
        <div className="card-b" style={{ padding: '12px 16px' }}>
          <div className="stmt-entry" style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '.05em' }}>
            <div className="dt">Date</div><div>Particulars</div><div className="num" style={{ textAlign: 'right', width: 92 }}>Debit</div>
            <div className="num" style={{ textAlign: 'right', width: 92 }}>Credit</div><div className="bal">Balance</div>
          </div>
          {data.entries.length === 0 && <div className="hint" style={{ padding: '14px 0' }}>No entries yet. Bill this party or record a payment.</div>}
          {data.entries.map((e, i) => (
            <div className="stmt-entry" key={i}>
              <div className="dt">{fmtDate(e.date)}</div>
              <div>
                <b style={{ fontSize: 12.5 }}>{e.label}</b>
                {(e.reference || e.mode || e.notes) && <div className="muted">{[e.reference, e.mode ? String(e.mode).toUpperCase() : '', e.notes].filter(Boolean).join(' · ')}</div>}
              </div>
              <div className="num neg" style={{ textAlign: 'right', width: 92 }}>{e.debit ? money(e.debit) : ''}</div>
              <div className="num pos" style={{ textAlign: 'right', width: 92 }}>{e.credit ? money(e.credit) : ''}</div>
              <div className="bal" style={{ color: e.balance >= 0 ? 'var(--red)' : 'var(--green)' }}>{money(e.balance)}</div>
            </div>
          ))}
        </div>
      </div>

      {pay && <PayModal kind={pay} party={p} onClose={() => setPay(null)}
        onSaved={async () => { setPay(null); await load(); onChanged(); toast('Entry saved to the ledger', 'ok'); }} toast={toast} />}

      {intOpen && (
        <Modal title="Charge interest" sub={`On the outstanding ${money(Math.abs(p.balance))}`} onClose={() => setIntOpen(false)}
          footer={<>
            <button className="btn" onClick={() => setIntOpen(false)}>Cancel</button>
            <button className="btn primary" onClick={async () => {
              try { await api.chargeInterest({ partyId: p.id, rate: interest.rate, days: interest.days }); toast('Interest added to the ledger', 'ok'); setIntOpen(false); load(); onChanged(); }
              catch (e) { toast(e.message, 'err'); }
            }}>Add interest</button>
          </>}>
          <div className="form-grid">
            <Field label="Rate (% per annum)"><input className="input" type="number" value={interest.rate} onChange={(e) => setInterest({ ...interest, rate: Number(e.target.value) })} /></Field>
            <Field label="Days"><input className="input" type="number" value={interest.days} onChange={(e) => setInterest({ ...interest, days: Number(e.target.value) })} /></Field>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Interest = {money(Math.abs(p.balance))} × {interest.rate}% × {interest.days}/365 = <b>{money((Math.abs(p.balance) * interest.rate * interest.days) / 36500)}</b>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function Mini({ label, value, tone }) {
  return <div className="stat" style={{ padding: '11px 13px' }}><div className="lbl">{label}</div><div className={`val ${tone || ''}`} style={{ fontSize: 17 }}>{value}</div></div>;
}

function PayModal({ kind, party, onClose, onSaved, toast }) {
  const [form, setForm] = useState({ amount: '', date: today(), mode: 'upi', reference: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr(''); setBusy(true);
    try {
      await api.createTransaction({ ...form, partyId: party.id, type: kind, amount: Number(form.amount) });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={kind === 'you_got' ? `Money received from ${party.name}` : `Money paid to ${party.name}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${kind === 'you_got' ? 'green' : 'red'}`} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save entry'}</button>
      </>}>
      {err && <div className="banner err"><Icon.alert size={15} />{err}</div>}
      <div className="form-grid">
        <Field label="Amount" req><input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} autoFocus /></Field>
        <Field label="Date"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Mode">
          <select className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            {['upi', 'cash', 'bank', 'card', 'cheque', 'credit'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
        </Field>
        <Field label="Reference / UTR"><input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        <Field label="Note" full><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field>
      </div>
    </Modal>
  );
}

/* ---------------- party editor ---------------- */
function PartyEditor({ business, type, party, onClose, onSaved, toast }) {
  const [form, setForm] = useState(() => party ? { ...party, opening_balance: party.opening_balance || 0 } : {
    type, name: '', contact_name: '', phone: '', email: '', gstin: '', address: '', city: business.city || '',
    state: business.state || '', pincode: '', opening_balance: 0, balance_type: 'DR', credit_limit: 0,
    credit_days: business.credit_days || 30, tag: '', notes: ''
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      if (party) await api.updateParty(party.id, form);
      else await api.createParty(form);
      toast(party ? 'Party updated' : `${form.name} added`, 'ok');
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={party ? `Edit ${party.name}` : `Add ${type}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      {err && <div className="banner err"><Icon.alert size={15} />{err}</div>}
      <div className="form-grid">
        <Field label="Name" req full><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Contact person"><input className="input" value={form.contact_name || ''} onChange={(e) => set('contact_name', e.target.value)} /></Field>
        <Field label="Mobile"><input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="98450 12345" /></Field>
        <Field label="GSTIN" hint="State code is read from the first 2 digits"><input className="input" value={form.gstin || ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="29AAAAA1111A1Z1" /></Field>
        <Field label="Email"><input className="input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Address" full><input className="input" value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="City"><input className="input" value={form.city || ''} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="State"><input className="input" value={form.state || ''} onChange={(e) => set('state', e.target.value)} /></Field>
        <Field label="Pincode"><input className="input" value={form.pincode || ''} onChange={(e) => set('pincode', e.target.value)} /></Field>
        <Field label="Opening balance">
          <input className="input" type="number" value={form.opening_balance} onChange={(e) => set('opening_balance', Number(e.target.value))} />
        </Field>
        <Field label="Balance direction">
          <select className="input" value={form.balance_type} onChange={(e) => set('balance_type', e.target.value)}>
            <option value="DR">They owe me (DR)</option><option value="CR">I owe them (CR)</option>
          </select>
        </Field>
        <Field label="Credit limit" hint="Used for over-limit warnings"><input className="input" type="number" value={form.credit_limit || 0} onChange={(e) => set('credit_limit', Number(e.target.value))} /></Field>
        <Field label="Credit period (days)"><input className="input" type="number" value={form.credit_days || 0} onChange={(e) => set('credit_days', Number(e.target.value))} /></Field>
        <Field label="Tag" hint="e.g. HORECA, Retail, Wholesale"><input className="input" value={form.tag || ''} onChange={(e) => set('tag', e.target.value)} /></Field>
        <Field label="Notes" full><textarea className="input" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
