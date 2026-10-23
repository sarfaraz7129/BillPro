'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const SEED_REGISTRY_PATH = path.join(__dirname, 'persistent_registry.json');
const REGISTRY_PATH = process.env.BILLPRO_DATA_DIR
  ? path.join(process.env.BILLPRO_DATA_DIR, 'persistent_registry.json')
  : SEED_REGISTRY_PATH;

function ensureRegistryFile() {
  const dir = path.dirname(REGISTRY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(REGISTRY_PATH) && REGISTRY_PATH !== SEED_REGISTRY_PATH && fs.existsSync(SEED_REGISTRY_PATH)) {
    fs.copyFileSync(SEED_REGISTRY_PATH, REGISTRY_PATH);
  }
  if (REGISTRY_PATH !== SEED_REGISTRY_PATH && fs.existsSync(REGISTRY_PATH)) fs.chmodSync(REGISTRY_PATH, 0o600);
}

const hasPersistentRegistryStorage = () => Boolean(process.env.BILLPRO_DATA_DIR);

/**
 * Loads the registry array from persistent_registry.json
 */
function loadRegistry() {
  try {
    ensureRegistryFile();
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
    ensureRegistryFile();
    const list = loadRegistry();
    const cleanEmail = String(clientRecord.email || '').trim().toLowerCase();
    if (!cleanEmail) throw new Error('A client email is required for registry persistence');
    const previousEmail = String(clientRecord.previous_email || '').trim().toLowerCase();
    const currentIdx = list.findIndex((c) => String(c.email || '').trim().toLowerCase() === cleanEmail);
    const previousIdx = previousEmail ? list.findIndex((c) => String(c.email || '').trim().toLowerCase() === previousEmail) : -1;
    const idx = currentIdx >= 0 ? currentIdx : previousIdx;
    const record = { ...(idx >= 0 ? list[idx] : {}), ...clientRecord, email: cleanEmail };
    delete record.previous_email;
    if (clientRecord.password_hash && !clientRecord.password) delete record.password;
    if (idx >= 0) list[idx] = record;
    else list.push(record);

    // Upsert by email only. Phone numbers are not unique (family/shared business numbers).
    const deduped = list.filter((c, i) => {
      const email = String(c.email || '').trim().toLowerCase();
      if (previousEmail && previousEmail !== cleanEmail && email === previousEmail) return false;
      return i === list.findIndex((x) => String(x.email || '').trim().toLowerCase() === email);
    });
    const tempPath = `${REGISTRY_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(deduped, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, REGISTRY_PATH);
    return { ok: true, path: REGISTRY_PATH, isPersistent: hasPersistentRegistryStorage() };
  } catch (err) {
    console.warn('[Persistent Registry Save Warning]:', err.message);
    return { ok: false, error: err.message, isPersistent: hasPersistentRegistryStorage() };
  }
}

function removeFromRegistry(email) {
  try {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return { ok: false, error: 'Email is required' };
    const list = loadRegistry().filter((c) => String(c.email || '').trim().toLowerCase() !== cleanEmail);
    ensureRegistryFile();
    const tempPath = `${REGISTRY_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(list, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, REGISTRY_PATH);
    return { ok: true, isPersistent: hasPersistentRegistryStorage() };
  } catch (err) {
    console.warn('[Persistent Registry Remove Warning]:', err.message);
    return { ok: false, error: err.message, isPersistent: hasPersistentRegistryStorage() };
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
        const pwdHash = c.password_hash || bcrypt.hashSync(c.password || 'demo1234', 10);
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
          (c.plan === 'lifetime' || c.expires_at === null) ? null : (c.expires_at || '2028-12-31'),
          c.password || c.initial_password || null
        );
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(res.lastInsertRowid);
      } else {
        // Update credentials & profile to match persistent registry
        const pwdHash = c.password ? bcrypt.hashSync(c.password, 10) : (c.password_hash || user.password_hash);
        // The live database is authoritative for an existing user. A bundled or
        // stale registry snapshot must never downgrade a changed subscription.
        const hasDatabasePlan = Boolean(user.plan);
        const resolvedPlan = hasDatabasePlan ? user.plan : (c.plan || 'yearly');
        const resolvedExpiry = resolvedPlan === 'lifetime'
          ? null
          : (hasDatabasePlan ? user.expires_at : (c.expires_at !== undefined ? c.expires_at : '2028-12-31'));
        db.prepare(`
          UPDATE users 
          SET name = ?, phone = ?, password_hash = ?, initial_password = ?, status = ?, plan = ?, expires_at = ?
          WHERE id = ?
        `).run(
          c.name.trim(),
          c.phone ? String(c.phone).trim() : user.phone,
          pwdHash,
          c.password || c.initial_password || user.initial_password || null,
          c.status || user.status || 'active',
          resolvedPlan,
          resolvedExpiry,
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
            invoice_prefix, quoter_prefix, estimate_prefix, estimate_counter, default_bill_mode,
            default_gst_rate, credit_days, color
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QT', ?, ?, ?, ?, ?, '#4f46e5')
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
          b.estimate_prefix || 'EST-',
          b.estimate_counter || 1,
          b.default_bill_mode || 'estimate',
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
            gstin = COALESCE(?, gstin),
            default_bill_mode = COALESCE(?, default_bill_mode),
            estimate_prefix = COALESCE(?, estimate_prefix)
          WHERE id = ?
        `).run(
          b.name || null,
          b.legal_name || b.name || null,
          b.phone || c.phone || null,
          b.gstin || null,
          b.default_bill_mode || null,
          b.estimate_prefix || null,
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
        expires_at: u.plan === 'lifetime' ? null : (u.expires_at || '2028-12-31'),
        initial_password: u.initial_password || null,
        password_hash: u.password_hash,
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
  removeFromRegistry,
  hasPersistentRegistryStorage,
  syncPersistentClients,
  syncAllCurrentDataToRegistry
};
