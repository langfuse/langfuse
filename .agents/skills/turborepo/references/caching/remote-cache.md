# Remote Caching

Share cache artifacts across your team and CI pipelines.

## Benefits

- Team members get cache hits from each other's work
- CI gets cache hits from local development (and vice versa)
- Dramatically faster CI runs after first build
- No more "works on my machine" rebuilds

## Vercel Remote Cache

Free, zero-config when deploying on Vercel. For local dev and other CI:

### Local Development Setup

```bash
# Authenticate with Vercel
npx turbo login

# Link repo to your Vercel team
npx turbo link
```

This creates `.turbo/config.json` with your team info (gitignored by default).

### CI Setup

Set these environment variables:

```bash
TURBO_TOKEN=<your-token>
TURBO_TEAM=<your-team-slug>
```

Get your token from Vercel dashboard → Settings → Tokens.

**GitHub Actions example:**

```yaml
- name: Build
  run: npx turbo build
  env:
    TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
    TURBO_TEAM: ${{ vars.TURBO_TEAM }}
```

## Configuration in turbo.json

```json
{
  "remoteCache": {
    "enabled": true,
    "signature": false
  }
}
```

Options:

- `enabled`: toggle remote cache (default: true when authenticated)
- `signature`: require artifact signing (default: false)

## Artifact Signing

Verify cache artifacts haven't been tampered with:

```bash
# Set a secret key (use same key across all environments)
export TURBO_REMOTE_CACHE_SIGNATURE_KEY="your-secret-key"
```

Enable in config:

```json
{
  "remoteCache": {
    "signature": true
  }
}
```

Signed artifacts can only be restored if the signature matches.

## Self-Hosted Options

Community implementations for running your own cache server:

- **turbo-remote-cache** (Node.js) - supports S3, GCS, Azure
- **turborepo-remote-cache** (Go) - lightweight, S3-compatible
- **ducktape** (Rust) - high-performance option

Configure with environment variables:

```bash
TURBO_API=https://your-cache-server.com
TURBO_TOKEN=your-auth-token
TURBO_TEAM=your-team
```

## Cache Behavior Control

```bash
# Disable remote cache for a run
turbo build --remote-cache-read-only  # read but don't write
turbo build --no-cache                # skip cache entirely

# Environment variable alternative
TURBO_REMOTE_ONLY=true  # only use remote, skip local
```

## Debugging Remote Cache

```bash
# Verbose output shows cache operations
turbo build --verbosity=2

# Check if remote cache is configured
turbo config
```

Look for:

- "Remote caching enabled" in output
- Upload/download messages during runs
- "cache hit, replaying output" with remote cache indicator
