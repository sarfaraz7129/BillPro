import React, { useState } from 'react';
import { api, setToken } from '../src/api.js';
import { Icon } from '../src/ui.jsx';
import { Field } from '../src/components.jsx';

const FEATURES = [
  { icon: 'layers', title: 'Run several businesses from one login', body: 'Separate GSTIN, invoices, stock and ledgers - plus one combined group view.' },
  { icon: 'invoice', title: 'GST invoices, E-Way Bill & e-Invoice', body: 'CGST/SGST/IGST, HSN summary, UPI QR on every bill, GSTR-1 & 3B ready.' },
  { icon: 'khata', title: 'Khata with you-gave / you-got', body: 'Live party balances, credit limits, overdue reminders and statements.' },
  { icon: 'box', title: 'Inventory that updates itself', body: 'Stock moves with every sale and purchase, with low-stock alerts.' }
];

export default function Login({ onAuthed }) {
  const [mode, setMode] = useState('login');
  // Pre-fill demo credentials so the user can sign in immediately with one click
  const [form, setForm] = useState({ name: '', email: 'demo@billpro.in', phone: '', password: 'demo1234' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const executeLogin = async (email, password) => {
    setErr('');
    setBusy(true);
    try {
      const res = await api.login({ email, password });
      setToken(res.token);
      onAuthed(res.user, res.businesses);
    } catch (ex) {
      setErr(ex.message || 'Login failed. Please check credentials.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const email = (form.email || '').trim() || 'demo@billpro.in';
        const password = form.password || 'demo1234';
        await executeLogin(email, password);
      } else {
        const name = (form.name || '').trim();
        const email = (form.email || '').trim();
        const password = form.password || '';
        if (!name || !email || !password) {
          setErr('Please fill in your name, email and password');
          setBusy(false);
          return;
        }
        const res = await api.signup({ name, email, phone: form.phone, password });
        setToken(res.token);
        onAuthed(res.user, res.businesses);
      }
    } catch (ex) {
      setErr(ex.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const demo = () => {
    setForm({ name: '', email: 'demo@billpro.in', phone: '', password: 'demo1234' });
    setMode('login');
    executeLogin('demo@billpro.in', 'demo1234');
  };

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="brand-mark" style={{ background: 'rgba(255,255,255,.16)' }}>B</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>BillPro</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>Billing · Khata · GST · Inventory</div>
            </div>
          </div>
          <h1>Every business you run.<br />One billing system.</h1>
          <p>Make GST invoices, keep party khatas, track stock and file returns - without switching between apps or spreadsheets.</p>
          <div className="hero-feats">
            {FEATURES.map((f) => {
              const I = Icon[f.icon];
              return (
                <div className="hero-feat" key={f.title}>
                  <div className="dot"><I size={16} /></div>
                  <div><b>{f.title}</b><span>{f.body}</span></div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.5)', position: 'relative', zIndex: 1 }}>
          Installable on your phone · works offline · your data stays on your server
        </div>
      </div>

      <div className="auth-side">
        <div className="auth-card">
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p>{mode === 'login' ? 'Sign in to open your businesses.' : 'Set up once, then add as many businesses as you need.'}</p>

          {/* Quick Demo Login button */}
          <div style={{ marginBottom: 18 }}>
            <button
              type="button"
              className="btn primary lg block"
              style={{
                background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)',
                boxShadow: '0 4px 14px rgba(79,70,229,.35)',
                fontWeight: 650,
                fontSize: 14,
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
              onClick={() => executeLogin('demo@billpro.in', 'demo1234')}
              disabled={busy}
            >
              <Icon.zap size={16} /> {busy ? 'Signing in…' : '1-Click Demo Login (Coastal Traders)'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              or enter account details below
            </div>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'on' : ''}
              onClick={() => { setMode('login'); setErr(''); }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'on' : ''}
              onClick={() => { setMode('signup'); setErr(''); setForm({ name: '', email: '', phone: '', password: '' }); }}
            >
              Create account
            </button>
          </div>

          <form onSubmit={submit} className="form-grid">
            {mode === 'signup' && (
              <>
                <Field label="Your name" req full>
                  <input
                    className="input"
                    value={form.name}
                    onChange={set('name')}
                    placeholder="Ramesh Shetty"
                    required
                  />
                </Field>
                <Field label="Mobile number" full>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={set('phone')}
                    placeholder="98450 12345"
                  />
                </Field>
              </>
            )}
            <Field label="Email" req full>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@business.in"
                autoComplete="email"
              />
            </Field>
            <Field label="Password" req full>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                autoComplete="current-password"
              />
            </Field>
            {err && <div className="banner err full"><Icon.alert size={15} />{err}</div>}
            <div className="full">
              <button type="submit" className="btn primary lg block" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account & continue'}
              </button>
            </div>
          </form>

          <div className="demo-box" style={{ marginTop: 16 }}>
            <b>Demo account:</b> <code>demo@billpro.in</code> / <code>demo1234</code>
            <div style={{ marginTop: 6 }}>
              <button type="button" className="btn sm" style={{ padding: '4px 10px', fontSize: 12 }} onClick={demo}>
                Auto-fill & Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
