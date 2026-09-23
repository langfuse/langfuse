#!/usr/bin/env bash
set -euo pipefail

# Environment loading belongs to the package command so caller-provided values
# (including an isolated test database) take precedence over the root .env.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
TARGET="${1:-all}"

usage() {
  cat <<'EOF'
Create the Topics development tables after applying the base migrations.

  pnpm --filter @langfuse/shared run topics:dev-tables [all|postgres|clickhouse]

Defaults to both databases. Existing tables and data are retained; this does
not upgrade older Topics schemas or record migration history. See
packages/shared/scripts/topics-dev-tables/README.md for the migration cutover.
EOF
}

if [[ "$TARGET" == "--help" || "$TARGET" == "-h" ]]; then
  usage
  exit 0
fi
if [[ $# -gt 1 || ! "$TARGET" =~ ^(all|postgres|clickhouse)$ ]]; then
  usage >&2
  exit 1
fi

# Validate both clients/configurations before applying any DDL.
if [[ "$TARGET" != "clickhouse" ]]; then
  : "${DATABASE_URL:?DATABASE_URL is required for Postgres setup}"
  export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"
  command -v pnpm >/dev/null || { echo "Error: pnpm is required." >&2; exit 1; }
fi

if [[ "$TARGET" != "postgres" ]]; then
  : "${CLICKHOUSE_MIGRATION_URL:?CLICKHOUSE_MIGRATION_URL is required for ClickHouse setup}"
  : "${CLICKHOUSE_USER:?CLICKHOUSE_USER is required for ClickHouse setup}"
  : "${CLICKHOUSE_PASSWORD?CLICKHOUSE_PASSWORD must be set (it may be empty)}"
  command -v clickhouse >/dev/null || { echo "Error: install the ClickHouse client." >&2; exit 1; }

  if [[ "$CLICKHOUSE_MIGRATION_URL" =~ ^clickhouse://([^:/]+)(:([0-9]+))?$ ]]; then
    CLICKHOUSE_HOST="${BASH_REMATCH[1]}"
    CLICKHOUSE_PORT="${BASH_REMATCH[3]:-9000}"
  else
    echo "Error: CLICKHOUSE_MIGRATION_URL must be clickhouse://host[:port]." >&2
    exit 1
  fi

  CLICKHOUSE_ARGS=(
    "--host=$CLICKHOUSE_HOST"
    "--port=$CLICKHOUSE_PORT"
    "--user=$CLICKHOUSE_USER"
    "--password=$CLICKHOUSE_PASSWORD"
    "--database=${CLICKHOUSE_DB:-default}"
    --multiquery
  )
  if [[ "${CLICKHOUSE_MIGRATION_SSL:-false}" == "true" ]]; then
    CLICKHOUSE_ARGS+=(--secure)
  fi
fi

cd -- "$SHARED_DIR"

if [[ "$TARGET" != "clickhouse" ]]; then
  echo "Creating Topics development tables in Postgres..."
  pnpm exec prisma db execute \
    --schema "$SHARED_DIR/prisma/schema.prisma" \
    --file "$SCRIPT_DIR/topics-dev-tables/postgres.sql"
fi

if [[ "$TARGET" != "postgres" ]]; then
  echo "Creating Topics development tables in ClickHouse..."
  clickhouse client "${CLICKHOUSE_ARGS[@]}" < "$SCRIPT_DIR/topics-dev-tables/clickhouse.sql"
fi

echo "Topics development tables created successfully (or already exist)."
