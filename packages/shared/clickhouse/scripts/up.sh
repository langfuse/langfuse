#!/bin/bash

# Load environment variables
source ../../.env

# Construct the database URL
if [ "$CLICKHOUSE_MIGRATION_SSL" = true ] ; then
    DATABASE_URL="clickhouse://${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=default&x-multi-statement=true&secure=true&skip_verify=true&x-migrations-table-engine=MergeTree"
else
    DATABASE_URL="clickhouse://${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=default&x-multi-statement=true&x-migrations-table-engine=MergeTree"
fi
# Execute the drop command
migrate -source file://clickhouse/migrations -database "$DATABASE_URL" up
