#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Restore node_modules if stripped by snapshot exclusion
if [ ! -d "$DIR/node_modules" ]; then
  if [ -f "$DIR/vendor_archive.tar.gz" ]; then
    echo "[BillPro] Restoring node_modules from vendor_archive.tar.gz..."
    tar -xzf "$DIR/vendor_archive.tar.gz"
  else
    echo "[BillPro] Installing npm packages..."
    npm install --no-audit --no-fund
  fi
fi

# Ensure frontend bundle is built
if [ ! -f "$DIR/www/app.js" ]; then
  echo "[BillPro] Building frontend bundle..."
  node tools/build.js
fi

export PORT=4173
export HOST=0.0.0.0
export NODE_ENV=production

echo "[BillPro] Starting server on http://0.0.0.0:4173..."
exec node server/index.js
