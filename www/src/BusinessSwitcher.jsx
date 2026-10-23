import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { moneyShort } from './api.js';

/**
 * Multi-business switcher. Shows the active business in the top bar, lets you
 * hop between businesses, jump to the consolidated group view, or add a new one.
 */
export default function BusinessSwitcher({ businesses, active, onSwitch, onAdd, onGroup, onSettings, group }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('touchstart', h);
    };
  }, []);
  if (!active) return null;

  return (
    <div className="biz-switch" ref={ref}>
      <button
        type="button"
        className="biz-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-label="Switch active business"
      >
        <span className="biz-dot" style={{ background: active.logo_url ? '#ffffff' : (active.color || '#4f46e5'), overflow: 'hidden', border: active.logo_url ? '1px solid var(--line)' : 'none' }}>
          {active.logo_url ? (
            <img src={active.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            (active.name || '?').slice(0, 1).toUpperCase()
          )}
        </span>
        <span className="nm">
          {active.name}
          <small>{active.gstin || 'GSTIN not set'} · {businesses.length} business{businesses.length > 1 ? 'es' : ''}</small>
        </span>
        <Icon.chevDown size={15} style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {open && (
        <div className="biz-menu">
          {group && (
            <div className="grp">
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 5 }}>All businesses combined</div>
              <div className="row"><span>Total sales</span><b>{moneyShort(group.total.sales)}</b></div>
              <div className="row"><span>To collect</span><b>{moneyShort(group.total.receivable)}</b></div>
              <div className="row"><span>Tax payable (net)</span><b>{moneyShort(group.total.outputTax - group.total.inputTax)}</b></div>
              <div className="item" style={{ marginTop: 6, background: 'var(--surface)' }} onClick={(e) => { e.stopPropagation(); onGroup(); setOpen(false); }}>
                <Icon.chart size={15} style={{ color: 'var(--brand)' }} />
                <span className="nm" style={{ color: 'var(--brand)' }}>Open consolidated view</span>
              </div>
            </div>
          )}
          <div className="biz-list" style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {businesses.map((b) => (
              <div key={b.id} className={`item ${b.id === active.id ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onSwitch(b); setOpen(false); }}>
                <span className="biz-dot" style={{ background: b.logo_url ? '#ffffff' : (b.color || '#4f46e5'), width: 26, height: 26, fontSize: 11, overflow: 'hidden', border: b.logo_url ? '1px solid var(--line)' : 'none' }}>
                  {b.logo_url ? (
                    <img src={b.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    (b.name || '?').slice(0, 1).toUpperCase()
                  )}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="nm">
                    {b.name}
                    {b.owner_name ? <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', marginLeft: 6 }}>({b.owner_name})</span> : null}
                  </div>
                  <div className="st">{b.city || 'No city'} · Sales {moneyShort(b.stats ? b.stats.sales : 0)}</div>
                </div>
                {b.id === active.id && <Icon.check size={15} className="check" />}
              </div>
            ))}
          </div>
          <hr />
          {onSettings && (
            <div className="add" style={{ color: 'var(--ink)' }} onClick={(e) => { e.stopPropagation(); onSettings(); setOpen(false); }}>
              <Icon.settings size={15} /> Business settings & logo
            </div>
          )}
          <div className="add" onClick={(e) => { e.stopPropagation(); onAdd(); setOpen(false); }}>
            <Icon.plus size={15} /> Add a new business
          </div>
        </div>
      )}
    </div>
  );
}
