#!/usr/bin/env bash

set -euo pipefail

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required. Use a Codex base environment with Node.js 24 support."
  exit 1
fi

corepack enable
corepack prepare pnpm@10.33.0 --activate

pnpm install --frozen-lockfile

# Keep generated Prisma artifacts aligned after dependency or schema updates.
pnpm run db:generate
