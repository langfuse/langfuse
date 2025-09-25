# DATABASE_URL Encoding: Fixing Prisma P1013

## What’s fixed
Prisma P1013 caused by special characters in DB credentials when constructing `DATABASE_URL` from components.

## How it works
- Entrypoints only construct `DATABASE_URL` if it’s not already set.
- Encoder applies `encodeURIComponent` to username/password only if special characters are detected.
- Safe chars (letters, numbers, `-`, `_`, `.`) remain unchanged.

## Files changed
- Added: `packages/shared/scripts/encode-db-url.sh`
- Updated: `web/entrypoint.sh`, `worker/entrypoint.sh`

## Examples

### Simple credentials (unchanged)
Input:
```
USER=user
PASS=password123
HOST=localhost
DB=langfuse
```
Output:
```
postgresql://user:password123@localhost/langfuse
```

### Special characters (encoded)
Input:
```
USER='user@company.com'
PASS='pa:ss w%rd+!'
HOST='localhost:5432'
DB='langfuse'
```
Output:
```
postgresql://user%40company.com:pa%3Ass%20w%25rd%2B!@localhost:5432/langfuse
```

### With query arguments (preserved)
Input:
```
USER='user@test'
PASS='pass:123'
HOST='localhost:5432'
DB='dbname'
ARGS='sslmode=require&connect_timeout=10&schema=public'
```
Output:
```
postgresql://user%40test:pass%3A123@localhost:5432/dbname?sslmode=require&connect_timeout=10&schema=public
```

### Roundtrip validation (decoded)
```
Decoded username: user@company.com
Decoded password: pa:ss w%rd+!
```

## Backwards compatibility
- If `DATABASE_URL` is provided → never modified.
- Simple component creds → identical output to pre-change.
- Special chars in components → now encoded; no more P1013.


