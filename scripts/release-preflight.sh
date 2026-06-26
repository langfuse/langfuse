#!/usr/bin/env bash

# Shared safety gates run before any path that promotes main to production.
# Sourced by release-cloud.sh and invoked standalone by the `release` script so
# both entry points enforce the same preconditions:
#   - the release is cut from `main`
#   - local `main` matches `origin/main`
#   - any migrations on main but not yet on production are confirmed as applied
# Helpers (log/fail/require_command) are exposed for sourcing callers to reuse.

set -euo pipefail

LOG_PREFIX="${LOG_PREFIX:-release}"
MIGRATION_CONFIRMATION_TOKEN="applied"

log() {
  echo "[${LOG_PREFIX}] $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "Required command '$command_name' is not installed."
  fi
}

ensure_on_main_branch() {
  local current_branch
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "main" ]]; then
    fail "Current branch is '$current_branch'. Switch to 'main' before running this command."
  fi
}

ensure_main_matches_origin() {
  git fetch origin main

  local local_main_sha
  local origin_main_sha
  local_main_sha="$(git rev-parse HEAD)"
  origin_main_sha="$(git rev-parse origin/main)"

  if [[ "$local_main_sha" != "$origin_main_sha" ]]; then
    fail "Local main ($local_main_sha) is not in sync with origin/main ($origin_main_sha)."
  fi

  log "Local main is in sync with origin/main ($local_main_sha)."
}

fetch_production_branch() {
  git fetch origin production

  if ! git show-ref --verify --quiet refs/remotes/origin/production; then
    fail "Could not find remote branch origin/production."
  fi
}

collect_prisma_migrations_not_in_production() {
  git diff --name-only origin/production..HEAD -- packages/shared/prisma/migrations \
    | awk -F/ 'NF >= 5 {print $5}' \
    | sort -u
}

collect_clickhouse_migrations_not_in_production() {
  git diff --name-only origin/production..HEAD -- packages/shared/clickhouse/migrations \
    | sed -E 's#.*/([0-9]+_[^.]+)\.(up|down)\.sql#\1#' \
    | sort -u
}

confirm_migrations_are_applied() {
  local prisma_migrations="$1"
  local clickhouse_migrations="$2"

  log "Detected migrations in main that are not yet on production."

  if [[ -n "$prisma_migrations" ]]; then
    log "Postgres (Prisma) migrations not yet promoted:"
    while IFS= read -r migration; do
      [[ -n "$migration" ]] && echo "  - $migration"
    done <<< "$prisma_migrations"
  fi

  if [[ -n "$clickhouse_migrations" ]]; then
    log "ClickHouse migrations not yet promoted:"
    while IFS= read -r migration; do
      [[ -n "$migration" ]] && echo "  - $migration"
    done <<< "$clickhouse_migrations"
  fi

  echo
  log "Confirm you have reviewed these migrations and applied them to the production Postgres and ClickHouse databases."
  read -r -p "Type '${MIGRATION_CONFIRMATION_TOKEN}' to continue: " confirmation

  if [[ "$confirmation" != "$MIGRATION_CONFIRMATION_TOKEN" ]]; then
    fail "Confirmation failed. Aborting release."
  fi
}

run_release_preflight() {
  ensure_on_main_branch
  ensure_main_matches_origin
  fetch_production_branch

  local prisma_migrations
  local clickhouse_migrations
  prisma_migrations="$(collect_prisma_migrations_not_in_production)"
  clickhouse_migrations="$(collect_clickhouse_migrations_not_in_production)"

  if [[ -n "$prisma_migrations" || -n "$clickhouse_migrations" ]]; then
    confirm_migrations_are_applied "$prisma_migrations" "$clickhouse_migrations"
  else
    log "No Prisma or ClickHouse migration differences detected between main and production."
  fi
}

# Run the gates when executed directly; do nothing extra when sourced.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_release_preflight
fi
