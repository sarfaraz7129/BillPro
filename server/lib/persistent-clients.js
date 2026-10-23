'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const REGISTRY_PATH = path.join(__dirname, 'persistent_registry.json');

/**
 * Loads the registry array from persistent_registry.json
 */
function loadRegistry() {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return [];
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[Persistent Registry Load Warning]:', err.message);
    return [];
  }
}

/**
 * Appends or updates a client record in persistent_registry.json
 */
function saveToRegistry(clientRecord) {
  try {
    const list = loadRegistry();
    const cleanEmail = String(clientRecord.email || '').trim().toLowerCase();
    const idx = list.findIndex(
      (c) => String(c.email || '').trim().toLowerCase() === cleanEmail ||
             (c.phone && clientRecord.phone && String(c.phone).trim() === String(clientRecord.phone).trim())
    );
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...clientRecord };
    } else {
      list.push(clientRecord);
    }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Persistent Registry Save Warning]:', err.message);
  }
}

/**
 * Synchronizes all persistent clients and their primary businesses into SQLite.
 * Runs on every server startup to guarantee accounts are never lost on container redeploy.
 */
function syncPersistentClients(db) {
  try {
    const clients = loadRegistry();
    const allPermsJson = JSON.stringify([
      'manage_business', 'manage_staff', 'manage_products', 'create_invoice',
      'edit_invoice', 'cancel_invoice', 'create_purchase', 'manage_khata',
      'view_reports', 'export_data', 'pos_billing'
    ]);

    for (const c of clients) {
      const cleanEmail = String(c.email || '').trim().toLowerCase();
      let user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(cleanEmail);

      if (!user) {
        // Create user account
        const pwdHash = bcrypt.hashSync(c.password || 'demo1234', 10);
        const res = db.prepare(`
          INSERT INTO users (name, email, phone, password_hash, role, permissions, is_superadmin, status, plan, expires_at, initial_password)
          VALUES (?, ?, ?, ?, 'owner', ?, 0, ?, ?, ?, ?)
        `).run(
          c.name.trim(),
          cleanEmail,
          c.phone ? String(c.phone).trim() : null,
          pwdHash,
          allPermsJson,
          c.status || 'active',
          c.plan || 'yearly',
          c.expires_at || '2028-12-31',
          c.password || 'demo1234'
        );
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(res.lastInsertRowid);
      } else {
        // Update credentials & profile to match persistent registry
        const pwdHash = c.password ? bcrypt.hashSync(c.password, 10) : user.password_hash;
        db.prepare(`
          UPDATE users 
          SET name = ?, phone = ?, password_hash = ?, initial_password = ?, status = ?, plan = ?, expires_at = ?
          WHERE id = ?
        `).run(
          c.name.trim(),
          c.phone ? String(c.phone).trim() : user.phone,
          pwdHash,
          c.password || user.initial_password || 'demo1234',
          c.status || user.status || 'active',
          c.plan || user.plan || 'yearly',
          c.expires_at || user.expires_at || '2028-12-31',
          user.id
        );
      }

      // Check primary business for this user
      let biz = db.prepare('SELECT * FROM businesses WHERE owner_id = ?').get(user.id);
      if (!biz && c.business) {
        const b = c.business;
        const bizInsert = db.prepare(`
          INSERT INTO businesses (
            owner_id, name, legal_name, gstin, pan, phone, city, state, state_code, pincode,
            invoice_prefix, quoter_prefix, default_gst_rate, credit_days, color
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QT', ?, ?, '#4f46e5')
        `).run(
          user.id,
          b.name || `${c.name}'s Business`,
          b.legal_name || b.name || `${c.name}'s Business`,
          b.gstin || null,
          b.pan || (b.gstin && b.gstin.length >= 10 ? b.gstin.slice(2, 12) : null),
          b.phone || c.phone || null,
          b.city || 'Udupi',
          b.state || 'Karnataka',
          b.state_code || '29',
          b.pincode || '576101',
          b.invoice_prefix || 'INV',
          b.default_gst_rate || 18,
          b.credit_days || 30
        );
        biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(bizInsert.lastInsertRowid);
      } else if (biz && c.business) {
        const b = c.business;
        db.prepare(`
          UPDATE businesses SET
            name = COALESCE(?, name),
            legal_name = COALESCE(?, legal_name),
            phone = COALESCE(?, phone),
            gstin = COALESCE(?, gstin)
          WHERE id = ?
        `).run(
          b.name || null,
          b.legal_name || b.name || null,
          b.phone || c.phone || null,
          b.gstin || null,
          biz.id
        );
      }

      if (biz && (!user.active_business_id || user.active_business_id !== biz.id)) {
        db.prepare('UPDATE users SET active_business_id = ? WHERE id = ?').run(biz.id, user.id);
      }

      // Sync customer parties defined for this client
      if (Array.isArray(c.parties) && biz) {
        for (const p of c.parties) {
          const pExists = db.prepare('SELECT id FROM parties WHERE business_id = ? AND lower(name) = ?').get(biz.id, p.name.toLowerCase());
          if (!pExists) {
            db.prepare(`
              INSERT INTO parties (business_id, type, name, contact_name, phone, email, city, state, state_code, opening_balance, balance_type, credit_limit, credit_days)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, '29', 0, 'DR', 50000, 30)
            `).run(biz.id, p.type || 'customer', p.name, p.contact_name || p.name, p.phone || null, p.email || null, p.city || 'Udupi', p.state || 'Karnataka');
          }
        }
      }

      // Ensure Mohammad Sayyad Zoheb is also registered as a Party (Customer) across other businesses
      // so if any other merchant/admin searches for Mohammad Sayyad Zoheb in Khata, he appears!
      const activeBizs = db.prepare('SELECT id FROM businesses').all();
      for (const ab of activeBizs) {
        const existingParty = db.prepare(
          'SELECT id FROM parties WHERE business_id = ? AND lower(name) = ?'
        ).get(ab.id, c.name.toLowerCase());

        if (!existingParty) {
          db.prepare(`
            INSERT INTO parties (business_id, type, name, contact_name, phone, email, city, state, state_code, opening_balance, balance_type, credit_limit, credit_days)
            VALUES (?, 'customer', ?, ?, ?, ?, ?, ?, '29', 0, 'DR', 50000, 30)
          `).run(
            ab.id,
            c.name,
            c.name,
            c.phone || null,
            cleanEmail,
            c.business?.city || 'Udupi',
            c.business?.state || 'Karnataka'
          );
        }
      }
    }

    // Always ensure "City Walk" customer is present across every business in the system
    const allBizs = db.prepare('SELECT id FROM businesses').all();
    for (const b of allBizs) {
      const cw = db.prepare('SELECT id FROM parties WHERE business_id = ? AND lower(name) = ?').get(b.id, 'city walk');
      if (!cw) {
        db.prepare(`
          INSERT INTO parties (business_id, type, name, contact_name, phone, email, city, state, state_code, opening_balance, balance_type, credit_limit, credit_days)
          VALUES (?, 'customer', 'City Walk', 'City Walk Customer', '9845099887', 'citywalk@example.com', 'Udupi', 'Karnataka', '29', 0, 'DR', 50000, 30)
        `).run(b.id);
      }
    }
  } catch (err) {
    console.error('[Persistent Clients Sync Error]:', err);
  }
}

/**
 * Saves all active businesses and their registered clients into the persistent registry
 */
function syncAllCurrentDataToRegistry(db) {
  try {
    const users = db.prepare("SELECT * FROM users WHERE role = 'owner'").all();
    const currentRegistry = loadRegistry();
    for (const u of users) {
      const biz = db.prepare('SELECT * FROM businesses WHERE owner_id = ?').get(u.id);
      if (!biz) continue;
      const parties = db.prepare("SELECT name, contact_name, phone, email, type, city, state FROM parties WHERE business_id = ?").all(biz.id);
      const entry = {
        name: u.name,
        email: u.email,
        phone: u.phone,
        plan: u.plan || 'yearly',
        expires_at: u.expires_at || '2028-12-31',
        status: u.status || 'active',
        business: {
          name: biz.name,
          legal_name: biz.legal_name,
          gstin: biz.gstin,
          pan: biz.pan,
          phone: biz.phone,
          city: biz.city,
          state: biz.state,
          state_code: biz.state_code,
          pincode: biz.pincode,
          invoice_prefix: biz.invoice_prefix,
          default_gst_rate: biz.default_gst_rate,
          credit_days: biz.credit_days
        },
        parties: parties.slice(0, 50)
      };
      saveToRegistry(entry);
    }
  } catch (err) {
    console.warn('[Sync All Registry Warning]:', err.message);
  }
}

module.exports = {
  loadRegistry,
  saveToRegistry,
  syncPersistentClients,
  syncAllCurrentDataToRegistry
};
