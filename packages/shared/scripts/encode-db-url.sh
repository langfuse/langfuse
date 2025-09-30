#!/bin/sh

# Utility script to encode DATABASE_URL when it contains special characters
# This script is backwards compatible - it only applies encoding when special characters are detected

encode_database_url() {
    local db_url="$1"
    
    # Use Node.js to handle URL encoding reliably
    node -e '
        const dbUrl = process.argv[1];
        
        // Parse the URL to extract username and password
        // Expected format: postgresql://username:password@host/database
        const urlPattern = /^(postgresql:\/\/)([^:]+):([^@]+)@(.+)$/;
        const match = dbUrl.match(urlPattern);
        
        // If URL does not match expected pattern, return it unchanged
        if (!match) {
            console.log(dbUrl);
            process.exit(0);
        }
        
        // Extract components from the URL
        const [, protocol, username, password, rest] = match;
        
        // Check if a string contains special characters that need URL encoding
        // Safe characters are: letters, numbers, hyphen, underscore, period
        function needsEncoding(str) {
            return /[@:\/%+\s!"#\$&'"'"'()*,;<=>?\[\\\]^`{|}~]/.test(str);
        }
        
        // Check if string is already URL encoded
        // Look for percent-encoded sequences like %20, %40, etc.
        function isAlreadyEncoded(str) {
            return /%[0-9A-Fa-f]{2}/.test(str);
        }
        
        // Encode only if needed and not already encoded
        // This prevents double-encoding and unnecessary changes
        function encodeIfNeeded(str) {
            if (isAlreadyEncoded(str)) {
                return str; // Already encoded, avoid double-encoding
            }
            return needsEncoding(str) ? encodeURIComponent(str) : str;
        }
        
        // Apply encoding to username and password
        const encodedUsername = encodeIfNeeded(username);
        const encodedPassword = encodeIfNeeded(password);
        
        // Reconstruct the URL with encoded credentials
        const newUrl = `${protocol}${encodedUsername}:${encodedPassword}@${rest}`;
        console.log(newUrl);
    ' "$db_url"
}

# Main execution - expects exactly one argument (the DATABASE_URL)
if [ "$#" -eq 1 ]; then
    encode_database_url "$1"
else
    echo "Usage: $0 <database_url>"
    echo "Example: $0 'postgresql://user@domain:pass:word@localhost/mydb'"
    exit 1
fi