'use strict';
/**
 * Invoice / statement / report PDF generation with pdfkit.
 * Uses the built-in Helvetica family only, so there is no font download step,
 * and renders the rupee sign as a literal glyph (Helvetica supports U+20B9).
 */
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { formatIstDateTime, istToday } = require('./time');
const { amountInWords, hsnSummary, round2 } = require('./gst');

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const THEMES = {
  classic: '#4f46e5',
  emerald: '#047857',
  ruby: '#b91c1c',
  amber: '#b45309',
  slate: '#334155'
};

const money = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TITLE = { sale: 'TAX INVOICE', purchase: 'PURCHASE BILL', quotation: 'QUOTATION', expense: 'EXPENSE VOUCHER' };

async function documentPdf(doc, business, party) {
  const accent = THEMES[business.invoice_theme] || THEMES.classic;
  const buf = await render(doc, business, party, accent);
  return buf;
}

function render(doc, business, party, accent) {
  return new Promise(async (resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const title = TITLE[doc.type] || 'INVOICE';
    const lines = Array.isArray(doc.items) ? doc.items : JSON.parse(doc.items || '[]');

    // ---------- header band ----------
    pdf.rect(0, 0, pdf.page.width, 92).fill(accent);
    pdf.fillColor('#ffffff');
    const leftX = 40;
    let logoImg = null;
    if (business.logo_url) {
      try {
        let imgBuffer = null;
        if (/^data:image\/(png|jpeg|jpg);base64,/i.test(business.logo_url)) {
          const base64Data = business.logo_url.replace(/^data:image\/\w+;base64,/, '');
          imgBuffer = Buffer.from(base64Data, 'base64');
        } else if (/^data:image/.test(business.logo_url)) {
          const parts = business.logo_url.split(',');
          if (parts[1]) imgBuffer = Buffer.from(parts[1], 'base64');
        }
        if (imgBuffer) {
          logoImg = pdf.openImage(imgBuffer);
        }
      } catch (e) {
        logoImg = null;
      }
    }

    const hasLogo = !!logoImg;
    const textX = hasLogo ? 114 : leftX;

    if (hasLogo && logoImg) {
      pdf.save();
      pdf.roundedRect(leftX, 16, 60, 60, 6).fill('#ffffff');
      pdf.image(logoImg, leftX + 4, 20, { fit: [52, 52], align: 'center', valign: 'center' });
      pdf.restore();
    }

    pdf.fillColor('#ffffff');
    pdf.font('Helvetica-Bold').fontSize(18).text(business.legal_name || business.name, textX, 22, { width: 380 - (hasLogo ? 74 : 0) });
    pdf.font('Helvetica').fontSize(9);
    const addr = [business.address, business.city, business.state, business.pincode].filter(Boolean).join(', ');
    if (addr) pdf.text(addr, textX, 44, { width: 380 - (hasLogo ? 74 : 0) });
    const ids = [];
    if (business.gstin) ids.push(`GSTIN: ${business.gstin}`);
    if (business.pan) ids.push(`PAN: ${business.pan}`);
    if (business.phone) ids.push(`Ph: ${business.phone}`);
    if (ids.length) pdf.text(ids.join('   |   '), textX, 64, { width: 390 - (hasLogo ? 74 : 0) });

    pdf.text(title, 400, 26, { width: 175, align: 'right' });
    pdf.font('Helvetica').fontSize(9);
    pdf.text(`${doc.number}`, 400, 44, { width: 175, align: 'right' });
    pdf.text(`Date: ${doc.date}`, 400, 56, { width: 175, align: 'right' });
    if (doc.due_date) pdf.text(`Due date: ${doc.due_date}`, 400, 68, { width: 175, align: 'right' });
    if (doc.status === 'cancelled') {
      pdf.rect(470, 70, 105, 16).fill('#dc2626');
      pdf.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text('CANCELLED', 470, 74, { width: 105, align: 'center' });
      pdf.save();
      pdf.rotate(-25, { origin: [290, 420] });
      pdf.fillColor('#dc2626').opacity(0.12).font('Helvetica-Bold').fontSize(58).text('CANCELLED', 40, 400, { width: 500, align: 'center', lineBreak: false });
      pdf.restore();
      pdf.opacity(1.0);
    }

    // ---------- parties ----------
    let y = 108;
    pdf.fillColor(INK).font('Helvetica-Bold').fontSize(8).text('BILL TO', 40, y);
    pdf.text('PLACE OF SUPPLY', 320, y, { width: 120 });
    pdf.text('TRANSPORT', 460, y, { width: 120 });
    y += 13;
    pdf.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text((party && party.name) || doc.party_name || 'Walk-in Customer', 40, y, { width: 270 });
    let partyY = y + 13;
    pdf.font('Helvetica').fontSize(8.5).fillColor(MUTED);
    const partyAddr = party ? [party.address, party.city, party.state, party.pincode].filter(Boolean).join(', ') : '';
    if (partyAddr) {
      pdf.text(partyAddr, 40, partyY, { width: 270 });
      partyY += pdf.heightOfString(partyAddr, { width: 270 }) + 3;
    }
    const partyIds = [];
    if (party && party.gstin) partyIds.push(`GSTIN: ${party.gstin}`);
    if (party && party.phone) partyIds.push(`Ph: ${party.phone}`);
    if (partyIds.length) {
      pdf.text(partyIds.join('   '), 40, partyY, { width: 270 });
      partyY += 12;
    }

    pdf.fillColor(INK).font('Helvetica').fontSize(8.5);
    pdf.text(`${doc.place_of_supply || ''}`, 320, y, { width: 130 });
    pdf.font('Helvetica-Bold').fontSize(8.5).text(doc.supply_type === 'inter' ? 'INTER-STATE' : 'INTRA-STATE', 320, y + 12, { width: 130 });
    let posExtraY = y + 24;
    if (doc.ewaybill_no) {
      pdf.font('Helvetica').fontSize(8).fillColor(MUTED).text(`EWB: ${doc.ewaybill_no}`, 320, posExtraY, { width: 130 });
      posExtraY += 11;
    }
    if (doc.irn) {
      pdf.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(`IRN: ${String(doc.irn).slice(0, 24)}...`, 320, posExtraY, { width: 130 });
      posExtraY += 11;
    }

    pdf.fillColor(INK).font('Helvetica').fontSize(8.5);
    let transY = y;
    if (doc.vehicle_no) { pdf.text(`Vehicle: ${doc.vehicle_no}`, 460, transY, { width: 120 }); transY += 12; }
    if (doc.transport_doc_no) { pdf.text(`LR No: ${doc.transport_doc_no}`, 460, transY, { width: 120 }); transY += 12; }
    if (doc.bags_count) {
      pdf.font('Helvetica-Bold').text(`Bags / Pkgs: ${doc.bags_count}`, 460, transY, { width: 120 });
      transY += 12;
      pdf.font('Helvetica');
    }
    pdf.text(`Supply: ${doc.supply_type === 'inter' ? 'Inter' : 'Intra'}`, 460, transY, { width: 120 }); transY += 12;

    y = Math.max(partyY, posExtraY, transY, 172) + 8;

    // ---------- line items ----------
    const tableTop = y;
    const cols = [
      { label: '#', x: 40, w: 18, align: 'left' },
      { label: 'ITEM / SERVICE', x: 60, w: 148, align: 'left' },
      { label: 'HSN/SAC', x: 212, w: 46, align: 'left' },
      { label: 'QTY', x: 260, w: 36, align: 'right' },
      { label: 'RATE', x: 298, w: 56, align: 'right' },
      { label: 'DISC', x: 356, w: 44, align: 'right' },
      { label: 'TAXABLE', x: 402, w: 58, align: 'right' },
      { label: 'GST %', x: 462, w: 34, align: 'right' },
      { label: 'CGST', x: 498, w: 38, align: 'right' },
      { label: 'SGST', x: 538, w: 38, align: 'right' }
    ];
    const isInter = doc.supply_type === 'inter';
    if (isInter) {
      cols[8].label = 'IGST';
      cols[8].w = 78;
      cols.pop();
    }

    pdf.rect(40, tableTop, 536, 18).fill('#f1f5f9');
    pdf.fillColor(INK).font('Helvetica-Bold').fontSize(7.5);
    cols.forEach((c) => pdf.text(c.label, c.x, tableTop + 5.5, { width: c.w, align: c.align }));

    let rowY = tableTop + 20;
    pdf.font('Helvetica').fontSize(8);
    lines.forEach((l, i) => {
      const isRet = !!(l.isReturn || l.is_return);
      const rawName = String((isRet ? '[RETURN / LESS] ' : '') + (l.name || ''));
      const itemName = rawName.length > 80 ? rawName.slice(0, 78) + '\u2026' : rawName;
      const nameH = pdf.heightOfString(itemName, { width: cols[1].w });
      const cellH = Math.max(16, Math.min(36, Math.ceil(nameH) + 4));

      if (rowY + cellH > 660) {
        pdf.addPage();
        rowY = 50;
        pdf.rect(40, rowY - 10, 536, 18).fill('#f1f5f9');
        pdf.fillColor(INK).font('Helvetica-Bold').fontSize(7.5);
        cols.forEach((c) => pdf.text(c.label, c.x, rowY - 4.5, { width: c.w, align: c.align }));
        rowY += 14;
        pdf.font('Helvetica').fontSize(8);
      }

      pdf.fillColor(MUTED).text(String(i + 1), cols[0].x, rowY, { width: cols[0].w });
      pdf.fillColor(isRet ? '#dc2626' : INK).font('Helvetica-Bold').text(itemName, cols[1].x, rowY, { width: cols[1].w });
      pdf.font('Helvetica');
      pdf.text(l.hsn || '-', cols[2].x, rowY, { width: cols[2].w });
      pdf.text(`${isRet ? '-' : ''}${l.qty} ${l.unit || ''}`.trim(), cols[3].x, rowY, { width: cols[3].w, align: 'right' });
      pdf.text(fmt(l.rate), cols[4].x, rowY, { width: cols[4].w, align: 'right' });
      pdf.text(l.discount ? '-' + fmt(l.discount) : '-', cols[5].x, rowY, { width: cols[5].w, align: 'right' });
      pdf.text(fmt(l.taxable), cols[6].x, rowY, { width: cols[6].w, align: 'right' });
      pdf.text(`${l.gstRate}%`, cols[7].x, rowY, { width: cols[7].w, align: 'right' });
      if (isInter) pdf.text(fmt(l.igst), cols[8].x, rowY, { width: cols[8].w, align: 'right' });
      else {
        pdf.text(fmt(l.cgst), cols[8].x, rowY, { width: cols[8].w, align: 'right' });
        pdf.text(fmt(l.sgst), cols[9].x, rowY, { width: cols[9].w, align: 'right' });
      }
      rowY += cellH;
      pdf.moveTo(40, rowY - 3).lineTo(576, rowY - 3).strokeColor(LINE).lineWidth(0.5).stroke();
    });

    // Check if totals and summary section fit on the current page
    let summaryY = rowY + 10;
    if (summaryY > 520) {
      pdf.addPage();
      summaryY = 50;
    }

    // ---------- totals (right column) ----------
    let totalsY = summaryY;
    const totalsX = 390;
    const row = (label, value, bold) => {
      pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 9.5 : 8.5);
      pdf.fillColor(bold ? INK : MUTED).text(label, totalsX, totalsY, { width: 106 });
      pdf.fillColor(INK).text(fmt(value), totalsX + 108, totalsY, { width: 78, align: 'right' });
      totalsY += 15;
    };
    row('Subtotal', doc.subtotal);
    if (doc.discount_amount) row(`Discount (${doc.discount_type === 'pct' ? doc.discount_value + '%' : 'flat'})`, -doc.discount_amount);
    row('Taxable value', doc.taxable_value);
    if (isInter) row(`IGST`, doc.igst);
    else { row('CGST', doc.cgst); row('SGST / UTGST', doc.sgst); }
    if (doc.cess) row('Cess', doc.cess);
    if (Number(doc.transportation) > 0) row('Transportation', doc.transportation);
    if (Number(doc.loading_charges) > 0) row('Loading charges', doc.loading_charges);
    if (Number(doc.bag_charges) > 0) row('Bag charges', doc.bag_charges);
    if (doc.round_off) row('Round off', doc.round_off);
    pdf.moveTo(totalsX, totalsY - 2).lineTo(576, totalsY - 2).strokeColor(accent).lineWidth(1).stroke();
    row('CURRENT BILL TOTAL', doc.total, true);

    // If sale or purchase: display Current Bill Total, Previous Due, Amount Received, Net Balance
    const isSaleOrPurchase = doc.type === 'sale' || doc.type === 'purchase';
    if (isSaleOrPurchase) {
      totalsY += 4;
      pdf.moveTo(totalsX, totalsY - 2).lineTo(576, totalsY - 2).strokeColor(LINE).lineWidth(0.5).stroke();

      const paid = Number(doc.paid_amount) || 0;
      const due = Number(doc.due_amount) || 0;

      // Calculate Previous Balance & Net Balance
      if (party && party.balance !== undefined) {
        const netBal = Number(party.balance) || 0;
        // Prior balance strictly before this document's net impact
        const prevBal = Math.round((netBal - (Number(doc.total) - paid)) * 100) / 100;

        if (Math.abs(prevBal) > 0.01) {
          row(prevBal > 0 ? 'Previous Due' : 'Previous Advance', Math.abs(prevBal), false);
        }

        row('Amount Received', paid, false);

        totalsY += 3;
        // Highlighted Net Balance box
        pdf.roundedRect(totalsX, totalsY - 1, 186, 21, 3).fillAndStroke('#f8fafc', '#cbd5e1');
        pdf.font('Helvetica-Bold').fontSize(8.5).fillColor(netBal > 0 ? '#b91c1c' : (netBal < 0 ? '#15803d' : INK));
        const netLabel = netBal > 0 ? 'NET BALANCE DUE' : (netBal < 0 ? 'NET ADVANCE' : 'NET BALANCE');
        pdf.text(netLabel, totalsX + 6, totalsY + 5, { width: 104 });
        pdf.text(fmt(Math.abs(netBal)), totalsX + 112, totalsY + 5, { width: 68, align: 'right' });
        totalsY += 25;
      } else {
        const due = Number(doc.due_amount) || 0;
        row('Amount Received', paid, false);
        if (due > 0) {
          totalsY += 3;
          pdf.roundedRect(totalsX, totalsY - 1, 186, 21, 3).fillAndStroke('#f8fafc', '#cbd5e1');
          pdf.font('Helvetica-Bold').fontSize(8.5).fillColor('#b91c1c');
          pdf.text('NET BALANCE DUE', totalsX + 6, totalsY + 5, { width: 104 });
          pdf.text(fmt(due), totalsX + 112, totalsY + 5, { width: 68, align: 'right' });
          totalsY += 25;
        }
      }
    }

    // ---------- left column: words, HSN summary, bank ----------
    let ly = summaryY;
    const leftWidth = 330;
    const wordsText = doc.amount_in_words || amountInWords(doc.total);
    if (wordsText) {
      pdf.fillColor(INK).font('Helvetica-Bold').fontSize(8).text('AMOUNT IN WORDS', 40, ly);
      ly += 11;
      pdf.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(wordsText, 40, ly, { width: leftWidth });
      const wordsH = pdf.heightOfString(wordsText, { width: leftWidth });
      ly += wordsH + 10;
    }

    const hsn = hsnSummary(lines, doc.supply_type);
    if (hsn.length) {
      pdf.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('HSN SUMMARY', 40, ly);
      ly += 11;
      pdf.font('Helvetica').fontSize(7.5).fillColor(MUTED);
      hsn.slice(0, 5).forEach((h) => {
        pdf.text(`${h.hsn}  |  ${h.gstRate}%  |  Qty ${h.qty}  |  Taxable ${fmt(h.taxable)}  |  Tax ${fmt(h.cgst + h.sgst + h.igst + h.cess)}`, 40, ly, { width: leftWidth });
        ly += 10;
      });
      ly += 6;
    }

    if (business.bank_account_no || business.upi_id) {
      pdf.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('PAYMENT DETAILS', 40, ly);
      ly += 11;
      pdf.font('Helvetica').fontSize(7.5).fillColor(MUTED);
      if (business.bank_name) {
        pdf.text(`${business.bank_name}${business.bank_branch ? ' - ' + business.bank_branch : ''}`, 40, ly, { width: leftWidth });
        ly += 10;
      }
      if (business.bank_account_no) {
        pdf.text(`A/C ${business.bank_account_no}${business.bank_ifsc ? '   IFSC ' + business.bank_ifsc : ''}`, 40, ly, { width: leftWidth });
        ly += 10;
      }
      if (business.upi_id) {
        pdf.text(`UPI: ${business.upi_id}`, 40, ly, { width: leftWidth });
        ly += 10;
      }
      ly += 4;
    }

    // ---------- footer ----------
    let footY = Math.max(totalsY, ly) + 12;
    if (footY > 640) {
      pdf.addPage();
      footY = 50;
    }

    pdf.moveTo(40, footY).lineTo(576, footY).strokeColor(LINE).lineWidth(0.5).stroke();
    let fy = footY + 8;
    if (business.terms) {
      pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('TERMS & CONDITIONS', 40, fy);
      fy += 10;
      pdf.font('Helvetica').fontSize(7).fillColor(MUTED).text(business.terms, 40, fy, { width: 330, height: 50, ellipsis: true });
    }
    if (doc.notes) {
      pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text('NOTES', 400, footY + 8, { width: 176 });
      pdf.font('Helvetica').fontSize(7).fillColor(MUTED).text(doc.notes, 400, footY + 18, { width: 176, height: 40, ellipsis: true });
    }
    // signature block, bottom right
    pdf.font('Helvetica').fontSize(8).fillColor(MUTED).text('For ' + (business.legal_name || business.name), 420, 690, { width: 156, align: 'center' });
    pdf.moveTo(420, 736).lineTo(576, 736).strokeColor(MUTED).lineWidth(0.5).stroke();
    pdf.font('Helvetica').fontSize(7).text('Authorised Signatory', 420, 740, { width: 156, align: 'center' });
    pdf.text(business.invoice_footer || 'This is a computer generated invoice.', 40, 782, { width: 536, align: 'center' });

    // QR (UPI deep link) bottom-left
    if (business.upi_id) {
      const link = `upi://pay?pa=${encodeURIComponent(business.upi_id)}&pn=${encodeURIComponent(business.name)}&am=${doc.total}&cu=INR&tn=${encodeURIComponent(doc.number)}`;
      QRCode.toBuffer(link, { margin: 0, width: 130 }).then((buf) => {
        try {
          pdf.image(buf, 40, 700, { width: 62, height: 62 });
          pdf.font('Helvetica').fontSize(6.5).fillColor(MUTED).text('Scan to pay via UPI', 40, 766, { width: 120 });
        } catch (e) { /* page closed */ }
        finish();
      }).catch(finish);
    } else {
      finish();
    }

    function finish() {
      const range = pdf.bufferedPageRange();
      pdf.flushPages();
      pdf.end();
      void range;
    }
  });
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1) + '\u2026' : str;
}
const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Party account statement PDF (khata style). */
function statementPdf(business, party, entries, openingLabel) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    let logoImg = null;
    if (business.logo_url) {
      try {
        let imgBuffer = null;
        if (/^data:image\/(png|jpeg|jpg);base64,/i.test(business.logo_url)) {
          const base64Data = business.logo_url.replace(/^data:image\/\w+;base64,/, '');
          imgBuffer = Buffer.from(base64Data, 'base64');
        } else if (/^data:image/.test(business.logo_url)) {
          const parts = business.logo_url.split(',');
          if (parts[1]) imgBuffer = Buffer.from(parts[1], 'base64');
        }
        if (imgBuffer) {
          logoImg = pdf.openImage(imgBuffer);
        }
      } catch (e) {
        logoImg = null;
      }
    }
    const hasLogo = !!logoImg;
    const textX = hasLogo ? 100 : 40;
    if (hasLogo && logoImg) {
      pdf.image(logoImg, 40, 36, { fit: [48, 48] });
    }
    pdf.fontSize(16).font('Helvetica-Bold').fillColor(INK).text(business.legal_name || business.name, textX, 36);
    pdf.fontSize(9).font('Helvetica').fillColor(MUTED).text([business.address, business.city, business.state].filter(Boolean).join(', '), textX, 56);
    pdf.text(business.gstin ? `GSTIN: ${business.gstin}` : '', textX, 68);
    pdf.fontSize(14).font('Helvetica-Bold').fillColor(INK).text('ACCOUNT STATEMENT', 380, 40, { width: 196, align: 'right' });
    pdf.fontSize(9).font('Helvetica').fillColor(MUTED).text(`Generated ${formatIstDateTime()}`, 380, 58, { width: 196, align: 'right' });

    pdf.fontSize(10).font('Helvetica-Bold').fillColor(INK).text(party.name, 40, 92);
    pdf.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text([party.address, party.city, party.state, party.pincode].filter(Boolean).join(', '), 40, 106)
      .text([party.phone, party.gstin].filter(Boolean).join('   '), 40, 118);

    let y = 138;
    const head = ['DATE', 'PARTICULARS', 'REF', 'DEBIT', 'CREDIT', 'BALANCE'];
    const xs = [40, 110, 300, 370, 430, 490];
    pdf.rect(40, y - 4, 536, 16).fill('#f1f5f9');
    pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
    head.forEach((h, i) => pdf.text(h, xs[i], y, { width: i === 5 ? 86 : 66, align: i >= 3 ? 'right' : 'left' }));
    y += 18;

    pdf.font('Helvetica').fontSize(8);
    if (openingLabel) {
      pdf.fillColor(MUTED).text(openingLabel, 40, y, { width: 250 });
      y += 13;
    }
    entries.forEach((e) => {
      if (y > 770) { pdf.addPage(); y = 50; }
      pdf.fillColor(MUTED).text(e.date, xs[0], y, { width: 66 });
      pdf.fillColor(INK).text(truncate(e.label, 40), xs[1], y, { width: 180 });
      pdf.fillColor(MUTED).text(e.reference || e.mode || '', xs[2], y, { width: 66 });
      pdf.fillColor('#b91c1c').text(e.debit ? fmt(e.debit) : '', xs[3], y, { width: 56, align: 'right' });
      pdf.fillColor('#047857').text(e.credit ? fmt(e.credit) : '', xs[4], y, { width: 56, align: 'right' });
      pdf.fillColor(INK).font('Helvetica-Bold').text(fmt(e.balance), xs[5], y, { width: 86, align: 'right' });
      pdf.font('Helvetica');
      y += 13;
      pdf.moveTo(40, y - 3).lineTo(576, y - 3).strokeColor(LINE).lineWidth(0.4).stroke();
    });

    y += 8;
    pdf.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('CLOSING BALANCE', 370, y, { width: 116 });
    const last = entries.length ? entries[entries.length - 1].balance : 0;
    pdf.text(`${last >= 0 ? 'To receive ' : 'To pay '}${fmt(Math.abs(last))}`, 490, y, { width: 86, align: 'right' });
    pdf.end();
  });
}

/** Simple tabular report PDF (stock, GSTR summary etc.). */
function tablePdf(title, business, columns, rows, subtitle) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 36, layout: columns.length > 6 ? 'landscape' : 'portrait' });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const W = pdf.page.width - 72;
    pdf.fontSize(15).font('Helvetica-Bold').fillColor(INK).text(title, 36, 36);
    pdf.fontSize(9).font('Helvetica').fillColor(MUTED).text(`${business.legal_name || business.name}${business.gstin ? '  |  GSTIN ' + business.gstin : ''}`, 36, 56);
    if (subtitle) pdf.text(subtitle, 36, 68);
    pdf.fontSize(8).text(`Generated ${formatIstDateTime()}`, 36, 80);

    const colW = columns.map((c) => (W / columns.length) * (c.weight || 1));
    let y = 100;
    const drawHeader = () => {
      pdf.rect(36, y - 4, W, 16).fill('#f1f5f9');
      pdf.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
      let x = 36;
      columns.forEach((c, i) => { pdf.text(c.label, x + 2, y, { width: colW[i] - 4, align: c.align || 'left' }); x += colW[i]; });
      y += 18;
    };
    drawHeader();
    pdf.font('Helvetica').fontSize(8);
    rows.forEach((r) => {
      if (y > pdf.page.height - 60) { pdf.addPage(); y = 50; drawHeader(); pdf.font('Helvetica').fontSize(8); }
      let x = 36;
      columns.forEach((c, i) => {
        const v = typeof c.get === 'function' ? c.get(r) : r[c.key];
        pdf.fillColor(c.color ? c.color(r) : INK).text(String(v ?? ''), x + 2, y, { width: colW[i] - 4, align: c.align || 'left' });
        x += colW[i];
      });
      y += 13;
      pdf.moveTo(36, y - 3).lineTo(36 + W, y - 3).strokeColor(LINE).lineWidth(0.4).stroke();
    });
    pdf.end();
  });
}

module.exports = { documentPdf, statementPdf, tablePdf, money };
