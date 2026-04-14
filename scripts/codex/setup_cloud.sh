#!/usr/bin/env bash

set -euo pipefail

ensure_env_file() {
  local target_path="$1"
  local fallback_path="$2"

  if [ -f "$target_path" ]; then
    return 0
  fi

  cp "$fallback_path" "$target_path"
}

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required. Use a Codex base environment with Node.js 24 support."
  exit 1
fi

corepack enable
corepack prepare pnpm@10.33.0 --activate

ensure_env_file .env .env.dev.example
ensure_env_file .env.test .env.test.example

# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/cloud_services.sh"
ensure_cloud_dependencies

pnpm install --frozen-lockfile

# Install Chromium into the default user-level Playwright cache so frontend
# browser review works on first bootstrap.
pnpm run playwright:install

# Generate the shared Prisma client explicitly in the current worktree before
# the workspace-wide db:generate task, which may be satisfied by Turbo cache.
pnpm --filter=shared run db:generate

# Prisma client generation is needed for typecheck/build tasks in Codex.
pnpm run db:generate

# Initialize local databases so worker/web tests can run immediately after
# bootstrap without "table does not exist" failures.
pnpm --filter=shared run db:reset:test
pnpm --filter=shared run db:reset -f
SKIP_CONFIRM=1 pnpm --filter=shared run ch:reset
pnpm --filter=shared run db:seed:examples
