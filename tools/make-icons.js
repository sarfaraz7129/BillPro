'use strict';
/** Generates the PWA icons (192 / 512 / maskable) as PNGs with pngjs - no native deps. */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const OUT = path.join(__dirname, '..', 'www', 'icons');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

/** Diagonal indigo -> violet gradient with a soft radial highlight. */
function gradient(size, from, to) {
  const img = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      let r = Math.round(from[0] + (to[0] - from[0]) * t);
      let g = Math.round(from[1] + (to[1] - from[1]) * t);
      let b = Math.round(from[2] + (to[2] - from[2]) * t);
      // radial highlight, top-left
      const dx = x / size - 0.28, dy = y / size - 0.24;
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.6) * 42;
      r = Math.min(255, r + glow); g = Math.min(255, g + glow); b = Math.min(255, b + glow);
      img.data[(y * size + x) * 4] = r;
      img.data[(y * size + x) * 4 + 1] = g;
      img.data[(y * size + x) * 4 + 2] = b;
      img.data[(y * size + x) * 4 + 3] = 255;
    }
  }
  return img;
}

/** Stamp a bold "B" built from rectangles so it stays crisp at every size. */
function drawB(img, size, padFrac, safe) {
  const set = (x, y, on) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    img.data[i] = on; img.data[i + 1] = on; img.data[i + 2] = on; img.data[i + 3] = 255;
  };
  const pad = Math.round(size * padFrac);
  const left = safe ? Math.round(size * 0.36) : pad;
  const right = size - (safe ? Math.round(size * 0.36) : pad);
  const top = safe ? Math.round(size * 0.34) : pad;
  const bottom = size - (safe ? Math.round(size * 0.34) : pad);
  const h = bottom - top;
  const w = right - left;
  const stem = Math.max(3, Math.round(w * 0.19));
  const bar = Math.max(2, Math.round(h * 0.16));

  // vertical stem
  for (let y = top; y < bottom; y++) for (let x = left; x < left + stem; x++) set(x, y, 255);
  // three horizontal bars (top, middle, bottom)
  [top, top + Math.round((h - bar) / 2), bottom - bar].forEach((yy) => {
    for (let y = yy; y < yy + bar; y++) for (let x = left; x < right - Math.round(w * 0.1); x++) set(x, y, 255);
  });
  // right bowls
  const bowlX = right - Math.round(w * 0.1);
  [
    { y0: top, y1: top + Math.round((h - bar) / 2) },
    { y0: top + Math.round((h - bar) / 2), y1: bottom }
  ].forEach((seg) => {
    for (let y = seg.y0; y < seg.y1; y++) for (let x = bowlX; x < right; x++) set(x, y, 255);
  });
  return img;
}

/** Round the corners by making outside pixels transparent. */
function roundCorners(img, size, radius) {
  const r = Math.round(size * radius);
  const corners = [[r, r], [size - r, r], [r, size - r], [size - r, size - r]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const outside = (x < r || x >= size - r) && (y < r || y >= size - r);
      if (!outside) continue;
      const c = corners[(x < r ? 0 : 2) + (y < r ? 0 : 1)];
      const dx = x - c[0], dy = y - c[1];
      if (dx * dx + dy * dy > r * r) {
        const i = (y * size + x) * 4;
        img.data[i + 3] = 0;
      }
    }
  }
  return img;
}

function write(img, name) {
  fs.writeFileSync(path.join(OUT, name), PNG.sync.write(img));
  console.log('wrote icons/' + name, fs.statSync(path.join(OUT, name)).size, 'bytes');
}

[[192, 'icon-192.png', false], [512, 'icon-512.png', false], [512, 'icon-maskable-512.png', true]].forEach(([size, name, maskable]) => {
  let img = gradient(size, [79, 70, 229], [139, 92, 246]);
  drawB(img, size, 0.24, maskable);
  if (!maskable) roundCorners(img, size, 0.22);
  write(img, name);
});

// Apple touch icon must be opaque and square
const apple = gradient(180, [79, 70, 229], [139, 92, 246]);
drawB(apple, 180, 0.24, false);
write(apple, 'apple-touch-icon.png');
