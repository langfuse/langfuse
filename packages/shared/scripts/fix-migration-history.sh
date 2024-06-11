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

# echo "$DATABASE_URL"

# potential inputs in DATABASE_URL
# - postgresql://postgres:postgres@localhost:5432/postgres?schema=something
# - postgresql://postgres:postgres@localhost:5432/postgres
# - postgresql://postgres:postgres@localhost:5432/postgres?foo=bar

# expected outputs
# - postgresql://postgres:postgres@localhost:5432/postgres?search_path=something
# - postgresql://postgres:postgres@localhost:5432/postgres
# - postgresql://postgres:postgres@localhost:5432/postgres?foo=bar


# Function to transform DATABASE_URL
transform_database_url() {
    local conn_str="$1"
    local schema
    local transformed_url

    echo $conn_str
    # Extract schema using regex
    schema=$(echo "$conn_str" | grep -oP "(?<=schema=)[^&]+")

    
    if [ -n "$schema" ]; then
        # Schema found, replace schema with search_path
        transformed_url=$(echo "$conn_str" | sed "s/schema=$schema/search_path=$schema/")
    else
        # Schema not found, keep the original connection string
        transformed_url="$conn_str"
    fi

    # Print the transformed URL
    echo "$transformed_url"
}

# Call the function with the DATABASE_URL
transformed_url=$(transform_database_url "$DATABASE_URL")

echo "Cleaning up migration history for database: $transformed_url"

# Connect to the database and execute the query
psql "${transformed_url}" -f "./scripts/cleanup.sql"



echo "Migration history cleaned up successfully"