import React from 'react';

/* Inline SVG icon set (no external icon font, works offline in the PWA). */
const S = (p) => (
  <svg width={p.size || 17} height={p.size || 17} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={p.w || 1.9} strokeLinecap="round" strokeLinejoin="round"
    style={p.style} className={p.className}>
    {p.children}
  </svg>
);

export const Icon = {
  dashboard: (p = {}) => <S {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></S>,
  invoice: (p = {}) => <S {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></S>,
  bill: (p = {}) => <S {...p}><path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h8M8 16h4" /></S>,
  pos: (p = {}) => <S {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20M7 15h4" /></S>,
  khata: (p = {}) => <S {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><path d="M9 7h7M9 11h4" /></S>,
  box: (p = {}) => <S {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" /></S>,
  chart: (p = {}) => <S {...p}><path d="M3 3v18h18" /><path d="M7 15l3-4 3 3 5-7" /></S>,
  settings: (p = {}) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></S>,
  users: (p = {}) => <S {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></S>,
  building: (p = {}) => <S {...p}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" /></S>,
  search: (p = {}) => <S {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></S>,
  plus: (p = {}) => <S {...p}><path d="M12 5v14M5 12h14" /></S>,
  close: (p = {}) => <S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>,
  x: (p = {}) => <S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>,
  check: (p = {}) => <S {...p}><path d="M20 6 9 17l-5-5" /></S>,
  chevDown: (p = {}) => <S {...p}><path d="m6 9 6 6 6-6" /></S>,
  chevRight: (p = {}) => <S {...p}><path d="m9 18 6-6-6-6" /></S>,
  chevLeft: (p = {}) => <S {...p}><path d="m15 18-6-6 6-6" /></S>,
  arrowLeft: (p = {}) => <S {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></S>,
  arrowRight: (p = {}) => <S {...p}><path d="M5 12h14M12 5l7 7-7 7" /></S>,
  menu: (p = {}) => <S {...p}><path d="M3 12h18M3 6h18M3 18h18" /></S>,
  logout: (p = {}) => <S {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></S>,
  print: (p = {}) => <S {...p}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /></S>,
  download: (p = {}) => <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></S>,
  upload: (p = {}) => <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></S>,
  image: (p = {}) => <S {...p}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></S>,
  camera: (p = {}) => <S {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></S>,
  whatsapp: (p = {}) => <S {...p}><path d="M3 21l1.65-4.5A9 9 0 1 1 12 21a9 9 0 0 1-4.3-1.1L3 21z" /><path d="M8.5 9.5c0 3 2.5 5.5 5.5 5.5 1 0 1.5-.7 1.5-1.5l-2-1-.9 1c-1-.5-2-1.5-2.5-2.5l1-.9-1-2c-.8 0-1.6.5-1.6 1.4z" /></S>,
  share: (p = {}) => <S {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></S>,
  edit: (p = {}) => <S {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></S>,
  trash: (p = {}) => <S {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></S>,
  copy: (p = {}) => <S {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></S>,
  ban: (p = {}) => <S {...p}><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></S>,
  truck: (p = {}) => <S {...p}><rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></S>,
  stamp: (p = {}) => <S {...p}><path d="M5 22h14M6 18h12l-1-4a3 3 0 0 0-3-2h-4a3 3 0 0 0-3 2z" /><path d="M10 12V7a2 2 0 1 1 4 0v5" /></S>,
  rupee: (p = {}) => <S {...p}><path d="M6 3h12M6 8h12M6 21l7-8c3 0 5-1.5 5-4.5" /></S>,
  arrowUp: (p = {}) => <S {...p}><path d="M12 19V5M5 12l7-7 7 7" /></S>,
  arrowDown: (p = {}) => <S {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></S>,
  alert: (p = {}) => <S {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></S>,
  clock: (p = {}) => <S {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></S>,
  wallet: (p = {}) => <S {...p}><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></S>,
  tag: (p = {}) => <S {...p}><path d="M20.59 13.41 12 22l-9-9V3h10z" /><path d="M7 7h.01" /></S>,
  file: (p = {}) => <S {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></S>,
  shield: (p = {}) => <S {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></S>,
  barcode: (p = {}) => <S {...p}><path d="M3 5v14M7 5v14M11 5v14M15 5v10M19 5v14M22 5v14" /></S>,
  layers: (p = {}) => <S {...p}><path d="m12 2 10 6-10 6L2 8z" /><path d="m2 16 10 6 10-6M2 12l10 6 10-6" /></S>,
  refresh: (p = {}) => <S {...p}><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></S>,
  phone: (p = {}) => <S {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></S>,
  mail: (p = {}) => <S {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></S>,
  sparkles: (p = {}) => <S {...p}><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></S>,
  zap: (p = {}) => <S {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></S>,
  filter: (p = {}) => <S {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54z" /></S>,
  cal: (p = {}) => <S {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></S>,
  eye: (p = {}) => <S {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></S>,
  swap: (p = {}) => <S {...p}><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></S>,
  lock: (p = {}) => <S {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></S>,
  cloud: (p = {}) => <S {...p}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></S>,
  wifiOff: (p = {}) => <S {...p}><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" /></S>
};

export const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const colorFor = (seed) => {
  const palette = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0d9488'];
  let h = 0;
  String(seed || '').split('').forEach((c) => { h = (h * 31 + c.charCodeAt(0)) % 9973; });
  return palette[h % palette.length];
};
