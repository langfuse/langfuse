#!/bin/sh

# URL encode a string for use in DATABASE_URL
encode_url_component() {
    node -e "console.log(encodeURIComponent('${1//\'/\\\'}'))"
}

# Run cleanup script before running migrations
# Check if DATABASE_URL is not set
if [ -z "$DATABASE_URL" ]; then
    # Check if all required variables are provided
    if [ -n "$DATABASE_HOST" ] && [ -n "$DATABASE_USERNAME" ] && [ -n "$DATABASE_PASSWORD" ]  && [ -n "$DATABASE_NAME" ]; then
        # Encode username and password to handle special characters
        # This prevents Prisma errors when credentials contain characters like @, :, /, etc.
        ENCODED_USERNAME=$(encode_url_component "$DATABASE_USERNAME")
        ENCODED_PASSWORD=$(encode_url_component "$DATABASE_PASSWORD")
        
        # Construct DATABASE_URL from the provided variables with encoded credentials
        DATABASE_URL="postgresql://${ENCODED_USERNAME}:${ENCODED_PASSWORD}@${DATABASE_HOST}/${DATABASE_NAME}"
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

# Check if CLICKHOUSE_URL is not set
if [ -z "$CLICKHOUSE_URL" ]; then
    echo "Error: CLICKHOUSE_URL is not configured. Migrating from V2? Check out migration guide: https://langfuse.com/self-hosting/upgrade-guides/upgrade-v2-to-v3"
    exit 1
fi

# Set DIRECT_URL to the value of DATABASE_URL if it is not set, required for migrations
if [ -z "$DIRECT_URL" ]; then
    export DIRECT_URL="${DATABASE_URL}"
fi

# Apply migrations if LANGFUSE_INIT_ORG_ID is set
if [ -n "$LANGFUSE_INIT_ORG_ID" ]; then
    # Get optional LANGFUSE_INIT_ORG_NAME if set
    ORG_NAME_ARG=""
    if [ -n "$LANGFUSE_INIT_ORG_NAME" ]; then
        ORG_NAME_ARG="--org-name \"$LANGFUSE_INIT_ORG_NAME\""
    fi

    # Get optional LANGFUSE_INIT_PROJECT_ID if set
    PROJECT_ID_ARG=""
    if [ -n "$LANGFUSE_INIT_PROJECT_ID" ]; then
        PROJECT_ID_ARG="--project-id \"$LANGFUSE_INIT_PROJECT_ID\""
    fi

    # Get optional LANGFUSE_INIT_PROJECT_NAME if set
    PROJECT_NAME_ARG=""
    if [ -n "$LANGFUSE_INIT_PROJECT_NAME" ]; then
        PROJECT_NAME_ARG="--project-name \"$LANGFUSE_INIT_PROJECT_NAME\""
    fi

    # Get optional LANGFUSE_INIT_PROJECT_PUBLIC_KEY if set
    PROJECT_PUBLIC_KEY_ARG=""
    if [ -n "$LANGFUSE_INIT_PROJECT_PUBLIC_KEY" ]; then
        PROJECT_PUBLIC_KEY_ARG="--project-public-key \"$LANGFUSE_INIT_PROJECT_PUBLIC_KEY\""
    fi

    # Get optional LANGFUSE_INIT_PROJECT_SECRET_KEY if set
    PROJECT_SECRET_KEY_ARG=""
    if [ -n "$LANGFUSE_INIT_PROJECT_SECRET_KEY" ]; then
        PROJECT_SECRET_KEY_ARG="--project-secret-key \"$LANGFUSE_INIT_PROJECT_SECRET_KEY\""
    fi

    # Get optional LANGFUSE_INIT_USER_EMAIL if set
    USER_EMAIL_ARG=""
    if [ -n "$LANGFUSE_INIT_USER_EMAIL" ]; then
        USER_EMAIL_ARG="--user-email \"$LANGFUSE_INIT_USER_EMAIL\""
    fi

    # Get optional LANGFUSE_INIT_USER_NAME if set
    USER_NAME_ARG=""
    if [ -n "$LANGFUSE_INIT_USER_NAME" ]; then
        USER_NAME_ARG="--user-name \"$LANGFUSE_INIT_USER_NAME\""
    fi

    # Get optional LANGFUSE_INIT_USER_PASSWORD if set
    USER_PASSWORD_ARG=""
    if [ -n "$LANGFUSE_INIT_USER_PASSWORD" ]; then
        USER_PASSWORD_ARG="--user-password \"$LANGFUSE_INIT_USER_PASSWORD\""
    fi

    echo "Provisioning Langfuse with organization ${LANGFUSE_INIT_ORG_ID}"
    eval "node scripts/bootstrap.mjs --org-id \"${LANGFUSE_INIT_ORG_ID}\" ${ORG_NAME_ARG} ${PROJECT_ID_ARG} ${PROJECT_NAME_ARG} ${PROJECT_PUBLIC_KEY_ARG} ${PROJECT_SECRET_KEY_ARG} ${USER_EMAIL_ARG} ${USER_NAME_ARG} ${USER_PASSWORD_ARG}"
fi

# Exit if the Prisma migration fails
echo "Applying migrations..."
if ! node_modules/.bin/prisma migrate deploy; then
    echo "Applying database migrations failed. This is mostly caused by the database being unavailable."
    exit 1
fi
echo "Migrations applied successfully."

# Run seed scripts
echo "Running seed scripts..."
node scripts/seed.mjs

# start the application
echo "Starting application..."
node server.js
