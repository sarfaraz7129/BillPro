import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, setToken, setBizId, getBizId, getToken, syncServerTime } from './api.js';
import { Icon, initials, colorFor } from './ui.jsx';
import { Toasts, Modal, Field, GstRateInput } from './components.jsx';
import BusinessSwitcher from './BusinessSwitcher.jsx';
import Login from '../pages/Login.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Billing from '../pages/Billing.jsx';
import POS from '../pages/POS.jsx';
import Khata from '../pages/Khata.jsx';
import Inventory from '../pages/Inventory.jsx';
import Reports from '../pages/Reports.jsx';
import Group from '../pages/Group.jsx';
import Settings from '../pages/Settings.jsx';

const NAV = [
  { section: 'Run the business', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'pos', label: 'Counter billing (POS)', icon: 'pos' },
    { id: 'billing', label: 'Invoices & bills', icon: 'invoice' },
    { id: 'khata', label: 'Khata / ledgers', icon: 'khata' },
    { id: 'inventory', label: 'Inventory', icon: 'box' }
  ]},
  { section: 'Money & compliance', items: [
    { id: 'reports', label: 'Reports & GST', icon: 'chart' },
    { id: 'group', label: 'All businesses', icon: 'layers' }
  ]},
  { section: 'Setup', items: [
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ]}
];

const TITLES = {
  dashboard: ['Dashboard', 'Today at a glance'],
  pos: ['Counter billing', 'Fast billing with automatic stock updates'],
  billing: ['Invoices & bills', 'GST invoices, purchases, quotations and expenses'],
  khata: ['Khata', 'Party ledgers, payments and credit limits'],
  inventory: ['Inventory', 'Products, stock levels and low-stock alerts'],
  reports: ['Reports & GST', 'GSTR-1, GSTR-3B, profit, ageing and day book'],
  group: ['All businesses', 'Consolidated numbers across everything you own'],
  settings: ['Settings', 'Business profile, GST, banking, staff and account']
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [active, setActive] = useState(null);
  const [group, setGroup] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [nav, setNav] = useState({ type: null, docId: null, partyId: null });
  const [toasts, setToasts] = useState([]);
  const [drawer, setDrawer] = useState(false);
  const [bizModal, setBizModal] = useState(false);
  const [needBusiness, setNeedBusiness] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);

  const toast = useCallback((msg, kind) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  /* ---------- boot ---------- */
  /* ---------- boot ---------- */
  const boot = useCallback(async (u, initialBizs) => {
    try {
      let bizs = initialBizs;
      if (!bizs || !Array.isArray(bizs) || bizs.length === 0) {
        try {
          const list = await api.businesses();
          bizs = list?.businesses || [];
        } catch (fetchErr) {
          await new Promise((r) => setTimeout(r, 600));
          const list = await api.businesses();
          bizs = list?.businesses || [];
        }
      }
      setBusinesses(bizs);
      if (bizs.length === 0) {
        setActive(null);
        setNeedBusiness(true);
        setBizModal(true);
      } else {
        const stored = Number(getBizId());
        const targetId = u?.activeBusinessId || stored;
        const pick = bizs.find((b) => b.id === targetId) || bizs[0];
        setActive(pick);
        setBizId(pick.id);
        if (u?.activeBusinessId !== pick.id) {
          api.setActiveBusiness(pick.id).catch(() => {});
        }
      }
      api.groupOverview().then((g) => setGroup(g)).catch(() => {});
    } catch (err) {
      console.error('Failed to load businesses on boot:', err);
      toast('Could not load businesses: ' + (err.message || 'Please refresh'), 'err');
    } finally {
      setBooting(false);
    }
  }, [toast]);

  useEffect(() => {
    // Authoritative Indian Standard Time (+5:30) sync at software level
    api.time().then((t) => { if (t && t.epoch) syncServerTime(t.epoch); }).catch(() => {});

    const t = getToken();
    if (!t) {
      setBooting(false);
      return;
    }
    let active = true;
    api.me({ forceLogout: true })
      .then((r) => {
        if (!active) return;
        setUser(r.user);
        return boot(r.user, r.businesses);
      })
      .catch((err) => {
        if (!active) return;
        console.warn('Session expired or invalid:', err);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (active) setBooting(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const out = () => { setToken(null); setUser(null); setPage('dashboard'); };
    window.addEventListener('billpro:signed-out', out);
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('billpro:signed-out', out); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const switchBusiness = async (b) => {
    setActive(b); setBizId(b.id); setNav({});
    setPage((p) => (p === 'group' ? 'dashboard' : p));
    try { await api.setActiveBusiness(b.id); toast(`Switched to ${b.name}`, 'ok'); } catch (e) { toast(e.message, 'err'); }
  };

  /** Navigate. opts can carry { type, docId, partyId } so a page can deep-link straight to a record. */
  const goto = useCallback((p, opts) => {
    const o = opts || {};
    setNav({ type: o.type || null, docId: o.docId || null, partyId: o.partyId || null });
    setPage(p);
    setDrawer(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /* ---------- service worker cleanup in dev/preview ---------- */
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) {
          r.unregister();
        }
      }).catch(() => {});
    }
  }, []);

  if (booting) return <div className="empty" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading BillPro…</div>;
  if (!user) return (
    <>
      <Login onAuthed={(u, bzs) => {
        setUser(u);
        if (bzs && bzs.length > 0) {
          setBusinesses(bzs);
          const activeBiz = bzs.find((b) => b.id === u?.activeBusinessId) || bzs[0];
          setActive(activeBiz);
          setBizId(activeBiz.id);
        }
        boot(u, bzs);
      }} />
      <Toasts toasts={toasts} />
    </>
  );

  const [title, sub] = TITLES[page] || TITLES.dashboard;

  return (
    <div className="app">
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">B</div>
          <div className="brand-name">BillPro<small>Billing · Khata · GST</small></div>
        </div>
        <nav className="nav">
          {NAV.map((sec) => (
            <div key={sec.section}>
              <div className="nav-label">{sec.section}</div>
              {sec.items.map((it) => {
                const I = Icon[it.icon];
                return (
                  <a key={it.id} className={page === it.id ? 'on' : ''} onClick={() => goto(it.id)}>
                    <I size={16} /> {it.label}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            {offline ? <Icon.wifiOff size={13} /> : <Icon.cloud size={13} />}
            {offline ? 'Offline - reconnect to sync' : 'Connected · data saved on server'}
          </div>
          Signed in as <b style={{ color: '#cbd5e1' }}>{user.name}</b>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn sm" style={{ background: 'rgba(255,255,255,.07)', border: 0, color: '#cbd5e1' }} onClick={() => goto('settings')}>
              <Icon.settings size={13} /> Settings
            </button>
            <button className="btn sm" style={{ background: 'rgba(255,255,255,.07)', border: 0, color: '#cbd5e1' }}
              onClick={() => { setToken(null); setUser(null); setPage('dashboard'); }}>
              <Icon.logout size={13} /> Sign out
            </button>
          </div>
        </div>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setDrawer(true)} aria-label="Open navigation menu"><Icon.menu /></button>
          <BusinessSwitcher businesses={businesses} active={active} group={group}
            onSwitch={switchBusiness} onAdd={() => setBizModal(true)} onGroup={() => goto('group')} />
          <div className="spacer" />
          <div className="topbar-titles">
            <div className="topbar-title">{title}</div>
            <div className="topbar-sub">{sub}</div>
          </div>
          <button className="btn primary topbar-action-btn" onClick={() => goto('billing', { type: 'sale', docId: 'new' })} title="New invoice">
            <Icon.plus size={15} /> <span className="btn-label">New invoice</span>
          </button>
        </header>

        <div className="content">
          {offline && <div className="banner warn"><Icon.wifiOff size={15} />You are offline. Saved records are still visible; new entries need a connection.</div>}
          {!active ? (
            <div className="empty" style={{ padding: '70px 20px' }}>
              <Icon.building size={44} />
              <b>Create your first business</b>
              <div style={{ maxWidth: 420, margin: '0 auto 14px' }}>Add your shop or company details - GSTIN, address, bank - and BillPro will number and tax every invoice for it.</div>
              <button className="btn primary" onClick={() => setBizModal(true)}><Icon.plus size={15} /> Add business</button>
            </div>
          ) : (
            <>
              {page === 'dashboard' && <Dashboard business={active} goto={goto} toast={toast} />}
              {page === 'pos' && <POS business={active} toast={toast} />}
              {page === 'billing' && <Billing business={active} user={user} initialType={nav.type} initialDocId={nav.docId} goto={goto} toast={toast} />}
              {page === 'khata' && <Khata business={active} initialType={nav.type} initialPartyId={nav.partyId} toast={toast} />}
              {page === 'inventory' && <Inventory business={active} toast={toast} />}
              {page === 'reports' && <Reports business={active} toast={toast} />}
              {page === 'group' && <Group businesses={businesses} onSwitch={switchBusiness} goto={goto} toast={toast} />}
              {page === 'settings' && (
                <Settings business={active} user={user} toast={toast} onAddBusiness={() => setBizModal(true)}
                  onBusinessSaved={(b) => {
                    setBusinesses((old) => old.map((x) => (x.id === b.id ? b : x)));
                    setActive(b);
                    api.groupOverview().then(setGroup).catch(() => {});
                  }}
                  onDeleteBusiness={async () => {
                    const list = await api.businesses();
                    setBusinesses(list.businesses);
                    if (list.businesses.length) { setActive(list.businesses[0]); setBizId(list.businesses[0].id); }
                    else { setActive(null); setNeedBusiness(true); }
                    api.groupOverview().then(setGroup).catch(() => {});
                  }} />
              )}
            </>
          )}
        </div>
      </div>

      {bizModal && <NewBusiness businesses={businesses} onClose={() => setBizModal(false)} toast={toast}
        onCreated={async (b) => {
          const list = await api.businesses();
          setBusinesses(list.businesses);
          setNeedBusiness(false);
          setBizModal(false);
          await switchBusiness(b);
          api.groupOverview().then(setGroup).catch(() => {});
        }} />}

      <Toasts toasts={toasts} />
    </div>
  );
}

function NewBusiness({ businesses, onClose, onCreated, toast }) {
  const [form, setForm] = useState({
    name: '', gstin: '', address: '', city: '', state: '', state_code: '', pincode: '', phone: '', email: '',
    invoice_prefix: 'INV', default_gst_rate: 18, credit_days: 30, bank_name: '', bank_account_no: '', bank_ifsc: '',
    upi_id: '', color: '#4f46e5'
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api.createBusiness(form);
      toast(`${r.business.name} is ready`, 'ok');
      onCreated(r.business);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal title="Add a business" sub={businesses.length ? `You already run ${businesses.length} - each keeps its own books` : 'Your first business'}
      size="wide" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create business'}</button></>}>
      {err && <div className="banner err"><Icon.alert size={15} />{err}</div>}
      <div className="form-grid">
        <Field label="Business name" req><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="Coastal Traders" /></Field>
        <Field label="GSTIN" hint="Optional for unregistered / composition dealers">
          <input className="input" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="29AAAAA1111A1Z1" />
        </Field>
        <Field label="Address" full><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="City"><input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Mangaluru" /></Field>
        <Field label="State"><input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="Karnataka" /></Field>
        <Field label="Pincode"><input className="input" value={form.pincode} onChange={(e) => set('pincode', e.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Invoice prefix"><input className="input" value={form.invoice_prefix} onChange={(e) => set('invoice_prefix', e.target.value.toUpperCase())} /></Field>
        <Field label="Default GST rate" hint="Standard slab or custom percentage">
          <GstRateInput value={form.default_gst_rate} onChange={(r) => set('default_gst_rate', r)} />
        </Field>
        <Field label="Credit period (days)"><input className="input" type="number" value={form.credit_days} onChange={(e) => set('credit_days', Number(e.target.value))} /></Field>
        <Field label="UPI ID"><input className="input" value={form.upi_id} onChange={(e) => set('upi_id', e.target.value)} placeholder="business@okaxis" /></Field>
        <Field label="Accent colour">
          <div style={{ display: 'flex', gap: 7 }}>
            {['#4f46e5', '#047857', '#b91c1c', '#b45309', '#334155', '#7c3aed', '#0891b2', '#db2777'].map((c) => (
              <span key={c} onClick={() => set('color', c)}
                style={{ width: 26, height: 26, borderRadius: 8, background: c, cursor: 'pointer', border: form.color === c ? '2.5px solid var(--ink)' : '2.5px solid transparent' }} />
            ))}
          </div>
        </Field>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>You can add bank details, staff and invoice terms later under Settings.</div>
    </Modal>
  );
}

/* ---------- mount ---------- */
import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')).render(<App />);
