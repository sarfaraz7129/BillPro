# BillPro — Multi-Business Billing, Khata, GST & Inventory Platform

**BillPro** is a full-featured, Indian-market billing platform designed as an alternative to **Khatabook** and **myBillBook**, with support for managing multiple independent businesses under one login plus an aggregated group dashboard.

The application is running live in your workspace on port **4173** and is installable as a **Progressive Web App (PWA)** on desktop or mobile.

---

## 1. Quick Start & Demo Credentials

The database is pre-seeded with two realistic Indian businesses so you can test all features immediately:

* **URL:** `http://localhost:4173/` (or your live preview window)
* **Email:** `demo@billpro.in`
* **Password:** `demo1234`
* *(A "Fill demo credentials" button is also present on the login screen for 1-click access)*

### Seeded Demo Businesses

| Detail | Business 1 | Business 2 |
|---|---|---|
| **Trade Name** | **Coastal Traders** | **Udupi Tiffin Supply** |
| **Legal Name** | Coastal Traders Pvt Ltd | Udupi Tiffin Supply |
| **GSTIN** | `29AAECC1234F1Z5` (Karnataka) | `29AAEFU5678K1Z2` (Karnataka) |
| **City** | Mangaluru | Udupi |
| **Default GST** | 18% | 5% |
| **Prefixes** | `CT-` (Invoices), `CQ-` (Quotes) | `UT-` (Invoices), `UQ-` (Quotes) |
| **Theme** | Indigo Classic | Emerald Green |
| **UPI ID** | `coastaltraders@okaxis` | `udupitiffin@ybl` |
| **Seeded Data** | 7 Invoices, 5 Customers, 2 Suppliers, 6 Products | 3 Invoices, 2 Customers, 4 Products |

---

## 2. Architecture & Data Isolation

```
                         ┌─────────────────────────────┐
                         │   One User Account (Owner)  │
                         └──────────────┬──────────────┘
                                        │
           ┌────────────────────────────┴────────────────────────────┐
           ▼                                                         ▼
┌─────────────────────────┐                               ┌─────────────────────────┐
│ Business 1: Coastal Tr. │                               │ Business 2: Udupi Tiff. │
├─────────────────────────┤                               ├─────────────────────────┤
│ • GSTIN: 29AAECC1234F1Z5│                               │ • GSTIN: 29AAEFU5678K1Z2│
│ • Isolated Invoices     │                               │ • Isolated Invoices     │
│ • Isolated Customers    │                               │ • Isolated Customers    │
│ • Isolated Inventory    │                               │ • Isolated Inventory    │
│ • Own Bank & UPI QR     │                               │ • Own Bank & UPI QR     │
│ • Own Staff & Roles     │                               │ • Own Staff & Roles     │
└──────────┬──────────────┘                               └──────────┬──────────────┘
           │                                                         │
           └────────────────────────────┬────────────────────────────┘
                                        ▼
                         ┌─────────────────────────────┐
                         │  Consolidated Group View    │
                         │  • Total Combined Sales     │
                         │  • Total Group Receivables  │
                         │  • Net Group GST Liability  │
                         │  • Combined Stock Valuation │
                         │  • Cross-business Split     │
                         └─────────────────────────────┘
```

Every table in SQLite (`parties`, `products`, `documents`, `transactions`, `stock_moves`, `staff`) has a foreign key `business_id REFERENCES businesses(id) ON DELETE CASCADE`.

* **Context Switching:** Picking a business from the header switcher sets `X-Business-Id` on all API calls. Business A cannot see Business B's parties, products or bills.
* **Group Aggregation:** The `GET /api/businesses/group/overview` route computes SQL `UNION` / group-by roll-ups across all businesses owned by your account without mixing up their records.

---

## 3. Premium Features Included

### A. GST-Compliant Invoicing
* **Tax Splitting:** Automatically detects **Intra-State** (CGST + SGST split 50/50) vs **Inter-State** (100% IGST) by comparing the business state code to the customer's GSTIN / Place of Supply.
* **Tax Inclusive vs Exclusive:** Toggle on any product or line item; backward-computes taxable base.
* **HSN/SAC Codes:** Auto-suggested per product; Table 12 GSTR-1 summary generated on every bill.
* **Amount in Words:** Indian numbering system (Lakhs, Crores, Paise) generated dynamically.
* **Round-Off:** One-click rounding of final totals to the nearest Rupee with standard rounding accounting.
* **UPI Scan-to-Pay QR:** Generates a real `upi://pay` dynamic QR embedded directly in the footer of every invoice PDF with exact bill total pre-filled.
* **E-Way Bill Ready:** Generates 12-digit E-Way Bill numbers with Part-A/Part-B transport details (vehicle number, LR document, validity date calculation).
* **e-Invoice (IRN) Ready:** Mints compliant Invoice Reference Number (IRN) and signed QR payload structure per ICB 1.03 specifications.

### B. Khata / Digital Udhaar Ledger
* **You Gave (Debit) & You Got (Credit):** Instant entries for cash, UPI, bank transfer, cheque, or credit card.
* **Live Running Balances:** Reflects unpaid bills, partial payments and direct cash advances instantly.
* **Credit Limits & Overdue Alerts:** Visual warning when a customer exceeds their allowed credit.
* **Interest Calculator:** Charges overdue interest (e.g. 18% p.a. for N days) directly into the party ledger.
* **Account Statement PDF:** Download a branded statement with opening balance, all debits/credits, running balance and closing position.
* **Multi-Channel Sharing:** 1-click **WhatsApp message** with bill summary, amount due and UPI payment link; also supports SMS, Email and direct PDF download.

### C. Counter Billing (POS)
* **High-Speed Counter Mode:** Tap products or scan physical barcodes via the `F2` quick-key.
* **Keyboard Shortcuts:** `F2` focus barcode scanner, `F9` complete & print bill.
* **Cash Change Calculator:** Quick cash buttons (Round 100, 500, 1000) with automatic change return math.
* **Instant Stock Deduction:** Every counter sale immediately deducts inventory and flags low-stock warnings.

### D. Inventory & Stock Management
* **Automated Stock Movement:** Documented `stock_moves` ledger for every invoice, purchase bill, opening balance and manual adjustment.
* **Low-Stock Alerts:** Amber warning badges and dashboard alerts when stock drops to or below threshold.
* **Stock Valuation:** Real-time cost-basis valuation (purchase price × stock) vs projected retail value.
* **Profit Margins:** Calculated per SKU (`(Sale - Purchase) / Sale * 100`).
* **Stock History Audit:** Complete trail of who moved how many units and on which invoice.

### E. Tax Compliance & Business Reports
* **GSTR-3B Summary:** Table 3.1(a) Outward supplies, Table 4 Eligible ITC, Net cash liability after setting off ITC.
* **GSTR-1 Ready:** Tables for B2B (registered buyers with GSTIN), B2C Large (> ₹2.5L), B2C Small, Table 12 (HSN summary), and Table 13 (document serial numbers).
* **CSV Export:** Government portal / ClearTax / Tally compatible CSV files for GSTR-1, Sales register, Purchase register, HSN, Stock, and Parties.
* **Profit & Loss:** Month-by-month gross margin and net margin after operational expenses.
* **Receivables Ageing:** Visual donut chart and follow-up table bucketed into `0-30`, `31-60`, `61-90`, and `90+` days overdue.
* **Day Book:** Single-day audit of every bill issued, purchase logged, payment received and stock move.

### F. Multi-User & Staff Roles
* **Owner:** Full access across all businesses.
* **Admin:** Full access to a specific business.
* **Accountant:** Read/write access to Billing, Khata, Inventory, and full compliance Reports.
* **Counter Staff:** Billing (POS + invoices) and Khata payments only; hidden financial reports and settings.

### G. Installable Progressive Web App (PWA)
* Manifest with custom high-resolution icons (192px, 512px, maskable, Apple touch icon).
* Service worker caching app shell for offline availability.
* Standalone window mode when installed on Chrome, Edge, Safari (iOS) or Android.

---

## 4. Key API Endpoints

All endpoints require `Authorization: Bearer <token>` and respect `X-Business-Id: <id>`.

| Route | Method | Description |
|---|---|---|
| `/api/auth/login` | POST | Sign in with email and password |
| `/api/auth/signup` | POST | Register new owner account |
| `/api/auth/active-business/:id` | POST | Switch active business context |
| `/api/businesses` | GET, POST | List or create businesses |
| `/api/businesses/group/overview` | GET | Aggregated multi-business roll-up |
| `/api/documents?type=sale` | GET, POST | List or create invoices / bills |
| `/api/documents/:id/payment` | POST | Record payment against document |
| `/api/documents/:id/ewaybill` | POST | Generate E-Way Bill Part-A |
| `/api/documents/:id/einvoice` | POST | Generate GST e-invoice IRN & ack |
| `/api/documents/:id/share` | GET | WhatsApp / SMS deep-links & text |
| `/api/parties` | GET, POST | Customer and supplier directory |
| `/api/parties/:id/statement` | GET | Khata statement with running balance |
| `/api/transactions` | GET, POST | Direct "You gave" / "You got" entries |
| `/api/products` | GET, POST | Inventory items with low-stock filter |
| `/api/products/:id/stock` | POST | Manual stock adjustment |
| `/api/reports/dashboard` | GET | KPI metrics, sales chart, alerts |
| `/api/reports/gstr1` | GET | GSTR-1 sections (B2B, B2C, HSN) |
| `/api/reports/gstr3b` | GET | GSTR-3B summary & net tax |
| `/api/reports/profit` | GET | P&L by month |
| `/api/reports/aging` | GET | Receivables ageing buckets |
| `/api/reports/export/:report` | GET | CSV downloads (`gstr1`, `sales`, etc.) |
| `/api/pdf/invoice/:id` | GET | PDF Tax Invoice with UPI QR |
| `/api/pdf/statement/:partyId` | GET | PDF Account Statement |
| `/api/pdf/stock` | GET | PDF Stock valuation report |

---

## 5. File Structure

```
/home/user/billpro/
├── package.json               # Dependencies (Express, better-sqlite3, pdfkit, qrcode, esbuild, react)
├── server/
│   ├── index.js               # Express server entry point (port 4173)
│   ├── db.js                  # SQLite connection and relational schema
│   ├── middleware.js          # JWT auth + multi-business context loader
│   ├── lib/
│   │   ├── gst.js             # Indian GST math, HSN summary, IRN/E-Way payloads
│   │   ├── service.js         # Balances, stock moves, numbering rules
│   │   └── pdf.js             # Vector PDFKit invoice, statement & report generator
│   └── routes/
│       ├── auth.js            # Login, signup, password, active business
│       ├── businesses.js      # Multi-business CRUD + group overview + staff
│       ├── documents.js       # Invoices, purchases, quotations, expenses, EWB, IRN
│       ├── parties.js         # Customers, suppliers, statements
│       ├── products.js        # Inventory, barcode search, stock adjustments
│       ├── transactions.js    # Khata you-gave / you-got / interest
│       ├── reports.js         # GSTR-1, GSTR-3B, P&L, Ageing, CSV export
│       └── pdf.js             # PDF download endpoints
├── www/
│   ├── index.html             # PWA entry page
│   ├── manifest.webmanifest   # Web app manifest
│   ├── sw.js                  # Service worker for offline caching
│   ├── styles.css             # Modern SaaS design system
│   ├── icons/                 # PWA icons (192, 512, maskable, apple)
│   ├── src/
│   │   ├── main.jsx           # App shell, navigation, global state
│   │   ├── api.js             # API client with token & business headers
│   │   ├── ui.jsx             # Inline SVG icons & design tokens
│   │   ├── components.jsx     # Modals, charts, pickers, pills, GstRateInput
│   │   ├── states.js          # GST state codes list
│   │   ├── excel.js           # SheetJS (.xlsx) templates, parser, column mapper & export
│   │   ├── ExcelImportModal.jsx # Live Excel import wizard with preview & mapping
│   │   ├── WhatsAppModal.jsx  # WhatsApp bill sharing with direct mobile number input
│   │   ├── ThermalReceipt.jsx # 58mm/80mm thermal receipt generator & ESC/POS copy
│   │   ├── BusinessSwitcher.jsx
│   │   └── DocumentEditor.jsx # Full GST invoice editor
│   └── pages/
│       ├── Login.jsx
│       ├── Dashboard.jsx
│       ├── Billing.jsx
│       ├── POS.jsx
│       ├── Khata.jsx
│       ├── Inventory.jsx
│       ├── Reports.jsx
│       ├── Group.jsx
│       └── Settings.jsx
└── tools/
    ├── build.js               # esbuild bundler
    ├── seed-demo.js           # Seeds Indian businesses with real GST data
    ├── test.js                # 48-assertion end-to-end HTTP integration test
    ├── test-excel-bulk.js     # Bulk import API integration tests
    └── make-icons.js          # Generates PWA icon set
```

---

## 7. Migration & Advanced Features

### A. Excel / CSV Bulk Upload for Products & Customers
Easily migrate existing data from **Khatabook**, **myBillBook**, **Vyapar**, **Marg**, **Tally**, or custom spreadsheets:
* **Download Sample Excel Template:** Click **"Import Excel"** on Inventory or Khata to download pre-formatted `.xlsx` templates containing sample rows and standard columns.
* **Auto-Column Mapping:** Automatically matches headers like "Item Name", "Sale Price", "Barcode", "HSN", "GST Rate", "Customer Name", "Mobile Phone", "GSTIN", and "Opening Balance", with a dropdown selector to adjust mappings if needed.
* **Live Validation Preview:** Previews rows before import, flagging valid rows (green), missing optional fields (amber), or missing required names (red).
* **Duplicate Merging:** Option to update existing records if name, barcode, or mobile number matches, or skip duplicates.
* **Atomic Batch Transaction:** Backend `/api/products/bulk` and `/api/parties/bulk` endpoints process hundreds of items in a single SQLite transaction with automatic opening stock ledger logging.
* **Excel Export:** 1-click **"Export Excel"** button on both Inventory and Khata to export your full product catalog and customer ledger anytime.

### B. Thermal Printer Receipt (58mm / 80mm)
* **Direct Thermal Printing:** Dedicated printer button in both Counter POS and Invoices table.
* **Dual Width Switch:** Switch between **58mm (2-inch)** and **80mm (3-inch standard)** receipt paper rolls.
* **Compact Slip Layout:** Clear merchant header, GSTIN, receipt number, item table with HSN and GST, tax breakdown (CGST/SGST/IGST), and total payable.
* **Dynamic UPI QR Code:** Generates a real-time scannable QR code on the paper slip linked to your UPI ID and bill total.
* **ESC/POS Raw Text Copy:** 1-click copy of standard ESC/POS formatted receipt text for Bluetooth and serial thermal printers.

### C. Direct WhatsApp Bill Sharing
* **Recipient Mobile Phone Modal:** Direct modal opening from invoice rows, POS counter, and invoice viewer.
* **+91 Mobile Formatter:** Pre-fills the customer's phone number or allows typing any 10-digit number on the fly.
* **Customizable Message Preview:** Includes bill number, total amount, due date, direct PDF view link, and UPI payment details.
* **1-Click Launch:** Deep links directly into `wa.me` for instant mobile or desktop WhatsApp web sending, with fallback SMS link.

### D. Custom Arbitrary GST Rate Support
* Support for any custom GST percentage (e.g., 7.5%, 3%, 1.5%, 0.25%) alongside preset slabs (0%, 5%, 12%, 18%, 28%).
* Available in Product creation, Excel upload, Invoice line items, POS counter billing, and Business default settings.
* Seamless split into intra-state CGST + SGST (exact half) or inter-state IGST.

### E. Live Customer Outstanding Balance & Khata Impact in Invoices & POS
* **Persistent Customer Balance Badge:** Once a customer is selected in the invoice editor or POS counter billing, a dedicated customer card is displayed with the customer's phone number, credit limit, and prominent live outstanding balance (`To Collect (Dr)` / `Advance (Cr)` / `Settled`).
* **Instant Clear & Switch:** 1-click `✕` clear button on the customer picker allows fast switching between customers or walk-in parties without manual text deletion.
* **Live Khata Impact Calculation:** The totals calculation box displays a real-time ledger impact summary:
  - **Previous Outstanding Balance:** The customer's balance prior to this bill.
  - **+ Current Bill Total:** Real-time invoice amount with taxes and line discounts.
  - **- Amount Received Now:** Live deduction when the cashier enters an immediate payment.
  - **Net Closing Balance:** The projected new ledger closing balance (`Dr Due` / `Cr Adv` / `Settled`) once saved.
* **Over-Limit Warnings:** If a customer's balance exceeds their assigned credit limit, an active warning banner (`⚠️ Over Limit`) alerts staff before saving.
* **Invoice Viewer Ledger Bar:** When opening any past invoice (`DocViewer`), the customer's overall khata balance across all bills is displayed directly alongside the specific invoice balance.


