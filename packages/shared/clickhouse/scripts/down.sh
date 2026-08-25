#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables
[ -f ../../.env ] && source ../../.env

# Check if CLICKHOUSE_URL is configured
if [ -z "${CLICKHOUSE_URL}" ]; then
  echo "Info: CLICKHOUSE_URL not configured, skipping migration."
  exit 0
fi

# Check if golang-migrate is installed
if ! command -v migrate &> /dev/null
then
    echo "Error: golang-migrate is not installed or not in PATH."
    echo "Please install golang-migrate via 'brew install golang-migrate' to run this script."
    echo "Visit https://github.com/golang-migrate/migrate for more installation instructions."
    exit 1
fi

# Ensure CLICKHOUSE_DB is set
if [ -z "${CLICKHOUSE_DB}" ]; then
    export CLICKHOUSE_DB="default"
fi

# Default to the built-in ClickHouse cluster name when not configured.
export CLICKHOUSE_CLUSTER_NAME="${CLICKHOUSE_CLUSTER_NAME:-default}"

# Construct the database URL
if [ "$CLICKHOUSE_CLUSTER_ENABLED" == "false" ] ; then
  if [ "$CLICKHOUSE_MIGRATION_SSL" = true ] ; then
      DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&secure=true&skip_verify=true&x-migrations-table-engine=MergeTree"
  else
      DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&x-migrations-table-engine=MergeTree"
  fi

  # If SKIP_CONFIRM is set, automatically answer the confirmation prompt. Otherwise run interactively.
  if [ "$SKIP_CONFIRM" = "1" ] || [ "$SKIP_CONFIRM" = "true" ]; then
    printf 'y\n' | migrate -source file://clickhouse/migrations/unclustered -database "$DATABASE_URL" down
  else
    migrate -source file://clickhouse/migrations/unclustered -database "$DATABASE_URL" down
  fi
else
  source "$SCRIPT_DIR/prepare-clustered-migrations.sh"

  CLUSTERED_MIGRATIONS_DIR="$(prepare_clustered_migrations "$SCRIPT_DIR/../migrations/clustered" "$CLICKHOUSE_CLUSTER_NAME")" || exit 1
  trap 'rm -rf "$CLUSTERED_MIGRATIONS_DIR"' EXIT

  if [ "$CLICKHOUSE_MIGRATION_SSL" = true ] ; then
      DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&secure=true&skip_verify=true&x-cluster-name=${CLICKHOUSE_CLUSTER_NAME}&x-migrations-table-engine=ReplicatedMergeTree"
  else
      DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&x-cluster-name=${CLICKHOUSE_CLUSTER_NAME}&x-migrations-table-engine=ReplicatedMergeTree"
  fi

  # If SKIP_CONFIRM is set, automatically answer the confirmation prompt. Otherwise run interactively.
  if [ "$SKIP_CONFIRM" = "1" ] || [ "$SKIP_CONFIRM" = "true" ]; then
    printf 'y\n' | migrate -source "file://${CLUSTERED_MIGRATIONS_DIR}" -database "$DATABASE_URL" down
  else
    migrate -source "file://${CLUSTERED_MIGRATIONS_DIR}" -database "$DATABASE_URL" down
  fi
fi
