#!/bin/sh

# Utility script to encode DATABASE_URL when it contains special characters
# This script is backwards compatible - it only applies encoding when special characters are detected

encode_database_url() {
    local db_url="$1"
    
    node -e '
        const dbUrl = process.argv[1];
        
        // Parse the URL to extract username and password
        const urlPattern = /^(postgresql:\/\/)([^:]+):([^@]+)@(.+)$/;
        const match = dbUrl.match(urlPattern);
        
        if (!match) {
            // URL is not in expected format, return as-is
            console.log(dbUrl);
            process.exit(0);
        }
        
        const [, protocol, username, password, rest] = match;
        
        // Only encode if the string contains characters that need encoding
        // Safe characters: alphanumeric, hyphen, underscore, period
        function needsEncoding(str) {
            return /[@:\/%+\s!"#\$&'"'"'()*,;<=>?\[\\\]^`{|}~]/.test(str);
        }
        
        // Check if already encoded (contains % followed by hex digits)
        function isAlreadyEncoded(str) {
            return /%[0-9A-Fa-f]{2}/.test(str);
        }
        
        function encodeIfNeeded(str) {
            if (isAlreadyEncoded(str)) {
                return str; // Already encoded, avoid double-encoding
            }
            return needsEncoding(str) ? encodeURIComponent(str) : str;
        }
        
        const encodedUsername = encodeIfNeeded(username);
        const encodedPassword = encodeIfNeeded(password);
        
        const newUrl = `${protocol}${encodedUsername}:${encodedPassword}@${rest}`;
        console.log(newUrl);
    ' "$db_url"
}

# Main execution
if [ "$#" -eq 1 ]; then
    encode_database_url "$1"
else
    echo "Usage: $0 <database_url>"
    echo "Example: $0 'postgresql://user@domain:pass:word@localhost/mydb'"
    exit 1
fi