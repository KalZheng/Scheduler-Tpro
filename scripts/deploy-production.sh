#!/usr/bin/env bash
set -e

echo "🚀 =========================================="
echo "🚀 Starting Production Multi-Branch Deploy"
echo "🚀 =========================================="

# Ensure working directory is clean before starting
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Error: Working tree has uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Ensure we have the latest master
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "master" ]; then
  echo "📌 Switching to master..."
  git checkout master
fi

echo "🔄 Pulling latest master..."
git pull origin master || true

# ----------------------------------------------------
# 1. Puli Production (埔里酒廠)
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
# 2. Jinan Production (濟南店)
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
# 3. Return to Master
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
