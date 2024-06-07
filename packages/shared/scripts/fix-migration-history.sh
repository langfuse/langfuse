#!/bin/bash

# Load environment variables
source ./../../.env

# Download psql if not already installed
if ! command -v psql &> /dev/null
then
    echo "psql could not be found"
    echo "Downloading psql..."
    sudo apt-get install postgresql-client -y
fi


# Connect to the database and execute the query
psql "${DATABASE_URL}" -f "./scripts/cleanup.sql"

echo "Migration history cleaned up successfully"