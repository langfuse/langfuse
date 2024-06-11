#!/bin/bash

# Load environment variables
source ./../../.env

# Download psql if not already installed
if ! command -v psql &> /dev/null
then
    echo "prisma could not be found"
    echo "Downloading prisma..."
    sudo npm install -g prisma
fi

# potential inputs in DATABASE_URL
# - postgresql://postgres:postgres@localhost:5432/postgres?schema=something
# - postgresql://postgres:postgres@localhost:5432/postgres
# - postgresql://postgres:postgres@localhost:5432/postgres?foo=bar

# expected outputs
# - postgresql://postgres:postgres@localhost:5432/postgres?search_path=something
# - postgresql://postgres:postgres@localhost:5432/postgres
# - postgresql://postgres:postgres@localhost:5432/postgres?foo=bar

# Function to transform DATABASE_URL

# echo the cleanup sql
echo "Cleanup SQL: $(<./scripts/cleanup.sql)"

# Connect to the database and execute the query
prisma db execute --url $DATABASE_URL --file "./scripts/cleanup.sql"
# echo the transformed url
echo "Transformed DATABASE_URL: $transformed_url"


echo "Migration history cleaned up successfully"