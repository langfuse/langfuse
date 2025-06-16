#!/bin/bash

# Load environment variables
[ -f ../../.env ] && source ../../.env

# Check if DORIS_URL is configured
if [ -z "${DORIS_URL}" ]; then
  echo "Info: DORIS_URL not configured, skipping drop operation."
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
    echo "Database ${DORIS_DB} does not exist. Nothing to drop."
    exit 0
fi

echo "⚠️  WARNING: This will permanently delete all tables and data in database '${DORIS_DB}'!"
echo "This action cannot be undone."
echo "Are you sure you want to continue? (y/N)"

# Check if running in CI or non-interactive mode
if [ "$CI" = "true" ] || [ "$LANGFUSE_DROP_FORCE" = "true" ]; then
    echo "Running in non-interactive mode, proceeding with drop..."
    CONFIRMATION="y"
else
    read -r CONFIRMATION
fi

if [ "$CONFIRMATION" != "y" ] && [ "$CONFIRMATION" != "Y" ]; then
    echo "Drop operation cancelled."
    exit 0
fi

echo "Dropping all tables in database ${DORIS_DB}..."

# Get list of all tables (excluding system tables)
TABLES=$(mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" "${DORIS_DB}" -N -e "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '${DORIS_DB}' AND TABLE_TYPE = 'BASE TABLE';" 2>/dev/null)

if [ -z "$TABLES" ]; then
    echo "No tables found in database ${DORIS_DB}."
else
    # Drop each table
    for table in $TABLES; do
        echo "Dropping table: $table"
        mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" "${DORIS_DB}" -e "DROP TABLE IF EXISTS \`$table\`;" 2>/dev/null
        
        if [ $? -eq 0 ]; then
            echo "  ✓ Table $table dropped successfully"
        else
            echo "  ✗ Failed to drop table $table"
        fi
    done
fi

echo "All tables dropped successfully!"
echo "Database ${DORIS_DB} is now empty and ready for fresh migrations." 