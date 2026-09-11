#!/usr/bin/env bash

set -euo pipefail

sudo tee /etc/apt/apt.conf.d/80-playwright-network-retries > /dev/null <<'EOF'
Acquire::Retries "3";
EOF

pnpm --filter=web exec playwright install --with-deps --only-shell chromium
