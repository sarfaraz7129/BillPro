'use strict';
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.BILLPRO_JWT_SECRET || 'billpro-dev-secret-change-me-in-production';

function sign(user) {
  return jwt.sign({ uid: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

/** Returns all businesses the user owns or is invited to as staff. */
function getUserBusinesses(userId, userEmail) {
  if (!userId) return [];
  const email = (userEmail || '').toLowerCase();
  return db.prepare(`
    SELECT DISTINCT b.* FROM businesses b
    WHERE b.owner_id = ?
       OR (b.id IN (SELECT business_id FROM staff WHERE lower(email) = ?))
    ORDER BY b.created_at
  `).all(userId, email);
}

/** Attaches req.user; 401 if the token is missing/invalid. */
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  let token = null;
  if (header.toLowerCase().startsWith('bearer ')) {
    token = header.slice(7).trim();
  } else if (req.headers['x-billpro-token']) {
    token = req.headers['x-billpro-token'];
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    console.warn('[BillPro Auth] Missing token on', req.method, req.path);
    return res.status(401).json({ error: 'Not signed in' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, phone, role, permissions, active_business_id, lang FROM users WHERE id = ?').get(payload.uid);
    if (!user) {
      console.warn('[BillPro Auth] User not found for id', payload.uid);
      return res.status(401).json({ error: 'Account not found' });
    }
    req.user = user;
    next();
  } catch (e) {
    console.warn('[BillPro Auth] JWT verify failed:', e.message);
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

/**
 * Resolves the business the request is acting on (X-Business-Id header, or the
 * user's active business) and checks the user actually has access to it.
 * Falls back gracefully to active_business_id or first business if wanted id is invalid.
 */
function loadBusiness(req, res, next) {
  const rawWanted = req.headers['x-business-id'] || req.body?.business_id || req.query.business_id;
  const wanted = Number(rawWanted);
  const list = getUserBusinesses(req.user.id, req.user.email);
  const biz = (wanted ? list.find((b) => b.id === wanted) : null)
    || list.find((b) => b.id === req.user.active_business_id)
    || list[0];
  if (!biz) return res.status(400).json({ error: 'No business selected. Create one first.' });
  req.business = biz;
  req.businesses = list;
  next();
}

const PERMISSIONS = {
  dashboard: 'View dashboard',
  billing: 'Create invoices & bills',
  khata: 'Manage party ledgers',
  inventory: 'Manage inventory',
  reports: 'View reports & GST filings',
  settings: 'Edit business settings',
  staff: 'Manage staff & roles'
};

module.exports = { sign, auth, loadBusiness, getUserBusinesses, JWT_SECRET, PERMISSIONS };
