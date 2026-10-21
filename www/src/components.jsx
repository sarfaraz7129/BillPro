import React, { useEffect, useState, useRef } from 'react';
import { Icon, initials, colorFor } from './ui.jsx';

/* ---------------- modal ---------------- */
export function Modal({ title, sub, children, footer, onClose, size = '' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className={`modal ${size}`}>
        <div className="modal-h">
          <div style={{ flex: 1 }}>
            <h3>{title}</h3>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button className="icon-btn" onClick={onClose}><Icon.close /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- confirm ---------------- */
export function Confirm({ title, message, confirmLabel = 'Delete', danger = true, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? 'red' : 'primary'}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </>
    }>
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>{message}</p>
    </Modal>
  );
}

/* ---------------- toasts ---------------- */
export function Toasts({ toasts }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          {t.kind === 'err' ? <Icon.alert size={16} /> : t.kind === 'ok' ? <Icon.check size={16} /> : <Icon.sparkles size={16} />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- empty state ---------------- */
export function Empty({ title, hint, action, icon }) {
  const I = icon || Icon.file;
  return (
    <div className="empty">
      <I size={40} />
      <b>{title}</b>
      {hint && <div style={{ maxWidth: 380, margin: '0 auto 14px' }}>{hint}</div>}
      {action}
    </div>
  );
}

/* ---------------- field ---------------- */
export function Field({ label, req, hint, err, children, full }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      {label && <label>{label}{req && <span className="req"> *</span>}</label>}
      {children}
      {err ? <div className="hint" style={{ color: 'var(--red)' }}>{err}</div> : hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/* ---------------- status pill ---------------- */
export function PayPill({ status }) {
  if (status === 'paid') return <span className="pill green"><Icon.check size={11} /> Paid</span>;
  if (status === 'partial') return <span className="pill amber">Partial</span>;
  return <span className="pill red">Unpaid</span>;
}

export function BalancePill({ balance }) {
  const v = Number(balance || 0);
  if (Math.abs(v) < 0.005) return <span className="pill grey">Settled</span>;
  return v > 0
    ? <span className="pill red">You'll get {Math.abs(v).toLocaleString('en-IN')}</span>
    : <span className="pill green">You'll give {Math.abs(v).toLocaleString('en-IN')}</span>;
}

/* ---------------- avatar ---------------- */
export function Avatar({ name, size = 32, color }) {
  return <div className="avatar" style={{ width: size, height: size, background: color || colorFor(name), fontSize: size * 0.38 }}>{initials(name)}</div>;
}

/* ---------------- simple bar chart ---------------- */
export function Bars({ data, format }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="spark">
      {data.map((d, i) => (
        <div className="col" key={i} title={`${d.label}: ${format ? format(d.value) : d.value}`}>
          <div className="b" style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }} />
          <div className="l">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- donut chart (SVG, no libs) ---------------- */
export function Donut({ segments, size = 150, thickness = 20, center }) {
  const total = segments.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <svg width={size} height={size} className="chart-svg" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (Math.abs(s.value) / total) * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="butt" />
          );
          offset += len;
          return el;
        })}
        {center && (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
            style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }} fontSize="13" fontWeight="700" fill="var(--ink)">
            {center}
          </text>
        )}
      </svg>
      <div style={{ flex: 1, minWidth: 130 }}>
        {segments.map((s, i) => (
          <div className="bar-row" key={i}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: 'none' }} />
            <span style={{ flex: 1 }}>{s.label}</span>
            <b className="mono">{s.display || s.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- date range picker ---------------- */
export function DateRange({ from, to, onChange, presets = true }) {
  const apply = (preset) => {
    const now = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    let f, t = iso(now);
    if (preset === 'month') f = t.slice(0, 8) + '01';
    else if (preset === 'quarter') { const q = Math.floor(now.getMonth() / 3) * 3; f = iso(new Date(now.getFullYear(), q, 1)); }
    else if (preset === 'fy') f = now.getMonth() >= 3 ? `${now.getFullYear()}-04-01` : `${now.getFullYear() - 1}-04-01`;
    else if (preset === 'year') f = `${now.getFullYear()}-01-01`;
    else if (preset === 'all') f = '2000-01-01';
    else if (preset === 'last') f = iso(new Date(Date.now() - 30 * 86400000));
    onChange({ from: f, to: t });
  };
  return (
    <div className="btn-row date-range-wrap">
      {presets && (
        <div className="tabs">
          <button type="button" onClick={() => apply('month')}>This month</button>
          <button type="button" onClick={() => apply('quarter')}>Quarter</button>
          <button type="button" onClick={() => apply('fy')}>FY</button>
          <button type="button" onClick={() => apply('all')}>All</button>
        </div>
      )}
      <input type="date" className="input date-input" value={from} onChange={(e) => onChange({ from: e.target.value, to })} />
      <span style={{ color: 'var(--muted)' }}>to</span>
      <input type="date" className="input date-input" value={to} onChange={(e) => onChange({ from, to: e.target.value })} />
    </div>
  );
}

/* ---------------- party / product autocomplete ---------------- */
export function Picker({ items, value, onChange, placeholder, onAddNew, render, emptyText = 'Nothing found' }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const needle = q.toLowerCase();
  const filtered = items.filter((it) => !needle || String(it.name || '').toLowerCase().includes(needle) || String(it.sku || it.phone || '').toLowerCase().includes(needle)).slice(0, 40);
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <div className="search" style={{ position: 'relative' }}>
        <Icon.search size={15} />
        <input className="input" placeholder={placeholder} value={open ? q : (value ? (value.name || '') : '')}
          onChange={(e) => { setQ(e.target.value); setOpen(true); if (value) onChange(null); }}
          onFocus={() => { setOpen(true); setQ(''); }}
          style={value && !open ? { paddingRight: 28 } : {}}
        />
        {value && !open && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); setQ(''); }}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
              fontSize: 14, lineHeight: 1, padding: 4
            }}
            title="Clear selection"
          >
            ✕
          </button>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, minWidth: 320, maxWidth: 460, width: 'max-content',
          background: 'var(--surface)', border: '1px solid var(--line-2)',
          borderRadius: 11, boxShadow: '0 12px 28px -4px rgba(15,23,42,0.22), 0 4px 10px rgba(0,0,0,0.08)',
          zIndex: 150, marginTop: 4, maxHeight: 280, overflowY: 'auto', padding: 4
        }}>
          {filtered.length === 0 && !onAddNew && <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{emptyText}</div>}
          {filtered.length === 0 && onAddNew && !q && (
            <div style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: 12 }}>
              Type item name to search or add…
            </div>
          )}
          {filtered.map((it) => (
            <div key={it.id} className="item" style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '8px 9px', borderRadius: 8, cursor: 'pointer' }}
              onMouseDown={(e) => { e.preventDefault(); onChange(it); setOpen(false); setQ(''); }}>
              {render ? render(it) : (
                <>
                  <Avatar name={it.name} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</div>
                    {it.sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{it.sub}</div>}
                  </div>
                  {it.right && <div style={{ fontSize: 11.5, fontWeight: 650 }}>{it.right}</div>}
                </>
              )}
            </div>
          ))}
          {onAddNew && q && (
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '8px 9px', borderRadius: 8, cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, fontSize: 12.5 }}
              onMouseDown={(e) => { e.preventDefault(); onAddNew(q); setOpen(false); }}>
              <Icon.plus size={15} /> Add “{q}”
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- GST Rate selector with custom figure entry ---------------- */
export function GstRateInput({ value, onChange, className = 'input', style = {}, id, placeholder = '0' }) {
  const PRESETS = [0, 0.25, 1.5, 3, 5, 6, 7.5, 12, 14, 18, 28, 40];
  const numVal = Number(value !== undefined && value !== null ? value : 18);
  const isPreset = PRESETS.includes(numVal);
  const [custom, setCustom] = useState(!isPreset);

  useEffect(() => {
    if (!PRESETS.includes(Number(value))) {
      setCustom(true);
    }
  }, [value]);

  return (
    <div className="gst-rate-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
      {!custom ? (
        <select
          id={id}
          className={className}
          style={{ width: '100%', minWidth: 84 }}
          value={numVal}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              setCustom(true);
            } else {
              onChange(Number(e.target.value));
            }
          }}
        >
          {PRESETS.map((r) => (
            <option key={r} value={r}>{r}%</option>
          ))}
          <option value="custom">+ New / Custom %…</option>
        </select>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
          <input
            id={id}
            className={className}
            type="number"
            step="0.01"
            min="0"
            max="100"
            style={{ width: 64, minWidth: 54, flex: '1 1 auto', padding: '6px 8px' }}
            value={value !== undefined ? value : ''}
            onChange={(e) => onChange(Number(e.target.value))}
            placeholder={placeholder}
            autoFocus
          />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>%</span>
          <button
            type="button"
            className="btn xs"
            style={{ padding: '3px 7px', fontSize: 10.5, whiteSpace: 'nowrap' }}
            title="Choose from standard GST slabs"
            onClick={() => {
              setCustom(false);
              onChange(18);
            }}
          >
            Presets
          </button>
        </div>
      )}
    </div>
  );
}

