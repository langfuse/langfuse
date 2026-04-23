#!/bin/bash

# Load environment variables
[ -f ../../.env ] && source ../../.env

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

# Check if CLICKHOUSE_USER is set (required before URL-encoding to avoid the
# literal string "undefined" being injected into the connection URL).
if [ -z "${CLICKHOUSE_USER}" ]; then
  echo "Error: CLICKHOUSE_USER is not set."
  echo "Please set CLICKHOUSE_USER in your environment variables."
  exit 1
fi

# Check if CLICKHOUSE_PASSWORD is set (required before URL-encoding to avoid
# the literal string "undefined" being injected into the connection URL).
if [ -z "${CLICKHOUSE_PASSWORD}" ]; then
  echo "Error: CLICKHOUSE_PASSWORD is not set."
  echo "Please set CLICKHOUSE_PASSWORD in your environment variables."
  exit 1
fi

# URL-encode credentials to handle special characters safely
ENCODED_CLICKHOUSE_USER=$(node -e "console.log(encodeURIComponent(process.env.CLICKHOUSE_USER))")
ENCODED_CLICKHOUSE_PASSWORD=$(node -e "console.log(encodeURIComponent(process.env.CLICKHOUSE_PASSWORD))")

# Construct the database URL
if [ "$CLICKHOUSE_MIGRATION_SSL" = true ] ; then
    DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${ENCODED_CLICKHOUSE_USER}&password=${ENCODED_CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&secure=true&skip_verify=true&x-migrations-table-engine=MergeTree"
else
    DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${ENCODED_CLICKHOUSE_USER}&password=${ENCODED_CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&x-migrations-table-engine=MergeTree"
fi
# Execute the drop command
migrate -source file://clickhouse/migrations -database "$DATABASE_URL" drop
