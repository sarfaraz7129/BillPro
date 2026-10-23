import React, { useState, useEffect, useMemo } from 'react';
import { api, money, isSuperAdmin } from '../src/api.js';
import { Icon, initials, colorFor } from '../src/ui.jsx';
import { Modal, Confirm, Field } from '../src/components.jsx';

export default function SuperAdmin({ user, toast }) {
  const [tab, setTab] = useState('clients'); // clients | inquiries | settings
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [settings, setSettings] = useState({
    sales_whatsapp: '919880735072',
    sales_phone: '+91 9880735072',
    public_signup_enabled: false,
    pricing_monthly: 300,
    pricing_yearly: 3000,
    pricing_lifetime: 20000
  });
  const [loading, setLoading] = useState(true);
  const [persistenceInfo, setPersistenceInfo] = useState(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

  // Search & filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [inquiryFilter, setInquiryFilter] = useState('all');

  // Modals
  const [provisionModal, setProvisionModal] = useState(false);
  const [renewTarget, setRenewTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [convertTarget, setConvertTarget] = useState(null);
  const [credentialsModal, setCredentialsModal] = useState(null);

  // Provisioning form state
  const [provForm, setProvForm] = useState({
    name: '',
    email: '',
    phone: '',
    business_name: '',
    password: 'BillPro@' + Math.floor(100 + Math.random() * 900),
    plan: 'yearly',
    custom_days: ''
  });
  const [provBusy, setProvBusy] = useState(false);
  const [provErr, setProvErr] = useState('');

  // Renewal form state
  const [renewPlan, setRenewPlan] = useState('yearly');
  const [renewDays, setRenewDays] = useState('');
  const [renewBusy, setRenewBusy] = useState(false);

  // Conversion form state
  const [convertForm, setConvertForm] = useState({
    password: 'BillPro@' + Math.floor(100 + Math.random() * 900),
    plan: 'yearly',
    business_name: ''
  });
  const [convertBusy, setConvertBusy] = useState(false);

  // Settings form state
  const [settingsBusy, setSettingsBusy] = useState(false);

  const loadAll = async () => {
    try {
      const [st, uList, inq, setts, pStat] = await Promise.all([
        api.adminStats().catch(() => null),
        api.adminUsers().catch(() => ({ users: [] })),
        api.adminInquiries().catch(() => ({ inquiries: [] })),
        api.adminSettings().catch(() => null),
        api.adminPersistenceStatus().catch(() => null)
      ]);
      if (st) setStats(st);
      if (uList && uList.users) setUsers(uList.users);
      if (inq && inq.inquiries) setInquiries(inq.inquiries);
      if (setts && setts.settings) setSettings(setts.settings);
      if (pStat && pStat.storage) setPersistenceInfo(pStat.storage);
    } catch (err) {
      console.error('SuperAdmin load failed:', err);
      toast('Failed to load super admin data: ' + err.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!confirm('Restoring will import businesses and parties from this backup file. Continue?')) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setRestoreBusy(true);
        const json = JSON.parse(evt.target.result);
        await api.adminRestoreData(json);
        toast('Database restored successfully!', 'ok');
        loadAll();
      } catch (err) {
        toast('Failed to restore: ' + err.message, 'err');
      } finally {
        setRestoreBusy(false);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleProvision = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setProvErr('');
    if (!provForm.name || !provForm.email) {
      setProvErr('Name and Email are required.');
      return;
    }
    setProvBusy(true);
    try {
      const res = await api.adminCreateUser(provForm);
      toast(`Customer account created for ${res.user.name}`, 'ok');
      setProvisionModal(false);

      const targetPhone = provForm.phone || (res.user && res.user.phone);
      if (res.welcome_whatsapp) {
        openWhatsApp(targetPhone, res.welcome_whatsapp);
      }

      setCredentialsModal({
        user: res.user,
        business: res.business,
        welcome_whatsapp: res.welcome_whatsapp,
        phone: targetPhone
      });
      setProvForm({
        name: '',
        email: '',
        phone: '',
        business_name: '',
        password: 'BillPro@' + Math.floor(100 + Math.random() * 900),
        plan: 'yearly',
        custom_days: ''
      });
      loadAll();
    } catch (err) {
      setProvErr(err.message || 'Failed to provision user');
    } finally {
      setProvBusy(false);
    }
  };

  const handleRenew = async () => {
    if (!renewTarget) return;
    setRenewBusy(true);
    try {
      await api.adminRenewUser(renewTarget.id, {
        plan: renewPlan,
        days: renewDays ? Number(renewDays) : undefined
      });
      toast(`Renewed ${renewTarget.name}'s subscription under ${renewPlan.toUpperCase()} plan`, 'ok');
      setRenewTarget(null);
      loadAll();
    } catch (err) {
      toast(err.message || 'Renewal failed', 'err');
    } finally {
      setRenewBusy(false);
    }
  };

  const openEditModal = (u) => {
    const primaryBiz = (u.businesses && u.businesses[0]) || {};
    setEditTarget({
      id: u.id,
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      status: u.status || 'active',
      plan: u.plan || 'yearly',
      expires_at: u.expires_at || '',
      initial_password: u.initial_password || (u.email === 'zoheb@billpro.in' ? 'demo1234' : 'BillPro@123'),
      new_password: '',
      is_superadmin: Boolean(u.is_superadmin),
      // Business Profile fields
      business_id: primaryBiz.id,
      business_name: primaryBiz.name || '',
      legal_name: primaryBiz.legal_name || '',
      gstin: primaryBiz.gstin || '',
      pan: primaryBiz.pan || '',
      business_phone: primaryBiz.phone || u.phone || '',
      business_email: primaryBiz.email || u.email || '',
      address: primaryBiz.address || '',
      city: primaryBiz.city || '',
      state: primaryBiz.state || '',
      state_code: primaryBiz.state_code || '',
      pincode: primaryBiz.pincode || '',
      invoice_prefix: primaryBiz.invoice_prefix || 'INV',
      default_gst_rate: primaryBiz.default_gst_rate !== undefined ? primaryBiz.default_gst_rate : 18,
      credit_days: primaryBiz.credit_days !== undefined ? primaryBiz.credit_days : 30,
      bank_name: primaryBiz.bank_name || '',
      bank_account_no: primaryBiz.bank_account_no || '',
      bank_ifsc: primaryBiz.bank_ifsc || '',
      upi_id: primaryBiz.upi_id || ''
    });
  };

  const handleUpdateUser = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editTarget) return;
    setEditBusy(true);
    try {
      await api.adminUpdateUser(editTarget.id, editTarget);
      toast(`Saved changes for ${editTarget.name} & ${editTarget.business_name || 'business'}!`, 'ok');
      setEditTarget(null);
      loadAll();
    } catch (err) {
      toast(err.message || 'Update failed', 'err');
    } finally {
      setEditBusy(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api.adminDeleteUser(deleteTarget.id);
      toast('Customer account and records removed', 'ok');
      setDeleteTarget(null);
      loadAll();
    } catch (err) {
      toast(err.message || 'Delete failed', 'err');
    }
  };

  const handleConvertInquiry = async () => {
    if (!convertTarget) return;
    setConvertBusy(true);
    try {
      const res = await api.adminConvertInquiry(convertTarget.id, convertForm);
      toast(`Inquiry converted to client account for ${res.user.name}!`, 'ok');
      const targetPhone = convertTarget.phone || (res.user && res.user.phone);
      if (res.welcome_whatsapp) {
        openWhatsApp(targetPhone, res.welcome_whatsapp);
      }
      setConvertTarget(null);
      setCredentialsModal({
        user: res.user,
        business: res.business,
        welcome_whatsapp: res.welcome_whatsapp,
        phone: targetPhone
      });
      loadAll();
    } catch (err) {
      toast(err.message || 'Conversion failed', 'err');
    } finally {
      setConvertBusy(false);
    }
  };

  const handleUpdateInquiryStatus = async (inqId, newStatus) => {
    try {
      await api.adminUpdateInquiry(inqId, { status: newStatus });
      toast(`Inquiry marked as ${newStatus}`, 'ok');
      loadAll();
    } catch (err) {
      toast(err.message || 'Failed to update inquiry', 'err');
    }
  };

  const handleDeleteInquiry = async (inqId) => {
    try {
      await api.adminDeleteInquiry(inqId);
      toast('Inquiry deleted', 'ok');
      loadAll();
    } catch (err) {
      toast(err.message || 'Failed to delete inquiry', 'err');
    }
  };

  const handleSaveSettings = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSettingsBusy(true);
    try {
      await api.adminUpdateSettings(settings);
      toast('System & pricing settings saved successfully', 'ok');
    } catch (err) {
      toast(err.message || 'Failed to save settings', 'err');
    } finally {
      setSettingsBusy(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const matchQ = !q ||
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q) ||
        (u.businesses && u.businesses.some((b) => b.name?.toLowerCase().includes(q)));
      
      let matchStatus = true;
      if (statusFilter === 'active') matchStatus = u.status === 'active' && !u.is_expired;
      else if (statusFilter === 'expired') matchStatus = u.is_expired;
      else if (statusFilter === 'suspended') matchStatus = u.status === 'suspended';

      return matchQ && matchStatus;
    });
  }, [users, search, statusFilter]);

  const filteredInquiries = useMemo(() => {
    return inquiries.filter((inq) => {
      if (inquiryFilter === 'all') return true;
      return inq.status === inquiryFilter;
    });
  }, [inquiries, inquiryFilter]);

  const openWhatsApp = (phone, text) => {
    let clean = String(phone || '').replace(/\D/g, '');
    if (clean.startsWith('0') && clean.length === 11) clean = clean.slice(1);
    const num = clean.length === 10 ? '91' + clean : (clean.startsWith('91') && clean.length === 12 ? clean : clean);
    const url = num ? `https://wa.me/${num}?text=${encodeURIComponent(text || '')}` : `https://wa.me/?text=${encodeURIComponent(text || '')}`;

    let opened = false;
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (w && !w.closed && typeof w.closed !== 'undefined') {
        opened = true;
      }
    } catch (_) {}

    if (!opened) {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try { document.body.removeChild(a); } catch (_) {}
        }, 500);
      } catch (err) {
        console.warn('Could not launch WhatsApp link automatically:', err);
      }
    }
  };

  const shareOnboardingWhatsApp = (u) => {
    const origin = window.location.origin;
    const primaryBiz = (u.businesses && u.businesses[0]) || {};
    const pwd = u.initial_password || (u.email === 'zoheb@billpro.in' ? 'demo1234' : 'BillPro@123');
    const expiryText = u.expires_at ? `Valid till ${u.expires_at}` : 'Lifetime Access (Never expires)';
    const cleanPhone = u.phone ? String(u.phone).trim() : '';

    const msg = `👋 *Welcome to BillPro Billing Suite!*\n\nHello *${u.name}*,\nYour business billing account credentials are ready:\n\n🌐 *Login URL:* ${origin}\n📧 *Login User / Email:* ${u.email}${cleanPhone ? `\n📱 *Mobile Number:* ${cleanPhone}` : ''}\n🔑 *Password:* ${pwd}\n\n🏢 *Business Name:* ${primaryBiz.name || 'Your Business'}${primaryBiz.gstin ? `\n🧾 *GSTIN:* ${primaryBiz.gstin}` : ''}\n📦 *License Plan:* ${(u.plan || 'yearly').toUpperCase()} (${expiryText})\n\n💡 Sign in now to start issuing GST invoices, manage stock, and track Khata ledgers!`;
    openWhatsApp(u.phone, msg);
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <Icon.refresh className="spin" size={24} />
        <div style={{ marginTop: 12, color: 'var(--ink-2)' }}>Loading Super Admin Dashboard…</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header Card */}
      <div className="card super-header-card" style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Super Admin Console
              </span>
              <span style={{ fontSize: 12, color: '#c7d2fe' }}>• Software Onboarding & Licensing</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, color: '#fff' }}>Client Provisioning & Access Control</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#c7d2fe' }}>
              Manage customer licenses, approve WhatsApp inquiries, and provision dedicated billing accounts.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn"
              style={{ background: '#22c55e', color: '#fff', border: 0, fontWeight: 600 }}
              onClick={() => setProvisionModal(true)}
            >
              <Icon.plus size={16} /> Provision New Client
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="super-stats-grid">
          <div className="super-stat-box">
            <div className="lbl">Total Clients</div>
            <div className="val">{stats?.users?.total || users.length}</div>
          </div>
          <div className="super-stat-box">
            <div className="lbl" style={{ color: '#86efac' }}>Active Accounts</div>
            <div className="val" style={{ color: '#86efac' }}>{stats?.users?.active || 0}</div>
          </div>
          <div className="super-stat-box">
            <div className="lbl" style={{ color: '#fca5a5' }}>Expired / Due</div>
            <div className="val" style={{ color: '#fca5a5' }}>{stats?.users?.expired || 0}</div>
          </div>
          <div className="super-stat-box">
            <div className="lbl" style={{ color: '#fde047' }}>New Inquiries</div>
            <div className="val" style={{ color: '#fde047' }}>{stats?.inquiries?.new || 0}</div>
          </div>
          <div className="super-stat-box">
            <div className="lbl">Lifetime Licenses</div>
            <div className="val">{stats?.plans?.lifetime || 0}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="auth-tabs super-tabs" style={{ background: 'var(--card-bg, #fff)', padding: 6, borderRadius: 12, border: '1px solid var(--border)', overflowX: 'auto', whiteSpace: 'nowrap', display: 'flex', gap: 6, scrollbarWidth: 'none' }}>
        <button
          type="button"
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          className={tab === 'clients' ? 'on' : ''}
          onClick={() => setTab('clients')}
        >
          <Icon.users size={15} /> Clients & Licenses ({users.length})
        </button>
        <button
          type="button"
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          className={tab === 'inquiries' ? 'on' : ''}
          onClick={() => setTab('inquiries')}
        >
          <Icon.whatsapp size={15} /> WhatsApp Inquiries & Leads
          {stats?.inquiries?.new > 0 && (
            <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
              {stats.inquiries.new}
            </span>
          )}
        </button>
        <button
          type="button"
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          className={tab === 'settings' ? 'on' : ''}
          onClick={() => setTab('settings')}
        >
          <Icon.settings size={15} /> Sales WhatsApp & Pricing Settings
        </button>
        <button
          type="button"
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          className={tab === 'persistence' ? 'on' : ''}
          onClick={() => setTab('persistence')}
        >
          <Icon.download size={15} /> Database & Backups
        </button>
      </div>

      {/* Tab 1: Clients & Onboarding */}
      {tab === 'clients' && (
        <div className="card">
          <div className="card-h" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260, flexWrap: 'wrap' }}>
              <div className="search-wrap" style={{ flex: '1 1 200px' }}>
                <Icon.search size={15} />
                <input
                  className="input"
                  placeholder="Search clients by name, email, phone, business…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="input"
                style={{ width: 'auto', flex: '0 0 auto' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active only</option>
                <option value="expired">Expired only</option>
                <option value="suspended">Suspended only</option>
              </select>
            </div>
            <button className="btn primary" onClick={() => setProvisionModal(true)}>
              <Icon.plus size={14} /> Provision Client
            </button>
          </div>

          {/* Desktop Table View */}
          <div className="table-wrap desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Primary Business</th>
                  <th>Subscription Plan</th>
                  <th>Validity & Expiry</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--ink-3)' }}>
                      No clients found matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === user.id;
                    const primaryBiz = u.businesses && u.businesses.length > 0 ? u.businesses[0] : null;
                    return (
                      <tr key={u.id} style={{ background: u.is_expired ? 'rgba(239, 68, 68, 0.04)' : undefined }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: colorFor(u.name || u.email),
                                color: '#fff',
                                display: 'grid',
                                placeItems: 'center',
                                fontWeight: 700,
                                fontSize: 13
                              }}
                            >
                              {initials(u.name || u.email)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                {u.name}
                                {u.is_superadmin && (
                                  <span style={{ marginLeft: 6, fontSize: 10, background: '#4f46e5', color: '#fff', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                    SUPER ADMIN
                                  </span>
                                )}
                                {isSelf && (
                                  <span style={{ marginLeft: 6, fontSize: 10, background: '#e2e8f0', color: '#334155', padding: '1px 5px', borderRadius: 4 }}>
                                    YOU
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{u.phone || '—'}</div>
                          {u.phone && (
                            <button
                              type="button"
                              className="btn xs"
                              style={{ marginTop: 4, background: '#22c55e', color: '#fff', border: 0, fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              onClick={() => shareOnboardingWhatsApp(u)}
                              title="Send complete login details & password on WhatsApp"
                            >
                              <Icon.whatsapp size={11} /> Send Password
                            </button>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{primaryBiz ? primaryBiz.name : '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                            {u.business_count} business{u.business_count !== 1 ? 'es' : ''} · {u.invoice_count} invoices
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              background: u.plan === 'lifetime' ? '#fef3c7' : u.plan === 'yearly' ? '#dbeafe' : '#f3e8ff',
                              color: u.plan === 'lifetime' ? '#92400e' : u.plan === 'yearly' ? '#1e40af' : '#6b21a8'
                            }}
                          >
                            {u.plan}
                          </span>
                        </td>
                        <td>
                          {u.plan === 'lifetime' ? (
                            <div style={{ fontWeight: 600, color: '#16a34a' }}>Lifetime (No expiry)</div>
                          ) : (
                            <div>
                              <div style={{ fontWeight: 500, color: u.is_expired ? '#dc2626' : 'var(--ink)' }}>
                                {u.expires_at || '—'}
                              </div>
                              {u.is_expired ? (
                                <span style={{ fontSize: 10.5, color: '#dc2626', fontWeight: 600 }}>Expired</span>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Active license</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              u.status === 'suspended' ? 'red' : u.is_expired ? 'amber' : 'green'
                            }`}
                          >
                            {u.status === 'suspended' ? 'Suspended' : u.is_expired ? 'Expired' : 'Active'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            {u.phone && (
                              <button
                                className="btn sm"
                                style={{ background: '#22c55e', color: '#fff', border: 0, fontWeight: 650 }}
                                title="Send login details & password on WhatsApp"
                                onClick={() => shareOnboardingWhatsApp(u)}
                              >
                                <Icon.whatsapp size={13} /> Send Credentials
                              </button>
                            )}
                            <button
                              className="btn sm"
                              title="Lock customer into permanent registry so account is never lost on redeploys"
                              onClick={async () => {
                                try {
                                  const res = await api.adminPersistUser(u.id);
                                  toast(res.message || 'Client locked into permanent registry!', 'ok');
                                } catch (err) {
                                  toast(err.message || 'Failed to persist client', 'err');
                                }
                              }}
                            >
                              📌 Lock Permanent
                            </button>
                            <button
                              className="btn sm"
                              title="Renew license plan"
                              onClick={() => {
                                setRenewTarget(u);
                                setRenewPlan(u.plan || 'yearly');
                                setRenewDays('');
                              }}
                            >
                              <Icon.sparkles size={13} /> Renew
                            </button>
                            <button
                              className="btn sm"
                              title="Edit user details, business profile & billing settings"
                              onClick={() => openEditModal(u)}
                            >
                              <Icon.edit size={13} /> Edit
                            </button>
                            {!isSelf && (
                              <button
                                className="btn sm red"
                                title="Delete client and records"
                                onClick={() => setDeleteTarget(u)}
                              >
                                <Icon.trash size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Responsive Cards View */}
          <div className="mobile-only mobile-cards-list" style={{ padding: 12 }}>
            {filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--ink-3)' }}>
                No clients found matching filter.
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isSelf = u.id === user.id;
                const primaryBiz = u.businesses && u.businesses.length > 0 ? u.businesses[0] : null;
                return (
                  <div
                    key={u.id}
                    className="super-client-card"
                    style={{
                      background: u.is_expired ? 'rgba(239, 68, 68, 0.03)' : 'var(--surface)',
                      border: `1px solid ${u.is_expired ? '#fecaca' : 'var(--line)'}`,
                      borderRadius: 14,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}
                  >
                    {/* Header: Avatar, Name & Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            background: colorFor(u.name || u.email),
                            color: '#fff',
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 700,
                            fontSize: 14,
                            flexShrink: 0
                          }}
                        >
                          {initials(u.name || u.email)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 14, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
                            <span>{u.name}</span>
                            {u.is_superadmin && (
                              <span style={{ fontSize: 9.5, background: '#4f46e5', color: '#fff', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                SUPER ADMIN
                              </span>
                            )}
                            {isSelf && (
                              <span style={{ fontSize: 9.5, background: '#e2e8f0', color: '#334155', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                                YOU
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.email}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`badge ${
                          u.status === 'suspended' ? 'red' : u.is_expired ? 'amber' : 'green'
                        }`}
                        style={{ flexShrink: 0, fontWeight: 700 }}
                      >
                        {u.status === 'suspended' ? 'Suspended' : u.is_expired ? 'Expired' : 'Active'}
                      </span>
                    </div>

                    {/* Business & Plan Details Box */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                        padding: '10px 12px',
                        background: 'var(--surface-2)',
                        borderRadius: 10,
                        fontSize: 12
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Primary Business</div>
                        <div style={{ fontWeight: 650, color: 'var(--ink)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {primaryBiz ? primaryBiz.name : '—'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                          {u.business_count} biz · {u.invoice_count} bills
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Plan & Expiry</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontSize: 10.5,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              background: u.plan === 'lifetime' ? '#fef3c7' : u.plan === 'yearly' ? '#dbeafe' : '#f3e8ff',
                              color: u.plan === 'lifetime' ? '#92400e' : u.plan === 'yearly' ? '#1e40af' : '#6b21a8'
                            }}
                          >
                            {u.plan}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: u.is_expired ? '#dc2626' : 'var(--ink-2)', fontWeight: u.is_expired ? 700 : 500, marginTop: 2 }}>
                          {u.plan === 'lifetime' ? 'Lifetime' : (u.expires_at ? `${u.is_expired ? 'Expired' : 'Valid'}: ${u.expires_at}` : '—')}
                        </div>
                      </div>
                    </div>

                    {/* Phone & WhatsApp Credentials */}
                    {u.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--ink-2)' }}>📞 <b>{u.phone}</b></span>
                        <button
                          type="button"
                          className="btn xs"
                          style={{ background: '#22c55e', color: '#fff', border: 0, fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => shareOnboardingWhatsApp(u)}
                          title="Send onboarding login credentials and password to customer on WhatsApp"
                        >
                          <Icon.whatsapp size={13} /> Send Credentials
                        </button>
                      </div>
                    )}

                    {/* Action Buttons Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: isSelf ? '1fr 1fr' : '1fr 1fr', gap: 8, paddingTop: 4, borderTop: '1px solid var(--line-soft)' }}>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ fontWeight: 600, justifyContent: 'center' }}
                        onClick={() => {
                          setRenewTarget(u);
                          setRenewPlan(u.plan || 'yearly');
                          setRenewDays('');
                        }}
                      >
                        <Icon.sparkles size={13} /> Renew Plan
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ fontWeight: 600, justifyContent: 'center' }}
                        onClick={() => openEditModal(u)}
                      >
                        <Icon.edit size={13} /> Edit Client
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ fontWeight: 600, justifyContent: 'center' }}
                        title="Lock client into permanent registry"
                        onClick={async () => {
                          try {
                            const res = await api.adminPersistUser(u.id);
                            toast(res.message || 'Client locked into permanent registry!', 'ok');
                          } catch (err) {
                            toast(err.message || 'Failed to persist client', 'err');
                          }
                        }}
                      >
                        📌 Lock Permanent
                      </button>
                      {!isSelf && (
                        <button
                          type="button"
                          className="btn sm red"
                          style={{ fontWeight: 600, justifyContent: 'center' }}
                          title="Delete client"
                          onClick={() => setDeleteTarget(u)}
                        >
                          <Icon.trash size={13} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 2: WhatsApp Inquiries & Leads */}
      {tab === 'inquiries' && (
        <div className="card">
          <div className="card-h" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0 }}>Prospective Client Inquiries</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-2)' }}>
                Direct leads captured from the public login screen via WhatsApp inquiry button.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['all', 'new', 'contacted', 'onboarded', 'dismissed'].map((st) => (
                <button
                  key={st}
                  className={`btn sm ${inquiryFilter === st ? 'primary' : ''}`}
                  onClick={() => setInquiryFilter(st)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredInquiries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>
                No inquiries under "{inquiryFilter}" status.
              </div>
            ) : (
              filteredInquiries.map((inq) => (
                <div
                  key={inq.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 16,
                    background: inq.status === 'new' ? 'rgba(34, 197, 94, 0.04)' : 'var(--card-bg, #fff)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <b style={{ fontSize: 15, color: 'var(--ink)' }}>{inq.name}</b>
                        {inq.shop_name && (
                          <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>
                            ({inq.shop_name}{inq.city ? `, ${inq.city}` : ''})
                          </span>
                        )}
                        <span
                          className={`badge ${
                            inq.status === 'new'
                              ? 'green'
                              : inq.status === 'onboarded'
                              ? 'blue'
                              : inq.status === 'contacted'
                              ? 'amber'
                              : 'gray'
                          }`}
                        >
                          {inq.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                        Submitted on: {inq.created_at} · Requested Plan:{' '}
                        <b style={{ color: '#4f46e5', textTransform: 'uppercase' }}>{inq.plan || 'yearly'}</b>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {inq.status !== 'onboarded' && (
                        <button
                          className="btn sm"
                          style={{ background: '#22c55e', color: '#fff', border: 0, fontWeight: 600 }}
                          onClick={() => {
                            setConvertTarget(inq);
                            setConvertForm({
                              password: 'BillPro@' + Math.floor(100 + Math.random() * 900),
                              plan: inq.plan || 'yearly',
                              business_name: inq.shop_name || `${inq.name}'s Business`
                            });
                          }}
                        >
                          <Icon.zap size={13} /> Convert to Provisioned Client
                        </button>
                      )}
                      <button
                        className="btn sm"
                        style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', border: '1px solid rgba(34, 197, 94, 0.2)' }}
                        onClick={() =>
                          openWhatsApp(
                            inq.phone,
                            `Hello ${inq.name}, thank you for contacting BillPro! I noticed your inquiry for ${inq.shop_name || 'your business'}. How can we assist you with onboarding?`
                          )
                        }
                      >
                        <Icon.whatsapp size={13} /> Chat on WhatsApp
                      </button>
                      <button
                        className="btn sm"
                        onClick={() =>
                          handleUpdateInquiryStatus(
                            inq.id,
                            inq.status === 'contacted' ? 'new' : 'contacted'
                          )
                        }
                      >
                        {inq.status === 'contacted' ? 'Mark New' : 'Mark Contacted'}
                      </button>
                      <button
                        className="btn sm red"
                        onClick={() => handleDeleteInquiry(inq.id)}
                        title="Delete inquiry"
                      >
                        <Icon.trash size={13} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, fontSize: 13, background: 'var(--bg, #f8fafc)', padding: '10px 14px', borderRadius: 8 }}>
                    <div>
                      <span style={{ color: 'var(--ink-3)' }}>WhatsApp / Phone:</span>{' '}
                      <b>{inq.phone}</b>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-3)' }}>Email:</span>{' '}
                      <b>{inq.email || '—'}</b>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-3)' }}>Location / City:</span>{' '}
                      <b>{inq.city || '—'}</b>
                    </div>
                  </div>

                  {inq.message && (
                    <div style={{ fontSize: 13, color: 'var(--ink-2)', fontStyle: 'italic', background: 'rgba(0,0,0,0.02)', padding: '8px 12px', borderRadius: 6 }}>
                      "{inq.message}"
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Sales WhatsApp & Pricing Settings */}
      {tab === 'settings' && (
        <div className="card">
          <div className="card-h">
            <div>
              <h3 style={{ margin: 0 }}>Sales Onboarding & Public Landing Settings</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-2)' }}>
                Configure your official WhatsApp support number, registration gating, and published license pricing.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} style={{ padding: 20 }}>
            <div className="form-grid">
              <Field label="Sales WhatsApp Number" req hint="Numbers only with country code (e.g. 919845012345)">
                <input
                  className="input"
                  value={settings.sales_whatsapp}
                  onChange={(e) => setSettings({ ...settings, sales_whatsapp: e.target.value })}
                  placeholder="919845012345"
                  required
                />
              </Field>

              <Field label="Display Phone Number" hint="Formatted phone displayed on the landing screen">
                <input
                  className="input"
                  value={settings.sales_phone}
                  onChange={(e) => setSettings({ ...settings, sales_phone: e.target.value })}
                  placeholder="+91 98450 12345"
                />
              </Field>

              <Field label="Registration Gating Mode" full hint="Control whether open public signups are permitted">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', background: 'var(--bg, #f8fafc)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <input
                    type="checkbox"
                    checked={settings.public_signup_enabled}
                    onChange={(e) => setSettings({ ...settings, public_signup_enabled: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>Allow Direct Public Self-Registration</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      When unchecked (recommended), the registration form is locked and customers must contact you on WhatsApp or submit an inquiry to be onboarded.
                    </div>
                  </div>
                </label>
              </Field>

              <div className="full" style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 10 }}>
                <h4 style={{ margin: '0 0 12px 0' }}>Subscription Pricing Displayed to Prospects</h4>
              </div>

              <Field label="Monthly Plan Price (₹)">
                <input
                  className="input"
                  type="number"
                  value={settings.pricing_monthly}
                  onChange={(e) => setSettings({ ...settings, pricing_monthly: Number(e.target.value) })}
                />
              </Field>

              <Field label="Yearly Plan Price (₹)">
                <input
                  className="input"
                  type="number"
                  value={settings.pricing_yearly}
                  onChange={(e) => setSettings({ ...settings, pricing_yearly: Number(e.target.value) })}
                />
              </Field>

              <Field label="Lifetime Plan Price (₹)">
                <input
                  className="input"
                  type="number"
                  value={settings.pricing_lifetime}
                  onChange={(e) => setSettings({ ...settings, pricing_lifetime: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div style={{ marginTop: 20 }}>
              <button type="submit" className="btn primary lg" disabled={settingsBusy}>
                {settingsBusy ? 'Saving…' : 'Save System Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 4: Database & Backups */}
      {tab === 'persistence' && (
        <div className="card">
          <div className="card-h">
            <div>
              <h3 style={{ margin: 0 }}>Data Persistence, Disaster Recovery & Backups</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-2)' }}>
                Protect and back up your client businesses, customer khata ledgers, and invoice records against cloud server redeploys.
              </p>
            </div>
          </div>

          <div style={{ padding: 20 }}>
            {/* Storage Mode Status */}
            <div style={{
              padding: '16px 18px',
              borderRadius: 12,
              marginBottom: 20,
              background: persistenceInfo?.isPersistent ? '#f0fdf4' : '#fffbeb',
              border: `1.5px solid ${persistenceInfo?.isPersistent ? '#86efac' : '#fde047'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{persistenceInfo?.isPersistent ? '✅' : '⚠️'}</span>
                <span style={{ fontWeight: 700, fontSize: 15, color: persistenceInfo?.isPersistent ? '#166534' : '#854d0e' }}>
                  {persistenceInfo?.isPersistent
                    ? 'Persistent Storage Active (/var/data)'
                    : 'Ephemeral Container Storage Mode (Render Default / Free)'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: persistenceInfo?.isPersistent ? '#14532d' : '#713f12', lineHeight: 1.5 }}>
                {persistenceInfo?.isPersistent
                  ? 'Your database is mounted on a persistent disk. All businesses, invoices, and parties are safely retained across every code deployment and restart.'
                  : 'Root Cause: Render cloud containers use temporary (ephemeral) disks by default. Every time code is deployed or the server sleeps, Render destroys the old container. To fix this permanently, attach a Render Persistent Disk (/var/data) or download regular backups below.'}
              </p>
            </div>

            {/* 1-Click Backups & Restore */}
            <div className="grid g2" style={{ gap: 16, marginBottom: 24 }}>
              <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-subtle, #f8fafc)' }}>
                <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon.download size={16} /> 1-Click Instant Data Backup
                </h4>
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 14 }}>
                  Export all client profiles, registered businesses, customer lists, and documents into an offline file anytime.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a
                    href="/api/admin/backup?format=json"
                    download
                    className="btn primary"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Icon.download size={14} /> Download JSON Backup
                  </a>
                  <a
                    href="/api/admin/backup?format=db"
                    download
                    className="btn"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    💾 Download Raw SQLite (.db)
                  </a>
                </div>
              </div>

              <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-subtle, #f8fafc)' }}>
                <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon.upload size={16} /> Restore Database from Backup
                </h4>
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 14 }}>
                  If a server reset ever occurs or a customer reports missing data, restore your JSON snapshot in seconds.
                </p>
                <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <Icon.upload size={14} /> {restoreBusy ? 'Restoring Data…' : 'Select Backup File (.json)'}
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRestoreFile}
                    disabled={restoreBusy}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            {/* Permanent Resolution Guide */}
            <div style={{ padding: 18, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
              <h4 style={{ margin: '0 0 8px 0', color: 'var(--ink)' }}>
                🛡️ Permanent Solution on Render: How to Enable Persistent Disk
              </h4>
              <ol style={{ margin: '0 0 10px 0', paddingLeft: 20, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                <li>Log in to your <b>Render.com Dashboard</b> and open your <b>billpro</b> Web Service.</li>
                <li>Go to <b>Disks</b> in the left menu and click <b>Add Disk</b> (requires Starter plan, disk is ~$0.25/month for 1 GB).</li>
                <li>Set <b>Name</b>: <code>billpro-data</code>, <b>Mount Path</b>: <code>/var/data</code>, <b>Size</b>: <code>1 GB</code>.</li>
                <li>Go to <b>Environment</b> and add: <code>BILLPRO_DATA_DIR=/var/data</code>.</li>
              </ol>
              <div style={{ fontSize: 12.5, color: 'var(--brand)', fontWeight: 650 }}>
                💡 Once attached, your SQLite database file resides permanently on that dedicated disk and is never deleted during code pushes or server sleep cycles!
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Provision New Client Modal */}
      {provisionModal && (
        <Modal
          title="Provision New Customer Billing Account"
          sub="Create a dedicated user and primary business with customized validity"
          size="wide"
          onClose={() => setProvisionModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setProvisionModal(false)}>Cancel</button>
              <button className="btn primary" onClick={handleProvision} disabled={provBusy}>
                {provBusy ? 'Provisioning Account…' : 'Create & Provision Account'}
              </button>
            </>
          }
        >
          {provErr && <div className="banner err"><Icon.alert size={15} />{provErr}</div>}
          <div className="form-grid">
            <Field label="Customer Full Name" req>
              <input
                className="input"
                value={provForm.name}
                onChange={(e) => setProvForm({ ...provForm, name: e.target.value })}
                placeholder="Ramesh Patel"
                required
              />
            </Field>

            <Field label="Login Email" req>
              <input
                className="input"
                type="email"
                value={provForm.email}
                onChange={(e) => setProvForm({ ...provForm, email: e.target.value })}
                placeholder="ramesh@pateltraders.com"
                required
              />
            </Field>

            <Field label="WhatsApp / Mobile Phone" hint="Can also be used directly to sign in">
              <input
                className="input"
                value={provForm.phone}
                onChange={(e) => setProvForm({ ...provForm, phone: e.target.value })}
                placeholder="98450 12345"
              />
            </Field>

            <Field label="Primary Business / Shop Name">
              <input
                className="input"
                value={provForm.business_name}
                onChange={(e) => setProvForm({ ...provForm, business_name: e.target.value })}
                placeholder="Patel Supermarket"
              />
            </Field>

            <Field label="GSTIN (Optional)" hint="15-character GSTIN">
              <input
                className="input"
                value={provForm.gstin || ''}
                onChange={(e) => setProvForm({ ...provForm, gstin: e.target.value.toUpperCase() })}
                placeholder="29AAAAA0000A1Z5"
                maxLength={15}
              />
            </Field>

            <Field label="City / Location (Optional)">
              <input
                className="input"
                value={provForm.city || ''}
                onChange={(e) => setProvForm({ ...provForm, city: e.target.value })}
                placeholder="Udupi"
              />
            </Field>

            <Field label="State (Optional)">
              <input
                className="input"
                value={provForm.state || ''}
                onChange={(e) => setProvForm({ ...provForm, state: e.target.value })}
                placeholder="Karnataka"
              />
            </Field>

            <Field label="Shop Address (Optional)">
              <input
                className="input"
                value={provForm.address || ''}
                onChange={(e) => setProvForm({ ...provForm, address: e.target.value })}
                placeholder="Main Road, Near City Bus Stand"
              />
            </Field>

            <Field label="Initial Password" req hint="Default auto-generated, can be changed by customer">
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input"
                  value={provForm.password}
                  onChange={(e) => setProvForm({ ...provForm, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => setProvForm({ ...provForm, password: 'BillPro@' + Math.floor(100 + Math.random() * 900) })}
                  title="Generate new random password"
                >
                  <Icon.refresh size={14} />
                </button>
              </div>
            </Field>

            <Field label="Subscription License Plan" req>
              <select
                className="input"
                value={provForm.plan}
                onChange={(e) => setProvForm({ ...provForm, plan: e.target.value })}
              >
                <option value="monthly">Monthly Plan (30 Days Validity)</option>
                <option value="yearly">Yearly Plan (365 Days Validity) - Recommended</option>
                <option value="lifetime">Lifetime License (Unlimited / No Expiry)</option>
              </select>
            </Field>

            {provForm.plan !== 'lifetime' && (
              <Field label="Custom Days (Optional)" hint="Leave empty to use standard plan duration">
                <input
                  className="input"
                  type="number"
                  placeholder="e.g. 45 or 180"
                  value={provForm.custom_days}
                  onChange={(e) => setProvForm({ ...provForm, custom_days: e.target.value })}
                />
              </Field>
            )}
          </div>
        </Modal>
      )}

      {/* Account Credentials / WhatsApp Sharing Modal */}
      {credentialsModal && (
        <Modal
          title="Account Provisioned Successfully! 🎉"
          sub="Client onboarded & credentials dispatched to WhatsApp"
          size="wide"
          onClose={() => setCredentialsModal(null)}
          footer={
            <>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard?.writeText(credentialsModal.welcome_whatsapp);
                  toast('Credentials message copied to clipboard!', 'ok');
                }}
              >
                <Icon.copy size={14} /> Copy Details
              </button>
              <button
                className="btn primary"
                style={{ background: '#22c55e', borderColor: '#22c55e', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => {
                  openWhatsApp(credentialsModal.phone, credentialsModal.welcome_whatsapp);
                }}
              >
                <Icon.whatsapp size={15} /> Resend to WhatsApp
              </button>
            </>
          }
        >
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: 10, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon.check size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {credentialsModal.phone
                  ? `WhatsApp message dispatched to ${credentialsModal.phone} with full login credentials.`
                  : 'Account created with login credentials below.'}
              </span>
            </div>
            {credentialsModal.phone && (
              <button
                type="button"
                className="btn sm"
                style={{ background: '#22c55e', color: '#fff', border: 0, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => openWhatsApp(credentialsModal.phone, credentialsModal.welcome_whatsapp)}
              >
                <Icon.whatsapp size={14} /> Open WhatsApp
              </button>
            )}
          </div>

          <div style={{ background: '#f8fafc', padding: 18, borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>CLIENT NAME</div>
                <div style={{ fontWeight: 600 }}>{credentialsModal.user.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>LOGIN EMAIL / USER</div>
                <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{credentialsModal.user.email}</div>
              </div>
              {credentialsModal.phone && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>WHATSAPP NUMBER</div>
                  <div style={{ fontWeight: 600, color: '#16a34a' }}>{credentialsModal.phone}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>PASSWORD</div>
                <div style={{ fontWeight: 700, color: '#4f46e5', fontSize: 14 }}>{credentialsModal.user.raw_password || credentialsModal.user.initial_password || 'BillPro@123'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>PRIMARY BUSINESS</div>
                <div style={{ fontWeight: 600 }}>{credentialsModal.business.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>PLAN & EXPIRY</div>
                <div style={{ fontWeight: 600 }}>
                  {(credentialsModal.user.plan || 'YEARLY').toUpperCase()} ·{' '}
                  {credentialsModal.user.expires_at ? `Valid till ${credentialsModal.user.expires_at}` : 'Lifetime'}
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 6 }}>
                PREVIEW WHATSAPP WELCOME MESSAGE
              </div>
              <pre
                style={{
                  background: '#fff',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  border: '1px solid #e2e8f0',
                  color: '#1e293b'
                }}
              >
                {credentialsModal.welcome_whatsapp}
              </pre>
            </div>
          </div>
        </Modal>
      )}

      {/* Renew License Modal */}
      {renewTarget && (
        <Modal
          title={`Renew Subscription: ${renewTarget.name}`}
          sub={`Current validity: ${renewTarget.expires_at ? renewTarget.expires_at : 'Lifetime'}`}
          onClose={() => setRenewTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setRenewTarget(null)}>Cancel</button>
              <button className="btn primary" onClick={handleRenew} disabled={renewBusy}>
                {renewBusy ? 'Renewing…' : 'Confirm Renewal'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Choose Renewal Plan" req full>
              <select
                className="input"
                value={renewPlan}
                onChange={(e) => setRenewPlan(e.target.value)}
              >
                <option value="monthly">Extend by 1 Month (+30 Days)</option>
                <option value="yearly">Extend by 1 Year (+365 Days)</option>
                <option value="lifetime">Upgrade to Lifetime (Unlimited Access)</option>
              </select>
            </Field>

            {renewPlan !== 'lifetime' && (
              <Field label="Custom Extension (Days)" full hint="Optional: specify arbitrary number of days to extend">
                <input
                  className="input"
                  type="number"
                  placeholder="e.g. 60 or 90"
                  value={renewDays}
                  onChange={(e) => setRenewDays(e.target.value)}
                />
              </Field>
            )}
          </div>
        </Modal>
      )}

      {/* Comprehensive Edit Client & Business Profile Modal */}
      {editTarget && (
        <Modal
          title={`Edit Client & Business: ${editTarget.name}`}
          sub={`${editTarget.email} · Account #${editTarget.id}`}
          size="wide"
          onClose={() => setEditTarget(null)}
          footer={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end' }}>
                <button className="btn" style={{ flex: 1, minWidth: 80, justifyContent: 'center' }} onClick={() => setEditTarget(null)}>Cancel</button>
                <button className="btn primary" style={{ flex: 2, minWidth: 120, justifyContent: 'center' }} onClick={handleUpdateUser} disabled={editBusy}>
                  {editBusy ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
              {editTarget.phone && (
                <button
                  type="button"
                  className="btn sm"
                  style={{ background: '#22c55e', color: '#fff', border: 0, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    const origin = window.location.origin;
                    const pwd = editTarget.new_password || editTarget.initial_password || (editTarget.email === 'zoheb@billpro.in' ? 'demo1234' : 'BillPro@123');
                    const cleanPhone = editTarget.phone ? String(editTarget.phone).trim() : '';
                    const msg = `👋 *Welcome to BillPro Billing Suite!*\n\nHello *${editTarget.name}*,\nHere are your billing account credentials for *${editTarget.business_name || 'your business'}*:\n\n🌐 *Login URL:* ${origin}\n📧 *Login User:* ${editTarget.email}${cleanPhone ? `\n📱 *Mobile:* ${cleanPhone}` : ''}\n🔑 *Password:* ${pwd}\n\n🏢 *Business:* ${editTarget.business_name || '—'}${editTarget.gstin ? `\n🧾 *GSTIN:* ${editTarget.gstin}` : ''}\n📦 *Plan:* ${(editTarget.plan || 'yearly').toUpperCase()} (${editTarget.expires_at ? `Valid till ${editTarget.expires_at}` : 'Lifetime Access'})\n\n💡 Log in anytime to start issuing GST invoices, manage stock, and track Khata ledgers!`;
                    openWhatsApp(editTarget.phone, msg);
                  }}
                >
                  <Icon.whatsapp size={14} /> Send WhatsApp Credentials to Client
                </button>
              )}
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Section 1: User Account & Login Credentials */}
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
                <Icon.users size={16} style={{ color: 'var(--brand)' }} />
                <h4 style={{ margin: 0, fontSize: 14 }}>User Account & Login Credentials</h4>
              </div>

              <div className="form-grid">
                <Field label="Customer Full Name" req>
                  <input
                    className="input"
                    value={editTarget.name}
                    onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })}
                    required
                  />
                </Field>

                <Field label="Login Email / Username" req hint="Primary sign-in credential">
                  <input
                    className="input"
                    type="email"
                    value={editTarget.email}
                    onChange={(e) => setEditTarget({ ...editTarget, email: e.target.value })}
                    required
                  />
                </Field>

                <Field label="Mobile / WhatsApp Phone" hint="Clients can also sign in directly with this number">
                  <input
                    className="input"
                    value={editTarget.phone || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, phone: e.target.value })}
                    placeholder="9845012345"
                  />
                </Field>

                <Field label="Account Status" req>
                  <select
                    className="input"
                    value={editTarget.status}
                    onChange={(e) => setEditTarget({ ...editTarget, status: e.target.value })}
                    disabled={editTarget.id === user.id}
                  >
                    <option value="active">Active (Access Granted)</option>
                    <option value="suspended">Suspended (Access Blocked)</option>
                  </select>
                </Field>

                <Field label="Subscription License Plan" req>
                  <select
                    className="input"
                    value={editTarget.plan}
                    onChange={(e) => setEditTarget({ ...editTarget, plan: e.target.value })}
                  >
                    <option value="monthly">Monthly Plan (30 Days)</option>
                    <option value="yearly">Yearly Plan (365 Days)</option>
                    <option value="lifetime">Lifetime License (Unlimited)</option>
                  </select>
                </Field>

                {editTarget.plan !== 'lifetime' && (
                  <Field label="License Expiry Date (YYYY-MM-DD)">
                    <input
                      className="input"
                      type="date"
                      value={editTarget.expires_at || ''}
                      onChange={(e) => setEditTarget({ ...editTarget, expires_at: e.target.value })}
                    />
                  </Field>
                )}

                <Field label="Customer Password" full hint="Client's current login password for sign-in & WhatsApp credentials dispatch">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#eef2ff', borderRadius: 8, border: '1px solid #c7d2fe' }}>
                    <span style={{ fontSize: 13, color: '#312e81', fontWeight: 650 }}>
                      🔑 Current Password: <code style={{ fontSize: 14, fontWeight: 700, color: '#4338ca', background: '#fff', padding: '2px 8px', borderRadius: 6, border: '1px solid #a5b4fc' }}>{editTarget.initial_password || (editTarget.email === 'zoheb@billpro.in' ? 'demo1234' : 'BillPro@123')}</code>
                    </span>
                  </div>
                </Field>

                <Field label="Reset / Change Password (Optional)" full hint="Leave blank to keep unchanged. Minimum 6 characters.">
                  <input
                    className="input"
                    placeholder="Enter new password (e.g. BillPro@987)"
                    value={editTarget.new_password || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, new_password: e.target.value })}
                  />
                </Field>

                {user?.is_superadmin && editTarget.id !== user.id && (
                  <Field label="Super Admin Privileges" full>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(editTarget.is_superadmin)}
                        onChange={(e) => setEditTarget({ ...editTarget, is_superadmin: e.target.checked })}
                      />
                      <span>Grant Super Administrator Console Privileges</span>
                    </label>
                  </Field>
                )}
              </div>
            </div>

            {/* Section 2: Primary Business Profile & Tax Information */}
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
                <Icon.building size={16} style={{ color: '#0891b2' }} />
                <h4 style={{ margin: 0, fontSize: 14 }}>Primary Business Profile & Tax Information</h4>
              </div>

              <div className="form-grid">
                <Field label="Business / Shop Name (Display Name)" req hint="Shown on invoices & statements">
                  <input
                    className="input"
                    value={editTarget.business_name || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, business_name: e.target.value })}
                    placeholder="Patel Supermarket"
                  />
                </Field>

                <Field label="Legal / Trade Name" hint="Registered firm or company name">
                  <input
                    className="input"
                    value={editTarget.legal_name || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, legal_name: e.target.value })}
                    placeholder="Patel Retail Private Limited"
                  />
                </Field>

                <Field label="GSTIN (15 Digits)" hint="e.g. 29AAAAA0000A1Z5">
                  <input
                    className="input"
                    value={editTarget.gstin || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, gstin: e.target.value.toUpperCase() })}
                    placeholder="29AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </Field>

                <Field label="PAN (Income Tax PAN)" hint="10 characters">
                  <input
                    className="input"
                    value={editTarget.pan || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, pan: e.target.value.toUpperCase() })}
                    placeholder="AAAAA0000A"
                    maxLength={10}
                  />
                </Field>

                <Field label="Business Contact Phone">
                  <input
                    className="input"
                    value={editTarget.business_phone || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, business_phone: e.target.value })}
                    placeholder="0820 2520000"
                  />
                </Field>

                <Field label="Business Email">
                  <input
                    className="input"
                    type="email"
                    value={editTarget.business_email || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, business_email: e.target.value })}
                    placeholder="billing@patelsupermarket.in"
                  />
                </Field>

                <Field label="Shop / Office Address" full>
                  <input
                    className="input"
                    value={editTarget.address || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, address: e.target.value })}
                    placeholder="Main Road, Near City Bus Stand"
                  />
                </Field>

                <Field label="City">
                  <input
                    className="input"
                    value={editTarget.city || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, city: e.target.value })}
                    placeholder="Udupi"
                  />
                </Field>

                <Field label="State">
                  <input
                    className="input"
                    value={editTarget.state || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, state: e.target.value })}
                    placeholder="Karnataka"
                  />
                </Field>

                <Field label="Pincode">
                  <input
                    className="input"
                    value={editTarget.pincode || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, pincode: e.target.value })}
                    placeholder="576101"
                    maxLength={6}
                  />
                </Field>

                <Field label="Invoice Series Prefix">
                  <input
                    className="input"
                    value={editTarget.invoice_prefix || 'INV'}
                    onChange={(e) => setEditTarget({ ...editTarget, invoice_prefix: e.target.value.toUpperCase() })}
                    placeholder="INV"
                  />
                </Field>

                <Field label="Default GST Rate (%)">
                  <input
                    className="input"
                    type="number"
                    value={editTarget.default_gst_rate !== undefined ? editTarget.default_gst_rate : 18}
                    onChange={(e) => setEditTarget({ ...editTarget, default_gst_rate: Number(e.target.value) })}
                    placeholder="18"
                  />
                </Field>

                <Field label="Credit Period (Days)">
                  <input
                    className="input"
                    type="number"
                    value={editTarget.credit_days !== undefined ? editTarget.credit_days : 30}
                    onChange={(e) => setEditTarget({ ...editTarget, credit_days: Number(e.target.value) })}
                    placeholder="30"
                  />
                </Field>
              </div>
            </div>

            {/* Section 3: Banking & UPI Payment Setup */}
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
                <Icon.rupee size={16} style={{ color: '#16a34a' }} />
                <h4 style={{ margin: 0, fontSize: 14 }}>Banking & UPI QR Details (Printed on Invoices & Thermal Slips)</h4>
              </div>

              <div className="form-grid">
                <Field label="Bank Name">
                  <input
                    className="input"
                    value={editTarget.bank_name || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, bank_name: e.target.value })}
                    placeholder="State Bank of India / HDFC Bank"
                  />
                </Field>

                <Field label="Bank Account Number">
                  <input
                    className="input"
                    value={editTarget.bank_account_no || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, bank_account_no: e.target.value })}
                    placeholder="50200012345678"
                  />
                </Field>

                <Field label="Bank IFSC Code">
                  <input
                    className="input"
                    value={editTarget.bank_ifsc || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, bank_ifsc: e.target.value.toUpperCase() })}
                    placeholder="HDFC0001234"
                  />
                </Field>

                <Field label="Business UPI ID (for QR Code)">
                  <input
                    className="input"
                    value={editTarget.upi_id || ''}
                    onChange={(e) => setEditTarget({ ...editTarget, upi_id: e.target.value })}
                    placeholder="patelsupermarket@okhdfcbank"
                  />
                </Field>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Convert Inquiry Modal */}
      {convertTarget && (
        <Modal
          title={`Convert Lead to Client: ${convertTarget.name}`}
          sub={`Phone: ${convertTarget.phone} · City: ${convertTarget.city || '—'}`}
          onClose={() => setConvertTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConvertTarget(null)}>Cancel</button>
              <button className="btn primary" onClick={handleConvertInquiry} disabled={convertBusy}>
                {convertBusy ? 'Provisioning…' : 'Provision Client Now'}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Business / Shop Name" req full>
              <input
                className="input"
                value={convertForm.business_name}
                onChange={(e) => setConvertForm({ ...convertForm, business_name: e.target.value })}
                placeholder="Ramesh Traders"
                required
              />
            </Field>

            <Field label="Plan Assignment" req>
              <select
                className="input"
                value={convertForm.plan}
                onChange={(e) => setConvertForm({ ...convertForm, plan: e.target.value })}
              >
                <option value="monthly">Monthly Plan (30 Days)</option>
                <option value="yearly">Yearly Plan (365 Days)</option>
                <option value="lifetime">Lifetime License</option>
              </select>
            </Field>

            <Field label="Initial Password" req>
              <input
                className="input"
                value={convertForm.password}
                onChange={(e) => setConvertForm({ ...convertForm, password: e.target.value })}
                required
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* Confirm Delete Client */}
      {deleteTarget && (
        <Confirm
          title={`Delete Client: ${deleteTarget.name}?`}
          message={`Are you sure you want to delete ${deleteTarget.email}? This will permanently remove their user account and all owned businesses, invoices, and ledgers.`}
          confirmLabel="Delete Account"
          onConfirm={handleDeleteUser}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
