import React, { useEffect, useState } from 'react';
import { api, money, moneyShort } from '../src/api.js';
import { Icon } from '../src/ui.jsx';
import { Donut, Empty } from '../src/components.jsx';

/** Consolidated view across every business this account owns. */
export default function Group({ businesses, onSwitch, goto, toast }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { api.groupOverview().then(setData).catch((e) => setErr(e.message)); }, [businesses.length]);

  if (err) return <div className="banner err"><Icon.alert size={15} />{err}</div>;
  if (!data) return <div className="empty">Loading consolidated numbers…</div>;
  const t = data.total;
  const maxSales = Math.max(1, ...data.businesses.map((b) => b.sales));

  const segs = data.businesses.map((b, i) => ({
    label: b.name, value: b.sales, color: b.color || ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626'][i % 5],
    display: moneyShort(b.sales)
  }));

  return (
    <>
      <div className="banner info">
        <Icon.layers size={16} />
        <div><b>{data.businesses.length} businesses</b> combined. Every figure below is the sum across all of them - switch to one business from the picker above for its own books.</div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="Combined sales" value={money(t.sales)} foot={`${t.invoices} invoices billed`} icon={Icon.rupee} color="#4f46e5" soft="var(--brand-soft)" />
        <Kpi label="Combined receivables" value={money(t.receivable)} foot={`${moneyShort(t.overdue)} is overdue`} icon={Icon.wallet} color="#dc2626" soft="var(--red-soft)" />
        <Kpi label="Combined payables" value={money(t.payable)} foot="Supplier bills pending" icon={Icon.arrowUp} color="#d97706" soft="var(--amber-soft)" />
        <Kpi label="Net GST payable" value={money(t.outputTax - t.inputTax)} foot={`Output ${moneyShort(t.outputTax)} - ITC ${moneyShort(t.inputTax)}`} icon={Icon.shield} color="#059669" soft="var(--green-soft)" />
      </div>

      <div className="grid grid-split" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><Icon.building size={16} /><div><h3>Business-wise performance</h3><div className="sub">Click a row to switch into that business</div></div></div>
          <div className="card-b tight tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Business</th><th className="num">Sales</th><th className="num">Purchases</th><th className="num">Receivable</th><th className="num">Payable</th><th className="num">Net tax</th><th className="num">Stock value</th><th style={{ width: 130 }} /></tr></thead>
              <tbody>
                {data.businesses.map((b) => (
                  <tr key={b.id} className="clickable" onClick={() => { onSwitch(b); goto('dashboard'); }}>
                    <td>
                      <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                        <span className="biz-dot" style={{ background: b.color || '#4f46e5', width: 26, height: 26, fontSize: 11 }}>{(b.name || '?').slice(0, 1).toUpperCase()}</span>
                        <div><div className="strong">{b.name}</div><div className="muted">{b.gstin || 'GSTIN not set'}{b.state ? ' · ' + b.state : ''}</div></div>
                      </div>
                    </td>
                    <td className="num strong">{money(b.sales)}</td>
                    <td className="num muted">{money(b.purchases)}</td>
                    <td className="num neg">{money(b.receivable)}</td>
                    <td className="num muted">{money(b.payable)}</td>
                    <td className="num">{money(b.outputTax - b.inputTax)}</td>
                    <td className="num muted">{money(b.stockValue)}</td>
                    <td><div className="bar-track"><div className="bar-fill" style={{ width: `${(b.sales / maxSales) * 100}%`, background: b.color || 'var(--brand)' }} /></div></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>All businesses</td><td className="num">{money(t.sales)}</td><td className="num">{money(t.purchases)}</td>
                  <td className="num">{money(t.receivable)}</td><td className="num">{money(t.payable)}</td>
                  <td className="num">{money(t.outputTax - t.inputTax)}</td><td className="num">{money(t.stockValue)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><Icon.chart size={16} /><div><h3>Sales share</h3><div className="sub">Which business earns what</div></div></div>
          <div className="card-b">
            {segs.filter((s) => s.value > 0).length === 0
              ? <Empty title="No sales recorded yet" hint="Bill something in any business and the split appears here." />
              : <Donut segments={segs} center={moneyShort(t.sales)} size={170} />}
          </div>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h"><Icon.alert size={16} /><div><h3>Attention needed</h3><div className="sub">Across all businesses</div></div></div>
          <div className="card-b">
            {data.businesses.filter((b) => b.overdue > 0 || b.lowStock > 0).length === 0
              ? <Empty title="All clear" icon={Icon.check} hint="No overdue invoices and no stock alerts." />
              : data.businesses.filter((b) => b.overdue > 0 || b.lowStock > 0).map((b) => (
                <div className="bar-row" key={b.id} style={{ alignItems: 'flex-start' }}>
                  <span className="biz-dot" style={{ background: b.color || '#4f46e5', width: 24, height: 24, fontSize: 10, marginTop: 2 }}>{(b.name || '?').slice(0, 1).toUpperCase()}</span>
                  <div style={{ flex: 1 }}>
                    <b>{b.name}</b>
                    <div className="muted">
                      {b.overdue > 0 && <span className="neg">{money(b.overdue)} overdue</span>}
                      {b.overdue > 0 && b.lowStock > 0 && ' · '}
                      {b.lowStock > 0 && <span className="neg">{b.lowStock} item(s) low on stock</span>}
                    </div>
                  </div>
                  <button className="btn sm" onClick={() => { onSwitch(b); goto('dashboard'); }}>Open</button>
                </div>
              ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><Icon.tag size={16} /><div><h3>Combined inventory</h3><div className="sub">Stock held across businesses</div></div></div>
          <div className="card-b">
            {data.businesses.map((b) => {
              const max = Math.max(1, ...data.businesses.map((x) => x.stockValue));
              return (
                <div className="bar-row" key={b.id}>
                  <span style={{ width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(b.stockValue / max) * 100}%`, background: b.color || 'var(--brand)' }} /></div>
                  <b className="mono" style={{ width: 96, textAlign: 'right' }}>{moneyShort(b.stockValue)}</b>
                </div>
              );
            })}
            <hr className="divider" />
            <div className="kv"><span className="k">Total stock at cost</span><span className="v">{money(t.stockValue)}</span></div>
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, foot, icon: I, color, soft }) {
  return (
    <div className="stat">
      {I && <div className="ic" style={{ background: soft, color }}><I size={16} /></div>}
      <div className="lbl">{label}</div>
      <div className="val" style={{ fontSize: 21 }}>{value}</div>
      <div className="foot">{foot}</div>
    </div>
  );
}
