#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Checking sync status with upstream..."

git fetch upstream

# Compare upstream/main to your current main
echo
git status
echo

LOCAL=$(git rev-parse @)
# shellcheck disable=SC1083
UPSTREAM=$(git rev-parse @{u})
# shellcheck disable=SC1083
BASE=$(git merge-base @ @{u})

if [ "$LOCAL" = "$UPSTREAM" ]; then
  echo "✅ Your branch is up to date with upstream."
elif [ "$LOCAL" = "$BASE" ]; then
  echo "⬇️  You are behind upstream. You should run: make update"
elif [ "$UPSTREAM" = "$BASE" ]; then
  echo "⬆️  You are ahead of upstream (you have local changes not pushed upstream)."
else
  echo "⚠️  You have diverged from upstream!"
fi
