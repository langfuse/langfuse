#!/usr/bin/env bash

set -euo pipefail

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is required. Use a Codex base environment with Node.js 24 support."
  exit 1
fi

corepack enable
corepack prepare pnpm@10.33.0 --activate

# shellcheck source=/dev/null
source "$(dirname "${BASH_SOURCE[0]}")/cloud_services.sh"
ensure_cloud_dependencies

pnpm install --frozen-lockfile

# Keep generated Prisma artifacts aligned after dependency or schema updates.
pnpm run db:generate

# Keep local databases initialized for worker/web tests during maintenance runs.
pnpm --filter=shared run db:reset:test
pnpm --filter=shared run db:reset -f
SKIP_CONFIRM=1 pnpm --filter=shared run ch:reset
pnpm --filter=shared run db:seed:examples
