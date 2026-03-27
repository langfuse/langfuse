#!/usr/bin/env bash

set -euo pipefail

# Docker builds install dependencies from Turbo's pruned `out/json` tree before
# the full source tree (`out/full`) is copied into the image. In that install
# context, repo-owned agent files such as `scripts/agents/sync-agent-shims.mjs`
# and `.agents/config.json` are intentionally absent because they are not needed
# to resolve production dependencies.
#
# Root `postinstall` still runs during that pruned install step, but generating
# agent shims is only useful in a full repo checkout. Skip cleanly when the
# shared agent sync script is not available so Docker builds can continue.
if [[ ! -f "scripts/agents/sync-agent-shims.mjs" ]]; then
  echo "Skipping agent shim sync: scripts/agents/sync-agent-shims.mjs is not present in this install context."
  exit 0
fi

pnpm run agents:sync
pnpm run agents:check
