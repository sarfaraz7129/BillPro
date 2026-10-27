'use strict';
const path = require('path');
const express = require('express');
const cors = require('cors');
const { db } = require('./db');

const authRoutes = require('./routes/auth');
const businessRoutes = require('./routes/businesses');
const partyRoutes = require('./routes/parties');
const productRoutes = require('./routes/products');
const documentRoutes = require('./routes/documents');
const transactionRoutes = require('./routes/transactions');
const reportRoutes = require('./routes/reports');
const pdfRoutes = require('./routes/pdf');
const adminRoutes = require('./routes/admin');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging for API endpoints
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`[BillPro API] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

const { istToday, istTime, istIso, formatIstDateTime } = require('./lib/time');

// Global Standard Indian Time (+5:30) and server time headers
app.use((req, res, next) => {
  const nowMs = Date.now();
  res.setHeader('X-Server-Time', String(nowMs));
  res.setHeader('X-IST-Date', istToday(nowMs));
  res.setHeader('X-IST-Time', istTime(nowMs));
  res.setHeader('X-IST-Iso', istIso(nowMs));
  next();
});

const WWW = path.join(__dirname, '..', 'www');

// PWA files must be served from the app root so the service worker scope covers the whole site.
app.get('/sw.js', (req, res) => res.sendFile(path.join(WWW, 'sw.js')));
app.get('/manifest.webmanifest', (req, res) => res.sendFile(path.join(WWW, 'manifest.webmanifest')));
app.use('/icons', express.static(path.join(WWW, 'icons'), { maxAge: '7d' }));

// Authoritative Indian Standard Time endpoint (+05:30)
app.get('/api/time', (req, res) => {
  const nowMs = Date.now();
  res.json({
    ok: true,
    epoch: nowMs,
    ist_date: istToday(nowMs),
    ist_time: istTime(nowMs),
    ist_iso: istIso(nowMs),
    formatted: formatIstDateTime(nowMs),
    timezone: 'Asia/Kolkata',
    offset: '+05:30'
  });
});

app.get('/downloads/product-import-template.xlsx', (req, res, next) => {
  const templatePath = path.join(WWW, 'templates', 'BillPro_Product_Import_Template.xlsx');
  res.setHeader('Cache-Control', 'no-store');
  res.download(templatePath, 'BillPro_Product_Import_Template.xlsx', (err) => {
    if (err && !res.headersSent) next(err);
  });
});

app.get('/api/health', (req, res) => {
  const businesses = db.prepare('SELECT COUNT(*) n FROM businesses').get().n;
  const docs = db.prepare('SELECT COUNT(*) n FROM documents').get().n;
  res.json({
    ok: true,
    service: 'BillPro',
    version: '1.0.0',
    businesses,
    documents: docs,
    time: istIso(),
    ist_date: istToday(),
    ist_time: istTime(),
    epoch: Date.now(),
    offset: '+05:30'
  });
});

app.use('/api/auth', authRoutes.router);
app.use('/api/businesses', businessRoutes.router);
app.use('/api/parties', partyRoutes.router);
app.use('/api/products', productRoutes.router);
app.use('/api/documents', documentRoutes.router);
app.use('/api/transactions', transactionRoutes.router);
app.use('/api/reports', reportRoutes.router);
app.use('/api/pdf', pdfRoutes.router);
app.use('/api/admin', adminRoutes.router);

// Static frontend with strict no-cache headers to ensure immediate live updates
app.use(express.static(WWW, {
  extensions: ['html'],
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(WWW, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[BillPro]', err);
  res.status(500).json({ error: err.message || 'Something went wrong' });
});

// Auto-seed initial demo businesses on very first boot if the database is brand new
try {
  const userCount = db.prepare('SELECT COUNT(*) n FROM users').get()?.n || 0;
  if (userCount === 0) {
    const { seed } = require('../tools/seed-demo');
    seed();
    console.log('[BillPro] First-run detected: automatically seeded demo businesses.');
  }
} catch (e) {
  console.warn('[BillPro] First-run seed check:', e.message);
}

const PORT = Number(process.env.PORT) || 4173;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BillPro API + app running on http://0.0.0.0:${PORT}`);

  });
}

module.exports = { app };
