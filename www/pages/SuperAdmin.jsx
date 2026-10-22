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
    sales_whatsapp: '919845012345',
    sales_phone: '+91 98450 12345',
    public_signup_enabled: false,
    pricing_monthly: 499,
    pricing_yearly: 2999,
    pricing_lifetime: 7999
  });
  const [loading, setLoading] = useState(true);

  // Search & filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [inquiryFilter, setInquiryFilter] = useState('all');

  // Modals
  const [provisionModal, setProvisionModal] = useState(false);
  const [renewTarget, setRenewTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
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
      const [st, uList, inq, setts] = await Promise.all([
        api.adminStats().catch(() => null),
        api.adminUsers().catch(() => ({ users: [] })),
        api.adminInquiries().catch(() => ({ inquiries: [] })),
        api.adminSettings().catch(() => null)
      ]);
      if (st) setStats(st);
      if (uList && uList.users) setUsers(uList.users);
      if (inq && inq.inquiries) setInquiries(inq.inquiries);
      if (setts && setts.settings) setSettings(setts.settings);
    } catch (err) {
      console.error('SuperAdmin load failed:', err);
      toast('Failed to load super admin data: ' + err.message, 'err');
    } finally {
      setLoading(false);
    }
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
      setCredentialsModal({
        user: res.user,
        business: res.business,
        welcome_whatsapp: res.welcome_whatsapp,
        phone: provForm.phone
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

  const handleUpdateUser = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editTarget) return;
    try {
      await api.adminUpdateUser(editTarget.id, {
        name: editTarget.name,
        phone: editTarget.phone,
        status: editTarget.status,
        plan: editTarget.plan,
        expires_at: editTarget.expires_at,
        new_password: editTarget.new_password || undefined,
        is_superadmin: editTarget.is_superadmin
      });
      toast('Client details updated successfully', 'ok');
      setEditTarget(null);
      loadAll();
    } catch (err) {
      toast(err.message || 'Update failed', 'err');
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
      setConvertTarget(null);
      setCredentialsModal({
        user: res.user,
        business: res.business,
        welcome_whatsapp: res.welcome_whatsapp,
        phone: convertTarget.phone
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
    const clean = String(phone || '').replace(/[^\d]/g, '');
    const num = clean.startsWith('91') ? clean : (clean.length === 10 ? '91' + clean : clean);
    const url = `https://wa.me/${num}?text=${encodeURIComponent(text || '')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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
      <div className="card" style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', color: '#fff' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginTop: 20 }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: 10 }}>
            <div style={{ fontSize: 11.5, color: '#c7d2fe' }}>Total Clients</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{stats?.users?.total || users.length}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: 10 }}>
            <div style={{ fontSize: 11.5, color: '#86efac' }}>Active Accounts</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#86efac' }}>{stats?.users?.active || 0}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: 10 }}>
            <div style={{ fontSize: 11.5, color: '#fca5a5' }}>Expired / Due</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#fca5a5' }}>{stats?.users?.expired || 0}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: 10 }}>
            <div style={{ fontSize: 11.5, color: '#fde047' }}>New Inquiries</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#fde047' }}>{stats?.inquiries?.new || 0}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: 10 }}>
            <div style={{ fontSize: 11.5, color: '#c7d2fe' }}>Lifetime Licenses</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{stats?.plans?.lifetime || 0}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="auth-tabs" style={{ background: 'var(--card-bg, #fff)', padding: 6, borderRadius: 12, border: '1px solid var(--border)' }}>
        <button
          type="button"
          className={tab === 'clients' ? 'on' : ''}
          onClick={() => setTab('clients')}
        >
          <Icon.users size={15} /> Clients & Licenses ({users.length})
        </button>
        <button
          type="button"
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
          className={tab === 'settings' ? 'on' : ''}
          onClick={() => setTab('settings')}
        >
          <Icon.settings size={15} /> Sales WhatsApp & Pricing Settings
        </button>
      </div>

      {/* Tab 1: Clients & Onboarding */}
      {tab === 'clients' && (
        <div className="card">
          <div className="card-h" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
              <div className="search-wrap" style={{ flex: 1 }}>
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
                style={{ width: 'auto' }}
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

          <div className="table-wrap">
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
                          <div style={{ fontSize: 12.5 }}>{u.phone || '—'}</div>
                          {u.phone && (
                            <button
                              className="btn xs"
                              style={{ marginTop: 2, background: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', border: 0 }}
                              onClick={() => openWhatsApp(u.phone, `Hello ${u.name}, from BillPro Support!`)}
                            >
                              <Icon.whatsapp size={11} /> WhatsApp
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
                              title="Edit user details or reset password"
                              onClick={() => setEditTarget({ ...u, new_password: '' })}
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

            <Field label="WhatsApp / Mobile Phone">
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
          sub="Customer account and primary business have been configured"
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
                style={{ background: '#22c55e', borderColor: '#22c55e' }}
                onClick={() => {
                  openWhatsApp(credentialsModal.phone, credentialsModal.welcome_whatsapp);
                }}
              >
                <Icon.whatsapp size={15} /> Send to WhatsApp
              </button>
            </>
          }
        >
          <div style={{ background: '#f8fafc', padding: 18, borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>CLIENT NAME</div>
                <div style={{ fontWeight: 600 }}>{credentialsModal.user.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>LOGIN EMAIL</div>
                <div style={{ fontWeight: 600 }}>{credentialsModal.user.email}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>PASSWORD</div>
                <div style={{ fontWeight: 600, color: '#4f46e5' }}>{credentialsModal.user.raw_password}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>PRIMARY BUSINESS</div>
                <div style={{ fontWeight: 600 }}>{credentialsModal.business.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>PLAN & EXPIRY</div>
                <div style={{ fontWeight: 600 }}>
                  {credentialsModal.user.plan.toUpperCase()} ·{' '}
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

      {/* Edit Client Modal */}
      {editTarget && (
        <Modal
          title={`Edit Client: ${editTarget.name}`}
          sub={editTarget.email}
          onClose={() => setEditTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn primary" onClick={handleUpdateUser}>Save Changes</button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Full Name">
              <input
                className="input"
                value={editTarget.name}
                onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })}
              />
            </Field>

            <Field label="Mobile / WhatsApp Phone">
              <input
                className="input"
                value={editTarget.phone || ''}
                onChange={(e) => setEditTarget({ ...editTarget, phone: e.target.value })}
              />
            </Field>

            <Field label="Account Status">
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

            <Field label="Subscription Plan">
              <select
                className="input"
                value={editTarget.plan}
                onChange={(e) => setEditTarget({ ...editTarget, plan: e.target.value })}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </Field>

            {editTarget.plan !== 'lifetime' && (
              <Field label="Expiration Date (YYYY-MM-DD)">
                <input
                  className="input"
                  type="date"
                  value={editTarget.expires_at || ''}
                  onChange={(e) => setEditTarget({ ...editTarget, expires_at: e.target.value })}
                />
              </Field>
            )}

            <Field label="Reset Password (Optional)" full hint="Leave blank to keep unchanged">
              <input
                className="input"
                placeholder="Enter new password (min 6 chars)"
                value={editTarget.new_password || ''}
                onChange={(e) => setEditTarget({ ...editTarget, new_password: e.target.value })}
              />
            </Field>
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
