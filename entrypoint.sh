#!/bin/sh

# Set DIRECT_URL to the value of DATABASE_URL, required for migrations
export DIRECT_URL=$DATABASE_URL

# Apply migrations
prisma migrate deploy

# Start background cron job
node cron.js &

# Start server
node server.js
