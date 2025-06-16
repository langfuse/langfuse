#!/bin/bash

# Load environment variables
[ -f ../../.env ] && source ../../.env

# Check if DORIS_URL is configured
if [ -z "${DORIS_URL}" ]; then
  echo "Info: DORIS_URL not configured, skipping migration rollback."
  exit 0
fi

# Check if mysql client is installed (Doris uses MySQL protocol)
if ! command -v mysql &> /dev/null
then
    echo "Error: mysql client is not installed or not in PATH."
    echo "Please install mysql client to run this script."
    exit 1
fi

# Ensure DORIS_DB is set
if [ -z "${DORIS_DB}" ]; then
    export DORIS_DB="langfuse"
fi

# Ensure DORIS_USER is set
if [ -z "${DORIS_USER}" ]; then
    export DORIS_USER="root"
fi

# Parse DORIS_URL to extract host and port
# Expected format: http://host:port or https://host:port or just host:port
if [[ $DORIS_URL =~ ^https?://([^:]+):([0-9]+) ]]; then
    # Format: http://host:port or https://host:port
    DORIS_HOST="${BASH_REMATCH[1]}"
    DORIS_PORT="${BASH_REMATCH[2]}"
elif [[ $DORIS_URL =~ ^https?://([^:/]+) ]]; then
    # Format: http://host or https://host (no port)
    DORIS_HOST="${BASH_REMATCH[1]}"
    DORIS_PORT="9030"
elif [[ $DORIS_URL =~ ^([^:]+):([0-9]+)$ ]]; then
    # Format: host:port
    DORIS_HOST="${BASH_REMATCH[1]}"
    DORIS_PORT="${BASH_REMATCH[2]}"
else
    # Format: just host
    DORIS_HOST="$DORIS_URL"
    DORIS_PORT="9030"
fi

echo "Connecting to Doris at ${DORIS_HOST}:${DORIS_PORT} with database ${DORIS_DB}"

# Check if database exists
DB_EXISTS=$(mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" -N -e "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${DORIS_DB}';" 2>/dev/null | wc -l)

if [ "$DB_EXISTS" -eq 0 ]; then
    echo "Database ${DORIS_DB} does not exist. Nothing to rollback."
    exit 0
fi

# Check if migration tracking table exists
TABLE_EXISTS=$(mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" "${DORIS_DB}" -N -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${DORIS_DB}' AND TABLE_NAME = 'schema_migrations';" 2>/dev/null)

if [ "$TABLE_EXISTS" -eq 0 ]; then
    echo "Migration tracking table does not exist. Nothing to rollback."
    exit 0
fi

# Function to get the latest migration
get_latest_migration() {
    mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" "${DORIS_DB}" -N -e "SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1;" 2>/dev/null
}

# Function to remove migration from tracking table
remove_migration_record() {
    local version=$1
    mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" "${DORIS_DB}" -e "DELETE FROM schema_migrations WHERE version = '${version}';"
}

# Get the latest migration to rollback
LATEST_MIGRATION=$(get_latest_migration)

if [ -z "$LATEST_MIGRATION" ]; then
    echo "No migrations found to rollback."
    exit 0
fi

echo "Rolling back migration: ${LATEST_MIGRATION}"

# Look for the corresponding down migration file
MIGRATION_DIR="doris/migrations"
DOWN_FILE="${MIGRATION_DIR}/${LATEST_MIGRATION}.down.sql"

if [ ! -f "$DOWN_FILE" ]; then
    echo "Error: Down migration file not found: ${DOWN_FILE}"
    echo "Cannot rollback migration ${LATEST_MIGRATION}"
    exit 1
fi

echo "Executing down migration: ${DOWN_FILE}"

# Execute the down migration
mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" "${DORIS_DB}" < "${DOWN_FILE}"

if [ $? -eq 0 ]; then
    # Remove migration record from tracking table
    remove_migration_record "${LATEST_MIGRATION}"
    echo "Migration ${LATEST_MIGRATION} rolled back successfully"
else
    echo "Error: Failed to rollback migration ${LATEST_MIGRATION}"
    exit 1
fi

echo "Rollback completed successfully!"
