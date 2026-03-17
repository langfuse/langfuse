#!/usr/bin/env bash

set -euo pipefail

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required. Use a Codex base environment with Node.js 24 support."
  exit 1
fi

corepack enable
corepack prepare pnpm@9.5.0 --activate

if [ ! -f .env ]; then
  cp .env.dev.example .env
fi

if [ ! -f .env.test ]; then
  cp .env.test.example .env.test
fi

pnpm install --frozen-lockfile

# Prisma client generation is needed for typecheck/build tasks in Codex.
pnpm run db:generate
