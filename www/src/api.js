/* Thin API client. Keeps the auth token + active business id on every request. */
const TOKEN_KEY = 'billpro.token';
const BIZ_KEY = 'billpro.business';
const USER_KEY = 'billpro.user';

let _token = null;
let _bizId = null;
let _user = null;

export const getToken = () => {
  if (_token) return _token;
  try {
    _token = localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    _token = null;
  }
  return _token;
};

export const setToken = (t) => {
  _token = t || null;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
};

export const getBizId = () => {
  if (_bizId) return _bizId;
  try {
    const v = localStorage.getItem(BIZ_KEY);
    _bizId = v && v !== 'null' && v !== 'undefined' ? v : null;
  } catch (e) {
    _bizId = null;
  }
  return _bizId;
};

export const setBizId = (id) => {
  _bizId = id ? String(id) : null;
  try {
    if (id) localStorage.setItem(BIZ_KEY, String(id));
    else localStorage.removeItem(BIZ_KEY);
  } catch (e) {}
};

export const getUser = () => {
  if (_user) return _user;
  try {
    const raw = localStorage.getItem(USER_KEY);
    _user = raw ? JSON.parse(raw) : null;
  } catch (e) {
    _user = null;
  }
  return _user;
};

export const setUser = (u) => {
  _user = u || null;
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  } catch (e) {}
};

/** Checks if a user has admin or owner role */
export const isAdmin = (user) => {
  const u = user || getUser();
  return !!(u && (u.role === 'admin' || u.role === 'owner'));
};

/* ============================================================
 * Standard Indian Time (IST, UTC+05:30) Client Engine
 * Software-level time calculation that does NOT sync from or rely
 * upon the client OS / system clock. Uses authoritative server
 * epoch calibrated against monotonic performance.now().
 * ============================================================ */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // 19,800,000 ms

let _serverBaseEpoch = null;
let _serverBasePerf = null;

export const syncServerTime = (serverEpochMs) => {
  if (typeof serverEpochMs === 'number' && !isNaN(serverEpochMs) && serverEpochMs > 0) {
    _serverBaseEpoch = serverEpochMs;
    _serverBasePerf = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  }
};

/**
 * Returns the authoritative epoch in milliseconds, immune to local system clock changes.
 */
export const getServerEpoch = () => {
  if (_serverBaseEpoch !== null && _serverBasePerf !== null && typeof performance !== 'undefined' && performance.now) {
    const elapsed = performance.now() - _serverBasePerf;
    return _serverBaseEpoch + elapsed;
  }
  return Date.now();
};

/**
 * Returns a Date object shifted so UTC methods output Indian Standard Time (+05:30).
 */
export const getIstDate = (epochMs = getServerEpoch()) => {
  const epoch = typeof epochMs === 'number' ? epochMs : (epochMs instanceof Date ? epochMs.getTime() : new Date(epochMs).getTime());
  return new Date(epoch + IST_OFFSET_MS);
};

/**
 * Returns today's date in IST ("YYYY-MM-DD"), authoritative and unsynced from client OS clock.
 */
export const today = () => {
  return getIstDate().toISOString().slice(0, 10);
};

/**
 * Returns current time in IST ("HH:mm:ss").
 */
export const nowTime = () => {
  return getIstDate().toISOString().slice(11, 19);
};

/**
 * Formatted current IST timestamp (e.g. "21 Oct 2026, 02:45 PM (IST)").
 */
export const nowIstFormatted = () => {
  const d = getIstDate();
  const iso = d.toISOString();
  return formatIstIso(iso);
};

export const monthStart = () => today().slice(0, 8) + '01';

export const fmtDate = (d) => {
  if (!d) return '-';
  const str = String(d).slice(0, 10);
  const parts = str.split('-');
  if (parts.length !== 3) return str;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(parts[1], 10) - 1;
  return `${parts[2]} ${months[monthIdx] || parts[1]} ${parts[0]}`;
};

export const fmtDateTime = (d) => {
  if (!d) return '-';
  // If it's a date object or epoch or ISO
  const epoch = typeof d === 'number' ? d : (d instanceof Date ? d.getTime() : new Date(d).getTime());
  if (isNaN(epoch)) return fmtDate(d);
  const istDate = new Date(epoch + IST_OFFSET_MS);
  return formatIstIso(istDate.toISOString());
};

function formatIstIso(iso) {
  const parts = iso.slice(0, 10).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const dateStr = `${parts[2]} ${months[monthIdx] || parts[1]} ${parts[0]}`;
  let hours = parseInt(iso.slice(11, 13), 10);
  const minutes = iso.slice(14, 16);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hoursStr = hours < 10 ? '0' + hours : '' + hours;
  return `${dateStr}, ${hoursStr}:${minutes} ${ampm} (IST)`;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-BillPro-Token'] = token;
  }
  const biz = opts.businessId || getBizId();
  if (biz && biz !== 'null' && biz !== 'undefined') headers['X-Business-Id'] = String(biz);
  const res = await fetch(path, {
    method,
    headers,
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined
  });

  // Extract server time for monotonic IST synchronization
  const serverTime = res.headers.get('x-server-time');
  if (serverTime) {
    syncServerTime(Number(serverTime));
  }

  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    if (res.status === 401 && opts.forceLogout) {
      setToken(null);
      setUser(null);
      window.dispatchEvent(new CustomEvent('billpro:signed-out'));
    }
    throw new ApiError(msg, res.status);
  }
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  // auth
  signup: async (b) => {
    const data = await request('POST', '/api/auth/signup', b, { silent: true });
    if (data && data.user) setUser(data.user);
    return data;
  },
  login: async (b) => {
    const data = await request('POST', '/api/auth/login', b, { silent: true });
    if (data && data.user) setUser(data.user);
    return data;
  },
  me: async (opts = {}) => {
    const data = await request('GET', '/api/auth/me', null, opts);
    if (data && data.user) setUser(data.user);
    return data;
  },
  updateMe: async (b) => {
    const data = await request('PUT', '/api/auth/me', b);
    if (data && data.user) setUser(data.user);
    return data;
  },
  changePassword: (b) => request('POST', '/api/auth/change-password', b),
  setActiveBusiness: (id) => request('POST', `/api/auth/active-business/${id}`),

  // authoritative Indian Standard Time
  time: () => request('GET', '/api/time'),

  // businesses
  businesses: () => request('GET', '/api/businesses'),
  createBusiness: (b) => request('POST', '/api/businesses', b),
  updateBusiness: (id, b) => request('PUT', `/api/businesses/${id}`, b),
  deleteBusiness: (id) => request('DELETE', `/api/businesses/${id}`),
  groupOverview: () => request('GET', '/api/businesses/group/overview'),
  staff: (id) => request('GET', `/api/businesses/${id}/staff`),
  addStaff: (id, b) => request('POST', `/api/businesses/${id}/staff`, b),
  resetStaffPassword: (businessId, staffId, newPassword) => request('PUT', `/api/businesses/${businessId}/staff/${staffId}/password`, { newPassword }),
  removeStaff: (id, sid) => request('DELETE', `/api/businesses/${id}/staff/${sid}`),

  // parties
  parties: (p) => request('GET', `/api/parties${qs(p)}`),
  searchParties: (q, type) => request('GET', `/api/parties/search${qs({ q, type })}`),
  party: (id) => request('GET', `/api/parties/${id}`),
  createParty: (b) => request('POST', '/api/parties', b),
  updateParty: (id, b) => request('PUT', `/api/parties/${id}`, b),
  deleteParty: (id) => request('DELETE', `/api/parties/${id}`),
  statement: (id, p) => request('GET', `/api/parties/${id}/statement${qs(p)}`),
  bulkImportParties: (parties, opts = {}) => request('POST', '/api/parties/bulk', { parties, ...opts }),

  // products
  products: (p) => request('GET', `/api/products${qs(p)}`),
  byBarcode: (code) => request('GET', `/api/products/by-barcode/${encodeURIComponent(code)}`),
  createProduct: (b) => request('POST', '/api/products', b),
  updateProduct: (id, b) => request('PUT', `/api/products/${id}`, b),
  deleteProduct: (id) => request('DELETE', `/api/products/${id}`),
  adjustStock: (id, b) => request('POST', `/api/products/${id}/stock`, b),
  productMoves: (id) => request('GET', `/api/products/${id}/moves`),
  bulkImportProducts: (items, opts = {}) => request('POST', '/api/products/bulk', { items, ...opts }),

  // documents
  documents: (p) => request('GET', `/api/documents${qs(p)}`),
  document: (id) => request('GET', `/api/documents/${id}`),
  createDocument: (b) => request('POST', '/api/documents', b),
  updateDocument: (id, b) => request('PUT', `/api/documents/${id}`, b),
  deleteDocument: (id) => request('DELETE', `/api/documents/${id}`),
  cancelDocument: (id) => request('POST', `/api/documents/${id}/cancel`),
  duplicateDocument: (id) => request('POST', `/api/documents/${id}/duplicate`),
  payDocument: (id, b) => request('POST', `/api/documents/${id}/payment`, b),
  ewaybill: (id, b) => request('POST', `/api/documents/${id}/ewaybill`, b),
  einvoice: (id) => request('POST', `/api/documents/${id}/einvoice`),
  docQr: (id) => request('GET', `/api/documents/${id}/qr`),
  share: (id, p) => request('GET', `/api/documents/${id}/share${qs(p)}`),
  overdue: () => request('GET', '/api/documents/reminders/overdue'),

  // transactions
  transactions: (p) => request('GET', `/api/transactions${qs(p)}`),
  createTransaction: (b) => request('POST', '/api/transactions', b),
  updateTransaction: (id, b) => request('PUT', `/api/transactions/${id}`, b),
  deleteTransaction: (id) => request('DELETE', `/api/transactions/${id}`),
  chargeInterest: (b) => request('POST', '/api/transactions/interest', b),

  // reports
  dashboard: () => request('GET', '/api/reports/dashboard'),
  gstr1: (p) => request('GET', `/api/reports/gstr1${qs(p)}`),
  gstr3b: (p) => request('GET', `/api/reports/gstr3b${qs(p)}`),
  purchasesReport: (p) => request('GET', `/api/reports/purchases${qs(p)}`),
  profit: (p) => request('GET', `/api/reports/profit${qs(p)}`),
  aging: () => request('GET', '/api/reports/aging'),
  daybook: (date) => request('GET', `/api/reports/daybook${qs({ date })}`)
};

/** URL for a PDF - opened in a new tab, so the token rides along as a query param. */
export const pdfUrl = (path, download = false) =>
  `/api/pdf/${path}?token=${encodeURIComponent(getToken() || '')}${download ? '&download=1' : ''}`;
export const csvUrl = (report, params) => `/api/reports/export/${report}${qs({ ...(params || {}), token: getToken() || '' })}`;

export const money = (n) =>
  '\u20B9' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const moneyShort = (n) => {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 10000000) return '\u20B9' + (v / 10000000).toFixed(2) + ' Cr';
  if (abs >= 100000) return '\u20B9' + (v / 100000).toFixed(2) + ' L';
  if (abs >= 1000) return '\u20B9' + (v / 1000).toFixed(1) + 'k';
  return '\u20B9' + v.toFixed(0);
};
