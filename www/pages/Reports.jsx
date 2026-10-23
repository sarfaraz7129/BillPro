import React, { useEffect, useState } from 'react';
import { api, money, moneyShort, fmtDate, csvUrl, pdfUrl } from '../src/api.js';
import { Icon } from '../src/ui.jsx';
import { DateRange, Empty, Donut } from '../src/components.jsx';

const fyStart = () => {
  const n = new Date();
  return n.getMonth() >= 3 ? `${n.getFullYear()}-04-01` : `${n.getFullYear() - 1}-04-01`;
};
const fyEnd = () => {
  const n = new Date();
  return n.getMonth() >= 3 ? `${n.getFullYear() + 1}-03-31` : `${n.getFullYear()}-03-31`;
};

export default function Reports({ business, toast, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'payments');
  const [range, setRange] = useState({ from: fyStart(), to: fyEnd() });
  const [dayDate, setDayDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    setData(null); setErr('');
    const fn = { payments: api.paymentsReport, gstr1: api.gstr1, gstr3b: api.gstr3b, purchases: api.purchasesReport, profit: api.profit }[tab];
    const load = tab === 'aging' ? api.aging() : tab === 'daybook' ? api.daybook(dayDate) : fn(range);
    Promise.resolve(load).then((r) => { if (live) setData(r); }).catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [tab, range.from, range.to, dayDate, business.id]);

  const TABS = [
    { id: 'payments', label: 'Cash & UPI Collections', icon: 'wallet' },
    { id: 'gstr3b', label: 'GSTR-3B', icon: 'shield' },
    { id: 'gstr1', label: 'GSTR-1', icon: 'file' },
    { id: 'purchases', label: 'Purchases / ITC', icon: 'bill' },
    { id: 'profit', label: 'Profit & Loss', icon: 'chart' },
    { id: 'aging', label: 'Receivables ageing', icon: 'clock' },
    { id: 'daybook', label: 'Day book', icon: 'cal' }
  ];

  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setData(null); }}>{t.label}</button>)}
        </div>
        <div className="grow" />
        {tab !== 'aging' && tab !== 'daybook' && <DateRange from={range.from} to={range.to} onChange={setRange} />}
        {tab === 'daybook' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Select Date:</span>
            <input type="date" className="input" style={{ width: 145 }} value={dayDate} onChange={(e) => setDayDate(e.target.value)} />
          </div>
        )}
        <div className="spacer" />
        {tab === 'payments' && <a className="btn" href={csvUrl('payments', range)}><Icon.download size={15} /> Collections CSV</a>}
        {tab === 'payments' && <button className="btn" onClick={() => window.print()}><Icon.print size={15} /> Print</button>}
        {tab === 'gstr1' && <a className="btn" href={csvUrl('gstr1', range)}><Icon.download size={15} /> GSTR-1 CSV</a>}
        {tab === 'gstr1' && <button className="btn" onClick={() => window.open(pdfUrl(`gstr1?from=${range.from}&to=${range.to}`), '_blank')}><Icon.print size={15} /> PDF</button>}
        {tab === 'purchases' && <a className="btn" href={csvUrl('purchases', range)}><Icon.download size={15} /> CSV</a>}
        {tab === 'gstr3b' && <button className="btn" onClick={() => toast('GSTR-3B summary is print-ready - use Print to save as PDF', 'ok')}><Icon.print size={15} /> Print</button>}
      </div>

      {err && <div className="banner err"><Icon.alert size={15} />{err}</div>}
      {!data && !err && <div className="empty">Loading {TABS.find((t) => t.id === tab).label}…</div>}

      {data && tab === 'payments' && <PaymentsReport d={data} />}
      {data && tab === 'gstr3b' && <Gstr3b d={data} business={business} />}
      {data && tab === 'gstr1' && <Gstr1 d={data} />}
      {data && tab === 'purchases' && <Purchases d={data} />}
      {data && tab === 'profit' && <Profit d={data} />}
      {data && tab === 'aging' && <Aging d={data} />}
      {data && tab === 'daybook' && <Daybook d={data} />}
    </>
  );
}

function Card({ title, sub, children, right }) {
  return (
    <div className="card">
      <div className="card-h"><div><h3>{title}</h3>{sub && <div className="sub">{sub}</div>}</div><div className="spacer" />{right}</div>
      <div className="card-b">{children}</div>
    </div>
  );
}

function Gstr3b({ d, business }) {
  if (!d || !d.table3_1a) return null;
  const o = d.table3_1a.outward;
  const i = d.table4.itc;
  const n = d.table4.net;
  return (
    <>
      <div className="banner info">
        <Icon.shield size={16} />
        <div>
          <b>{business.name}</b>{business.gstin ? ` · GSTIN ${business.gstin}` : ' · GSTIN not set'} · period {fmtDate(d.period.from)} to {fmtDate(d.period.to)} ({d.period.financialYear})
          {business.composition ? ' · Composition scheme' : ''}
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="Outward supplies (taxable)" value={money(o.taxable)} foot={`Invoice value ${money(o.total)}`} />
        <Kpi label="Total output tax" value={money(o.igst + o.cgst + o.sgst + o.cess)} foot="IGST + CGST + SGST + Cess" />
        <Kpi label="Input tax credit" value={money(i.total)} foot="From purchase bills" tone="pos" />
        <Kpi label="Net payable in cash" value={money(d.payableCash)} foot="After setting off ITC" tone="neg" />
      </div>

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <Card title="3.1 - Details of outward supplies" sub="Table 3.1(a) of GSTR-3B">
          <TaxTable rows={[
            ['Taxable value', o.taxable], ['IGST', o.igst], ['CGST', o.cgst], ['SGST / UTGST', o.sgst], ['Cess', o.cess]
          ]} total={['Total invoice value', o.total]} />
        </Card>
        <Card title="4 - Eligible ITC" sub="Input tax credit from purchase bills">
          <TaxTable rows={[['IGST', i.igst], ['CGST', i.cgst], ['SGST / UTGST', i.sgst], ['Cess', i.cess]]} total={['Total ITC', i.total]} />
          <hr className="divider" />
          <div className="hint" style={{ marginBottom: 6 }}>Net liability after ITC set-off</div>
          <TaxTable rows={[['IGST', n.igst], ['CGST', n.cgst], ['SGST / UTGST', n.sgst], ['Cess', n.cess]]} total={['Payable in cash', d.payableCash]} />
        </Card>
      </div>

      <div className="grid g2">
        <Card title="5 - Intra-state B2C supplies" sub="Unregistered / consumer sales by place of supply">
          {d.table5.length === 0 ? <Empty title="No B2C sales in this period" /> : (
            <table className="tbl">
              <thead><tr><th>POS</th><th>State</th><th className="num">Taxable</th><th className="num">IGST</th><th className="num">CGST</th><th className="num">SGST</th></tr></thead>
              <tbody>{d.table5.map((r, idx) => (
                <tr key={idx}><td>{r.pos || '—'}</td><td>{r.state || '—'}</td><td className="num">{money(r.txval)}</td>
                  <td className="num">{money(r.iamt)}</td><td className="num">{money(r.camt)}</td><td className="num">{money(r.samt)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title="6 - Exempt / nil rated supplies" sub="Table 6">
          <div className="kv"><span className="k">Value of exempt supplies</span><span className="v">{money(d.table6)}</span></div>
          <div className="hint" style={{ marginTop: 8 }}>This is the taxable value of your sales - the figure your accountant reconciles against GSTR-1.</div>
        </Card>
      </div>
    </>
  );
}

function TaxTable({ rows, total }) {
  return (
    <div>
      {rows.map(([k, v]) => <div className="kv" key={k}><span className="k">{k}</span><span className="v">{money(v)}</span></div>)}
      <div className="kv" style={{ borderTop: '2px solid var(--ink)', marginTop: 6, paddingTop: 8 }}>
        <span style={{ fontWeight: 700 }}>{total[0]}</span><span className="v" style={{ fontSize: 16 }}>{money(total[1])}</span>
      </div>
    </div>
  );
}

function Kpi({ label, value, foot, tone }) {
  return <div className="stat"><div className="lbl">{label}</div><div className={`val ${tone || ''}`} style={{ fontSize: 19 }}>{value}</div><div className="foot">{foot}</div></div>;
}

function Gstr1({ d }) {
  const t = d?.totals || {};
  if (!d || !d.totals) return null;
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="Invoices" value={t.invoices} foot="Active sale invoices" />
        <Kpi label="Turnover" value={money(t.total)} foot="Invoice value" />
        <Kpi label="Taxable value" value={money(t.taxable)} foot="After discounts" />
        <Kpi label="Total tax" value={money(t.igst + t.cgst + t.sgst + t.cess)} foot={`IGST ${moneyShort(t.igst)} · CGST ${moneyShort(t.cgst)} · SGST ${moneyShort(t.sgst)}`} />
      </div>

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <Card title="B2B - registered recipients" sub={`${d.b2b.length} invoices`} right={<span className="pill brand">{money(d.b2b.reduce((s, r) => s + r.invVal, 0))}</span>}>
          {d.b2b.length === 0 ? <Empty title="No B2B invoices" /> : (
            <div className="tbl-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>GSTIN</th><th>Invoice</th><th>Date</th><th className="num">Taxable</th><th className="num">Tax</th><th className="num">Value</th></tr></thead>
                <tbody>{d.b2b.map((r, i) => (
                  <tr key={i}><td className="mono" style={{ fontSize: 11.5 }}>{r.gstin}</td><td>{r.invNo}<div className="muted">{r.party}</div></td>
                    <td className="muted">{r.invDt}</td><td className="num">{money(r.txval)}</td>
                    <td className="num muted">{money(r.iamt + r.camt + r.samt)}</td><td className="num strong">{money(r.invVal)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="HSN / SAC summary" sub="Table 12 of GSTR-1">
          {d.hsn.length === 0 ? <Empty title="Nothing to report" /> : (
            <div className="tbl-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>HSN</th><th>Desc</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Taxable</th><th className="num">Tax</th></tr></thead>
                <tbody>{d.hsn.map((h, i) => (
                  <tr key={i}><td className="mono">{h.hsn}</td><td style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.desc}</td>
                    <td className="num">{h.qty}</td><td className="num">{h.gstRate}%</td><td className="num">{money(h.taxable)}</td>
                    <td className="num">{money(h.cgst + h.sgst + h.igst + h.cess)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid g2">
        <Card title="B2C large (> ₹2.5 lakh)" sub={`${d.b2cLarge.length} invoices`}>
          {d.b2cLarge.length === 0 ? <Empty title="None" /> : d.b2cLarge.map((r, i) => (
            <div className="kv" key={i}><span className="k">{r.invNo} · POS {r.pos}</span><span className="v">{money(r.invVal)}</span></div>
          ))}
        </Card>
        <Card title="B2C small & document series" sub={`${d.b2cSmall.length} invoices`}>
          <div className="kv"><span className="k">B2C small value</span><span className="v">{money(d.b2cSmall.reduce((s, r) => s + r.invVal, 0))}</span></div>
          <hr className="divider" />
          <div className="hint" style={{ marginBottom: 6 }}>Table 13 - document series</div>
          {d.docSeries.map((s, i) => (
            <div className="kv" key={i}><span className="k">{s.type.toUpperCase()} ({s.n})</span><span className="v mono" style={{ fontSize: 12 }}>{s.from_no} → {s.to_no}</span></div>
          ))}
        </Card>
      </div>
    </>
  );
}

function Purchases({ d }) {
  if (!d || !d.totals || !d.documents) return null;
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="Purchase bills" value={d.totals.count} foot="Recorded in period" />
        <Kpi label="Taxable purchases" value={money(d.totals.taxable)} foot="Basis for ITC" />
        <Kpi label="Input tax (ITC)" value={money(d.totals.tax)} foot="Claimable credit" tone="pos" />
        <Kpi label="Total purchase value" value={money(d.totals.total)} foot="Including tax" />
      </div>
      <Card title="Purchase register" sub="Reconcile this against GSTR-2B before claiming ITC">
        {d.documents.length === 0 ? <Empty title="No purchase bills in this period" hint="Record supplier bills under Billing → Purchases to claim input tax credit." /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Bill no</th><th>Supplier</th><th>Date</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total</th></tr></thead>
              <tbody>{d.documents.map((r) => (
                <tr key={r.id}><td className="strong">{r.number}</td><td>{r.party_display || r.party_name}</td><td className="muted">{fmtDate(r.date)}</td>
                  <td className="num">{money(r.taxable_value)}</td><td className="num muted">{money(r.cgst)}</td>
                  <td className="num muted">{money(r.sgst)}</td><td className="num muted">{money(r.igst)}</td><td className="num strong">{money(r.total)}</td></tr>
              ))}</tbody>
              <tfoot><tr><td colSpan="3">Total</td><td className="num">{money(d.totals.taxable)}</td>
                <td className="num">{money(d.documents.reduce((s, r) => s + r.cgst, 0))}</td>
                <td className="num">{money(d.documents.reduce((s, r) => s + r.sgst, 0))}</td>
                <td className="num">{money(d.documents.reduce((s, r) => s + r.igst, 0))}</td>
                <td className="num">{money(d.totals.total)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Profit({ d }) {
  if (!d || !d.rows || !d.total) return null;
  const max = Math.max(1, ...d.rows.map((r) => r.sales));
  return (
    <>
      <div className="grid g5" style={{ marginBottom: 14 }}>
        <Kpi label="Sales" value={money(d.total.sales)} foot="Taxable value" />
        <Kpi label="Purchases" value={money(d.total.purchases)} foot="Cost of goods" tone="neg" />
        <Kpi label="Expenses" value={money(d.total.expenses)} foot="Overheads" tone="neg" />
        <Kpi label="Gross profit" value={money(d.total.grossProfit)} foot={`${d.total.sales ? ((d.total.grossProfit / d.total.sales) * 100).toFixed(1) : 0}% margin`} tone="pos" />
        <Kpi label="Net profit" value={money(d.total.netProfit)} foot="After expenses" tone={d.total.netProfit >= 0 ? 'pos' : 'neg'} />
      </div>
      <Card title="Month-wise profit & loss" sub={`${d.period.from} to ${d.period.to}`}>
        {d.rows.length === 0 ? <Empty title="No data in this period" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Month</th><th className="num">Sales</th><th className="num">Purchases</th><th className="num">Expenses</th><th className="num">Gross profit</th><th className="num">Margin</th><th className="num">Net profit</th><th style={{ width: 150 }} /></tr></thead>
              <tbody>{d.rows.map((r) => (
                <tr key={r.month}>
                  <td className="strong">{r.month}</td>
                  <td className="num">{money(r.sales)}</td><td className="num muted">{money(r.purchases)}</td><td className="num muted">{money(r.expenses)}</td>
                  <td className="num">{money(r.grossProfit)}</td>
                  <td className="num"><span className={`pill ${r.margin >= 20 ? 'green' : r.margin > 0 ? 'grey' : 'red'}`}>{r.margin}%</span></td>
                  <td className={`num strong ${r.netProfit >= 0 ? 'pos' : 'neg'}`}>{money(r.netProfit)}</td>
                  <td><div className="bar-track"><div className="bar-fill" style={{ width: `${(r.sales / max) * 100}%`, background: r.netProfit >= 0 ? 'var(--green)' : 'var(--red)' }} /></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Aging({ d }) {
  if (!d || !d.buckets || !d.items) return null;
  const segs = [
    { label: '0-30 days', value: d.buckets['0-30'], color: '#059669', display: moneyShort(d.buckets['0-30']) },
    { label: '31-60 days', value: d.buckets['31-60'], color: '#d97706', display: moneyShort(d.buckets['31-60']) },
    { label: '61-90 days', value: d.buckets['61-90'], color: '#ea580c', display: moneyShort(d.buckets['61-90']) },
    { label: '90+ days', value: d.buckets['90+'], color: '#dc2626', display: moneyShort(d.buckets['90+']) }
  ];
  return (
    <>
      <div className="grid grid-split" style={{ marginBottom: 14 }}>
        <Card title="Receivables ageing" sub={`Total outstanding ${money(d.total)}`}>
          <Donut segments={segs.filter((s) => s.value > 0)} center={moneyShort(d.total)} />
        </Card>
        <Card title="Follow-up list" sub="Oldest first - start collecting here">
          {d.items.length === 0 ? <Empty title="Nothing outstanding" icon={Icon.check} /> : (
            <div className="tbl-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>Party</th><th>Invoice</th><th>Due date</th><th className="num">Days</th><th className="num">Due</th></tr></thead>
                <tbody>{d.items.slice(0, 25).map((r) => (
                  <tr key={r.id}><td className="strong">{r.party}</td><td className="muted">{r.number}</td>
                    <td className="muted">{r.dueDate ? fmtDate(r.dueDate) : '—'}</td>
                    <td className="num"><span className={`pill ${r.age > 60 ? 'red' : r.age > 30 ? 'amber' : 'green'}`}>{r.age}d</span></td>
                    <td className="num strong neg">{money(r.due)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Daybook({ d }) {
  if (!d || !d.totals || !d.docs) return null;
  return (
    <>
      <div className="grid g5" style={{ marginBottom: 14 }}>
        <Kpi label="Billing" value={money(d.totals.billing)} foot={`${d.docs.filter((x) => x.type === 'sale').length} invoices`} />
        <Kpi label="Purchases" value={money(d.totals.purchases)} foot={`${d.docs.filter((x) => x.type === 'purchase').length} bills`} />
        <Kpi label="Expenses" value={money(d.totals.expenses)} foot={`${d.docs.filter((x) => x.type === 'expense').length} entries`} tone="neg" />
        <Kpi label="Money received" value={money(d.totals.received)} foot={`${d.totals.cashReceived ? money(d.totals.cashReceived) + ' Cash' : ''}${d.totals.upiReceived ? ' · ' + money(d.totals.upiReceived) + ' UPI' : ''}`} tone="pos" />
        <Kpi label="Money paid out" value={money(d.totals.paid)} foot={`${d.txns.filter((x) => x.type === 'you_gave').length} payments`} tone="neg" />
      </div>

      {/* Daily Mode Breakdown Banner */}
      <div className="banner info" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Icon.wallet size={16} />
          <b>Day's Collections Split:</b>
          <span className="pill sm green" style={{ fontWeight: 700 }}>💵 Cash: {money(d.totals.cashReceived || 0)}</span>
          <span className="pill sm" style={{ background: '#eef2ff', color: '#4f46e5', fontWeight: 700 }}>📱 UPI: {money(d.totals.upiReceived || 0)}</span>
          {(d.totals.bankReceived > 0) && <span className="pill sm blue" style={{ fontWeight: 700 }}>🏦 Bank: {money(d.totals.bankReceived)}</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          Total Day Received: <span style={{ color: 'var(--green)' }}>{money(d.totals.received || 0)}</span>
        </div>
      </div>

      <div className="grid g2">
        <Card title="Documents" sub={fmtDate(d.date)}>
          {d.docs.length === 0 ? <Empty title="No documents" /> : d.docs.map((r) => (
            <div className="kv" key={r.id}>
              <span className="k">{r.number} · {r.party_name}</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {r.paid_amount > 0 && (
                  <span className={`pill sm ${(r.payment_mode || '').toLowerCase() === 'cash' ? 'green' : 'indigo'}`}>
                    {(r.payment_mode || 'cash').toUpperCase()}
                  </span>
                )}
                <span className="v">{money(r.total)}</span>
              </div>
            </div>
          ))}
        </Card>
        <Card title="Collections & ledger entries" sub={fmtDate(d.date)}>
          {(!d.receipts || d.receipts.length === 0) && d.txns.length === 0 && d.moves.length === 0 ? <Empty title="No entries" /> : (
            <>
              {d.receipts && d.receipts.length > 0 ? (
                d.receipts.map((t, idx) => {
                  const m = (t.mode || 'cash').toLowerCase();
                  return (
                    <div className="kv" key={'rec' + idx}>
                      <span className="k">
                        Received from <b>{t.party_name}</b> · <span className={`pill sm ${m === 'cash' ? 'green' : 'indigo'}`} style={{ textTransform: 'uppercase' }}>{t.mode || 'CASH'}</span>
                        {t.reference ? ` (${t.reference})` : ''}
                      </span>
                      <span className="v pos">{money(t.amount)}</span>
                    </div>
                  );
                })
              ) : (
                d.txns.map((t) => (
                  <div className="kv" key={'t' + t.id}>
                    <span className="k">{t.type === 'you_got' ? 'Received from' : 'Paid to'} {t.party_name} · {String(t.mode).toUpperCase()}</span>
                    <span className={`v ${t.type === 'you_got' ? 'pos' : 'neg'}`}>{money(t.amount)}</span>
                  </div>
                ))
              )}
              {d.moves.length > 0 && <hr className="divider" />}
              {d.moves.map((m) => (
                <div className="kv" key={'m' + m.id}><span className="k">{m.product_name} · {m.reason}</span>
                  <span className={`v ${m.qty > 0 ? 'pos' : 'neg'}`}>{m.qty > 0 ? '+' : ''}{m.qty}</span></div>
              ))}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function PaymentsReport({ d }) {
  if (!d || !d.totals) return null;
  const t = d.totals;
  const [filterMode, setFilterMode] = useState('all');
  const [search, setSearch] = useState('');

  const filteredReceipts = (d.receipts || []).filter((r) => {
    if (filterMode !== 'all' && (r.mode || '').toLowerCase() !== filterMode) return false;
    if (search) {
      const q = search.toLowerCase();
      const party = (r.party_name || '').toLowerCase();
      const ref = (r.reference || r.doc_number || '').toLowerCase();
      const notes = (r.notes || '').toLowerCase();
      return party.includes(q) || ref.includes(q) || notes.includes(q);
    }
    return true;
  });

  const segs = [
    { label: 'Cash', value: t.cash, color: '#16a34a', display: money(t.cash) },
    { label: 'UPI', value: t.upi, color: '#4f46e5', display: money(t.upi) },
    { label: 'Bank', value: t.bank, color: '#0284c7', display: money(t.bank) },
    { label: 'Card / Cheque', value: t.card + t.cheque + t.other, color: '#d97706', display: money(t.card + t.cheque + t.other) }
  ];

  return (
    <>
      {/* KPI Cards */}
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi
          label="Cash Received"
          value={money(t.cash)}
          foot={`${t.total > 0 ? Math.round((t.cash / t.total) * 100) : 0}% of all collections`}
          tone="pos"
        />
        <Kpi
          label="UPI Received"
          value={money(t.upi)}
          foot={`${t.total > 0 ? Math.round((t.upi / t.total) * 100) : 0}% of all collections`}
        />
        <Kpi
          label="Bank / Transfer"
          value={money(t.bank)}
          foot={`${money(t.card + t.cheque + t.other)} via card/cheque`}
        />
        <Kpi
          label="Total Money Collected"
          value={money(t.total)}
          foot={`${t.count} total payment receipts`}
          tone="pos"
        />
      </div>

      {/* Breakdown Donut & Daily Trend */}
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <Card title="Collections by Payment Mode" sub="Cash vs UPI vs Bank split">
          {t.total === 0 ? <Empty title="No collections in this period" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Donut segments={segs.filter((s) => s.value > 0)} center={moneyShort(t.total)} />
              <table className="tbl" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Mode</th>
                    <th className="num">Share</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className="pill sm green">CASH</span> Cash in hand</td>
                    <td className="num">{t.total > 0 ? `${Math.round((t.cash / t.total) * 100)}%` : '0%'}</td>
                    <td className="num strong pos">{money(t.cash)}</td>
                  </tr>
                  <tr>
                    <td><span className="pill sm" style={{ background: '#eef2ff', color: '#4f46e5' }}>UPI</span> PhonePe / GPay / QR</td>
                    <td className="num">{t.total > 0 ? `${Math.round((t.upi / t.total) * 100)}%` : '0%'}</td>
                    <td className="num strong" style={{ color: '#4f46e5' }}>{money(t.upi)}</td>
                  </tr>
                  <tr>
                    <td><span className="pill sm" style={{ background: '#eff6ff', color: '#0284c7' }}>BANK</span> NEFT / RTGS / IMPS</td>
                    <td className="num">{t.total > 0 ? `${Math.round((t.bank / t.total) * 100)}%` : '0%'}</td>
                    <td className="num strong">{money(t.bank)}</td>
                  </tr>
                  {(t.card > 0 || t.cheque > 0 || t.other > 0) && (
                    <tr>
                      <td><span className="pill sm amber">OTHER</span> Card & Cheque</td>
                      <td className="num">{t.total > 0 ? `${Math.round(((t.card + t.cheque + t.other) / t.total) * 100)}%` : '0%'}</td>
                      <td className="num strong">{money(t.card + t.cheque + t.other)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Daily Collections Breakdown" sub="Day-by-day cash & UPI summary">
          {!d.daily || d.daily.length === 0 ? <Empty title="No daily collections" /> : (
            <div className="tbl-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Cash</th>
                    <th className="num">UPI</th>
                    <th className="num">Bank</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {d.daily.map((day) => (
                    <tr key={day.date}>
                      <td className="strong">{fmtDate(day.date)}</td>
                      <td className="num pos">{day.cash > 0 ? money(day.cash) : '—'}</td>
                      <td className="num" style={{ color: day.upi > 0 ? '#4f46e5' : 'inherit' }}>
                        {day.upi > 0 ? money(day.upi) : '—'}
                      </td>
                      <td className="num">{day.bank > 0 ? money(day.bank) : '—'}</td>
                      <td className="num strong">{money(day.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Monthly Summary (if 2 or more months exist) */}
      {d.monthly && d.monthly.length > 1 && (
        <Card title="Monthly Collections Summary" sub="Month-wise cash & UPI reconciliation" style={{ marginBottom: 14 }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Cash Received</th>
                  <th className="num">UPI Received</th>
                  <th className="num">Bank / Other</th>
                  <th className="num">Total Collected</th>
                  <th className="num">Receipts</th>
                </tr>
              </thead>
              <tbody>
                {d.monthly.map((m) => (
                  <tr key={m.month}>
                    <td className="strong">{m.month}</td>
                    <td className="num pos">{money(m.cash)}</td>
                    <td className="num" style={{ color: '#4f46e5' }}>{money(m.upi)}</td>
                    <td className="num">{money(m.bank + m.card + m.cheque + m.other)}</td>
                    <td className="num strong">{money(m.total)}</td>
                    <td className="num muted">{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detailed Payment Receipts Register */}
      <Card
        title="Payment Receipts Register"
        sub="All cash, UPI and bank payments received"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="segmented-control" style={{ display: 'inline-flex' }}>
              <button type="button" className={`btn xs ${filterMode === 'all' ? 'primary' : ''}`} onClick={() => setFilterMode('all')}>All ({t.count})</button>
              <button type="button" className={`btn xs ${filterMode === 'cash' ? 'primary' : ''}`} onClick={() => setFilterMode('cash')}>Cash</button>
              <button type="button" className={`btn xs ${filterMode === 'upi' ? 'primary' : ''}`} onClick={() => setFilterMode('upi')}>UPI</button>
              <button type="button" className={`btn xs ${filterMode === 'bank' ? 'primary' : ''}`} onClick={() => setFilterMode('bank')}>Bank</button>
            </div>
            <input
              type="search"
              className="input sm"
              placeholder="Search receipts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 140 }}
            />
          </div>
        }
      >
        {filteredReceipts.length === 0 ? <Empty title="No payment receipts found" /> : (
          <div className="tbl-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer / Party</th>
                  <th>Mode</th>
                  <th>Source</th>
                  <th>Reference / Doc</th>
                  <th>Notes</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.map((r, idx) => {
                  const m = (r.mode || 'cash').toLowerCase();
                  const modeBadge = m === 'cash' ? 'green' : m === 'upi' ? 'indigo' : 'blue';
                  return (
                    <tr key={idx}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                      <td className="strong">{r.party_name}</td>
                      <td>
                        <span className={`pill sm ${modeBadge}`} style={{ textTransform: 'uppercase', fontWeight: 700 }}>
                          {r.mode || 'CASH'}
                        </span>
                      </td>
                      <td className="muted" style={{ fontSize: 11.5 }}>
                        {r.source === 'khata' ? 'Khata Ledger' : 'Direct POS Sale'}
                      </td>
                      <td className="muted">{r.doc_number || r.reference || '—'}</td>
                      <td className="muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.notes || '—'}
                      </td>
                      <td className="num strong pos">{money(r.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
