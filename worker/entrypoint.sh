#!/bin/sh

# Check if DATABASE_URL is not set
if [ -z "$DATABASE_URL" ]; then
    # Check if all required variables are provided
    if [ -n "$DATABASE_HOST" ] && [ -n "$DATABASE_USERNAME" ] && [ -n "$DATABASE_PASSWORD" ]  && [ -n "$DATABASE_NAME" ]; then
        # Construct DATABASE_URL from the provided variables
        DATABASE_URL="postgresql://${DATABASE_USERNAME}:${DATABASE_PASSWORD}@${DATABASE_HOST}/${DATABASE_NAME}"
        export DATABASE_URL
    else
        echo "Error: Required database environment variables are not set. Provide a postgres url for DATABASE_URL."
        exit 1
    fi
    if [ -n "$DATABASE_ARGS" ]; then
      # Append ARGS to DATABASE_URL
       DATABASE_URL="${DATABASE_URL}?$DATABASE_ARGS"
       export DATABASE_URL
    fi
fi

# Fix for Prisma P1013 error: encode special characters in DATABASE_URL
# This prevents issues when username or password contains special characters like @, :, /, etc.
# The script only encodes when necessary and prevents double-encoding for backwards compatibility
DATABASE_URL=$(./packages/shared/scripts/encode-db-url.sh "$DATABASE_URL")
export DATABASE_URL

# Run the command passed to the docker image on start
exec "$@"
