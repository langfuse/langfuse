#!/bin/bash

# Load environment variables
source ../../.env

# Construct the database URL
DATABASE_URL="clickhouse://${CLICKHOUSE_MIGRATION_URL}?username=${CLICKHOUSE_USER}&password=${CLICKHOUSE_PASSWORD}&database=langfuse&x-multi-statement=true"


echo $DATABASE_URL
# Execute the drop command
migrate -source file://clickhouse/migrations -database "$DATABASE_URL" drop
