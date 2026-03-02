#!/bin/sh

# OceanBase entrypoint: database initialization and migrations

# Build OCEANBASE_URL from individual env vars if not set directly
if [ -z "$OCEANBASE_URL" ]; then
    if [ -n "$OB_HOST" ] && [ -n "$OB_DATABASE" ]; then
        OB_USER_ENCODED=$(printf '%s' "${OB_ADMIN_USER:-root@oceanbase}" | sed 's/@/%40/g')
        OCEANBASE_URL="mysql://${OB_USER_ENCODED}:${OB_ADMIN_PASSWORD:-}@${OB_HOST}:${OB_PORT:-2881}/${OB_DATABASE}"
        export OCEANBASE_URL
    else
        echo "Error: OCEANBASE_URL is not set and OB_HOST/OB_DATABASE are missing."
        exit 1
    fi
fi

# Run OceanBase init (create DB if needed, run Prisma migrations, apply migrate.ob.sql)
# mysql2 is installed at build time in the image (see Dockerfile)
echo "Running OceanBase initialization (initOb.js)..."
node ./packages/shared/scripts/initOb.js
status=$?
if [ $status -ne 0 ]; then
    echo "OceanBase initialization failed."
    echo "Exiting..."
    exit $status
fi

# Use NEXTAUTH_URL for the correct access address (avoid showing container hostname)
echo "Langfuse available at: ${NEXTAUTH_URL:-http://localhost:3000}"

# Run the command passed to the docker image on start
exec "$@"
