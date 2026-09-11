#!/usr/bin/env bash

set -euo pipefail

readonly APT_SOURCES_FILE="${PLAYWRIGHT_APT_SOURCES_FILE:-/etc/apt/sources.list.d/ubuntu.sources}"
readonly INSTALL_TIMEOUT_SECONDS=120
readonly MAX_FALLBACK_ATTEMPTS=3

install_playwright() {
  timeout --kill-after=10s "${INSTALL_TIMEOUT_SECONDS}" \
    pnpm --filter=web exec playwright install --with-deps --only-shell chromium
}

release_apt_locks() {
  local lock
  for lock in \
    /var/lib/apt/lists/lock \
    /var/cache/apt/archives/lock \
    /var/lib/dpkg/lock-frontend \
    /var/lib/dpkg/lock; do
    sudo fuser --kill "${lock}" > /dev/null 2>&1 || true
  done

  sudo dpkg --configure -a
}

if install_playwright; then
  exit 0
fi

echo "Playwright install via Blacksmith's Ubuntu mirror list failed; falling back to official Ubuntu HTTPS sources." >&2
release_apt_locks

if [[ ! -f "${APT_SOURCES_FILE}" ]]; then
  echo "Ubuntu apt sources file not found at ${APT_SOURCES_FILE}." >&2
  exit 1
fi

sudo sed -i \
  -e 's|mirror+file:/etc/apt/blacksmith-ubuntu-mirrors.txt|https://archive.ubuntu.com/ubuntu|g' \
  -e 's|http://security.ubuntu.com/ubuntu|https://security.ubuntu.com/ubuntu|g' \
  "${APT_SOURCES_FILE}"

if ! grep -q 'https://archive.ubuntu.com/ubuntu' "${APT_SOURCES_FILE}"; then
  echo "Could not configure the official Ubuntu archive fallback." >&2
  exit 1
fi

attempt=1
until install_playwright; do
  release_apt_locks

  if [[ "${attempt}" -ge "${MAX_FALLBACK_ATTEMPTS}" ]]; then
    echo "Playwright install failed after ${MAX_FALLBACK_ATTEMPTS} fallback attempts." >&2
    exit 1
  fi

  echo "Fallback attempt ${attempt} failed; retrying in 5s." >&2
  sleep 5
  attempt=$((attempt + 1))
done
