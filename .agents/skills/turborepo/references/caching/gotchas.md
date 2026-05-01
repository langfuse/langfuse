# Debugging Cache Issues

## Diagnostic Tools

### `--summarize`

Generates a JSON file with all hash inputs. Compare two runs to find differences.

```bash
turbo build --summarize
# Creates .turbo/runs/<run-id>.json
```

The summary includes:

- Global hash and its inputs
- Per-task hashes and their inputs
- Environment variables that affected the hash

**Comparing runs:**

```bash
# Run twice, compare the summaries
diff .turbo/runs/<first-run>.json .turbo/runs/<second-run>.json
```

### `--dry` / `--dry=json`

See what would run without executing anything:

```bash
turbo build --dry
turbo build --dry=json  # machine-readable output
```

Shows cache status for each task without running them.

### `--force`

Skip reading cache, re-execute all tasks:

```bash
turbo build --force
```

Useful to verify tasks actually work (not just cached results).

## Unexpected Cache Misses

**Symptom:** Task runs when you expected a cache hit.

### Environment Variable Changed

Check if an env var in the `env` key changed:

```json
{
  "tasks": {
    "build": {
      "env": ["API_URL", "NODE_ENV"]
    }
  }
}
```

Different `API_URL` between runs = cache miss.

### .env File Changed

`.env` files aren't tracked by default. Add to `inputs`:

```json
{
  "tasks": {
    "build": {
      "inputs": ["$TURBO_DEFAULT$", ".env", ".env.local"]
    }
  }
}
```

Or use `globalDependencies` for repo-wide env files:

```json
{
  "globalDependencies": [".env"]
}
```

With `futureFlags.globalConfiguration`, use `global.inputs` instead. The key difference: `global.inputs` files are folded into each task's hash individually (not the global hash), so tasks can exclude specific files with negation globs.

```json
{
  "futureFlags": { "globalConfiguration": true },
  "global": {
    "inputs": [".env"]
  }
}
```

### Lockfile Changed

Installing/updating packages changes the global hash.

### Source Files Changed

Any file in the package (or in `inputs`) triggers a miss.

### turbo.json Changed

Config changes invalidate the global hash.

## Incorrect Cache Hits

**Symptom:** Cached output is stale/wrong.

### Missing Environment Variable

Task uses an env var not listed in `env`:

```javascript
// build.js
const apiUrl = process.env.API_URL; // not tracked!
```

Fix: add to task config:

```json
{
  "tasks": {
    "build": {
      "env": ["API_URL"]
    }
  }
}
```

### Missing File in Inputs

Task reads a file outside default inputs:

```json
{
  "tasks": {
    "build": {
      "inputs": [
        "$TURBO_DEFAULT$",
        "../../shared-config.json" // file outside package
      ]
    }
  }
}
```

## Useful Flags

```bash
# Only show output for cache misses
turbo build --output-logs=new-only

# Show output for everything (debugging)
turbo build --output-logs=full

# See why tasks are running
turbo build --verbosity=2
```

## Debugging with `globalConfiguration` Enabled

When `futureFlags.globalConfiguration` is on, `global.inputs` files appear in per-task hash inputs (not the global hash). If you're getting unexpected cache misses:

1. Check `--summarize` output — global input files will show up in the **task inputs** section, not the global hash section
2. Verify tasks aren't accidentally excluding global inputs via negation globs in `inputs`
3. Remember that toggling the `globalConfiguration` flag itself invalidates all caches (the flag value is part of the global hash)

If you're getting unexpected cache **hits** after changing a global input file, the task may be excluding that file with a negation glob. Check the task's `inputs` for `!$TURBO_ROOT$/...` patterns.

## Quick Checklist

Cache miss when expected hit:

1. Run with `--summarize`, compare with previous run
2. Check env vars with `--dry=json`
3. Look for lockfile/config changes in git

Cache hit when expected miss:

1. Verify env var is in `env` array
2. Verify file is in `inputs` array
3. Check if file is outside package directory
