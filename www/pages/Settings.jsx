import React, { useEffect, useState } from 'react';
import { api, money } from '../src/api.js';
import { Icon } from '../src/ui.jsx';
import { Field, Modal, Confirm, Empty, GstRateInput } from '../src/components.jsx';
import { STATE_CODES } from '../src/states.js';

const ROLES = [
  { id: 'admin', label: 'Admin', desc: 'Everything except deleting the business' },
  { id: 'accountant', label: 'Accountant', desc: 'Billing, khata, inventory and all reports' },
  { id: 'staff', label: 'Counter staff', desc: 'Billing and khata only' }
];
const PERMS = {
  admin: ['dashboard', 'billing', 'khata', 'inventory', 'reports', 'settings', 'staff'],
  accountant: ['dashboard', 'billing', 'khata', 'inventory', 'reports'],
  staff: ['dashboard', 'billing', 'khata']
};

export default function Settings({ business, user, onBusinessSaved, onAddBusiness, onDeleteBusiness, toast }) {
  const [tab, setTab] = useState('profile');
  const [form, setForm] = useState({ ...business });
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState([]);
  const [staffModal, setStaffModal] = useState(null);
  const [resetStaffModal, setResetStaffModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [me, setMe] = useState({ name: user.name, phone: user.phone || '', email: user.email });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => { setForm({ ...business }); }, [business.id]);
  useEffect(() => { api.staff(business.id).then((r) => setStaff(r.staff)).catch(() => {}); }, [business.id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.updateBusiness(business.id, form);
      toast('Business settings saved', 'ok');
      onBusinessSaved(r.business);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const saveMe = async () => {
    try { await api.updateMe(me); toast('Profile updated', 'ok'); } catch (e) { toast(e.message, 'err'); }
  };

  const changePw = async () => {
    setPwMsg('');
    try { await api.changePassword(pw); setPw({ currentPassword: '', newPassword: '' }); setPwMsg('Password changed'); toast('Password changed', 'ok'); }
    catch (e) { setPwMsg(e.message); }
  };

  const TABS = [
    { id: 'profile', label: 'Business profile', icon: 'building' },
    { id: 'invoice', label: 'Invoice & GST', icon: 'invoice' },
    { id: 'bank', label: 'Bank & UPI', icon: 'wallet' },
    { id: 'staff', label: 'Staff & roles', icon: 'users' },
    { id: 'account', label: 'My account', icon: 'lock' }
  ];

  return (
    <div className="settings-layout">
      <div className="card">
        <div className="card-b" style={{ padding: 8 }}>
          {TABS.map((t) => {
            const I = Icon[t.icon];
            return (
              <div key={t.id} onClick={() => setTab(t.id)}
                style={{
                  display: 'flex', gap: 9, alignItems: 'center', padding: '9px 11px', borderRadius: 9, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, background: tab === t.id ? 'var(--brand-soft)' : 'transparent',
                  color: tab === t.id ? 'var(--brand)' : 'var(--ink-2)', marginBottom: 2
                }}>
                <I size={15} /> {t.label}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        {tab === 'profile' && (
          <>
            <div className="card-h"><Icon.building size={16} /><div><h3>Business profile</h3><div className="sub">Printed on every invoice and PDF</div></div></div>
            <div className="card-b">
              <div className="form-grid">
                <Field label="Business name (shown to customers)" req><input className="input" value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
                <Field label="Legal / registered name"><input className="input" value={form.legal_name || ''} onChange={(e) => set('legal_name', e.target.value)} /></Field>
                <Field label="GSTIN" hint="State code is read from the first 2 digits"><input className="input" value={form.gstin || ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="29AAAAA1111A1Z1" /></Field>
                <Field label="PAN"><input className="input" value={form.pan || ''} onChange={(e) => set('pan', e.target.value.toUpperCase())} /></Field>
                <Field label="Address" full><input className="input" value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
                <Field label="City"><input className="input" value={form.city || ''} onChange={(e) => set('city', e.target.value)} /></Field>
                <Field label="State">
                  <select className="input" value={form.state_code || ''} onChange={(e) => {
                    const code = e.target.value;
                    set('state_code', code); set('state', STATE_CODES[code] || form.state);
                  }}>
                    <option value="">Select state</option>
                    {Object.entries(STATE_CODES).map(([c, n]) => <option key={c} value={c}>{c} - {n}</option>)}
                  </select>
                </Field>
                <Field label="Pincode"><input className="input" value={form.pincode || ''} onChange={(e) => set('pincode', e.target.value)} /></Field>
                <Field label="Phone"><input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
                <Field label="Email"><input className="input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
                <Field label="Website"><input className="input" value={form.website || ''} onChange={(e) => set('website', e.target.value)} /></Field>
                <Field label="Accent colour" hint="Used on invoices and dashboards">
                  <div style={{ display: 'flex', gap: 7 }}>
                    {['#4f46e5', '#047857', '#b91c1c', '#b45309', '#334155', '#7c3aed', '#0891b2', '#db2777'].map((c) => (
                      <span key={c} onClick={() => set('color', c)}
                        style={{ width: 26, height: 26, borderRadius: 8, background: c, cursor: 'pointer', border: form.color === c ? '2.5px solid var(--ink)' : '2.5px solid transparent' }} />
                    ))}
                  </div>
                </Field>
              </div>
              <hr className="divider" />
              <div className="btn-row">
                <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
                <button className="btn" onClick={onAddBusiness}><Icon.plus size={14} /> Add another business</button>
                <div className="spacer" />
                <button className="btn red" onClick={() => setConfirm(business)}><Icon.trash size={14} /> Delete this business</button>
              </div>
            </div>
          </>
        )}

        {tab === 'invoice' && (
          <>
            <div className="card-h"><Icon.invoice size={16} /><div><h3>Invoice numbering & GST</h3><div className="sub">GST requires sequential, non-repeating invoice numbers</div></div></div>
            <div className="card-b">
              <div className="form-grid">
                <Field label="Invoice prefix" hint="e.g. CT gives CT-2025-26-1007"><input className="input" value={form.invoice_prefix || ''} onChange={(e) => set('invoice_prefix', e.target.value.toUpperCase())} /></Field>
                <Field label="Next invoice number" hint="Only change this with your accountant's advice"><input className="input" type="number" value={form.invoice_counter || 0} onChange={(e) => set('invoice_counter', Number(e.target.value))} /></Field>
                <Field label="Quotation prefix"><input className="input" value={form.quoter_prefix || ''} onChange={(e) => set('quoter_prefix', e.target.value.toUpperCase())} /></Field>
                <Field label="Default GST rate" hint="Standard slab or custom percentage">
                  <GstRateInput value={form.default_gst_rate} onChange={(r) => set('default_gst_rate', r)} />
                </Field>
                <Field label="Invoice theme">
                  <select className="input" value={form.invoice_theme || 'classic'} onChange={(e) => set('invoice_theme', e.target.value)}>
                    <option value="classic">Indigo classic</option><option value="emerald">Emerald</option>
                    <option value="ruby">Ruby</option><option value="amber">Amber</option><option value="slate">Slate</option>
                  </select>
                </Field>
                <Field label="Default credit period (days)"><input className="input" type="number" value={form.credit_days || 0} onChange={(e) => set('credit_days', Number(e.target.value))} /></Field>
                <Field label="Footer line on the PDF" full><input className="input" value={form.invoice_footer || ''} onChange={(e) => set('invoice_footer', e.target.value)} placeholder="Thank you for your business!" /></Field>
                <Field label="Terms & conditions" full hint="One per line"><textarea className="input" rows={5} value={form.terms || ''} onChange={(e) => set('terms', e.target.value)} /></Field>
                <div className="full">
                  <label className="checkbox">
                    <input type="checkbox" checked={!!form.composition_scheme} onChange={(e) => set('composition_scheme', e.target.checked ? 1 : 0)} />
                    Composition scheme dealer (CMP-08) - tax is not shown separately to customers
                  </label>
                </div>
              </div>
              <hr className="divider" />
              <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </>
        )}

        {tab === 'bank' && (
          <>
            <div className="card-h"><Icon.wallet size={16} /><div><h3>Bank & UPI</h3><div className="sub">Printed on invoices; UPI also powers the scan-to-pay QR</div></div></div>
            <div className="card-b">
              <div className="form-grid">
                <Field label="Bank name"><input className="input" value={form.bank_name || ''} onChange={(e) => set('bank_name', e.target.value)} /></Field>
                <Field label="Branch"><input className="input" value={form.bank_branch || ''} onChange={(e) => set('bank_branch', e.target.value)} /></Field>
                <Field label="Account number"><input className="input" value={form.bank_account_no || ''} onChange={(e) => set('bank_account_no', e.target.value)} /></Field>
                <Field label="IFSC"><input className="input" value={form.bank_ifsc || ''} onChange={(e) => set('bank_ifsc', e.target.value.toUpperCase())} /></Field>
                <Field label="UPI ID" hint="Customers can scan the QR on the invoice to pay" full><input className="input" value={form.upi_id || ''} onChange={(e) => set('upi_id', e.target.value)} placeholder="yourbusiness@okaxis" /></Field>
              </div>
              {form.upi_id && (
                <div className="banner info" style={{ marginTop: 12 }}>
                  <Icon.check size={15} /> UPI QR will be printed on every invoice: <b>{form.upi_id}</b>
                </div>
              )}
              <hr className="divider" />
              <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </>
        )}

        {tab === 'staff' && (
          <>
            <div className="card-h"><Icon.users size={16} /><div><h3>Staff & accountant access</h3><div className="sub">Give limited access without sharing your login</div></div>
              <div className="spacer" /><button className="btn primary sm" onClick={() => setStaffModal({})}><Icon.plus size={14} /> Add person</button></div>
            <div className="card-b tight">
              {staff.length === 0 ? (
                <Empty icon={Icon.users} title="Only you have access"
                  hint="Add your accountant for reports only, or a counter staff member for billing - each with their own permissions."
                  action={<button className="btn primary sm" onClick={() => setStaffModal({})}><Icon.plus size={14} /> Add person</button>} />
              ) : (
                <table className="tbl">
                  <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Permissions</th><th /></tr></thead>
                  <tbody>
                    <tr>
                      <td className="strong">{user.name} <span className="pill brand" style={{ marginLeft: 6 }}>You</span></td>
                      <td className="muted">{user.email}</td><td className="muted">{user.phone || '—'}</td>
                      <td><span className="pill brand">Owner</span></td><td className="muted">Full access to all businesses</td><td />
                    </tr>
                    {staff.map((s) => (
                      <tr key={s.id}>
                        <td className="strong">{s.name}</td>
                        <td className="muted">{s.email}</td><td className="muted">{s.phone || '—'}</td>
                        <td><span className="pill grey">{s.role}</span></td>
                        <td className="muted">{JSON.parse(s.permissions || '[]').join(', ')}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              className="btn sm"
                              style={{ fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              title="Set or reset password for this user"
                              onClick={() => setResetStaffModal({ staff: s, newPassword: '' })}
                            >
                              <Icon.lock size={11} /> Reset password
                            </button>
                            <button
                              className="icon-btn danger"
                              title="Remove access"
                              onClick={async () => {
                                await api.removeStaff(business.id, s.id);
                                setStaff(staff.filter((x) => x.id !== s.id));
                                toast('Access removed', 'ok');
                              }}
                            >
                              <Icon.trash size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {tab === 'account' && (
          <>
            <div className="card-h"><Icon.lock size={16} /><div><h3>My account</h3><div className="sub">Your login works across every business you own</div></div></div>
            <div className="card-b">
              <div className="form-grid">
                <Field label="Name"><input className="input" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} /></Field>
                <Field label="Mobile"><input className="input" value={me.phone} onChange={(e) => setMe({ ...me, phone: e.target.value })} /></Field>
                <Field label="Email" full><input className="input" value={me.email} disabled /></Field>
              </div>
              <button className="btn primary" style={{ marginTop: 12 }} onClick={saveMe}>Save profile</button>

              <hr className="divider" />
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Change password</h3>
              <div className="form-grid">
                <Field label="Current password"><input className="input" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
                <Field label="New password"><input className="input" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
              </div>
              {pwMsg && <div className={`banner ${pwMsg === 'Password changed' ? 'info' : 'err'}`} style={{ marginTop: 10 }}>{pwMsg}</div>}
              <button className="btn" style={{ marginTop: 12 }} onClick={changePw}>Change password</button>

              <hr className="divider" />
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>Data & backups</h3>
              <p className="hint" style={{ margin: '0 0 10px' }}>Your data lives in a SQLite file on your server. Export anything as CSV from the relevant screen, or take a copy of the database file for a full backup.</p>
              <div className="btn-row">
                <a className="btn" href={`/api/reports/export/parties?token=${encodeURIComponent(localStorage.getItem('billpro.token') || '')}`}><Icon.download size={14} /> Parties CSV</a>
                <a className="btn" href={`/api/reports/export/stock?token=${encodeURIComponent(localStorage.getItem('billpro.token') || '')}`}><Icon.download size={14} /> Stock CSV</a>
                <a className="btn" href={`/api/reports/export/sales?token=${encodeURIComponent(localStorage.getItem('billpro.token') || '')}`}><Icon.download size={14} /> Sales CSV</a>
              </div>
            </div>
          </>
        )}
      </div>

      {staffModal && (
        <Modal title="Add a person to this business" sub={business.name} onClose={() => setStaffModal(null)}
          footer={<>
            <button className="btn" onClick={() => setStaffModal(null)}>Cancel</button>
            <button className="btn primary" onClick={async () => {
              if (!staffModal.name || !staffModal.email) return toast('Name and email are required', 'err');
              if (staffModal.password && staffModal.password.length < 6) return toast('Password must be at least 6 characters', 'err');
              try {
                const r = await api.addStaff(business.id, staffModal);
                setStaff(r.staff);
                setStaffModal(null);
                toast(`${staffModal.name} added with ${staffModal.role || 'staff'} access`, 'ok');
              } catch (e) { toast(e.message, 'err'); }
            }}>Add person</button>
          </>}>
          <StaffForm value={staffModal} onChange={setStaffModal} />
        </Modal>
      )}

      {resetStaffModal && (
        <Modal
          title={`Set password for ${resetStaffModal.staff.name}`}
          sub={`${resetStaffModal.staff.email} · Role: ${resetStaffModal.staff.role}`}
          onClose={() => setResetStaffModal(null)}
          footer={<>
            <button className="btn" onClick={() => setResetStaffModal(null)}>Cancel</button>
            <button
              className="btn primary"
              onClick={async () => {
                if (!resetStaffModal.newPassword || resetStaffModal.newPassword.length < 6) {
                  return toast('Password must be at least 6 characters', 'err');
                }
                try {
                  await api.resetStaffPassword(business.id, resetStaffModal.staff.id, resetStaffModal.newPassword);
                  toast(`Password updated for ${resetStaffModal.staff.name}`, 'ok');
                  setResetStaffModal(null);
                } catch (e) {
                  toast(e.message, 'err');
                }
              }}
            >
              Save new password
            </button>
          </>}
        >
          <div className="form-grid">
            <Field label="New login password" req hint="Must be at least 6 characters">
              <input
                className="input"
                type="password"
                autoFocus
                value={resetStaffModal.newPassword}
                onChange={(e) => setResetStaffModal({ ...resetStaffModal, newPassword: e.target.value })}
                placeholder="Enter new password"
              />
            </Field>
          </div>
        </Modal>
      )}

      {confirm && (
        <Confirm title={`Delete ${confirm.name}?`}
          message="Every invoice, party, product and ledger entry in this business will be permanently deleted. Your other businesses are not affected."
          confirmLabel="Delete business"
          onConfirm={async () => { await api.deleteBusiness(confirm.id); toast('Business deleted', 'ok'); onDeleteBusiness(confirm.id); }}
          onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

function StaffForm({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const role = value.role || 'staff';
  return (
    <div className="form-grid">
      <Field label="Name" req><input className="input" value={value.name || ''} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
      <Field label="Email (login ID)" req><input className="input" type="email" value={value.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="user@company.in" /></Field>
      <Field label="Login Password" req hint="Initial password for account sign in (min 6 characters)">
        <input
          className="input"
          type="password"
          value={value.password || ''}
          onChange={(e) => set('password', e.target.value)}
          placeholder="Min 6 characters (e.g. staff1234)"
        />
      </Field>
      <Field label="Mobile"><input className="input" value={value.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="98XXXXXXXX" /></Field>
      <Field label="Role">
        <select className="input" value={role} onChange={(e) => set('role', e.target.value)}>
          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Field>
      <div className="full hint">{ROLES.find((r) => r.id === role).desc}</div>
      <div className="full" style={{ background: 'var(--surface-2)', borderRadius: 11, padding: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>Permissions</div>
        {Object.entries({ dashboard: 'Dashboard', billing: 'Billing', khata: 'Khata', inventory: 'Inventory', reports: 'Reports & GST', settings: 'Settings', staff: 'Manage staff' }).map(([k, label]) => (
          <label className="checkbox" key={k} style={{ marginBottom: 4 }}>
            <input type="checkbox" checked={(value.permissions || PERMS[role]).includes(k)}
              onChange={(e) => {
                const cur = value.permissions || PERMS[role];
                set('permissions', e.target.checked ? [...cur, k] : cur.filter((x) => x !== k));
              }} /> {label}
          </label>
        ))}
      </div>
    </div>
  );
}
