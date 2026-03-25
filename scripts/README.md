# Langfuse Utility Scripts

This directory contains helper scripts for Langfuse deployment and maintenance.

## Available Scripts

### `validate-database-url.sh`

Validates and encodes DATABASE_URL for use with Prisma. This script helps prevent connection errors when using special characters in database credentials.

#### Problem

Prisma requires special characters in database connection strings to be URL-encoded. Common characters that need encoding include:
- `@` → `%40` (often in email-style usernames)
- `:` → `%3A` (commonly in passwords)
- `/` → `%2F`
- `%` → `%25`

Without proper encoding, you'll see errors like:
```
Error: P1013: The provided database string is invalid. 
The scheme is not recognized in database URL.
```

#### Usage

```bash
# Check a specific URL
./scripts/validate-database-url.sh 'postgresql://username:password@host:port/database'

# Or use your existing DATABASE_URL environment variable
export DATABASE_URL='postgresql://admin@company.com:MyP@ss:word@localhost:5432/langfuse'
./scripts/validate-database-url.sh
```

#### Features

- ✅ Validates PostgreSQL URL format
- ✅ Detects special characters that need encoding
- ✅ Shows before/after comparison
- ✅ Prevents double-encoding
- ✅ Provides clear instructions for fixing issues

#### Example Output

```
==========================================
Langfuse DATABASE_URL Validator/Encoder
==========================================

Input URL:
  postgresql://admin@company.com:MyP@ss:word@localhost:5432/langfuse

Detected credentials:
  Username: admin@company.com
  Password: [hidden]

⚠️  Username contains special characters that need encoding:
     Found: @
⚠️  Password contains special characters that need encoding:
     Found: @ :

==========================================
Proposed Fix:
==========================================

Encoded URL:
  postgresql://admin%40company.com:MyP%40ss%3Aword@localhost:5432/langfuse

Changes made:
  Username: admin@company.com → admin%40company.com
  Password: [encoded]

==========================================
How to use:
==========================================

Option 1: Update your .env file
  DATABASE_URL="postgresql://admin%40company.com:MyP%40ss%3Aword@localhost:5432/langfuse"

Option 2: Export as environment variable
  export DATABASE_URL="postgresql://admin%40company.com:MyP%40ss%3Aword@localhost:5432/langfuse"
```

## Contributing

When adding new scripts:

1. Make them executable: `chmod +x scripts/your-script.sh`
2. Add documentation to this README
3. Follow the existing script style (colors, error handling, etc.)
4. Include helpful comments and usage examples
