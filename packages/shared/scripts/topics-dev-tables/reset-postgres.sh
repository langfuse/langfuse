#!/usr/bin/env bash
set -euo pipefail

# Keep Prisma's reset flags on the reset command, including callers' -f.
pnpm exec prisma migrate reset "$@"
pnpm run topics:dev-tables postgres --apply
