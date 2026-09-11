#!/usr/bin/env bash

set -euo pipefail

readonly APT_MIRRORS_FILE="${PLAYWRIGHT_APT_MIRRORS_FILE:-/etc/apt/blacksmith-ubuntu-mirrors.txt}"
readonly APT_SOURCES_FILE="${PLAYWRIGHT_APT_SOURCES_FILE:-/etc/apt/sources.list.d/ubuntu.sources}"
readonly APT_CONFIG_FILE="${PLAYWRIGHT_APT_CONFIG_FILE:-/etc/apt/apt.conf.d/80-playwright-network-retries}"
readonly COMMUNITY_MIRRORS=(
  "https://mirror.pilotfiber.com/ubuntu/"
  "https://mirror.tzulo.com/ubuntu/"
)

sudo tee "${APT_CONFIG_FILE}" > /dev/null <<'EOF'
Acquire::Retries "3";
EOF

if [[ -f "${APT_MIRRORS_FILE}" && -f "${APT_SOURCES_FILE}" ]]; then
  # Entries without a priority are tried after Blacksmith's prioritized mirrors.
  for mirror in "${COMMUNITY_MIRRORS[@]}"; do
    if ! grep -Fqx "${mirror}" "${APT_MIRRORS_FILE}"; then
      printf '%s\n' "${mirror}" | sudo tee -a "${APT_MIRRORS_FILE}" > /dev/null
    fi
  done

  sudo sed -i -E \
    "s|https?://security\\.ubuntu\\.com/ubuntu/?|mirror+file:${APT_MIRRORS_FILE}|g" \
    "${APT_SOURCES_FILE}"
fi

pnpm --filter=web exec playwright install --with-deps --only-shell chromium
