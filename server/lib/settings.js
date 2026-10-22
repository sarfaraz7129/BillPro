'use strict';
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'system-settings.json');

const FALLBACK_DEFAULTS = {
  sales_whatsapp: '919880735072',
  sales_phone: '+91 9880735072',
  public_signup_enabled: '0',
  pricing_monthly: '300',
  pricing_yearly: '3000',
  pricing_lifetime: '20000'
};

function readConfigFile() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return { ...FALLBACK_DEFAULTS, ...parsed };
    }
  } catch (err) {
    console.warn('[Settings] Failed to read config/system-settings.json:', err.message);
  }
  return { ...FALLBACK_DEFAULTS };
}

function writeConfigFile(settings) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = readConfigFile();
    const merged = { ...current, ...settings };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.warn('[Settings] Failed to write config/system-settings.json:', err.message);
    return false;
  }
}

function initSystemSettings(db) {
  const config = readConfigFile();
  const upsert = db.prepare(`
    INSERT INTO system_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  Object.entries(config).forEach(([k, v]) => {
    upsert.run(k, String(v));
  });

  // Upgrade any legacy placeholder defaults that might still linger in the database
  const upgradeIfOld = (key, oldVal, newVal) => {
    try {
      db.prepare('UPDATE system_settings SET value = ? WHERE key = ? AND value = ?').run(newVal, key, oldVal);
    } catch (_) {}
  };

  upgradeIfOld('sales_whatsapp', '919845012345', config.sales_whatsapp);
  upgradeIfOld('sales_phone', '+91 98450 12345', config.sales_phone);
  upgradeIfOld('pricing_monthly', '499', config.pricing_monthly);
  upgradeIfOld('pricing_yearly', '2999', config.pricing_yearly);
  upgradeIfOld('pricing_lifetime', '7999', config.pricing_lifetime);
}

function getSystemSettings(db) {
  const config = readConfigFile();
  try {
    const rows = db.prepare('SELECT key, value FROM system_settings').all();
    const dbMap = {};
    for (const r of rows) dbMap[r.key] = r.value;
    return {
      sales_whatsapp: dbMap.sales_whatsapp || config.sales_whatsapp,
      sales_phone: dbMap.sales_phone || config.sales_phone,
      public_signup_enabled: (dbMap.public_signup_enabled !== undefined ? dbMap.public_signup_enabled : config.public_signup_enabled) === '1',
      pricing_monthly: Number(dbMap.pricing_monthly || config.pricing_monthly),
      pricing_yearly: Number(dbMap.pricing_yearly || config.pricing_yearly),
      pricing_lifetime: Number(dbMap.pricing_lifetime || config.pricing_lifetime)
    };
  } catch (_) {
    return {
      sales_whatsapp: config.sales_whatsapp,
      sales_phone: config.sales_phone,
      public_signup_enabled: config.public_signup_enabled === '1',
      pricing_monthly: Number(config.pricing_monthly),
      pricing_yearly: Number(config.pricing_yearly),
      pricing_lifetime: Number(config.pricing_lifetime)
    };
  }
}

function updateSystemSettings(db, payload) {
  const { sales_whatsapp, sales_phone, public_signup_enabled, pricing_monthly, pricing_yearly, pricing_lifetime } = payload || {};
  const toSave = {};

  const upsert = db.prepare(`
    INSERT INTO system_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  if (sales_whatsapp !== undefined) {
    const val = String(sales_whatsapp).trim();
    upsert.run('sales_whatsapp', val);
    toSave.sales_whatsapp = val;
  }
  if (sales_phone !== undefined) {
    const val = String(sales_phone).trim();
    upsert.run('sales_phone', val);
    toSave.sales_phone = val;
  }
  if (public_signup_enabled !== undefined) {
    const val = public_signup_enabled ? '1' : '0';
    upsert.run('public_signup_enabled', val);
    toSave.public_signup_enabled = val;
  }
  if (pricing_monthly !== undefined) {
    const val = String(pricing_monthly);
    upsert.run('pricing_monthly', val);
    toSave.pricing_monthly = val;
  }
  if (pricing_yearly !== undefined) {
    const val = String(pricing_yearly);
    upsert.run('pricing_yearly', val);
    toSave.pricing_yearly = val;
  }
  if (pricing_lifetime !== undefined) {
    const val = String(pricing_lifetime);
    upsert.run('pricing_lifetime', val);
    toSave.pricing_lifetime = val;
  }

  // Persist to JSON config file
  writeConfigFile(toSave);
}

module.exports = {
  FALLBACK_DEFAULTS,
  readConfigFile,
  writeConfigFile,
  initSystemSettings,
  getSystemSettings,
  updateSystemSettings
};
