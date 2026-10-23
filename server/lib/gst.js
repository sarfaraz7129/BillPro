'use strict';
/**
 * Indian GST + money helpers shared by the API and the PDF generator.
 */

const { istToday, istFinancialYear } = require('./time');

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Indian currency amount in words, e.g. 12345.5 -> "Twelve Thousand Three Hundred Forty Five Rupees And Fifty Paise Only" */
function amountInWords(amount) {
  const n = Math.abs(Number(amount) || 0);
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);

  const two = (x) => (x < 20 ? ONES[x] : TENS[Math.floor(x / 10)] + (x % 10 ? ' ' + ONES[x % 10] : ''));
  const three = (x) => (x > 99 ? `${ONES[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));

  const indian = (num) => {
    if (num === 0) return 'Zero';
    const parts = [];
    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;
    if (crore) parts.push(`${three(crore)} Crore`);
    if (lakh) parts.push(`${three(lakh)} Lakh`);
    if (thousand) parts.push(`${three(thousand)} Thousand`);
    if (num) parts.push(three(num));
    return parts.join(' ');
  };

  let out = `${indian(rupees)} Rupees`;
  if (paise) out += ` And ${two(paise)} Paise`;
  return `${out} Only`;
}

/** Validate an Indian GSTIN (15 char checksum) - returns normalised GSTIN or null. */
function normaliseGstin(raw) {
  if (!raw) return null;
  const g = String(raw).trim().toUpperCase().replace(/\s/g, '');
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{2}[0-9A-Z]$/.test(g) ? g : null;
}

/** GST state code -> state name (as per the GST state code list). */
const STATE_CODES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory'
};
const stateName = (code) => STATE_CODES[String(code).padStart(2, '0')] || '';

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

/**
 * Compute a full GST invoice total from line items.
 * items: [{ name, hsn, qty, rate, discountPct, discountFlat, gstRate }]
 * opts:  { discountType, discountValue, roundOff, taxInclusiveDefault, supplyType, cessRate }
 */
function computeTotals(items, opts = {}) {
  const {
    discountType = 'flat',
    discountValue = 0,
    roundOff = false,
    cessRate = 0,
    isEstimate = false
  } = opts;

  let returnTotal = 0;
  const lines = (items || []).filter((i) => i && i.name).map((raw) => {
    const isReturn = !!(raw.isReturn || raw.is_return || (Number(raw.qty) < 0));
    const rawQty = Number(raw.qty) || 0;
    const qty = isReturn ? Math.abs(rawQty) : rawQty;
    const grossRate = Number(raw.rate) || 0;
    const gstRate = isEstimate ? 0 : Number(raw.gstRate || 0);
    const taxInclusive = isEstimate ? false : !!raw.taxInclusive;
    // strip tax out of an inclusive rate so the taxable value is correct
    const rate = taxInclusive ? grossRate / (1 + gstRate / 100) : grossRate;
    const lineSign = isReturn ? -1 : 1;
    const absGross = round2(qty * rate);
    const gross = round2(lineSign * absGross);
    const lineDiscFlat = isReturn ? 0 : round2(Number(raw.discountFlat) || 0);
    const lineDiscPct = isReturn ? 0 : Number(raw.discountPct) || 0;
    const disc = isReturn ? 0 : round2(lineDiscFlat + (absGross * lineDiscPct) / 100);
    const taxable = round2(isReturn ? -absGross : Math.max(0, gross - disc));
    const isInter = opts.supplyType === 'inter';
    const half = isEstimate ? 0 : round2((taxable * gstRate) / 200);
    const igstVal = (isEstimate || !isInter) ? 0 : round2((taxable * gstRate) / 100);
    const lineTotal = round2(taxable + (isInter ? igstVal : 2 * half));
    if (isReturn) {
      returnTotal = round2(returnTotal + Math.abs(lineTotal));
    }
    return {
      // carried through so invoice lines stay linked to their stock item
      product_id: raw.product_id || null,
      taxInclusive,
      isReturn,
      name: raw.name,
      hsn: raw.hsn || '',
      unit: raw.unit || '',
      qty,
      rate: round2(rate),
      gross,
      discountPct: lineDiscPct,
      discountFlat: lineDiscFlat,
      discount: disc,
      taxable,
      gstRate,
      cgst: isEstimate ? 0 : (isInter ? 0 : half),
      sgst: isEstimate ? 0 : (isInter ? 0 : half),
      igst: igstVal,
      cess: isEstimate ? 0 : round2((taxable * cessRate) / 100),
      total: lineTotal,
    };
  });

  const posLines = lines.filter((l) => !l.isReturn);
  const posSubtotal = round2(posLines.reduce((s, l) => s + l.gross, 0));
  const lineDiscount = round2(posLines.reduce((s, l) => s + l.discount, 0));
  const afterLine = round2(posSubtotal - lineDiscount);

  // whole-invoice discount is spread proportionally over positive lines
  let docDiscount = 0;
  if (discountValue && afterLine > 0) {
    docDiscount = round2(discountType === 'pct' ? (afterLine * discountValue) / 100 : discountValue);
    docDiscount = Math.min(docDiscount, afterLine);
  }
  const ratio = afterLine > 0 ? (afterLine - docDiscount) / afterLine : 1;
  lines.forEach((l) => {
    if (!l.isReturn) {
      const t = round2(l.taxable * ratio);
      const d = round2(l.taxable - t);
      l.docDiscount = d;
      l.taxable = t;
      const isInter = opts.supplyType === 'inter';
      const half = isEstimate ? 0 : round2((t * l.gstRate) / 200);
      l.cgst = isEstimate ? 0 : (isInter ? 0 : half);
      l.sgst = isEstimate ? 0 : (isInter ? 0 : half);
      l.igst = (isEstimate || !isInter) ? 0 : round2((t * l.gstRate) / 100);
      l.cess = isEstimate ? 0 : round2((t * cessRate) / 100);
      l.total = round2(t + l.cgst + l.sgst + l.igst + l.cess);
    }
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.gross, 0));
  const taxableValue = round2(lines.reduce((s, l) => s + l.taxable, 0));
  const cgst = round2(lines.reduce((s, l) => s + l.cgst, 0));
  const sgst = round2(lines.reduce((s, l) => s + l.sgst, 0));
  const igst = round2(lines.reduce((s, l) => s + l.igst, 0));
  const cess = round2(lines.reduce((s, l) => s + l.cess, 0));

  const transportation = round2(Number(opts.transportation) || 0);
  const loadingCharges = round2(Number(opts.loadingCharges || opts.loading_charges) || 0);
  const bagCharges = round2(Number(opts.bagCharges || opts.bag_charges || opts.bags_charges || opts.bagsPrice) || 0);
  const extraCharges = round2(Number(opts.extraCharges || opts.extra_charges || opts.extra) || 0);
  const bagsCount = opts.bagsCount || opts.bags_count || opts.bags || '';

  const preTotal = round2(taxableValue + cgst + sgst + igst + cess + transportation + loadingCharges + bagCharges + extraCharges);
  let roundOffAmt = 0;
  let total = preTotal;
  if (roundOff) {
    total = Math.round(preTotal);
    roundOffAmt = round2(total - preTotal);
  }

  return {
    lines,
    subtotal,
    returnAmount: returnTotal,
    lineDiscount,
    docDiscount,
    discountAmount: round2(lineDiscount + docDiscount),
    taxableValue,
    cgst, sgst, igst, cess,
    transportation,
    loadingCharges,
    bagCharges,
    extraCharges,
    bagsCount,
    roundOff: roundOffAmt,
    total,
    totalTax: round2(cgst + sgst + igst + cess),
    amountInWords: amountInWords(total),
  };
}

/** GST rate -> HSN summary rows, exactly the shape GSTR-1 expects. */
function hsnSummary(lines, supplyType) {
  const map = new Map();
  lines.forEach((l) => {
    const key = `${l.hsn || '-'}|${l.gstRate}`;
    const row = map.get(key) || { hsn: l.hsn || '-', desc: l.name, unit: l.unit, qty: 0, gstRate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    row.qty = round2(row.qty + l.qty);
    row.taxable = round2(row.taxable + l.taxable);
    row.cgst = round2(row.cgst + l.cgst);
    row.sgst = round2(row.sgst + l.sgst);
    row.igst = round2(row.igst + l.igst);
    row.cess = round2(row.cess + l.cess);
    map.set(key, row);
  });
  return [...map.values()];
}

/** Next sequential document number, e.g. INV-2025-26-1001 (financial-year aware). */
function financialYear(dateStr) {
  if (dateStr) return istFinancialYear(dateStr);
  return istFinancialYear();
}

function nextDocumentNumber(prefix, counter) {
  return `${prefix}-${counter}`;
}

/** GST e-invoice (IRN) payload skeleton per ICB 1.03 / API v1.03. */
const itemsOf = (doc) => (Array.isArray(doc.items) ? doc.items : JSON.parse(doc.items || '[]'));

function buildEinvoicePayload(doc, business, party) {
  const lines = itemsOf(doc);
  return {
    Version: '1.1',
    TranDtls: {
      TaxSch: business.composition_scheme ? 'GST' : 'GST',
      SupTyp: doc.type === 'sale' ? 'B2B' : 'B2B',
      RegRev: 'N',
      IgstOnIntra: 'N'
    },
    DocDtls: {
      Typ: doc.type === 'sale' ? 'INV' : doc.type === 'purchase' ? 'INV' : 'OTH',
      No: doc.number,
      Dt: toEinvDate(doc.date),
      Val: doc.total
    },
    SellerDtls: {
      Gstin: business.gstin,
      LglNm: business.legal_name || business.name,
      Addr1: business.address || '',
      Loc: business.city || '',
      Pin: Number(business.pincode) || 0,
      Stcd: String(business.state_code || '').padStart(2, '0'),
      Ph: business.phone || ''
    },
    BuyerDtls: {
      Gstin: party && party.gstin ? party.gstin : 'URP',
      LglNm: (party && party.name) || doc.party_name || 'Walk-in Customer',
      Addr1: (party && party.address) || '',
      Loc: (party && party.city) || '',
      Pin: Number(party && party.pincode) || 0,
      Stcd: String((party && party.state_code) || doc.party_state_code || '').padStart(2, '0')
    },
    DispDtls: { Nm: doc.party_name || '' },
    ItemList: lines.map((l, i) => ({
      SlNo: String(i + 1),
      IsServc: /^99/.test(String(l.hsn || '')) ? 'Y' : 'N',
      PrdDesc: l.name,
      HsnCd: l.hsn || '9999',
      Qty: l.qty,
      Unit: (l.unit || 'NOS').slice(0, 8).toUpperCase(),
      UnitPrice: l.rate,
      TotAmt: l.gross,
      Discount: l.discount,
      AssessAmt: l.taxable,
      GstRt: l.gstRate,
      CgstAmt: l.cgst,
      SgstAmt: l.sgst,
      IgstAmt: l.igst,
      CesRt: 0,
      CesAmt: 0,
      TotItemVal: l.total
    })),
    ValDtls: {
      AssVal: doc.taxable_value,
      CgstVal: doc.cgst,
      SgstVal: doc.sgst,
      IgstVal: doc.igst,
      CesVal: doc.cess,
      RndOffAmt: doc.round_off,
      TotInvVal: doc.total,
      TotInvValFc: doc.total
    },
    PayDtls: {
      Nm: business.bank_name || '',
      AccNo: business.bank_account_no || '',
      Mode: 'Cash',
      FinDt: toEinvDate(istToday()),
      PayInstr: business.bank_ifsc || ''
    },
    RefDtls: {},
    EwbDtls: doc.ewaybill_no ? {
      TransId: business.gstin,
      TransName: business.name,
      TransMode: '1',
      VehNo: doc.vehicle_no || '',
      VehType: 'O',
      TransDocNo: doc.transport_doc_no || '',
      TransDocDt: toEinvDate(doc.ewaybill_date || doc.date)
    } : undefined
  };
}

const toEinvDate = (d) => {
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};

/** E-Way Bill Part-A JSON as accepted by the e-way bill portal. */
function buildEwayBillPayload(doc, business, party) {
  return {
    supplyType: doc.type === 'sale' ? 'O' : 'I',
    subType: 'Supply',
    docType: 'INV',
    docNo: doc.number,
    docDate: toEinvDate(doc.date),
    transactionType: 'Regular',
    from: {
      gstin: business.gstin,
      tradeName: business.legal_name || business.name,
      address1: business.address || '',
      place: business.city || '',
      stateCode: String(business.state_code || '').padStart(2, '0'),
      pincode: Number(business.pincode) || 0
    },
    to: {
      gstin: (party && party.gstin) || 'URP',
      tradeName: (party && party.name) || doc.party_name,
      address1: (party && party.address) || '',
      place: (party && party.city) || '',
      stateCode: String((party && party.state_code) || '').padStart(2, '0'),
      pincode: Number(party && party.pincode) || 0
    },
    itemDetails: itemsOf(doc).map((l) => ({
      productName: l.name,
      hsnCode: l.hsn || '9999',
      quantity: l.qty,
      taxableValue: l.taxable,
      cgstRate: doc.supply_type === 'inter' ? 0 : l.gstRate / 2,
      sgstRate: doc.supply_type === 'inter' ? 0 : l.gstRate / 2,
      igstRate: doc.supply_type === 'inter' ? l.gstRate : 0,
      cessRate: 0
    })),
    vehicleDetails: {
      vehicleNo: doc.vehicle_no || '',
      transMode: '1',
      transDocNo: doc.transport_doc_no || '',
      transDocDate: toEinvDate(doc.date)
    },
    totalTaxableValue: doc.taxable_value,
    totalInvoiceValue: doc.total
  };
}

module.exports = {
  amountInWords,
  normaliseGstin,
  stateName,
  STATE_CODES,
  round2,
  computeTotals,
  hsnSummary,
  financialYear,
  nextDocumentNumber,
  buildEinvoicePayload,
  buildEwayBillPayload,
  toEinvDate
};
