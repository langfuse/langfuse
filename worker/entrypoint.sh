#!/bin/sh

# Run cleanup script before running migrations
# Encode DATABASE_URL if it contains special characters in username/password
# This is backwards compatible: only encodes if special chars detected and not already encoded
if [ -n "$DATABASE_URL" ]; then
    DATABASE_URL=$(./packages/shared/scripts/encode-db-url.sh "$DATABASE_URL")
    export DATABASE_URL
fi

# Run the command passed to the docker image on start
exec "$@"
