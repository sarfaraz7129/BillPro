import React, { useState, useEffect } from 'react';
import { api, money, fmtDate, fmtDateTime } from './api.js';
import { Icon } from './ui.jsx';
import { Modal } from './components.jsx';

export default function ThermalReceiptModal({ doc, business, onClose, onWhatsApp, toast }) {
  const [width, setWidth] = useState('80'); // '58' or '80'
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    if (!doc || !doc.id) return;
    api.docQr(doc.id)
      .then((res) => {
        if (active && res && res.qrDataUrl) setQrUrl(res.qrDataUrl);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [doc.id]);

  const printReceipt = () => {
    document.body.classList.add('printing-thermal');
    const prevTitle = document.title;
    document.title = `Receipt_${doc.number}`;
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-thermal');
      document.title = prevTitle;
    }, 600);
  };

  const copyPlainText = async () => {
    const cols = width === '58' ? 32 : 42;
    const line = '-'.repeat(cols);
    const double = '='.repeat(cols);
    const center = (str) => {
      const s = String(str || '').trim();
      const pad = Math.max(0, Math.floor((cols - s.length) / 2));
      return ' '.repeat(pad) + s;
    };
    const row = (left, right) => {
      const l = String(left || '');
      const r = String(right || '');
      const space = Math.max(1, cols - l.length - r.length);
      return l + ' '.repeat(space) + r;
    };

    const text = [
      double,
      center(business.name.toUpperCase()),
      business.legal_name && business.legal_name !== business.name ? center(business.legal_name) : '',
      business.gstin ? center(`GSTIN: ${business.gstin}`) : '',
      business.address ? center(business.address) : '',
      business.city ? center(`${business.city}${business.pincode ? ' - ' + business.pincode : ''}`) : '',
      business.phone ? center(`Tel: ${business.phone}`) : '',
      line,
      row(`Tax Invoice: ${doc.number}`, fmtDate(doc.date)),
      row('Time (IST):', fmtDateTime(doc.created_at || doc.date)),
      row(`Customer: ${doc.party_name || 'Walk-in'}`, doc.payment_mode ? `Mode: ${doc.payment_mode.toUpperCase()}` : ''),
      line,
      row('Item', 'Qty x Rate   Total'),
      line,
      ...doc.items.map((it) => {
        const itemLine = it.name.length > cols - 16 ? it.name.slice(0, cols - 16) : it.name;
        const calc = `${it.qty} ${it.unit || ''} x ${it.rate} = ${it.total}`;
        return `${itemLine}\n` + row(`  GST ${it.gstRate}%`, calc);
      }),
      line,
      row('Subtotal:', money(doc.subtotal)),
      doc.discount_amount > 0 ? row('Discount:', `-${money(doc.discount_amount)}`) : '',
      row('Taxable Value:', money(doc.taxable_value)),
      doc.supply_type === 'inter'
        ? row('IGST:', money(doc.igst))
        : [row('CGST:', money(doc.cgst)), row('SGST:', money(doc.sgst))].join('\n'),
      doc.round_off ? row('Round Off:', money(doc.round_off)) : '',
      double,
      row('GRAND TOTAL:', money(doc.total)),
      double,
      row('Paid Amount:', money(doc.paid_amount)),
      doc.due_amount > 0 ? row('Balance Due:', money(doc.due_amount)) : '',
      line,
      business.upi_id ? center(`UPI ID: ${business.upi_id}`) : '',
      center('Thank you! Visit again.'),
      business.terms ? center(business.terms) : '',
      double
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      if (toast) toast('Thermal receipt text copied to clipboard', 'ok');
    } catch (e) {}
  };

  return (
    <Modal
      title="Thermal Printer Receipt"
      sub={`${doc.number} · ${money(doc.total)} · ESC/POS ready`}
      size=""
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Close</button>
          {onWhatsApp && (
            <button
              type="button"
              className="btn green"
              onClick={() => { onClose(); onWhatsApp(doc); }}
              title="Send digital copy to customer WhatsApp"
            >
              <Icon.whatsapp size={14} /> Send WhatsApp
            </button>
          )}
          <button type="button" className="btn" onClick={copyPlainText}>
            {copied ? '✓ Copied' : '📋 Copy ESC/POS text'}
          </button>
          <button
            type="button"
            className="btn primary"
            style={{ fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={printReceipt}
          >
            <Icon.print size={16} /> Print to Thermal Printer
          </button>
        </>
      }
    >
      {/* Width Selector bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--line)'
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
          Roll Width:
        </div>
        <div className="btn-row" style={{ gap: 4 }}>
          <button
            type="button"
            className={`btn sm ${width === '58' ? 'primary' : ''}`}
            onClick={() => setWidth('58')}
          >
            58mm (2-Inch)
          </button>
          <button
            type="button"
            className={`btn sm ${width === '80' ? 'primary' : ''}`}
            onClick={() => setWidth('80')}
          >
            80mm (3-Inch Standard)
          </button>
        </div>
      </div>

      {/* Visual thermal roll preview */}
      <div className="thermal-wrapper">
        <div id="thermal-receipt-printable" className={`thermal-receipt w-${width}`}>
          {business.logo_url && (
            <div style={{ textAlign: 'center', marginBottom: 6 }}>
              <img src={business.logo_url} alt="Logo" style={{ maxHeight: 44, maxWidth: 140, objectFit: 'contain', filter: 'grayscale(100%)' }} />
            </div>
          )}
          <h2>{business.name}</h2>
          {business.legal_name && business.legal_name !== business.name && (
            <div className="center muted" style={{ fontSize: '0.9em' }}>{business.legal_name}</div>
          )}
          {business.gstin && (
            <div className="center"><b>GSTIN:</b> {business.gstin}</div>
          )}
          {business.address && <div className="center">{business.address}</div>}
          {business.city && (
            <div className="center">{business.city} {business.pincode ? `- ${business.pincode}` : ''}</div>
          )}
          {business.phone && <div className="center">Tel: {business.phone}</div>}

          <div className="dashed" />

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span><b>Bill:</b> {doc.number}</span>
            <span>{fmtDate(doc.date)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginTop: 1 }}>
            <span>Standard Time:</span>
            <span>{fmtDateTime(doc.created_at || doc.date)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span><b>Party:</b> {doc.party_name || 'Walk-in Customer'}</span>
            <span>{doc.payment_mode ? doc.payment_mode.toUpperCase() : 'CASH'}</span>
          </div>
          {doc.party_gstin && (
            <div><b>Party GSTIN:</b> {doc.party_gstin}</div>
          )}

          <div className="dashed" />

          {/* Item Table */}
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Item</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it, idx) => (
                <tr key={idx}>
                  <td style={{ verticalAlign: 'top' }}>
                    <div><b>{it.name}</b></div>
                    <div style={{ fontSize: '0.85em', color: '#555' }}>
                      HSN:{it.hsn || '-'} · GST {it.gstRate}%
                    </div>
                  </td>
                  <td className="num" style={{ verticalAlign: 'top' }}>{it.qty}</td>
                  <td className="num" style={{ verticalAlign: 'top' }}>{it.rate}</td>
                  <td className="num" style={{ verticalAlign: 'top' }}><b>{it.total}</b></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="dashed" />

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal:</span>
            <span>{money(doc.subtotal)}</span>
          </div>
          {doc.discount_amount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Discount:</span>
              <span>-{money(doc.discount_amount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Taxable:</span>
            <span>{money(doc.taxable_value)}</span>
          </div>

          {doc.supply_type === 'inter' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>IGST:</span>
              <span>{money(doc.igst)}</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>CGST:</span>
                <span>{money(doc.cgst)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SGST:</span>
                <span>{money(doc.sgst)}</span>
              </div>
            </>
          )}

          {doc.round_off ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Round Off:</span>
              <span>{money(doc.round_off)}</span>
            </div>
          ) : null}

          <div className="double">
            <div className="grand-total">
              <span>TOTAL PAYABLE:</span>
              <span>{money(doc.total)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Paid:</span>
            <span>{money(doc.paid_amount)}</span>
          </div>
          {doc.due_amount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>Balance Due:</span>
              <span>{money(doc.due_amount)}</span>
            </div>
          )}

          {/* Dynamic UPI QR Code */}
          {qrUrl && (
            <div style={{ textAlign: 'center', marginTop: 10, paddingTop: 6, borderTop: '1px dashed #444' }}>
              <div style={{ fontSize: '0.85em', fontWeight: 'bold', marginBottom: 4 }}>
                SCAN UPI QR TO PAY / VERIFY
              </div>
              <img src={qrUrl} alt="UPI Payment QR" style={{ width: 110, height: 110, display: 'inline-block' }} />
              {business.upi_id && (
                <div style={{ fontSize: '0.8em', marginTop: 2 }}>UPI: {business.upi_id}</div>
              )}
            </div>
          )}

          <div className="dashed" />
          <div className="center" style={{ fontWeight: 'bold' }}>Thank you! Visit again.</div>
          <div className="center" style={{ fontSize: '0.82em', color: '#555', marginTop: 2 }}>
            Goods once sold will not be returned without bill.
          </div>
          {business.invoice_footer && (
            <div className="center" style={{ fontSize: '0.82em', marginTop: 4 }}>{business.invoice_footer}</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
