#!/bin/sh

# Fail closed when FIPS mode is required but the OpenSSL FIPS provider is not
# active for Node (e.g. image rebuilt on a non-FIPS base, or a host/config
# change deactivated the provider).
if [ "$LANGFUSE_REQUIRE_FIPS" = "true" ]; then
    if ! node -e 'process.exit(require("node:crypto").getFips() === 1 ? 0 : 1)'; then
        echo "Error: LANGFUSE_REQUIRE_FIPS=true but Node's OpenSSL FIPS provider is not active (crypto.getFips() != 1). Exiting..."
        exit 1
    fi
fi

# Run cleanup script before running migrations
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

# Run the command passed to the docker image on start
exec "$@"
