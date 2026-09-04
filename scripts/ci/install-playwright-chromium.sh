#!/usr/bin/env bash
# Installs the Chromium headless shell for the Playwright-driven CI jobs
# (Storybook browser tests, e2e tests).
#
# Deliberately without `--with-deps`: the runner image (GitHub's ubuntu-24.04,
# which Blacksmith boots as well) already ships every shared library Chromium
# needs, while `--with-deps` runs apt-get against Canonical's mirrors, an
# external dependency whose outages fail the job. apt is only a fallback,
# taken when a launch probe proves a library is missing (for example on a
# slimmer runner image); the warning annotation makes that path visible.
set -uo pipefail

cd "$(dirname "$0")/../.."

probe() {
  pnpm --filter=web exec node -e "require('@playwright/test').chromium.launch().then((browser) => browser.close())"
}

for attempt in 1 2 3; do
  if timeout 90 pnpm --filter=web exec playwright install --only-shell chromium; then
    break
  fi
  if [ "$attempt" -eq 3 ]; then
    echo "Playwright install failed after 3 attempts" >&2
    exit 1
  fi
  echo "Attempt $attempt failed, retrying in $((attempt * 10))s..." >&2
  sleep $((attempt * 10))
done

if probe; then
  exit 0
fi

echo "::warning title=Chromium launch probe failed::Installing Chromium OS dependencies via apt as a fallback. The runner image no longer ships them; check the runner label or image."
# One bounded attempt, no retry: `timeout` cannot reach the apt-get that
# playwright spawns via sudo, so a second attempt after a stall would only
# fail on the dpkg lock the first one still holds.
timeout 300 pnpm --filter=web exec playwright install-deps chromium
probe
