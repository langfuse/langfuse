#!/usr/bin/env bash
# Fail when the served OpenAPI specs under web/public/generated/ differ from
# the git tree. CI runs this after `pnpm run openapi:export` so a forgotten
# re-export becomes a blocking, self-explaining failure.

set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Must run inside a git work tree." >&2
  exit 1
fi

root="$(git rev-parse --show-toplevel)"
cd "$root"

generated_root="web/public/generated"
spec_paths=(
  "$generated_root/api/openapi.yml"
  "$generated_root/api-client/openapi.yml"
  "$generated_root/organizations-api/openapi.yml"
)

missing=0
for spec_path in "${spec_paths[@]}"; do
  if [ ! -f "$spec_path" ]; then
    echo "Missing served OpenAPI spec: $spec_path" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "Re-export with: pnpm run openapi:export" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error::Served OpenAPI spec files are missing under ${generated_root}/. Run: pnpm run openapi:export"
  fi
  exit 1
fi

status="$(git status --porcelain -- "$generated_root")"
if [ -z "$status" ]; then
  echo "Served OpenAPI specs match their Fern sources."
  exit 0
fi

{
  echo
  echo "Served OpenAPI specs are out of date with their Fern sources."
  echo "These files are what customers fetch at /generated/.../openapi.yml."
  echo
  echo "Re-export and commit the result:"
  echo
  echo "  pnpm run openapi:export"
  echo
  echo "Changed files:"
  git status --porcelain -- "$generated_root"
  echo
  git diff --stat -- "$generated_root"
} >&2

if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::error::Served OpenAPI specs drifted from fern/. Run: pnpm run openapi:export"
fi

exit 1
