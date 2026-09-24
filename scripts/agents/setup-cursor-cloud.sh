#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly apt_config_file="/etc/apt/apt.conf.d/80-playwright-network-retries"

cd "$repo_root"
bash scripts/agents/setup.sh

# Cursor's custom Ubuntu image needs Playwright's system libraries. Keep this
# privileged host mutation out of the shared Codex and local setup path.
if [[ -d /etc/apt/apt.conf.d ]]; then
  sudo tee "$apt_config_file" > /dev/null <<'EOF'
Acquire::Retries "3";
Acquire::IndexTargets::deb::DEP-11::DefaultEnabled "false";
EOF
fi

pnpm --filter web exec playwright install-deps chromium
