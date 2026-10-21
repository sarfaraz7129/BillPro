#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

TOKEN=""
if [ -f "$DIR/.github_token" ]; then
  TOKEN="$(tr -d '[:space:]' < "$DIR/.github_token")"
fi

if [ -z "$TOKEN" ]; then
  echo "Error: .github_token not found in $DIR"
  exit 1
fi

REPO="sarfaraz7129/BillPro"
REMOTE_URL="https://${TOKEN}@github.com/${REPO}.git"

# Set identity
git config user.name "BillPro Team"
git config user.email "team@billpro.in"

# Set remote with token
git remote set-url origin "$REMOTE_URL" 2>/dev/null || git remote add origin "$REMOTE_URL"

echo "[BillPro Deploy] Pushing current branch to https://github.com/${REPO}.git main..."
git push origin main
echo "[BillPro Deploy] Pushed successfully to GitHub! Render auto-deploy triggered."
