#!/usr/bin/env bash
set -euo pipefail

# Uses the repo-root .env through the existing seed CLI.
# Extra arguments (e.g. --project <id> or --dry-run) go to each invocation.
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
id_prefix="session-header-examples-$(date +%Y%m%d-%H%M%S)-$$"

pnpm --dir "$repo_root" run seed -- session-threads \
  --id-prefix "$id_prefix" \
  "$@"
