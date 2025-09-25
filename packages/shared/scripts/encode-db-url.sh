#!/bin/sh

# Utility script to construct DATABASE_URL with proper encoding when needed
# This script is backwards compatible - it only applies encoding when special characters are detected

# Use Node.js for reliable URL encoding (available in all containers)
construct_database_url() {
    local username="$1"
    local password="$2"
    local host="$3"
    local database="$4"
    local args="$5"
    
    # Use Node.js to construct the URL with proper encoding
    node -e '
        const username = process.argv[1];
        const password = process.argv[2];
        const host = process.argv[3];
        const database = process.argv[4];
        const args = process.argv[5];
        
        // Only encode if the string contains characters that need encoding
        // Safe characters: alphanumeric, hyphen, underscore, period
        function needsEncoding(str) {
            return /[@:\/%+\s!"#\$&'"'"'()*,;<=>?\[\\\]^`{|}~]/.test(str);
        }
        
        function encodeIfNeeded(str) {
            return needsEncoding(str) ? encodeURIComponent(str) : str;
        }
        
        const encodedUsername = encodeIfNeeded(username);
        const encodedPassword = encodeIfNeeded(password);
        
        let url = `postgresql://${encodedUsername}:${encodedPassword}@${host}/${database}`;
        
        if (args) {
            url += `?${args}`;
        }
        
        console.log(url);
    ' "$username" "$password" "$host" "$database" "$args"
}

# Main execution
if [ "$#" -eq 4 ] || [ "$#" -eq 5 ]; then
    construct_database_url "$1" "$2" "$3" "$4" "$5"
else
    echo "Usage: $0 <username> <password> <host> <database> [args]"
    echo "Example: $0 'user@domain' 'pass:word' 'localhost' 'mydb' 'schema=public'"
    exit 1
fi
