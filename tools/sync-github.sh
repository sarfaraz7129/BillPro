#!/usr/bin/env bash
set -e

# BillPro GitHub Sync Helper
# Usage:
#   1. Set remote and push first time:
#      ./tools/sync-github.sh https://github.com/<your-username>/billpro.git
#      or using Personal Access Token:
#      ./tools/sync-github.sh https://<TOKEN>@github.com/<your-username>/billpro.git
#
#   2. Push subsequent updates:
#      ./tools/sync-github.sh "Updated invoice customer balance feature"

cd "$(dirname "$0")/.."

# Ensure git repo is initialized
if [ ! -d ".git" ]; then
  git init -b main
  echo "[Git] Initialized empty Git repository on main branch."
fi

# Configure default author if not set
if [ -z "$(git config user.name)" ]; then
  git config user.name "BillPro Developer"
  git config user.email "dev@billpro.in"
fi

ARG="$1"
MSG="$2"

if [[ "$ARG" =~ ^https:// || "$ARG" =~ ^git@ ]]; then
  REMOTE_URL="$ARG"
  COMMIT_MSG="${MSG:-"Initial commit: BillPro Billing, Khata & Inventory Platform"}"
  
  if git remote | grep -q "^origin$"; then
    git remote set-url origin "$REMOTE_URL"
    echo "[Git] Updated origin remote to $REMOTE_URL"
  else
    git remote add origin "$REMOTE_URL"
    echo "[Git] Added origin remote $REMOTE_URL"
  fi
else
  COMMIT_MSG="${ARG:-"Update BillPro features and improvements"}"
fi

# Ensure frontend is built before commit
echo "[Build] Running esbuild to verify bundle..."
node tools/build.js

# Stage files (respects .gitignore)
git add .
git status -s

if git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "[Git] No uncommitted changes detected."
else
  git commit -m "$COMMIT_MSG"
  echo "[Git] Committed changes: $COMMIT_MSG"
fi

if git remote | grep -q "^origin$"; then
  echo "[Git] Pushing to origin main..."
  git push -u origin main
  echo "[Git] Successfully pushed to GitHub!"
  echo "[Render] If connected to Render, auto-deploy will trigger in a few seconds."
else
  echo ""
  echo "=================================================================="
  echo "Git repository is ready! To push to your GitHub repo, run:"
  echo "  ./tools/sync-github.sh https://github.com/<your-username>/<your-repo>.git"
  echo "=================================================================="
fi
