#!/bin/bash

# Load environment variables
[ -f ../../.env ] && source ../../.env

# Check if DORIS_URL is configured
if [ -z "${DORIS_URL}" ]; then
  echo "Info: DORIS_URL not configured, skipping migration."
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

# Create database if it doesn't exist
echo "Creating database ${DORIS_DB} if not exists..."
mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS ${DORIS_DB};"

if [ $? -ne 0 ]; then
    echo "Error: Failed to create database ${DORIS_DB}"
    exit 1
fi

# Create migration tracking table if it doesn't exist
echo "Creating migration tracking table..."
mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" "${DORIS_DB}" << EOF
CREATE TABLE IF NOT EXISTS schema_migrations (
    version varchar(255) NOT NULL,
    applied_at datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=OLAP
DUPLICATE KEY(version)
DISTRIBUTED BY HASH(version) BUCKETS 1
PROPERTIES (
    "replication_allocation" = "tag.location.default: 1"
);
EOF

if [ $? -ne 0 ]; then
    echo "Error: Failed to create schema_migrations table"
    exit 1
fi

# Function to check if migration is already applied
is_migration_applied() {
    local version=$1
    local count=$(mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" "${DORIS_DB}" -N -e "SELECT COUNT(*) FROM schema_migrations WHERE version = '${version}';")
    [ "$count" -gt 0 ]
}

# Function to mark migration as applied
mark_migration_applied() {
    local version=$1
    mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" "${DORIS_DB}" -e "INSERT INTO schema_migrations (version) VALUES ('${version}');"
}

# Execute migrations in order
MIGRATION_DIR="doris/migrations"
echo "Executing migrations from ${MIGRATION_DIR}..."

# Get all .up.sql files and sort them
for migration_file in $(ls ${MIGRATION_DIR}/*.up.sql | sort); do
    # Extract version from filename (e.g., 0001_traces.up.sql -> 0001_traces)
    version=$(basename "${migration_file}" .up.sql)
    
    echo "Processing migration: ${version}"
    
    # Check if migration is already applied
    if is_migration_applied "${version}"; then
        echo "  Migration ${version} already applied, skipping..."
        continue
    fi
    
    echo "  Applying migration ${version}..."
    
    # Execute the migration
    mysql -h"${DORIS_HOST}" -P"${DORIS_PORT}" -u"${DORIS_USER}" -p"${DORIS_PASSWORD}" "${DORIS_DB}" < "${migration_file}"
    
    if [ $? -eq 0 ]; then
        # Mark migration as applied
        mark_migration_applied "${version}"
        echo "  Migration ${version} applied successfully"
    else
        echo "  Error: Failed to apply migration ${version}"
        exit 1
    fi
done

echo "All migrations completed successfully!"
