#!/bin/sh

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)

# Load environment variables
[ -f ../../.env ] && . ../../.env

# Check if CLICKHOUSE_URL is configured
if [ -z "${CLICKHOUSE_URL}" ]; then
  echo "Error: CLICKHOUSE_URL is not configured."
  echo "Please set CLICKHOUSE_URL in your environment variables."
  exit 1
fi

# Check if CLICKHOUSE_MIGRATION_URL is configured
if [ -z "${CLICKHOUSE_MIGRATION_URL}" ]; then
  echo "Error: CLICKHOUSE_MIGRATION_URL is not configured."
  echo "Please set CLICKHOUSE_MIGRATION_URL in your environment variables."
  exit 1
fi

# Check if CLICKHOUSE_USER is set
if [ -z "${CLICKHOUSE_USER}" ]; then
  echo "Error: CLICKHOUSE_USER is not set."
  echo "Please set CLICKHOUSE_USER in your environment variables."
  exit 1
fi

# Check if CLICKHOUSE_PASSWORD is set. An explicitly empty value is accepted
# to support instances whose user has no password (matches the application,
# which validates the password as a plain string and allows "").
if [ -z "${CLICKHOUSE_PASSWORD+x}" ]; then
  echo "Error: CLICKHOUSE_PASSWORD is not set."
  echo "Please set CLICKHOUSE_PASSWORD in your environment variables."
  exit 1
fi

# Check if golang-migrate is installed
if ! command -v migrate >/dev/null 2>&1
then
    echo "Error: golang-migrate is not installed or not in PATH."
    echo "Please install golang-migrate via 'brew install golang-migrate' to run this script."
    echo "Visit https://github.com/golang-migrate/migrate for more installation instructions."
    exit 1
fi

require_node() {
  if ! command -v node >/dev/null 2>&1
  then
      echo "Error: node is not installed or not in PATH."
      exit 1
  fi
}

# Ensure CLICKHOUSE_DB is set
export CLICKHOUSE_DB="${CLICKHOUSE_DB:-default}"

# Ensure CLICKHOUSE_CLUSTER_NAME is set
export CLICKHOUSE_CLUSTER_NAME="${CLICKHOUSE_CLUSTER_NAME:-default}"

MIGRATION_MODE="clustered"
MIGRATIONS_TABLE_ENGINE="ReplicatedMergeTree"
CLICKHOUSE_CLUSTER_QUERY=""
if [ "$CLICKHOUSE_CLUSTER_ENABLED" = "false" ]; then
  MIGRATION_MODE="unclustered"
  MIGRATIONS_TABLE_ENGINE="MergeTree"
else
  if [ "$CLICKHOUSE_CLUSTER_NAME" = "default" ]; then
    CLICKHOUSE_CLUSTER_NAME_ENCODED="default"
  else
    require_node
    if ! CLICKHOUSE_CLUSTER_NAME_ENCODED=$(node "$SCRIPT_DIR/prepare-migrations.mjs" encode-cluster-name "$CLICKHOUSE_CLUSTER_NAME"); then
      exit 1
    fi
  fi
  CLICKHOUSE_CLUSTER_QUERY="&x-cluster-name=${CLICKHOUSE_CLUSTER_NAME_ENCODED}"
fi

CANONICAL_MIGRATIONS_DIRECTORY="$SCRIPT_DIR/../migrations/canonical"
if [ ! -d "$CANONICAL_MIGRATIONS_DIRECTORY" ]; then
  echo "Error: canonical ClickHouse migration templates are missing."
  exit 1
fi

DELIVERED_MIGRATIONS_DIRECTORY="$SCRIPT_DIR/../migrations/$MIGRATION_MODE"
USE_DELIVERED_MIGRATIONS="false"
if [ -f "$DELIVERED_MIGRATIONS_DIRECTORY/0001_traces.up.sql" ]; then
  if [ "$MIGRATION_MODE" = "unclustered" ] || [ "$CLICKHOUSE_CLUSTER_NAME" = "default" ]; then
    USE_DELIVERED_MIGRATIONS="true"
  fi
fi

MIGRATIONS_DIRECTORY_IS_TEMP="false"
if [ "$USE_DELIVERED_MIGRATIONS" = "true" ]; then
  MIGRATIONS_DIRECTORY="$DELIVERED_MIGRATIONS_DIRECTORY"
else
  require_node
  if ! MIGRATIONS_DIRECTORY=$(node "$SCRIPT_DIR/prepare-migrations.mjs" render "$CANONICAL_MIGRATIONS_DIRECTORY" "$MIGRATION_MODE" "$CLICKHOUSE_CLUSTER_NAME"); then
    exit 1
  fi
  MIGRATIONS_DIRECTORY_IS_TEMP="true"
fi

cleanup_migrations() {
  if [ "$MIGRATIONS_DIRECTORY_IS_TEMP" = "true" ] && [ -n "${MIGRATIONS_DIRECTORY:-}" ]; then
    rm -rf -- "$MIGRATIONS_DIRECTORY"
  fi
}
trap cleanup_migrations 0

# Construct the database URL
DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true"
if [ "$CLICKHOUSE_MIGRATION_SSL" = true ] ; then
  DATABASE_URL="${DATABASE_URL}&secure=true&skip_verify=true"
fi
DATABASE_URL="${DATABASE_URL}${CLICKHOUSE_CLUSTER_QUERY}&x-migrations-table-engine=${MIGRATIONS_TABLE_ENGINE}"

# Execute the up command against delivered or custom-rendered migrations.
migrate -source "file://${MIGRATIONS_DIRECTORY}" -database "$DATABASE_URL" up
