import * as XLSX from 'xlsx';

function downloadWorkbook(workbook, fileName) {
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const PRODUCT_COLUMNS = [
  { key: 'name', label: 'Item Name*', required: true, aliases: ['item name', 'product name', 'item', 'product', 'name', 'title', 'particulars', 'description'] },
  { key: 'barcode', label: 'Barcode / Item Code', aliases: ['barcode', 'item code', 'code', 'sku', 'upc', 'product code'] },
  { key: 'category', label: 'Category', aliases: ['category', 'group', 'item group', 'department'] },
  { key: 'unit', label: 'Unit', aliases: ['unit', 'uom', 'measuring unit', 'unit of measure'] },
  { key: 'sale_price', label: 'Sale Price (₹)*', required: true, aliases: ['sale price', 'selling price', 'sale rate', 'mrp', 'rate', 'price', 'sales price'] },
  { key: 'purchase_price', label: 'Purchase Price (₹)', aliases: ['purchase price', 'purchase rate', 'cost price', 'cost', 'buy price'] },
  { key: 'gst_rate', label: 'GST Rate (%)', aliases: ['gst rate', 'gst %', 'gst', 'tax rate', 'tax %', 'tax', 'gst_rate'] },
  { key: 'hsn', label: 'HSN / SAC Code', aliases: ['hsn', 'hsn code', 'sac', 'sac code', 'hsn/sac', 'hsn sac'] },
  { key: 'stock', label: 'Opening Stock', aliases: ['opening stock', 'stock', 'qty', 'quantity', 'opening qty', 'current stock', 'balance qty'] },
  { key: 'low_stock_at', label: 'Min Stock Alert', aliases: ['min stock', 'low stock', 'min alert', 'min stock alert', 'reorder level', 'min qty', 'reorder qty'] }
];

export const PARTY_COLUMNS = [
  { key: 'name', label: 'Party Name*', required: true, aliases: ['party name', 'customer name', 'vendor name', 'supplier name', 'client name', 'name', 'party'] },
  { key: 'type', label: 'Type (customer/supplier)', aliases: ['type', 'party type', 'category'] },
  { key: 'contact_name', label: 'Contact Person', aliases: ['contact person', 'contact name', 'person'] },
  { key: 'phone', label: 'Mobile Phone*', aliases: ['phone', 'mobile', 'mobile no', 'mobile number', 'phone no', 'contact', 'whatsapp'] },
  { key: 'email', label: 'Email Address', aliases: ['email', 'email id', 'email address'] },
  { key: 'gstin', label: 'GSTIN', aliases: ['gstin', 'gst no', 'gst number', 'tax id'] },
  { key: 'address', label: 'Billing Address', aliases: ['billing address', 'address', 'street', 'location'] },
  { key: 'city', label: 'City', aliases: ['city', 'town', 'district'] },
  { key: 'state', label: 'State', aliases: ['state', 'state name', 'province'] },
  { key: 'pincode', label: 'Pincode', aliases: ['pincode', 'pin code', 'zip', 'postal code'] },
  { key: 'opening_balance', label: 'Opening Balance (₹)', aliases: ['opening balance', 'balance', 'due amount', 'balance amount', 'dues'] },
  { key: 'balance_type', label: 'Balance Type (DR/CR)', aliases: ['balance type', 'dr/cr', 'dr cr', 'to pay / to receive'] },
  { key: 'credit_limit', label: 'Credit Limit (₹)', aliases: ['credit limit', 'limit', 'max credit'] },
  { key: 'credit_days', label: 'Credit Period (Days)', aliases: ['credit period', 'credit days', 'due days'] }
];

/** Sample rows shared by the in-app preview and Excel template download. */
export const PRODUCT_TEMPLATE_SAMPLE = [
    {
      'Item Name*': 'Tata Tea Gold 500g',
      'Barcode / Item Code': '8901030382341',
      'Category': 'Beverages',
      'Unit': 'PCS',
      'Sale Price (₹)*': 280,
      'Purchase Price (₹)': 240,
      'GST Rate (%)': 5,
      'HSN / SAC Code': '0902',
      'Opening Stock': 45,
      'Min Stock Alert': 10
    },
    {
      'Item Name*': 'Fortune Sunlite Sunflower Oil 1L',
      'Barcode / Item Code': '8906007281014',
      'Category': 'Edible Oils',
      'Unit': 'PCS',
      'Sale Price (₹)*': 145,
      'Purchase Price (₹)': 125,
      'GST Rate (%)': 5,
      'HSN / SAC Code': '1512',
      'Opening Stock': 60,
      'Min Stock Alert': 15
    },
    {
      'Item Name*': 'Aashirvaad Shudh Chakki Atta 5kg',
      'Barcode / Item Code': '8901725131238',
      'Category': 'Staples',
      'Unit': 'BAG',
      'Sale Price (₹)*': 295,
      'Purchase Price (₹)': 260,
      'GST Rate (%)': 0,
      'HSN / SAC Code': '1101',
      'Opening Stock': 30,
      'Min Stock Alert': 8
    },
    {
      'Item Name*': 'Dettol Original Bathing Soap 125g',
      'Barcode / Item Code': '8901396112015',
      'Category': 'Personal Care',
      'Unit': 'PCS',
      'Sale Price (₹)*': 55,
      'Purchase Price (₹)': 42,
      'GST Rate (%)': 18,
      'HSN / SAC Code': '3401',
      'Opening Stock': 120,
      'Min Stock Alert': 25
    },
    {
      'Item Name*': 'Amul Pasteurised Butter 500g',
      'Barcode / Item Code': '8901262010051',
      'Category': 'Dairy',
      'Unit': 'BOX',
      'Sale Price (₹)*': 275,
      'Purchase Price (₹)': 245,
      'GST Rate (%)': 12,
      'HSN / SAC Code': '0405',
      'Opening Stock': 25,
      'Min Stock Alert': 5
    }
  ];

export function downloadProductTemplate() {
  const data = PRODUCT_TEMPLATE_SAMPLE;

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 35 }, // Item Name
    { wch: 20 }, // Barcode
    { wch: 16 }, // Category
    { wch: 8 },  // Unit
    { wch: 16 }, // Sale Price
    { wch: 18 }, // Purchase Price
    { wch: 14 }, // GST Rate
    { wch: 15 }, // HSN
    { wch: 14 }, // Opening Stock
    { wch: 15 }  // Min Stock
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products Template');
  downloadWorkbook(wb, 'BillPro_Product_Import_Template.xlsx');
}

/** Downloads sample Customer / Party import Excel template */
export function downloadPartyTemplate(defaultType = 'customer') {
  const data = [
    {
      'Party Name*': 'Shree Ganesh General Stores',
      'Type (customer/supplier)': 'customer',
      'Contact Person': 'Ganesh Pai',
      'Mobile Phone*': '9820123456',
      'Email Address': 'ganesh.stores@gmail.com',
      'GSTIN': '29AAAAA0000A1Z5',
      'Billing Address': '12 Market Main Road',
      'City': 'Mangalore',
      'State': 'Karnataka',
      'Pincode': '575001',
      'Opening Balance (₹)': 12500,
      'Balance Type (DR/CR)': 'DR',
      'Credit Limit (₹)': 50000,
      'Credit Period (Days)': 30
    },
    {
      'Party Name*': 'Pooja Provision Mart',
      'Type (customer/supplier)': 'customer',
      'Contact Person': 'Pooja Shenoy',
      'Mobile Phone*': '9845098765',
      'Email Address': 'pooja.udupi@outlook.com',
      'GSTIN': '',
      'Billing Address': '45 Car Street',
      'City': 'Udupi',
      'State': 'Karnataka',
      'Pincode': '576101',
      'Opening Balance (₹)': 0,
      'Balance Type (DR/CR)': 'DR',
      'Credit Limit (₹)': 25000,
      'Credit Period (Days)': 15
    },
    {
      'Party Name*': 'Karnataka Wholesale Distributors',
      'Type (customer/supplier)': 'supplier',
      'Contact Person': 'Mahesh Hegde',
      'Mobile Phone*': '9448112233',
      'Email Address': 'orders@karnatakawholesale.in',
      'GSTIN': '29BBBBB1111B1Z2',
      'Billing Address': 'Plot 88 Industrial Estate',
      'City': 'Bangalore',
      'State': 'Karnataka',
      'Pincode': '560058',
      'Opening Balance (₹)': 35000,
      'Balance Type (DR/CR)': 'CR',
      'Credit Limit (₹)': 100000,
      'Credit Period (Days)': 45
    }
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 32 }, // Party Name
    { wch: 22 }, // Type
    { wch: 18 }, // Contact Person
    { wch: 15 }, // Mobile
    { wch: 28 }, // Email
    { wch: 18 }, // GSTIN
    { wch: 30 }, // Address
    { wch: 15 }, // City
    { wch: 15 }, // State
    { wch: 10 }, // Pincode
    { wch: 20 }, // Opening Balance
    { wch: 20 }, // Balance Type
    { wch: 18 }, // Credit Limit
    { wch: 20 }  // Credit Days
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Parties Template');
  XLSX.writeFile(wb, defaultType === 'supplier' ? 'BillPro_Suppliers_Import_Template.xlsx' : 'BillPro_Customers_Import_Template.xlsx');
}

/** Export active products list to Excel */
export function exportProductsToExcel(products, businessName = 'Business') {
  const rows = (products || []).map((p, i) => ({
    '#': i + 1,
    'Item Name': p.name,
    'Barcode / SKU': p.barcode || p.sku || '',
    'Category': p.category || 'Uncategorized',
    'Unit': (p.unit || 'pcs').toUpperCase(),
    'Sale Price (₹)': p.sale_price || 0,
    'Purchase Price (₹)': p.purchase_price || 0,
    'GST Rate (%)': p.gst_rate || 0,
    'HSN / SAC': p.hsn || '',
    'Current Stock': p.stock || 0,
    'Stock Valuation (₹)': p.stockValue || Math.round((p.stock || 0) * (p.purchase_price || 0) * 100) / 100,
    'Min Stock Alert': p.low_stock_at || 0,
    'Status': (p.stock <= 0) ? 'Out of Stock' : (p.low_stock_at > 0 && p.stock <= p.low_stock_at) ? 'Low Stock' : 'In Stock'
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },  // #
    { wch: 32 }, // Name
    { wch: 18 }, // Barcode
    { wch: 16 }, // Category
    { wch: 8 },  // Unit
    { wch: 14 }, // Sale Price
    { wch: 16 }, // Purchase Price
    { wch: 12 }, // GST %
    { wch: 12 }, // HSN
    { wch: 14 }, // Stock
    { wch: 18 }, // Stock Value
    { wch: 15 }, // Min Stock
    { wch: 14 }  // Status
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanBiz = businessName.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `${cleanBiz}_Products_${dateStr}.xlsx`);
}

/** Export parties to Excel */
export function exportPartiesToExcel(parties, type = 'customer', businessName = 'Business') {
  const rows = (parties || []).map((p, i) => ({
    '#': i + 1,
    'Party Name': p.name,
    'Contact Person': p.contact_name || '',
    'Phone': p.phone || '',
    'Email': p.email || '',
    'GSTIN': p.gstin || '',
    'City': p.city || '',
    'State': p.state || '',
    'Opening Balance (₹)': p.opening_balance || 0,
    'Current Balance (₹)': Math.abs(p.balance || 0),
    'Balance Type': (p.balance || 0) >= 0 ? 'To Collect (DR)' : 'To Pay (CR)',
    'Credit Limit (₹)': p.credit_limit || 0,
    'Last Transaction': p.lastTransaction || ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 30 },
    { wch: 18 },
    { wch: 15 },
    { wch: 25 },
    { wch: 18 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 24 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type === 'supplier' ? 'Suppliers' : 'Customers');
  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanBiz = businessName.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `${cleanBiz}_${type === 'supplier' ? 'Suppliers' : 'Customers'}_${dateStr}.xlsx`);
}

/** Read and parse an Excel or CSV file from input[type=file] */
export async function parseSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          throw new Error('No sheets found in Excel file');
        }
        const ws = wb.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
        if (!rawJson || rawJson.length < 2) {
          throw new Error('Sheet contains no data rows or is empty');
        }
        const headerRow = rawJson[0].map((h) => String(h || '').trim());
        const dataRows = rawJson.slice(1).filter((r) => r.some((c) => String(c || '').trim() !== ''));

        resolve({
          fileName: file.name,
          headers: headerRow,
          rows: dataRows
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/** Auto map uploaded sheet columns to target schema keys */
export function autoMapColumns(headers, schemaColumns) {
  const mapping = {};
  const usedHeaders = new Set();

  // Pass 1: Exact matches
  schemaColumns.forEach((col) => {
    const idx = headers.findIndex((h, i) => {
      if (usedHeaders.has(i)) return false;
      const clean = h.toLowerCase().replace(/[^a-z0-9%]/g, ' ').replace(/\s+/g, ' ').trim();
      return col.aliases.some((alias) => {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9%]/g, ' ').replace(/\s+/g, ' ').trim();
        return clean === cleanAlias;
      });
    });
    if (idx !== -1) {
      mapping[col.key] = idx;
      usedHeaders.add(idx);
    }
  });

  // Pass 2: Partial matches for unmapped columns
  schemaColumns.forEach((col) => {
    if (mapping[col.key] !== undefined) return;
    const idx = headers.findIndex((h, i) => {
      if (usedHeaders.has(i)) return false;
      const clean = h.toLowerCase().replace(/[^a-z0-9%]/g, ' ').replace(/\s+/g, ' ').trim();
      return col.aliases.some((alias) => {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9%]/g, ' ').replace(/\s+/g, ' ').trim();
        return clean.includes(cleanAlias) || (cleanAlias.length > 5 && cleanAlias.includes(clean));
      });
    });
    if (idx !== -1) {
      mapping[col.key] = idx;
      usedHeaders.add(idx);
    }
  });

  return mapping;
}

/** Transform parsed rows into model objects using the column mapping */
export function buildRecords(headers, rawRows, mapping, schemaColumns) {
  return rawRows.map((row, idx) => {
    const rec = { _rowNum: idx + 2 }; // Excel row number (1-based, header is 1)
    schemaColumns.forEach((col) => {
      const colIdx = mapping[col.key];
      const val = (colIdx !== undefined && colIdx !== null && row[colIdx] !== undefined)
        ? String(row[colIdx]).trim()
        : '';
      rec[col.key] = val;
    });

    // Validation status
    const errors = [];
    const warnings = [];
    if (!rec.name) {
      errors.push('Name is required');
    }
    if (rec.phone) {
      const cleanPhone = rec.phone.replace(/\D+/g, '');
      if (cleanPhone.length < 10) warnings.push('Phone number is less than 10 digits');
    }
    if (rec.sale_price !== undefined) {
      const sp = Number(rec.sale_price);
      if (isNaN(sp) || sp < 0) warnings.push('Sale price is 0 or invalid');
    }
    if (rec.gstin && rec.gstin.length !== 15) {
      warnings.push('GSTIN length is not 15 characters');
    }

    rec._status = errors.length > 0 ? 'err' : warnings.length > 0 ? 'warn' : 'ok';
    rec._errors = errors;
    rec._warnings = warnings;

    return rec;
  });
}
