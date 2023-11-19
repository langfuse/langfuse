#!/bin/sh

# Set DIRECT_URL to the value of DATABASE_URL, required for migrations
export DIRECT_URL=$DATABASE_URL

# Apply migrations
prisma migrate deploy
status=$?

# If migration fails (returns non-zero exit status), exit script with that status
if [ $status -ne 0 ]; then
    echo "Applying database migrations failed. This is mostly caused by the database being unavailable."
    echo "Exiting..."
    exit $status
fi

# Start server
node server.js
