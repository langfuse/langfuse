#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$repo_root"
bash scripts/agents/setup.sh

# Cursor's custom Ubuntu image needs Playwright's system libraries. Keep this
# privileged host mutation out of the shared Codex and local setup path.
pnpm --filter web exec playwright install-deps chromium
