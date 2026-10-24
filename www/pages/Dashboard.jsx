import React, { useEffect, useState } from 'react';
import { api, money, moneyShort, fmtDate } from '../src/api.js';
import { Icon } from '../src/ui.jsx';
import { Bars, Donut, PayPill, Empty } from '../src/components.jsx';

export default function Dashboard({ business, goto, toast }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [overdue, setOverdue] = useState(null);

  const load = async () => {
    try {
      setErr('');
      const [dash, rem] = await Promise.all([api.dashboard(), api.overdue()]);
      setD(dash);
      setOverdue(rem);
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [business.id]);

  if (err) return <div className="banner err"><Icon.alert size={15} />{err}</div>;
  if (!d) return <div className="empty">Loading dashboard…</div>;

  const series = d.salesSeries.map((s) => ({ label: fmtDate(s.date).slice(0, 6), value: s.total }));
  const taxSegs = d.taxByRate.map((t, i) => ({
    label: `${t.rate}% GST`, value: t.taxable,
    color: ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626'][i % 5],
    display: moneyShort(t.taxable)
  }));

  return (
    <>
      {/* Mobile-only Unified App Overview Card */}
      <div className="mobile-only mobile-overview-card">
        {/* Top Split: To Collect vs To Pay */}
        <div className="moc-top">
          <div className="moc-col" onClick={() => goto('khata')}>
            <div className="moc-label">
              <span className="moc-dot" style={{ background: '#dc2626' }} />
              <span>TO COLLECT</span>
            </div>
            <div className="moc-val" style={{ color: d.receivable > 0 ? '#dc2626' : 'var(--ink)' }}>
              {money(d.receivable)}
            </div>
            <div className="moc-sub">
              {d.overdueCount > 0 ? `${d.overdueCount} overdue (${moneyShort(d.overdueAmount)})` : 'All accounts regular'}
            </div>
          </div>

          <div className="moc-divider" />

          <div className="moc-col" onClick={() => goto('billing', { type: 'purchase' })}>
            <div className="moc-label">
              <span className="moc-dot" style={{ background: '#d97706' }} />
              <span>TO PAY</span>
            </div>
            <div className="moc-val" style={{ color: d.payable > 0 ? '#d97706' : 'var(--ink)' }}>
              {money(d.payable)}
            </div>
            <div className="moc-sub">Supplier bills pending</div>
          </div>
        </div>

        {/* Bottom Strip: Sales & GST Summary */}
        <div className="moc-bottom">
          <div className="moc-stat" onClick={() => goto('billing')}>
            <span className="moc-stat-k">Today's Sales</span>
            <b className="moc-stat-v">{money(d.todaySales)}</b>
          </div>
          <div className="moc-stat" onClick={() => goto('reports', { tab: 'payments' })}>
            <span className="moc-stat-k">Today Collected</span>
            <b className="moc-stat-v" style={{ color: '#16a34a' }}>{money(d.todayCollected || 0)}</b>
          </div>
          <div className="moc-stat" onClick={() => goto('billing')}>
            <span className="moc-stat-k">This Month</span>
            <b className="moc-stat-v">{money(d.monthSales)}</b>
          </div>
          <div className="moc-stat" onClick={() => goto('reports')}>
            <span className="moc-stat-k">Net GST</span>
            <b className="moc-stat-v">{money(d.netTax)}</b>
          </div>
        </div>
      </div>

      {/* Desktop 5-Grid Stats */}
      <div className="grid g5 desktop-only" style={{ marginBottom: 14 }}>
        <Stat
          label="Today's sales"
          value={money(d.todaySales)}
          foot={d.todayCollected > 0 ? `Collected: ${money(d.todayCollected)} (${moneyShort(d.todayCash)} Cash · ${moneyShort(d.todayUpi)} UPI)` : `${d.invoiceCount} invoices total`}
          icon={Icon.rupee}
          color="#4f46e5"
          soft="var(--brand-soft)"
          onClick={() => goto('billing')}
        />
        <Stat
          label="This month"
          value={money(d.monthSales)}
          foot={d.monthCollected > 0 ? `Collected: ${moneyShort(d.monthCollected)} (${moneyShort(d.monthCash)} Cash · ${moneyShort(d.monthUpi)} UPI)` : 'Sales billed'}
          icon={Icon.chart}
          color="#0891b2"
          soft="var(--blue-soft)"
          onClick={() => goto('billing')}
        />
        <Stat label="To collect" value={money(d.receivable)} foot={`${d.overdueCount} overdue (${moneyShort(d.overdueAmount)})`} icon={Icon.wallet} color="#dc2626" soft="var(--red-soft)" onClick={() => goto('khata')} warn={d.overdueCount > 0} />
        <Stat label="To pay" value={money(d.payable)} foot="Supplier bills pending" icon={Icon.arrowUp} color="#d97706" soft="var(--amber-soft)" onClick={() => goto('billing', { type: 'purchase' })} />
        <Stat label="Net GST payable" value={money(d.netTax)} foot="Output tax less ITC" icon={Icon.shield} color="#059669" soft="var(--green-soft)" onClick={() => goto('reports')} />
      </div>

      {/* Mobile App Quick Actions */}
      <div className={`mobile-quick-actions ${business.pos_enabled ? 'pos-enabled' : ''}`}>
        <button type="button" className="quick-action-tile" onClick={() => goto('billing', { type: 'sale', docId: 'new' })}>
          <div className="qa-icon" style={{ background: '#eef2ff', color: '#4f46e5' }}>
            <Icon.plus size={19} />
          </div>
          <span className="qa-title">+ Sale Bill</span>
          <span className="qa-sub">Invoice</span>
        </button>

        {business.pos_enabled ? <button type="button" className="quick-action-tile" onClick={() => goto('pos')}>
          <div className="qa-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
            <Icon.pos size={19} />
          </div>
          <span className="qa-title">POS Bill</span>
          <span className="qa-sub">Counter</span>
        </button> : null}

        <button type="button" className="quick-action-tile" onClick={() => goto('khata')}>
          <div className="qa-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            <Icon.khata size={19} />
          </div>
          <span className="qa-title">Khata</span>
          <span className="qa-sub">Ledgers</span>
        </button>

        <button type="button" className="quick-action-tile" onClick={() => goto('inventory')}>
          <div className="qa-icon" style={{ background: '#eff6ff', color: '#0284c7' }}>
            <Icon.box size={19} />
          </div>
          <span className="qa-title">Stock</span>
          <span className="qa-sub">Items</span>
        </button>

        <button type="button" className="quick-action-tile" onClick={() => goto('reports')}>
          <div className="qa-icon" style={{ background: '#ecfeff', color: '#0891b2' }}>
            <Icon.chart size={19} />
          </div>
          <span className="qa-title">Reports</span>
          <span className="qa-sub">Sales & GST</span>
        </button>
      </div>

      {d.lowStock && d.lowStock.length > 0 && (
        <div className="banner warn">
          <Icon.alert size={16} />
          <div style={{ flex: 1 }}>
            <b>{d.lowStock.length} item{d.lowStock.length > 1 ? 's are' : ' is'} running low on stock.</b>{' '}
            {d.lowStock.slice(0, 3).map((p) => `${p.name} (${p.stock} ${p.unit})`).join(', ')}{d.lowStock.length > 3 ? '…' : ''}
            <span className="link" style={{ marginLeft: 8 }} onClick={() => goto('inventory')}>Review stock</span>
          </div>
        </div>
      )}

      <div className="grid grid-split" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><Icon.chart size={16} /><div><h3>Sales - last 6 days</h3><div className="sub">Gross billed value</div></div>
            <div className="spacer" /><span className="pill brand">{moneyShort(d.salesSeries.reduce((s, x) => s + x.total, 0))}</span></div>
          <div className="card-b"><Bars data={series} format={money} /></div>
        </div>
        <div className="card">
          <div className="card-h"><Icon.tag size={16} /><div><h3>Taxable value by GST rate</h3><div className="sub">All invoices</div></div></div>
          <div className="card-b">
            {taxSegs.length ? <Donut segments={taxSegs} center={moneyShort(taxSegs.reduce((s, x) => s + x.value, 0))} /> : <Empty title="No invoices yet" />}
          </div>
        </div>
      </div>

      <div className="grid grid-split" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><Icon.invoice size={16} /><div><h3>Recent documents</h3><div className="sub">Latest activity in this business</div></div>
            <div className="spacer" /><button className="btn sm" onClick={() => goto('billing')}>View all</button></div>
          
          {/* Mobile App Transaction Cards */}
          <div className="mobile-only mobile-trans-list">
            {d.recentDocs.length === 0 ? (
              <div className="empty-compact">
                <Icon.invoice size={26} style={{ color: 'var(--muted)', marginBottom: 6 }} />
                <div style={{ fontWeight: 650, fontSize: 13, color: 'var(--ink)' }}>Nothing billed yet</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Create your first invoice to see it here</div>
                <button className="btn primary sm" onClick={() => goto('billing', { type: 'sale', docId: 'new' })}>
                  <Icon.plus size={14} /> + New invoice
                </button>
              </div>
            ) : (
              d.recentDocs.map((r) => (
                <div key={r.id} className="mobile-trans-item" onClick={() => goto('billing', { type: r.type, docId: r.id })}>
                  <div className="mti-left">
                    <div className="mti-avatar" style={{ background: r.type === 'purchase' ? '#eff6ff' : '#eef2ff', color: r.type === 'purchase' ? '#2563eb' : '#4f46e5' }}>
                      <Icon.invoice size={17} />
                    </div>
                    <div className="mti-meta">
                      <b className="mti-party">{r.party_name || 'Walk-in Customer'}</b>
                      <div className="mti-sub">{r.number} · {fmtDate(r.date)}</div>
                    </div>
                  </div>
                  <div className="mti-right">
                    <div className="mti-amount">{money(r.total)}</div>
                    <div className="mti-pill">
                      {r.type === 'expense' ? <span className="pill sm grey">—</span> : <PayPill status={r.payment_status} />}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="card-b tight tbl-wrap desktop-only">
            <table className="tbl">
              <thead><tr><th>Document</th><th>Party</th><th>Date</th><th className="num">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {d.recentDocs.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => goto('billing', { type: r.type, docId: r.id })}>
                    <td>
                      <div className="strong">{r.number}</div>
                      <div className="muted">{{ sale: 'Invoice', purchase: 'Purchase', quotation: 'Quotation', expense: 'Expense' }[r.type]}</div>
                    </td>
                    <td>{r.party_name}</td>
                    <td className="muted">{fmtDate(r.date)}</td>
                    <td className="num strong">{money(r.total)}</td>
                    <td>{r.type === 'expense' ? <span className="pill grey">—</span> : <PayPill status={r.payment_status} />}</td>
                  </tr>
                ))}
                {d.recentDocs.length === 0 && <tr><td colSpan="5"><Empty title="Nothing billed yet" hint="Create your first invoice to see it here." action={<button className="btn primary sm" onClick={() => goto('billing', { type: 'sale', docId: 'new' })}>New invoice</button>} /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><Icon.clock size={16} /><div><h3>Collection queue</h3><div className="sub">Overdue first</div></div>
            <div className="spacer" /><button className="btn sm" onClick={() => goto('khata')}>Open khata</button></div>
          <div className="card-b tight">
            {!overdue || overdue.overdue.length === 0 ? (
              <Empty title="Nothing overdue" hint="Every invoice is within its due date." icon={Icon.check} />
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <tbody>
                    {overdue.overdue.slice(0, 6).map((r) => (
                      <tr key={r.id} className="clickable" onClick={() => goto('khata', { partyId: r.party_id })}>
                        <td>
                          <div className="strong">{r.party_display || r.party_name}</div>
                          <div className="muted">{r.number} · {r.daysOverdue}d overdue</div>
                        </td>
                        <td className="num strong neg">{money(r.due_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td>Total overdue</td><td className="num">{money(overdue.overdue.reduce((s, r) => s + r.due_amount, 0))}</td></tr></tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h"><Icon.users size={16} /><div><h3>Top customers</h3><div className="sub">By billed value</div></div></div>
          <div className="card-b">
            {d.topCustomers.length === 0 ? <Empty title="No customer sales yet" /> : d.topCustomers.map((c, i) => {
              const max = d.topCustomers[0].s || 1;
              return (
                <div className="bar-row" key={c.party_id}>
                  <span style={{ width: 16, color: 'var(--muted)', fontWeight: 700 }}>{i + 1}</span>
                  <span style={{ width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.s / max) * 100}%` }} /></div>
                  <b className="mono" style={{ width: 92, textAlign: 'right' }}>{moneyShort(c.s)}</b>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><Icon.box size={16} /><div><h3>Best selling items</h3><div className="sub">This month</div></div></div>
          <div className="card-b">
            {d.topProducts.length === 0 ? <Empty title="No sales this month" /> : d.topProducts.map((p) => (
              <div className="bar-row" key={p.name}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span className="muted" style={{ width: 62 }}>{p.qty} sold</span>
                <b className="mono" style={{ width: 92, textAlign: 'right' }}>{moneyShort(p.value)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function Stat({ label, value, foot, icon: I, color, soft, onClick, warn }) {
  return (
    <div className={`stat ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      {I && <div className="ic" style={{ background: soft, color }}><I size={16} /></div>}
      <div className="lbl">{label}{warn && <span className="pill red" style={{ padding: '0 5px' }}>!</span>}</div>
      <div className="val">{value}</div>
      <div className="foot">{foot}</div>
    </div>
  );
}
