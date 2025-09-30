#!/bin/sh

# Fix for Prisma P1013 error: encode special characters in DATABASE_URL
# This prevents issues when username or password contains special characters like @, :, /, etc.
# The script only encodes when necessary and prevents double-encoding for backwards compatibility
if [ -n "$DATABASE_URL" ]; then
    DATABASE_URL=$(./packages/shared/scripts/encode-db-url.sh "$DATABASE_URL")
    export DATABASE_URL
fi

# Check if CLICKHOUSE_URL is not set
if [ -z "$CLICKHOUSE_URL" ]; then
    echo "Error: CLICKHOUSE_URL is not configured. Migrating from V2? Check out migration guide: https://langfuse.com/self-hosting/upgrade-guides/upgrade-v2-to-v3"
    exit 1
fi

# Set DIRECT_URL to the value of DATABASE_URL if it is not set, required for migrations
if [ -z "$DIRECT_URL" ]; then
    export DIRECT_URL="${DATABASE_URL}"
fi

# Always execute the postgres migration, except when disabled.
if [ "$LANGFUSE_AUTO_POSTGRES_MIGRATION_DISABLED" != "true" ]; then
    prisma db execute --url "$DIRECT_URL" --file "./packages/shared/scripts/cleanup.sql"

    # Apply migrations
    prisma migrate deploy --schema=./packages/shared/prisma/schema.prisma
fi
status=$?

# If migration fails (returns non-zero exit status), exit script with that status
if [ $status -ne 0 ]; then
    echo "Applying database migrations failed. This is mostly caused by the database being unavailable."
    echo "Exiting..."
    exit $status
fi

# Execute the Clickhouse migration, except when disabled.
if [ "$LANGFUSE_AUTO_CLICKHOUSE_MIGRATION_DISABLED" != "true" ]; then
    # Apply Clickhouse migrations
    cd ./packages/shared
    sh ./clickhouse/scripts/up.sh
    status=$?
    cd ../../
fi

# If migration fails (returns non-zero exit status), exit script with that status
if [ $status -ne 0 ]; then
    echo "Applying clickhouse migrations failed. This is mostly caused by the database being unavailable."
    echo "Exiting..."
    exit $status
fi

# Run the command passed to the docker image on start
exec "$@"
