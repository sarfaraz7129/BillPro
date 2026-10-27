# BillPro — Multi-Business Billing, Khata, GST & Inventory Platform

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

A complete billing and accounting web application + installable PWA designed for Indian SMBs, similar to Khatabook and myBillBook. Manages multiple businesses with independent GSTINs, sequential billing series, stock, ledgers, e-Way bills, e-invoicing (IRN), thermal printing, WhatsApp sharing, and Excel bulk migration.

---

## ⚡ 1-Click Deploy to Render (Permanent Live URL)

### Method 1: Connect your GitHub Repo on Render Dashboard (Recommended)

1. **Push this code to a new repository on your GitHub account** (see instructions below).
2. Go to **[dashboard.render.com](https://dashboard.render.com)** and log in with GitHub.
3. Click **New +** → **Web Service**.
4. Select **"Build and deploy from a Git repository"** and choose your `billpro` repo.
5. Render will automatically detect Node.js. Fill in the service settings:
   - **Name:** `billpro` (or your choice)
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** `Free` (or Starter if you want a Persistent Disk)
6. Add Environment Variables:
   - `NODE_VERSION` = `20.18.0` *(Important: ensures Node 20 LTS for better-sqlite3)*
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = *(Click "Generate" or enter any secure string)*
   *(⚠️ Do NOT add a `PORT` variable manually in Environment Variables — Render reserves and manages `PORT` automatically).*
7. Click **Create Web Service**.
8. Within 2 minutes, Render will build the React SPA, compile SQLite, boot Express, and give you your **permanent live link**:
   `https://billpro-xxxx.onrender.com`

### Method 2: Deploy with Docker on Render (Zero-Config Alternative)
If you encounter host-level library issues, Render can build via the included `Dockerfile`:
1. In Render Web Service settings, choose **Runtime: Docker** instead of Node.
2. Render builds the container using Node 20 Bullseye with all native build tools pre-installed.
3. No build command or start command required — it works out of the box!

---

## 🔧 Render Troubleshooting & Build Failure Fixes

If your build on Render fails, check these 3 common causes:

1. **"PORT is a reserved environment variable and cannot be set"**:
   - **Fix:** In your Render dashboard under **Environment**, delete any variable named `PORT`. Render injects its own port (e.g. 10000) automatically.

2. **"better-sqlite3: The engine node is incompatible" or compilation failure**:
   - **Fix:** Render was running an older Node version (like Node 14/16). We added `.node-version` (`20.18.0`) and `.nvmrc` (`20`). You can also add `NODE_VERSION=20.18.0` in Render's Environment Variables.

3. **"Cannot find module 'esbuild'"**:
   - **Fix:** We moved `esbuild`, `react`, and `react-dom` into production `dependencies`, and made `tools/build.js` fallback cleanly to the committed `www/app.js` bundle if needed.

---

## 🔄 Real-Time Sync: Updating via Prompts / Commits

When you connect your GitHub repository to Render, **Auto-Deploy is enabled by default**:
* Every time you push a commit to the `main` branch (either directly, via git push, or after updating features with the prompt assistant), **Render automatically triggers a fresh build and live redeployment within seconds**.
* You can also trigger an immediate manual redeploy from Render's dashboard under **"Manual Deploy" → "Deploy latest commit"**.
* **Deploy Hook URL (Instant Webhook):**
  Under your Render Web Service **Settings** → **Deploy Hook**, you can copy a webhook URL. Hitting that URL from any script or GitHub Action triggers an instant build.

---

## 💾 SQLite Data Persistence on Render

BillPro uses a high-performance, embedded SQLite database (`better-sqlite3` with WAL mode).

* **On Render Free Tier:** Files are ephemeral. A runtime “Lock Permanent” action cannot survive a deployment without persistent storage; BillPro now rejects that action instead of falsely reporting success. Production database and client registry writes need a persistent disk.
* **For Persistent Production Data (Render plan with Persistent Disk support):**
  1. **Before changing storage**, download a full JSON backup from Super Admin → Database & Backups.
  2. In Render Web Service → **Disks**, add a disk named `billpro-data`, mounted at `/var/data` (1 GB or more).
  3. In **Environment Variables**, set `BILLPRO_DATA_DIR` to `/var/data` and deploy.
  4. Restore the JSON backup in Super Admin → Database & Backups, then verify users, businesses, products, and invoices.
  5. Client registry snapshots are now written to that same mounted disk; lifetime plan and expiry values are preserved through registry syncs.

---

## 🚀 Quick Local Development

```bash
# 1. Clone repository
git clone https://github.com/<your-username>/billpro.git
cd billpro

# 2. Install dependencies
npm install

# 3. Build frontend bundle
npm run build

# 4. Run database seed (preloads demo businesses)
npm run seed

# 5. Start server
npm start
# App is live on http://localhost:4173
```

### Demo Credentials
* **Email:** `demo.user@billpro.in`
* **Password:** `demo1234`
* **Sample Business:** Bharat Retail Mart (fictional sample customers, products, and bills)

The public demo account is never a platform Super Admin. `demo@billpro.in` and `admin@billpro.in` are local-development aliases only and are explicitly denied platform-wide access in production. To bootstrap a private production platform admin, set `BILLPRO_SUPERADMIN_EMAIL` and a unique `BILLPRO_SUPERADMIN_PASSWORD` (16–72 bytes) in the host environment. The password is stored as a bcrypt hash and is never logged. For an existing private user, the configured email grants the role; supplying `BILLPRO_SUPERADMIN_PASSWORD` resets it to that protected environment secret so the login is known only to the service owner. A new or workspace-less platform admin receives a separate empty `Super Admin Workspace` (or the name in `BILLPRO_SUPERADMIN_BUSINESS_NAME`) and starts there, rather than inheriting a demo/customer business selected in the browser.

---

## Render Free Tier: Allowing the Service to Sleep

Render Free web services spin down after about **15 minutes without inbound traffic** and start again when a user visits; the first request after sleep can take about a minute. Sleeping services do not consume free instance-hours. Free instance-hours are shared across the Render workspace, so do not configure self-pingers, scheduled health checks, UptimeRobot, or cron jobs to keep this service awake. This project intentionally does not send keep-alive requests.

Render Free filesystems are ephemeral: local SQLite data can be lost when the service sleeps, restarts, or redeploys. Do not rely on the local SQLite database for live business records; use a durable external database (for example, the user's selected Neon PostgreSQL Free plan) before storing important data.

---

## 🛠 Features

- **Multi-Tenant / Multi-Business Architecture:** Independent GSTIN, invoice series, stock, and parties per business with 1-click header switcher and consolidated group overview.
- **GST Billing & Compliance:** Full CGST, SGST, IGST tax breakdown, arbitrary custom GST rates (e.g. 7.5%, 3%, 0.25%), HSN summaries, and numbers-to-words.
- **Customer Khata with Live Outstanding Balance:** Persistent outstanding balance cards, live Khata impact calculations (Previous Due + Bill - Paid = Net Closing Balance), and over-limit credit alerts.
- **Counter POS (Point of Sale):** Quick barcode billing, tap-to-add grid, tender change calculator, and keyboard shortcuts (F2/F9).
- **Thermal Receipt Printing:** Instant printing for 58mm (2-inch) and 80mm (3-inch) receipt printers with dynamic UPI payment QR codes.
- **Direct WhatsApp Sharing:** Modal with +91 phone formatting, editable bill text, and direct `wa.me` deep linking.
- **Excel / CSV Migration:** Two-way bulk import & export with auto-column mapping and live validation preview.
- **E-Way Bill & e-Invoicing Ready:** JSON payload generation and 12-digit mock EWB issue.
- **Financial Reports:** GSTR-1 (B2B, B2CS, HSN), GSTR-3B summary, P&L statement, balance sheet, and aged receivables.
- **Installable PWA:** Offline-capable service worker and installable mobile web app.

---

## 📁 Repository Structure

```
billpro/
├── server/
│   ├── db.js                  # SQLite database connection & schema
│   ├── index.js               # Express server, PWA routes & API
│   ├── middleware.js          # JWT auth & multi-business context
│   ├── lib/
│   │   ├── gst.js             # GST tax maths, HSN & payload builders
│   │   ├── pdf.js             # Vector PDFKit invoice generator
│   │   └── service.js         # Khata ledgers, stock moves & counters
│   └── routes/                # Express API endpoints
├── www/                       # Frontend PWA & React client
│   ├── index.html             # Single-page app HTML
│   ├── styles.css             # Responsive styling & thermal print media
│   ├── sw.js                  # Service worker
│   ├── manifest.webmanifest   # PWA manifest
│   └── src/                   # React 18 UI components
├── tools/                     # Build, seed & automated test scripts
├── render.yaml                # Render Blueprint deployment definition
└── package.json               # NPM scripts & dependencies
```

---

## 📜 License
MIT License. Built for Indian businesses and creators.
