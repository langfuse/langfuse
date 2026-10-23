#!/bin/sh

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)

# Load environment variables
[ -f ../../.env ] && . ../../.env

# The migrate drop command only removes tables on the connected server.
if [ "$CLICKHOUSE_CLUSTER_ENABLED" != "false" ]; then
    echo "Error: ch:drop requires CLICKHOUSE_CLUSTER_ENABLED=false. Use ch:down for clustered migrations."
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

# Ensure CLICKHOUSE_DB is set
if [ -z "${CLICKHOUSE_DB}" ]; then
    export CLICKHOUSE_DB="default"
fi

# Construct the database URL
if [ "$CLICKHOUSE_MIGRATION_SSL" = true ] ; then
    DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&secure=true&skip_verify=true&x-migrations-table-engine=MergeTree"
else
    DATABASE_URL="${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=${CLICKHOUSE_DB}&x-multi-statement=true&x-migrations-table-engine=MergeTree"
fi
# Drop does not execute migration SQL, so the canonical source needs no rendering.
MIGRATIONS_DIRECTORY="$SCRIPT_DIR/../migrations/canonical"
if [ "$SKIP_CONFIRM" = "1" ] || [ "$SKIP_CONFIRM" = "true" ]; then
    migrate -source "file://${MIGRATIONS_DIRECTORY}" -database "$DATABASE_URL" drop -f
else
    migrate -source "file://${MIGRATIONS_DIRECTORY}" -database "$DATABASE_URL" drop
fi
