import React, { useState, useRef } from 'react';
import { api } from './api.js';
import { Icon } from './ui.jsx';
import { Modal } from './components.jsx';
import {
  PRODUCT_COLUMNS,
  PARTY_COLUMNS,
  downloadProductTemplate,
  downloadPartyTemplate,
  parseSpreadsheet,
  autoMapColumns,
  buildRecords
} from './excel.js';

export default function ExcelImportModal({ mode = 'products', partyType = 'customer', business, onClose, onSuccess, toast }) {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [records, setRecords] = useState([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [step, setStep] = useState(1); // 1 = Upload, 2 = Preview & Map
  const fileInputRef = useRef(null);

  const isProduct = mode === 'products';
  const schemaColumns = isProduct ? PRODUCT_COLUMNS : PARTY_COLUMNS;
  const title = isProduct ? 'Import Products from Excel / CSV' : `Import ${partyType === 'supplier' ? 'Suppliers' : 'Customers'} from Excel / CSV`;

  const handleDownloadTemplate = () => {
    if (isProduct) {
      downloadProductTemplate();
      toast('Product Excel template downloaded', 'ok');
    } else {
      downloadPartyTemplate(partyType);
      toast(`${partyType === 'supplier' ? 'Supplier' : 'Customer'} Excel template downloaded`, 'ok');
    }
  };

  const handleFileChange = async (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setParsing(true);
    try {
      const parsed = await parseSpreadsheet(selected);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      const autoMap = autoMapColumns(parsed.headers, schemaColumns);
      setMapping(autoMap);
      const recs = buildRecords(parsed.headers, parsed.rows, autoMap, schemaColumns);
      setRecords(recs);
      setStep(2);
      toast(`Found ${parsed.rows.length} rows in ${selected.name}`, 'ok');
    } catch (err) {
      toast(err.message || 'Failed to parse spreadsheet', 'err');
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const handleMappingChange = (colKey, headerIndex) => {
    const nextMapping = { ...mapping, [colKey]: headerIndex === '' ? undefined : Number(headerIndex) };
    setMapping(nextMapping);
    const recs = buildRecords(headers, rawRows, nextMapping, schemaColumns);
    setRecords(recs);
  };

  const validRecords = records.filter((r) => r._status !== 'err');
  const errorRecords = records.filter((r) => r._status === 'err');
  const warnRecords = records.filter((r) => r._status === 'warn');

  const handleImport = async () => {
    if (validRecords.length === 0) {
      toast('No valid records to import. Please check your file and mapping.', 'err');
      return;
    }

    setImporting(true);
    try {
      if (isProduct) {
        const payload = validRecords.map((r) => ({
          name: r.name,
          barcode: r.barcode || null,
          sku: r.barcode || null,
          category: r.category || null,
          unit: r.unit || 'pcs',
          sale_price: Number(r.sale_price) || 0,
          purchase_price: Number(r.purchase_price) || 0,
          gst_rate: r.gst_rate !== '' && r.gst_rate !== undefined ? Number(r.gst_rate) : business.default_gst_rate,
          hsn: r.hsn || null,
          stock: Number(r.stock) || 0,
          opening_stock: Number(r.stock) || 0,
          low_stock_at: Number(r.low_stock_at) || 0
        }));
        const res = await api.bulkImportProducts(payload, { updateExisting });
        toast(`Imported ${res.created + res.updated} products (${res.created} new, ${res.updated} updated)`, 'ok');
      } else {
        const payload = validRecords.map((r) => ({
          name: r.name,
          type: r.type || partyType,
          contact_name: r.contact_name || null,
          phone: r.phone || null,
          email: r.email || null,
          gstin: r.gstin || null,
          address: r.address || null,
          city: r.city || null,
          state: r.state || null,
          pincode: r.pincode || null,
          opening_balance: Number(r.opening_balance) || 0,
          balance_type: (r.balance_type || 'DR').toUpperCase() === 'CR' ? 'CR' : 'DR',
          credit_limit: Number(r.credit_limit) || 0,
          credit_days: Number(r.credit_days) || 30
        }));
        const res = await api.bulkImportParties(payload, { type: partyType, updateExisting });
        toast(`Imported ${res.created + res.updated} parties (${res.created} new, ${res.updated} updated)`, 'ok');
      }
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      toast(err.message || 'Import failed', 'err');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      title={title}
      sub={isProduct ? 'Bulk upload your product catalog, prices, and stock' : `Bulk import ${partyType} names, contact numbers, and balances`}
      size="wide"
      onClose={onClose}
      footer={
        step === 1 ? (
          <>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
              {parsing ? 'Parsing...' : 'Select Excel / CSV File'}
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => { setStep(1); setFile(null); }}>
              Back to file upload
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={onClose} disabled={importing}>
              Cancel
            </button>
            <button className="btn primary" onClick={handleImport} disabled={importing || validRecords.length === 0}>
              {importing ? 'Importing Data...' : `Import ${validRecords.length} ${isProduct ? 'Products' : partyType + 's'}`}
            </button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Top Banner / Sample download */}
          <div
            style={{
              padding: '16px 20px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap'
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: '#166534', marginBottom: 2 }}>
                Need the official Excel format?
              </div>
              <div style={{ fontSize: 13, color: '#15803d' }}>
                Download our sample Excel template pre-filled with sample rows, proper columns, and GST rates.
              </div>
            </div>
            <button className="btn green" onClick={handleDownloadTemplate}>
              <Icon.download size={14} /> Download Sample Template (.xlsx)
            </button>
          </div>

          {/* Upload Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed #cbd5e1',
              borderRadius: 12,
              padding: '40px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: '#f8fafc',
              transition: 'all 0.15s ease'
            }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#059669'; }}
            onDragLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = '#cbd5e1';
              if (e.dataTransfer.files?.[0]) {
                handleFileChange({ target: { files: e.dataTransfer.files } });
              }
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <div style={{ width: 48, height: 48, margin: '0 auto 12px', color: '#059669', background: '#ecfdf5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon.upload size={24} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Click to browse or drag & drop your spreadsheet
            </div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Supports Microsoft Excel (.xlsx, .xls) and CSV (.csv) files
            </div>
            <div style={{ display: 'inline-flex', gap: 8, fontSize: 12, color: '#64748b', background: '#e2e8f0', padding: '4px 10px', borderRadius: 20 }}>
              <span>✓ Khatabook</span>
              <span>•</span>
              <span>✓ myBillBook</span>
              <span>•</span>
              <span>✓ Vyapar</span>
              <span>•</span>
              <span>✓ Tally</span>
              <span>•</span>
              <span>✓ Custom Sheets</span>
            </div>
          </div>

          {/* Guidelines */}
          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="card-b" style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Quick Tips for Migration:</div>
              <ul style={{ paddingLeft: 18, margin: 0, color: '#475569' }}>
                {isProduct ? (
                  <>
                    <li><strong>Item Name</strong> and <strong>Sale Price</strong> are required for each row.</li>
                    <li><strong>Barcode / Item Code</strong> enables instant 1-second scanner lookup in the POS billing terminal.</li>
                    <li><strong>Opening Stock</strong> automatically logs an opening stock movement in inventory ledger.</li>
                    <li><strong>GST Rate (%)</strong> supports any number: 0, 5, 12, 18, 28, or custom decimals like 7.5% or 3%.</li>
                  </>
                ) : (
                  <>
                    <li><strong>Party Name</strong> is required. <strong>Mobile Phone</strong> is recommended for WhatsApp sharing.</li>
                    <li><strong>Opening Balance:</strong> Enter positive amount if party owes you (DR), or choose CR if you owe them.</li>
                    <li><strong>GSTIN</strong> automatically validates length (15 digits) and state code prefix.</li>
                    <li>Duplicate parties with matching mobile phone numbers can be updated automatically.</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stats Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="pill green" style={{ fontSize: 13, padding: '4px 10px' }}>
                <Icon.check size={14} /> {validRecords.length} Ready to Import
              </span>
              {warnRecords.length > 0 && (
                <span className="pill brand" style={{ fontSize: 13, padding: '4px 10px', background: '#fef3c7', color: '#92400e' }}>
                  {warnRecords.length} with warnings
                </span>
              )}
              {errorRecords.length > 0 && (
                <span className="pill red" style={{ fontSize: 13, padding: '4px 10px' }}>
                  {errorRecords.length} skipped (missing name)
                </span>
              )}
              <span className="muted" style={{ fontSize: 13 }}>
                From <strong>{file?.name}</strong> ({rawRows.length} total rows)
              </span>
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
              />
              Update existing items if name / code matches
            </label>
          </div>

          {/* Field Mapping Accordion / Summary */}
          <details style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#334155' }}>
              🔧 Review / Change Excel Column Mapping ({Object.keys(mapping).length} columns auto-mapped)
            </summary>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {schemaColumns.map((col) => (
                <div key={col.key} style={{ fontSize: 12 }}>
                  <label style={{ display: 'block', marginBottom: 2, fontWeight: col.required ? 600 : 400, color: col.required ? '#0f172a' : '#64748b' }}>
                    {col.label}
                  </label>
                  <select
                    className="input sm"
                    value={mapping[col.key] !== undefined ? mapping[col.key] : ''}
                    onChange={(e) => handleMappingChange(col.key, e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">(None / Ignore)</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        Column {i + 1}: {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </details>

          {/* Preview Table */}
          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="card-b tight tbl-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th style={{ width: 60 }}>Status</th>
                    {schemaColumns.slice(0, 6).map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 25).map((r, i) => (
                    <tr key={i} style={{ background: r._status === 'err' ? '#fef2f2' : undefined }}>
                      <td className="muted">{r._rowNum}</td>
                      <td>
                        {r._status === 'ok' && <span className="pill green" style={{ padding: '2px 6px', fontSize: 10 }}>OK</span>}
                        {r._status === 'warn' && <span className="pill brand" style={{ padding: '2px 6px', fontSize: 10, background: '#fef3c7', color: '#92400e' }}>Warn</span>}
                        {r._status === 'err' && <span className="pill red" style={{ padding: '2px 6px', fontSize: 10 }}>Skip</span>}
                      </td>
                      {schemaColumns.slice(0, 6).map((col) => (
                        <td key={col.key} className={col.key.includes('price') || col.key.includes('stock') || col.key.includes('balance') ? 'num' : ''}>
                          {r[col.key] || <span className="muted">—</span>}
                        </td>
                      ))}
                      <td style={{ fontSize: 11, color: r._status === 'err' ? '#dc2626' : '#d97706' }}>
                        {r._errors.join(', ') || r._warnings.join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {records.length > 25 && (
                <div style={{ padding: '8px 12px', fontSize: 12, textAlign: 'center', background: '#f8fafc', color: '#64748b' }}>
                  Showing first 25 of {records.length} records. All {validRecords.length} valid rows will be imported.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
