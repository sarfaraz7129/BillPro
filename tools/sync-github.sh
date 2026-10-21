#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

TOKEN=""
if [ -f ".github_token" ]; then
  TOKEN="$(tr -d '[:space:]' < ".github_token")"
fi

REPO="sarfaraz7129/BillPro"
if [ -n "$TOKEN" ]; then
  REMOTE_URL="https://${TOKEN}@github.com/${REPO}.git"
else
  REMOTE_URL="https://github.com/${REPO}.git"
fi

git config user.name "BillPro Team"
git config user.email "team@billpro.in"
git remote set-url origin "$REMOTE_URL" 2>/dev/null || git remote add origin "$REMOTE_URL"

echo "[Build] Running esbuild to verify bundle..."
node tools/build.js

git add .
MSG="${1:-"Update BillPro features and improvements"}"
if git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "[Git] No uncommitted changes detected."
else
  git commit -m "$MSG"
  echo "[Git] Committed changes: $MSG"
fi

echo "[Git] Pushing to origin main..."
git push origin main
echo "[Git] Pushed successfully to GitHub! Render auto-deploy triggered."
