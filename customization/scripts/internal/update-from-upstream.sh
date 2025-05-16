#!/usr/bin/env bash
set -euo pipefail

echo "📥 Fetching and merging updates from upstream..."

git fetch upstream
git merge upstream/main

echo "✅ Upstream changes merged. Resolve conflicts if needed."
