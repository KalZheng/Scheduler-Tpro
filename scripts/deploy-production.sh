#!/usr/bin/env bash
set -e

# Trap any unexpected error and print a clear recovery message
trap 'handle_error $? $LINENO' ERR

handle_error() {
  local exit_code=$1
  local line_no=$2
  echo ""
  echo "❌ ========================================================"
  echo "❌ DEPLOYMENT STOPPED DUE TO AN ERROR (Exit Code: $exit_code, Line: $line_no)"
  echo "❌ ========================================================"
  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  echo "📍 Current Branch: $current_branch"
  echo ""
  
  # Check if in the middle of a merge conflict
  if [ -d ".git" ] && [ -f ".git/MERGE_HEAD" ]; then
    echo "⚠️  A Git Merge Conflict occurred on '$current_branch'!"
    echo "   To cancel the merge and return to a clean state, run:"
    echo "     git merge --abort"
    echo "   Or resolve the conflict in your editor and commit the merge."
  else
    echo "💡 What happened:"
    echo "   - The script stopped immediately (safe exit)."
    echo "   - Subsequent branches were NOT deployed."
    echo "   - To return to master at any time, run:"
    echo "     git checkout master"
  fi
  echo "❌ ========================================================"
  exit "$exit_code"
}

echo "🚀 =========================================="
echo "🚀 Starting Production Multi-Branch Deploy"
echo "🚀 =========================================="

# 1. Ensure working directory is clean before starting
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Error: Working tree has uncommitted changes."
  echo "   Please commit or stash your changes before running deploy."
  exit 1
fi

# 2. Ensure we have the latest master
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "master" ]; then
  echo "📌 Switching to master..."
  git checkout master
fi

echo "🔄 Pulling latest master..."
git pull origin master || true

# ----------------------------------------------------
# Step 1: Puli Production (埔里酒廠)
# ----------------------------------------------------
echo ""
echo "=========================================="
echo "📦 [1/2] Deploying puli-production"
echo "=========================================="
git checkout puli-production
git pull origin puli-production || true
echo "🔀 Merging master into puli-production..."
git merge master --no-edit
echo "⬆️ Pushing puli-production to origin..."
git push origin puli-production
echo "🏗️ Building and deploying puli-production..."
bun run build

# ----------------------------------------------------
# Step 2: Jinan Production (濟南店)
# ----------------------------------------------------
echo ""
echo "=========================================="
echo "📦 [2/2] Deploying jinan-production"
echo "=========================================="
git checkout jinan-production
git pull origin jinan-production || true
echo "🔀 Merging master into jinan-production..."
git merge master --no-edit
echo "⬆️ Pushing jinan-production to origin..."
git push origin jinan-production
echo "🏗️ Building and deploying jinan-production..."
bun run build

# ----------------------------------------------------
# Step 3: Return to Master
# ----------------------------------------------------
echo ""
echo "=========================================="
echo "🔄 Returning to master branch"
echo "=========================================="
git checkout master

echo ""
echo "🎉 ========================================================"
echo "🎉 All production branches successfully deployed to FTP!"
echo "🎉 ========================================================"
