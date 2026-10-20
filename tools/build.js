'use strict';
/** Bundles www/src (JSX) into www/app.js with esbuild. */
const esbuild = require('esbuild');
const path = require('path');

const watch = process.argv.includes('--watch');
const opts = {
  entryPoints: [path.join(__dirname, '..', 'www', 'src', 'main.jsx')],
  outfile: path.join(__dirname, '..', 'www', 'app.js'),
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  format: 'iife',
  target: ['chrome90', 'safari14', 'firefox90'],
  jsx: 'transform',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info'
};

if (watch) esbuild.context(opts).then((ctx) => ctx.watch());
else esbuild.build(opts).then(() => console.log('bundle written to www/app.js'));
