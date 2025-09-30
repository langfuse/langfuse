#!/bin/sh

# Fix for Prisma P1013 error: encode special characters in DATABASE_URL
# This prevents issues when username or password contains special characters like @, :, /, etc.
# The script only encodes when necessary and prevents double-encoding for backwards compatibility
if [ -n "$DATABASE_URL" ]; then
    DATABASE_URL=$(./packages/shared/scripts/encode-db-url.sh "$DATABASE_URL")
    export DATABASE_URL
fi

# Run the command passed to the docker image on start
exec "$@"
