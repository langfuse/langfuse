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

if [ -z "${CLICKHOUSE_CLUSTER_NAME}" ]; then
    export CLICKHOUSE_CLUSTER_NAME="default"
fi

if [ "$CLICKHOUSE_SHARDING_ENABLED" = "true" ] && [ "$CLICKHOUSE_CLUSTER_ENABLED" = "false" ]; then
    echo "Error: CLICKHOUSE_SHARDING_ENABLED requires CLICKHOUSE_CLUSTER_ENABLED=true."
    exit 1
fi

# Construct the database URL
if [ "$CLICKHOUSE_CLUSTER_ENABLED" = "false" ]; then
  MIGRATION_DIRECTORY="unclustered"
  MIGRATION_TABLE_ENGINE="MergeTree"
  CLUSTER_QUERY=""
elif [ "$CLICKHOUSE_SHARDING_ENABLED" = "true" ]; then
  MIGRATION_DIRECTORY="sharded"
  MIGRATION_TABLE_ENGINE="ReplicatedMergeTree"
  CLUSTER_QUERY="&x-cluster-name=${CLICKHOUSE_CLUSTER_NAME}"
else
  MIGRATION_DIRECTORY="clustered"
  MIGRATION_TABLE_ENGINE="ReplicatedMergeTree"
  CLUSTER_QUERY="&x-cluster-name=${CLICKHOUSE_CLUSTER_NAME}"
fi

if [ "$CLICKHOUSE_MIGRATION_SSL" = true ] ; then
    DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&secure=true&skip_verify=true&x-migrations-table-engine=${MIGRATION_TABLE_ENGINE}${CLUSTER_QUERY}"
else
    DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&x-migrations-table-engine=${MIGRATION_TABLE_ENGINE}${CLUSTER_QUERY}"
fi
# Execute the drop command
migrate -source "file://clickhouse/migrations/${MIGRATION_DIRECTORY}" -database "$DATABASE_URL" drop
