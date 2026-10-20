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
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
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
      setErr(ex.message || 'Login failed. Please check your email and password.');
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
        const email = (form.email || '').trim();
        const password = form.password || '';
        if (!email || !password) {
          setErr('Please enter your email and password');
          setBusy(false);
          return;
        }
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

          <div className="auth-tabs" style={{ marginTop: 20 }}>
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
                required
              />
            </Field>
            <Field label="Password" req full>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </Field>
            {err && <div className="banner err full"><Icon.alert size={15} />{err}</div>}
            <div className="full" style={{ marginTop: 6 }}>
              <button type="submit" className="btn primary lg block" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account & continue'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
