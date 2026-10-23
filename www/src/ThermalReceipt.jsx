import React, { useState, useEffect } from 'react';
import { api, money, fmtDate, fmtDateTime } from './api.js';
import { Icon } from './ui.jsx';
import { Modal } from './components.jsx';

export default function ThermalReceiptModal({ doc, party, business, initialWidth, onClose, onWhatsApp, toast }) {
  const [width, setWidth] = useState(() => {
    return initialWidth || localStorage.getItem('billpro.receipt_width') || '80';
  });
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [partyData, setPartyData] = useState(party || null);

  const handleSetWidth = (w) => {
    setWidth(w);
    try { localStorage.setItem('billpro.receipt_width', w); } catch (e) {}
  };

  useEffect(() => {
    if (initialWidth) {
      handleSetWidth(initialWidth);
    }
  }, [initialWidth]);

  useEffect(() => {
    let active = true;
    if (party) {
      setPartyData(party);
    } else if (doc && doc.party_id) {
      api.party(doc.party_id)
        .then((res) => {
          if (active && res && res.party) {
            setPartyData({
              ...res.party,
              balance: res.balance !== undefined ? res.balance : res.party.balance
            });
          }
        })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [doc?.party_id, party]);

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
    const isLq50 = width === '150';
    const cols = width === '58' ? 32 : width === '80' ? 42 : 54;
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

    const hasPartyBal = partyData && partyData.balance !== undefined;
    const netBal = hasPartyBal ? Number(partyData.balance) || 0 : Number(doc.due_amount) || 0;
    const paid = Number(doc.paid_amount || 0);
    const prevBal = hasPartyBal ? Math.round((netBal - (Number(doc.total) - paid)) * 100) / 100 : 0;

    const itemLines = isLq50
      ? [
          line,
          row('Item Description', 'HSN   Qty  Rate  GST%    Total'),
          line,
          ...doc.items.map((it) => {
            const isRet = !!(it.isReturn || it.is_return || (Number(it.qty) < 0));
            const baseName = (isRet ? '[RET] ' : '') + it.name;
            const name = baseName.length > 20 ? baseName.slice(0, 20) : baseName.padEnd(20, ' ');
            const hsn = (it.hsn || '-').slice(0, 5).padEnd(5, ' ');
            const qty = `${isRet ? '-' : ''}${Math.abs(it.qty)} ${it.unit || ''}`.slice(0, 5).padStart(5, ' ');
            const rate = `${it.rate}`.slice(0, 6).padStart(6, ' ');
            const gst = `${it.gstRate}%`.slice(0, 4).padStart(4, ' ');
            const tot = `${isRet && Number(it.total) > 0 ? '-' : ''}${it.total}`.slice(0, 8).padStart(8, ' ');
            return `${name} ${hsn} ${qty} ${rate} ${gst} ${tot}`;
          })
        ]
      : [
          line,
          row('Item', 'Qty x Rate   Total'),
          line,
          ...doc.items.map((it) => {
            const isRet = !!(it.isReturn || it.is_return || (Number(it.qty) < 0));
            const baseName = (isRet ? '[RET] ' : '') + it.name;
            const itemLine = baseName.length > cols - 16 ? baseName.slice(0, cols - 16) : baseName;
            const calc = `${isRet ? '-' : ''}${Math.abs(it.qty)} ${it.unit || ''} x ${it.rate} = ${isRet && Number(it.total) > 0 ? '-' : ''}${it.total}`;
            return `${itemLine}\n` + row(`  GST ${it.gstRate}%`, calc);
          })
        ];

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
      row('Standard Time (IST):', fmtDateTime(doc.created_at || doc.date)),
      row(`Customer: ${doc.party_name || 'Walk-in'}`, doc.payment_mode ? `Mode: ${doc.payment_mode.toUpperCase()}` : ''),
      ...(doc.party_gstin ? [row(`Party GSTIN: ${doc.party_gstin}`, '')] : []),
      ...itemLines,
      line,
      row('Subtotal:', money(doc.subtotal)),
      doc.discount_amount > 0 ? row('Discount:', `-${money(doc.discount_amount)}`) : '',
      row('Taxable Value:', money(doc.taxable_value)),
      doc.supply_type === 'inter'
        ? row('IGST:', money(doc.igst))
        : [row('CGST:', money(doc.cgst)), row('SGST:', money(doc.sgst))].join('\n'),
      Number(doc.transportation) > 0 ? row('Transportation:', money(doc.transportation)) : '',
      Number(doc.loading_charges) > 0 ? row('Loading Charges:', money(doc.loading_charges)) : '',
      Number(doc.bag_charges) > 0 ? row('Bag Charges:', money(doc.bag_charges)) : '',
      doc.round_off ? row('Round Off:', money(doc.round_off)) : '',
      double,
      row('CURRENT BILL TOTAL:', money(doc.total)),
      Math.abs(prevBal) > 0.01 ? row(prevBal > 0 ? 'Previous Due:' : 'Previous Advance:', money(Math.abs(prevBal))) : '',
      row('Amount Received:', money(doc.paid_amount || 0)),
      line,
      row(netBal > 0 ? 'NET BALANCE DUE:' : (netBal < 0 ? 'NET ADVANCE:' : 'NET BALANCE:'), money(Math.abs(netBal))),
      double,
      business.upi_id ? center(`UPI ID: ${business.upi_id}`) : '',
      center('Thank you! Visit again.'),
      business.terms ? center(business.terms) : '',
      double
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      if (toast) toast(isLq50 ? 'Epson LQ-50 text copied to clipboard' : 'Thermal receipt text copied to clipboard', 'ok');
    } catch (e) {}
  };

  const isLq50 = width === '150';

  return (
    <Modal
      title={isLq50 ? 'Epson LQ-50 Slip (6-Inch / 152mm)' : 'Receipt / Thermal Printer'}
      sub={isLq50
        ? `${doc.number} · ${money(doc.total)} · 6-inch continuous tractor-feed dot matrix`
        : `${doc.number} · ${money(doc.total)} · ESC/POS ready`}
      size={isLq50 ? 'wide' : ''}
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
            {copied ? '✓ Copied' : isLq50 ? '📋 Copy Dot Matrix Text' : '📋 Copy ESC/POS text'}
          </button>
          <button
            type="button"
            className="btn primary"
            style={{ fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={printReceipt}
          >
            <Icon.print size={16} /> {isLq50 ? '🖨️ Print to Epson LQ-50 (6")' : 'Print to Thermal Printer'}
          </button>
        </>
      }
    >
      {/* Width Selector bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
          Printer / Paper Width:
        </div>
        <div className="btn-row" style={{ gap: 4, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn sm ${width === '58' ? 'primary' : ''}`}
            onClick={() => handleSetWidth('58')}
            title="58mm 2-inch mini thermal roll"
          >
            58mm (2-Inch)
          </button>
          <button
            type="button"
            className={`btn sm ${width === '80' ? 'primary' : ''}`}
            onClick={() => handleSetWidth('80')}
            title="80mm 3-inch standard POS thermal receipt"
          >
            80mm (3-Inch Standard)
          </button>
          <button
            type="button"
            className={`btn sm ${width === '150' ? 'primary' : ''}`}
            style={width === '150' ? { fontWeight: 700 } : { color: '#4338ca', borderColor: '#c7d2fe', background: '#eef2ff' }}
            onClick={() => handleSetWidth('150')}
            title="Epson LQ-50 6-inch (152mm) 24-pin continuous paper / tractor feed"
          >
            🖨️ 6-Inch (Epson LQ-50)
          </button>
        </div>
      </div>

      {/* Visual roll/slip preview */}
      <div className="thermal-wrapper">
        <div id="thermal-receipt-printable" className={`thermal-receipt w-${width}`}>
          {isLq50 && (
            <div className="center muted" style={{ fontSize: '0.8em', marginBottom: 4, letterSpacing: '0.8px' }}>
              --- TAX INVOICE · EPSON LQ-50 6" SLIP ---
            </div>
          )}
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
          {doc.bags_count ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}>
              <span><b>Bags / Pkgs:</b></span>
              <span><b>{doc.bags_count}</b></span>
            </div>
          ) : null}

          <div className="dashed" />

          {/* Item Table */}
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Item Description</th>
                <th style={{ textAlign: 'center', width: isLq50 ? 55 : 45 }}>HSN</th>
                <th className="num" style={{ width: isLq50 ? 65 : 45 }}>Qty</th>
                <th className="num" style={{ width: isLq50 ? 70 : 55 }}>Rate</th>
                {isLq50 && <th className="num" style={{ width: 55 }}>GST%</th>}
                <th className="num" style={{ width: isLq50 ? 80 : 65 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it, idx) => {
                const isRet = !!(it.isReturn || it.is_return || (Number(it.qty) < 0));
                return (
                  <tr key={idx}>
                    <td style={{ verticalAlign: 'top' }}>
                      <div>
                        {isRet && <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.85em', marginRight: 4 }}>[RET]</span>}
                        <b>{it.name}</b>
                      </div>
                      {!isLq50 && (
                        <div style={{ fontSize: '0.85em', color: '#555' }}>
                          HSN:{it.hsn || '-'} · GST {it.gstRate}%
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'top' }}>{it.hsn || '-'}</td>
                    <td className="num" style={{ verticalAlign: 'top', color: isRet ? '#dc2626' : 'inherit' }}>
                      {isRet ? '-' : ''}{Math.abs(it.qty)} {it.unit || ''}
                    </td>
                    <td className="num" style={{ verticalAlign: 'top' }}>{it.rate}</td>
                    {isLq50 && <td className="num" style={{ verticalAlign: 'top' }}>{it.gstRate}%</td>}
                    <td className="num" style={{ verticalAlign: 'top', color: isRet ? '#dc2626' : 'inherit' }}>
                      <b>{isRet && Number(it.total) > 0 ? '-' : ''}{it.total}</b>
                    </td>
                  </tr>
                );
              })}
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

          {Number(doc.transportation) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Transportation:</span>
              <span>{money(doc.transportation)}</span>
            </div>
          )}
          {Number(doc.loading_charges) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Loading Charges:</span>
              <span>{money(doc.loading_charges)}</span>
            </div>
          )}
          {Number(doc.bag_charges) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Bag Charges:</span>
              <span>{money(doc.bag_charges)}</span>
            </div>
          )}

          <div className="double">
            <div className="grand-total">
              <span>CURRENT BILL TOTAL:</span>
              <span>{money(doc.total)}</span>
            </div>
          </div>

          {partyData && partyData.balance !== undefined ? (() => {
            const netBal = Number(partyData.balance) || 0;
            const paid = Number(doc.paid_amount || 0);
            const prevBal = Math.round((netBal - (Number(doc.total) - paid)) * 100) / 100;
            return (
              <div style={{ marginTop: 2 }}>
                {Math.abs(prevBal) > 0.01 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', fontSize: '0.95em' }}>
                    <span>{prevBal > 0 ? 'Previous Due:' : 'Previous Advance:'}</span>
                    <span>{money(Math.abs(prevBal))}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span>Amount Received:</span>
                  <span>{money(paid)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 'bold',
                  fontSize: '1em',
                  padding: '4px 6px',
                  marginTop: 4,
                  borderRadius: 4,
                  background: netBal > 0 ? '#fef2f2' : (netBal < 0 ? '#f0fdf4' : '#f8fafc'),
                  border: `1px solid ${netBal > 0 ? '#dc2626' : (netBal < 0 ? '#16a34a' : '#94a3b8')}`,
                  color: netBal > 0 ? '#b91c1c' : (netBal < 0 ? '#15803d' : '#0f172a')
                }}>
                  <span>{netBal > 0 ? 'NET BALANCE DUE:' : (netBal < 0 ? 'NET ADVANCE:' : 'NET BALANCE:')}</span>
                  <span>{money(Math.abs(netBal))}</span>
                </div>
              </div>
            );
          })() : (
            <div style={{ marginTop: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Amount Received:</span>
                <span>{money(doc.paid_amount || 0)}</span>
              </div>
              {doc.due_amount > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 'bold',
                  fontSize: '1em',
                  padding: '4px 6px',
                  marginTop: 4,
                  borderRadius: 4,
                  background: '#fef2f2',
                  border: '1px solid #dc2626',
                  color: '#b91c1c'
                }}>
                  <span>NET BALANCE DUE:</span>
                  <span>{money(doc.due_amount)}</span>
                </div>
              )}
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
