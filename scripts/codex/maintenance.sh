#!/usr/bin/env bash

set -euo pipefail

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required. Use an environment with Node.js 24 support."
  exit 1
fi

corepack enable
corepack prepare pnpm@11.0.9 --activate

pnpm install --frozen-lockfile

# Keep generated Prisma artifacts aligned after dependency or schema updates.
pnpm run db:generate
