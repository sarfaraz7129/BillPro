import React, { useState, useEffect } from 'react';
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
  const [mode, setMode] = useState('login'); // 'login' | 'inquiry' | 'signup'
  const [salesInfo, setSalesInfo] = useState({
    sales_whatsapp: '919845012345',
    sales_phone: '+91 98450 12345',
    public_signup_enabled: false,
    pricing: { monthly: 499, yearly: 2999, lifetime: 7999 }
  });

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Inquiry form
  const [inqForm, setInqForm] = useState({
    name: '',
    phone: '',
    email: '',
    shop_name: '',
    city: '',
    plan: 'yearly',
    message: ''
  });
  const [inqSuccess, setInqSuccess] = useState(false);

  // Self signup form (if allowed)
  const [signupForm, setSignupForm] = useState({ name: '', email: '', phone: '', password: '' });

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.salesInfo()
      .then((info) => {
        if (info) setSalesInfo(info);
      })
      .catch(() => {});
  }, []);

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

  const handleLoginSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const email = (loginEmail || '').trim();
    const password = loginPassword || '';
    if (!email || !password) {
      setErr('Please enter your email and password');
      return;
    }
    await executeLogin(email, password);
  };

  const handleInquirySubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErr('');
    if (!inqForm.name || !inqForm.phone) {
      setErr('Please provide your name and WhatsApp number.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.submitInquiry(inqForm);
      setInqSuccess(true);

      // Open WhatsApp chat prefilled with their request
      const cleanPhone = String(res.sales_whatsapp || salesInfo.sales_whatsapp).replace(/[^\d]/g, '');
      const waText = `Hi BillPro Team! I am interested in getting a license for my business.\n\n👤 *Name:* ${inqForm.name}\n🏢 *Shop/Business:* ${inqForm.shop_name || 'My Shop'}\n📍 *City:* ${inqForm.city || 'India'}\n📦 *Plan:* ${inqForm.plan.toUpperCase()}\n📱 *Phone:* ${inqForm.phone}`;
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (ex) {
      setErr(ex.message || 'Failed to submit inquiry. Please try contacting directly on WhatsApp.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErr('');
    const { name, email, password, phone } = signupForm;
    if (!name || !email || !password) {
      setErr('Please fill in your name, email and password');
      return;
    }
    setBusy(true);
    try {
      const res = await api.signup({ name, email, phone, password });
      setToken(res.token);
      onAuthed(res.user, res.businesses);
    } catch (ex) {
      setErr(ex.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const directWhatsAppSales = (selectedPlan = 'yearly') => {
    const cleanPhone = String(salesInfo.sales_whatsapp || '919845012345').replace(/[^\d]/g, '');
    const waText = `👋 Hi BillPro Team! I would like to buy a license for BillPro Billing Suite (${selectedPlan.toUpperCase()} plan). Please share account onboarding details.`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`, '_blank', 'noopener,noreferrer');
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
          <p>Make GST invoices, keep party khatas, track stock and file returns - with dedicated multi-business support and thermal printer connectivity.</p>
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
          Installable PWA · Indian Standard Time (IST +5:30) · Secure Admin Licensing
        </div>
      </div>

      <div className="auth-side">
        <div className="auth-card" style={{ maxWidth: 440, width: '100%' }}>
          <h2>{mode === 'login' ? 'Sign in to BillPro' : mode === 'inquiry' ? 'Buy License / WhatsApp Sales' : 'Create Account'}</h2>
          <p>
            {mode === 'login'
              ? 'Enter your provisioned credentials to access your businesses.'
              : mode === 'inquiry'
              ? 'Accounts are provisioned by admin. Inquire below or chat directly on WhatsApp.'
              : 'Set up once, then add as many businesses as you need.'}
          </p>

          <div className="auth-tabs" style={{ marginTop: 18, marginBottom: 18 }}>
            <button
              type="button"
              className={mode === 'login' ? 'on' : ''}
              onClick={() => { setMode('login'); setErr(''); }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'inquiry' ? 'on' : ''}
              onClick={() => { setMode('inquiry'); setErr(''); setInqSuccess(false); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Icon.whatsapp size={15} style={{ color: '#22c55e' }} /> Buy License / WhatsApp
            </button>
            {salesInfo.public_signup_enabled && (
              <button
                type="button"
                className={mode === 'signup' ? 'on' : ''}
                onClick={() => { setMode('signup'); setErr(''); }}
              >
                Sign up
              </button>
            )}
          </div>

          {/* Mode 1: Sign in */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="form-grid">
              <Field label="Email Address" req full>
                <input
                  className="input"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="you@company.in or demo.user@billpro.in"
                  autoComplete="email"
                  required
                />
              </Field>

              <Field label="Password" req full>
                <input
                  className="input"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                />
              </Field>

              {err && (
                <div className="banner err full" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon.alert size={15} />
                    <span>{err}</span>
                  </div>
                  {(err.includes('suspended') || err.includes('expired')) && (
                    <button
                      type="button"
                      className="btn xs"
                      style={{ background: '#22c55e', color: '#fff', border: 0, alignSelf: 'flex-start', marginTop: 4 }}
                      onClick={() => directWhatsAppSales('renewal')}
                    >
                      <Icon.whatsapp size={12} /> Contact Sales on WhatsApp to Renew
                    </button>
                  )}
                </div>
              )}

              <div className="full" style={{ marginTop: 6 }}>
                <button type="submit" className="btn primary lg block" disabled={busy}>
                  {busy ? 'Verifying credentials…' : 'Sign in to Dashboard'}
                </button>
              </div>

              {/* Quick 1-Click Demo Account for Prospective Users */}
              <div className="full" style={{ marginTop: 16, textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 2 }}>
                  Want to explore software features?
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 10 }}>
                  Experience GST invoicing, counter POS, Khata ledgers & inventory in 1-click
                </div>
                <button
                  type="button"
                  className="btn block"
                  style={{
                    background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
                    color: '#4338ca',
                    border: '1px solid #c7d2fe',
                    fontWeight: 700,
                    padding: '10px 14px',
                    fontSize: 13
                  }}
                  onClick={() => {
                    setLoginEmail('demo.user@billpro.in');
                    setLoginPassword('demo1234');
                    executeLogin('demo.user@billpro.in', 'demo1234');
                  }}
                >
                  <Icon.sparkles size={14} style={{ color: '#4f46e5' }} /> ⚡ Try 1-Click Demo Account (Explore Features)
                </button>
              </div>

              {/* Need License Footer */}
              <div className="full" style={{ marginTop: 10, textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn text"
                  style={{ color: '#16a34a', fontSize: 12.5 }}
                  onClick={() => { setMode('inquiry'); setErr(''); }}
                >
                  <Icon.whatsapp size={14} /> Need a business license? Chat with sales
                </button>
              </div>
            </form>
          )}

          {/* Mode 2: WhatsApp Sales & Inquiry */}
          {mode === 'inquiry' && (
            <div>
              {/* Pricing Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                <div
                  style={{
                    border: inqForm.plan === 'monthly' ? '2px solid #4f46e5' : '1px solid var(--border)',
                    padding: 10,
                    borderRadius: 8,
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: inqForm.plan === 'monthly' ? 'rgba(79, 70, 229, 0.05)' : '#fff'
                  }}
                  onClick={() => setInqForm({ ...inqForm, plan: 'monthly' })}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>MONTHLY</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '4px 0 2px' }}>
                    ₹{salesInfo.pricing?.monthly || 499}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>per month</div>
                </div>

                <div
                  style={{
                    border: inqForm.plan === 'yearly' ? '2px solid #22c55e' : '1px solid var(--border)',
                    padding: 10,
                    borderRadius: 8,
                    textAlign: 'center',
                    cursor: 'pointer',
                    position: 'relative',
                    background: inqForm.plan === 'yearly' ? 'rgba(34, 197, 94, 0.06)' : '#fff'
                  }}
                  onClick={() => setInqForm({ ...inqForm, plan: 'yearly' })}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: -8,
                      right: 6,
                      background: '#22c55e',
                      color: '#fff',
                      fontSize: 8.5,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 4
                    }}
                  >
                    POPULAR
                  </span>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>YEARLY</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '4px 0 2px' }}>
                    ₹{salesInfo.pricing?.yearly || 2999}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>per year</div>
                </div>

                <div
                  style={{
                    border: inqForm.plan === 'lifetime' ? '2px solid #b45309' : '1px solid var(--border)',
                    padding: 10,
                    borderRadius: 8,
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: inqForm.plan === 'lifetime' ? 'rgba(245, 158, 11, 0.06)' : '#fff'
                  }}
                  onClick={() => setInqForm({ ...inqForm, plan: 'lifetime' })}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309' }}>LIFETIME</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '4px 0 2px' }}>
                    ₹{salesInfo.pricing?.lifetime || 7999}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>one-time</div>
                </div>
              </div>

              {/* Direct Instant WhatsApp Chat Button */}
              <div style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className="btn lg block"
                  style={{ background: '#22c55e', color: '#fff', border: 0, fontWeight: 700, fontSize: 14 }}
                  onClick={() => directWhatsAppSales(inqForm.plan)}
                >
                  <Icon.whatsapp size={18} /> Chat Directly on WhatsApp
                </button>
                <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                  Connect with sales at {salesInfo.sales_phone || '+91 98450 12345'}
                </div>
              </div>

              <div style={{ textAlign: 'center', margin: '14px 0 10px', position: 'relative' }}>
                <span style={{ background: '#fff', padding: '0 10px', fontSize: 11, color: 'var(--ink-3)', position: 'relative', zIndex: 1 }}>
                  OR SUBMIT ONBOARDING REQUEST
                </span>
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--border)' }} />
              </div>

              {inqSuccess ? (
                <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid #86efac', padding: 18, borderRadius: 10, textAlign: 'center' }}>
                  <Icon.check size={32} style={{ color: '#16a34a', margin: '0 auto 8px' }} />
                  <b style={{ color: '#15803d', display: 'block', fontSize: 15 }}>Inquiry Submitted!</b>
                  <p style={{ margin: '6px 0 12px', fontSize: 12.5, color: '#166534' }}>
                    Thank you, {inqForm.name}. Your details have been routed to our team. We will activate your license shortly.
                  </p>
                  <button
                    type="button"
                    className="btn sm"
                    style={{ background: '#16a34a', color: '#fff' }}
                    onClick={() => directWhatsAppSales(inqForm.plan)}
                  >
                    <Icon.whatsapp size={14} /> Open WhatsApp Chat Now
                  </button>
                </div>
              ) : (
                <form onSubmit={handleInquirySubmit} className="form-grid">
                  <Field label="Your Full Name" req full>
                    <input
                      className="input"
                      value={inqForm.name}
                      onChange={(e) => setInqForm({ ...inqForm, name: e.target.value })}
                      placeholder="e.g. Ramesh Patel"
                      required
                    />
                  </Field>

                  <Field label="WhatsApp Mobile Number" req full hint="We will contact you here to activate your software">
                    <input
                      className="input"
                      value={inqForm.phone}
                      onChange={(e) => setInqForm({ ...inqForm, phone: e.target.value })}
                      placeholder="e.g. 98450 12345"
                      required
                    />
                  </Field>

                  <Field label="Shop / Business Name" full>
                    <input
                      className="input"
                      value={inqForm.shop_name}
                      onChange={(e) => setInqForm({ ...inqForm, shop_name: e.target.value })}
                      placeholder="e.g. Patel Supermarket"
                    />
                  </Field>

                  <Field label="City / State" full>
                    <input
                      className="input"
                      value={inqForm.city}
                      onChange={(e) => setInqForm({ ...inqForm, city: e.target.value })}
                      placeholder="e.g. Ahmedabad, Gujarat"
                    />
                  </Field>

                  {err && <div className="banner err full"><Icon.alert size={15} />{err}</div>}

                  <div className="full" style={{ marginTop: 6 }}>
                    <button type="submit" className="btn primary lg block" disabled={busy}>
                      {busy ? 'Submitting…' : 'Submit & Connect on WhatsApp'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Mode 3: Self Registration (only when public_signup_enabled is true) */}
          {mode === 'signup' && salesInfo.public_signup_enabled && (
            <form onSubmit={handleSignupSubmit} className="form-grid">
              <Field label="Your Name" req full>
                <input
                  className="input"
                  value={signupForm.name}
                  onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
                  placeholder="Ramesh Shetty"
                  required
                />
              </Field>

              <Field label="Mobile Number" full>
                <input
                  className="input"
                  value={signupForm.phone}
                  onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })}
                  placeholder="98450 12345"
                />
              </Field>

              <Field label="Email Address" req full>
                <input
                  className="input"
                  type="email"
                  value={signupForm.email}
                  onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                  placeholder="you@business.in"
                  required
                />
              </Field>

              <Field label="Password" req full>
                <input
                  className="input"
                  type="password"
                  value={signupForm.password}
                  onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                  placeholder="At least 6 characters"
                  required
                />
              </Field>

              {err && <div className="banner err full"><Icon.alert size={15} />{err}</div>}

              <div className="full" style={{ marginTop: 6 }}>
                <button type="submit" className="btn primary lg block" disabled={busy}>
                  {busy ? 'Creating account…' : 'Create Account & Continue'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
