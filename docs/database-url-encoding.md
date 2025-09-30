# DATABASE_URL Encoding: Fixing Prisma P1013

## What's fixed
Prisma P1013 errors caused by special characters in `DATABASE_URL` credentials.

## The Problem
When users provide `DATABASE_URL` directly with special characters in username or password:
```bash
DATABASE_URL="postgresql://admin@company.com:MyPass:word@localhost/langfuse"
```

Prisma throws:
```
Error: P1013: The provided database string is invalid. The scheme is not recognized in database URL.
```

## The Solution
Automatically encode username and password in `DATABASE_URL` when special characters are detected.

### How it works
- Parses `DATABASE_URL` to extract username and password
- Detects if encoding is needed (special characters present)
- Detects if already encoded (contains `%XX` patterns) to prevent double-encoding
- Safe characters (letters, numbers, `-`, `_`, `.`) remain unchanged
- Returns URL unchanged if no encoding needed

### Files changed
- Added: `packages/shared/scripts/encode-db-url.sh`
- Updated: `web/entrypoint.sh`, `worker/entrypoint.sh`

## Examples

### Example 1: Special characters in credentials (FIXED ✅)
**Before (causes P1013):**
```bash
DATABASE_URL="postgresql://admin@company.com:MyPass:word@localhost/langfuse"
```

**After (automatically encoded):**
```
postgresql://admin%40company.com:MyPass%3Aword@localhost/langfuse
```

### Example 2: Simple credentials (unchanged)
**Input:**
```bash
DATABASE_URL="postgresql://user:password123@localhost/langfuse"
```

**Output:**
```
postgresql://user:password123@localhost/langfuse
```
(No encoding needed - no change)

### Example 3: Already-encoded URL (unchanged)
**Input:**
```bash
DATABASE_URL="postgresql://user%40test:pass%3A123@localhost/db"
```

**Output:**
```
postgresql://user%40test:pass%3A123@localhost/db
```
(Already encoded - no double-encoding)

### Example 4: With query parameters (preserved)
**Input:**
```bash
DATABASE_URL="postgresql://user@test:pass:123@localhost/db?schema=public&sslmode=require"
```

**Output:**
```
postgresql://user%40test:pass%3A123@localhost/db?schema=public&sslmode=require
```
(Query parameters unchanged)

## Backwards Compatibility
✅ **Fully backwards compatible:**
- Simple credentials (no special chars) → unchanged
- Already-encoded URLs → unchanged (no double-encoding)
- Only URLs with unencoded special chars → encoded automatically

## Common Special Characters Handled
- `@` → `%40`
- `:` → `%3A`
- `/` → `%2F`
- `%` → `%25`
- `+` → `%2B`
- Space → `%20`
- And many more...

## Testing
Tested scenarios:
- ✅ Simple credentials (alphanumeric only)
- ✅ Special characters (`@`, `:`, `/`, `%`, `+`, `!`, spaces, etc.)
- ✅ Already-encoded URLs (no double-encoding)
- ✅ Query parameters preservation
- ✅ Original reported issue case