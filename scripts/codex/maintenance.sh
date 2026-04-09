#!/usr/bin/env bash

set -euo pipefail

# setup.sh installs golang-migrate into ~/.local/bin for non-root environments.
# Ensure the same location is on PATH when maintenance runs in non-interactive
# shells (where profile PATH mutations may not be loaded).
export PATH="${HOME}/.local/bin:${PATH}"

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required. Use a Codex base environment with Node.js 24 support."
  exit 1
fi

corepack enable
corepack prepare pnpm@10.33.0 --activate

pnpm install --frozen-lockfile

# Keep generated Prisma artifacts aligned after dependency or schema updates.
pnpm run db:generate

if [ "${CODEX_ENABLE_DOCKER_DEV_INFRA:-0}" = "1" ]; then
  # Opt-in path for Codex cloud environments that include Docker support.
  # This keeps infra containers healthy across recurring maintenance runs.
  if ! command -v docker >/dev/null 2>&1; then
    echo "CODEX_ENABLE_DOCKER_DEV_INFRA=1 is set, but Docker is unavailable in this environment."
    exit 1
  fi

  # Recreate local infra containers during maintenance so refreshed images and
  # compose configuration changes are applied deterministically.
  pnpm run infra:dev:down
  pnpm run infra:dev:up --pull always

  # Reapply committed Prisma migrations after container recreation.
  pnpm --filter=shared run db:deploy

  # Setup installs golang-migrate for Docker-enabled environments. Fail fast
  # if it is unexpectedly missing so infra maintenance does not silently drift.
  if ! command -v migrate >/dev/null 2>&1; then
    echo "golang-migrate is required for ClickHouse migrations. Re-run CODEX_ENABLE_DOCKER_DEV_INFRA=1 bash scripts/codex/setup.sh."
    exit 1
  fi

  pnpm --filter=shared run ch:up
fi
