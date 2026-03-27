#!/bin/bash
# Script to validate and encode DATABASE_URL for Langfuse
# This helps prevent Prisma connection errors when using special characters in credentials
# Reference: https://www.prisma.io/docs/orm/reference/connection-urls#special-characters

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Langfuse DATABASE_URL Validator/Encoder"
echo "=========================================="
echo ""

# Function to URL encode a string
url_encode() {
    local string="$1"
    local encoded=""
    local pos c o

    for (( pos=0; pos<${#string}; pos++ )); do
        c=${string:$pos:1}
        case "$c" in
            [a-zA-Z0-9.~_-])
                encoded+="$c"
                ;;
            *)
                printf -v o '%%%02x' "'$c"
                encoded+="$o"
                ;;
        esac
    done
    echo "$encoded"
}

# Function to check if string is already URL encoded
is_encoded() {
    local string="$1"
    if [[ "$string" =~ %[0-9A-Fa-f]{2} ]]; then
        return 0
    else
        return 1
    fi
}

# Check if DATABASE_URL is provided as argument or environment variable
if [ -n "$1" ]; then
    DATABASE_URL="$1"
elif [ -n "$DATABASE_URL" ]; then
    DATABASE_URL="$DATABASE_URL"
else
    echo -e "${YELLOW}⚠️  No DATABASE_URL provided${NC}"
    echo ""
    echo "Usage:"
    echo "  $0 'postgresql://username:password@host:port/database'"
    echo "  or set DATABASE_URL environment variable"
    echo ""
    echo -e "${YELLOW}Example with special characters:${NC}"
    echo "  $0 'postgresql://admin@company.com:MyP@ss:word@localhost:5432/langfuse'"
    exit 1
fi

echo "Input URL:"
echo "  $DATABASE_URL"
echo ""

# Parse the URL
# Format: postgresql://username:password@host:port/database
if [[ ! "$DATABASE_URL" =~ ^postgresql:// ]]; then
    echo -e "${RED}❌ Error: URL must start with 'postgresql://'${NC}"
    exit 1
fi

# Extract components
url_without_prefix="${DATABASE_URL#postgresql://}"

# Check if URL contains credentials
if [[ "$url_without_prefix" =~ @ ]]; then
    credentials="${url_without_prefix%%@*}"
    host_part="${url_without_prefix#*@}"
    
    if [[ "$credentials" =~ : ]]; then
        username="${credentials%%:*}"
        password="${credentials#*:}"
    else
        username="$credentials"
        password=""
    fi
else
    echo -e "${YELLOW}⚠️  No credentials found in URL${NC}"
    exit 0
fi

# Check for special characters that need encoding
echo "Detected credentials:"
echo "  Username: $username"
if [ -n "$password" ]; then
    echo "  Password: [hidden]"
fi
echo ""

# Check if already encoded
if is_encoded "$username" || is_encoded "$password"; then
    echo -e "${GREEN}✅ URL appears to already be encoded${NC}"
    echo "   No changes needed."
    exit 0
fi

# Check for special characters
special_chars_found=false

if [[ "$username" =~ [%:@/] ]]; then
    echo -e "${YELLOW}⚠️  Username contains special characters that need encoding:${NC}"
    echo "     Found: $(echo "$username" | grep -o '[%:@/]' | sort -u | tr '\n' ' ')"
    special_chars_found=true
fi

if [[ "$password" =~ [%:@/] ]]; then
    echo -e "${YELLOW}⚠️  Password contains special characters that need encoding:${NC}"
    echo "     Found: $(echo "$password" | grep -o '[%:@/]' | sort -u | tr '\n' ' ')"
    special_chars_found=true
fi

if [ "$special_chars_found" = false ]; then
    echo -e "${GREEN}✅ No special characters found that require encoding${NC}"
    echo "   Your URL should work as-is with Prisma."
    exit 0
fi

echo ""
echo "=========================================="
echo "Proposed Fix:"
echo "=========================================="

# Encode credentials
encoded_username=$(url_encode "$username")
encoded_password=$(url_encode "$password")

# Reconstruct URL
if [ -n "$password" ]; then
    encoded_url="postgresql://${encoded_username}:${encoded_password}@${host_part}"
else
    encoded_url="postgresql://${encoded_username}@${host_part}"
fi

echo ""
echo -e "${GREEN}Encoded URL:${NC}"
echo "  $encoded_url"
echo ""
echo "Changes made:"
echo "  Username: $username → $encoded_username"
if [ -n "$password" ]; then
    echo "  Password: [encoded]"
fi
echo ""
echo "=========================================="
echo "How to use:"
echo "=========================================="
echo ""
echo "Option 1: Update your .env file"
echo "  DATABASE_URL=\"$encoded_url\""
echo ""
echo "Option 2: Export as environment variable"
echo "  export DATABASE_URL=\"$encoded_url\""
echo ""
echo "Option 3: Use with docker-compose"
echo "  DATABASE_URL=\"$encoded_url\" docker-compose up -d"
echo ""
echo -e "${YELLOW}Note: If using docker-compose, ensure the URL is properly quoted${NC}"
echo "      to prevent shell interpretation of special characters."
echo ""
