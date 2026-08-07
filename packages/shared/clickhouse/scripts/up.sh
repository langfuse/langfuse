#!/bin/bash

# Load environment variables
[ -f ../../.env ] && source ../../.env

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

# Check if CLICKHOUSE_PASSWORD is set
if [ -z "${CLICKHOUSE_PASSWORD}" ]; then
  echo "Error: CLICKHOUSE_PASSWORD is not set."
  echo "Please set CLICKHOUSE_PASSWORD in your environment variables."
  exit 1
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

# Ensure CLICKHOUSE_CLUSTER_NAME is set
if [ -z "${CLICKHOUSE_CLUSTER_NAME}" ]; then
    export CLICKHOUSE_CLUSTER_NAME="default"
fi

# Select exactly one migration lineage. Sharded migrations are a fresh-cluster
# baseline and intentionally never run after the clustered lineage.
if [ "$CLICKHOUSE_SHARDING_ENABLED" = "true" ] && [ "$CLICKHOUSE_CLUSTER_ENABLED" = "false" ]; then
  echo "Error: CLICKHOUSE_SHARDING_ENABLED requires CLICKHOUSE_CLUSTER_ENABLED=true."
  exit 1
fi

if [ "$CLICKHOUSE_CLUSTER_ENABLED" = "false" ]; then
  MIGRATION_DIRECTORY="unclustered"
  if [ "$CLICKHOUSE_MIGRATION_SSL" = true ] ; then
      DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&secure=true&skip_verify=true&x-migrations-table-engine=MergeTree"
  else
      DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&x-migrations-table-engine=MergeTree"
  fi
else
  if [ "$CLICKHOUSE_SHARDING_ENABLED" = "true" ]; then
    MIGRATION_DIRECTORY="sharded"
  else
    MIGRATION_DIRECTORY="clustered"
  fi
  if [ "$CLICKHOUSE_MIGRATION_SSL" = true ] ; then
      DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&secure=true&skip_verify=true&x-cluster-name=${CLICKHOUSE_CLUSTER_NAME}&x-migrations-table-engine=ReplicatedMergeTree"
  else
      DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&x-cluster-name=${CLICKHOUSE_CLUSTER_NAME}&x-migrations-table-engine=ReplicatedMergeTree"
  fi
fi

echo "Applying ${MIGRATION_DIRECTORY} ClickHouse migrations."
migrate -source "file://clickhouse/migrations/${MIGRATION_DIRECTORY}" -database "$DATABASE_URL" up
