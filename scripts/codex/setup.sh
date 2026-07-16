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
  echo "corepack is required. Use an environment with Node.js 24 support."
  exit 1
fi

corepack enable
corepack prepare pnpm@11.10.0 --activate

ensure_env_file .env .env.dev.example
ensure_env_file .env.test .env.test.example

pnpm install --frozen-lockfile

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if ! docker image inspect "langfuse-in-app-agent-sandbox:latest" >/dev/null 2>&1; then
    rm -f "packages/in-app-agent-sandbox-runtime/.local-image-built"
  fi

  pnpm turbo run build:docker-image --filter @repo/in-app-agent-sandbox-runtime --output-logs errors-only
else
  echo "Skipping local in-app agent sandbox image build because Docker is not available."
fi

# Install Chromium into the default user-level Playwright cache so frontend
# browser review works on first bootstrap.
pnpm run playwright:install

# Generate the shared Prisma client explicitly in the current worktree before
# the workspace-wide db:generate task, which may be satisfied by Turbo cache.
pnpm --filter=shared run db:generate

# Prisma client generation is needed for typecheck/build tasks.
pnpm run db:generate
