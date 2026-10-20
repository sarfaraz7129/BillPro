'use strict';
/** Bundles www/src (JSX) into www/app.js with esbuild. */
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');
const outfile = path.join(__dirname, '..', 'www', 'app.js');

let esbuild;
try {
  esbuild = require('esbuild');
} catch (e) {
  if (fs.existsSync(outfile)) {
    console.log('[Build] esbuild module not found; using existing pre-bundled www/app.js');
    process.exit(0);
  }
  console.error('[Build] esbuild required to build www/app.js:', e.message);
  process.exit(1);
}

const opts = {
  entryPoints: [path.join(__dirname, '..', 'www', 'src', 'main.jsx')],
  outfile,
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  format: 'iife',
  target: ['chrome90', 'safari14', 'firefox90'],
  jsx: 'transform',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info'
};

if (watch) {
  esbuild.context(opts).then((ctx) => ctx.watch());
} else {
  esbuild.build(opts)
    .then(() => console.log('bundle written to www/app.js'))
    .catch((err) => {
      if (fs.existsSync(outfile)) {
        console.warn('[Build] Warning: esbuild build failed, but pre-bundled www/app.js exists. Using existing bundle:', err.message);
        process.exit(0);
      }
      console.error('[Build] esbuild build failed:', err);
      process.exit(1);
    });
}
