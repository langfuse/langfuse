# Global Options Reference

Options that affect all tasks. Full docs: https://turborepo.dev/docs/reference/configuration

## globalEnv

Environment variables affecting all task hashes.

```json
{
  "globalEnv": ["CI", "NODE_ENV", "VERCEL_*"]
}
```

Use for variables that should invalidate all caches when changed.

## globalDependencies

Files that affect all task hashes.

```json
{
  "globalDependencies": ["tsconfig.json", ".env", "pnpm-lock.yaml"]
}
```

Lockfile is included by default. Add shared configs here.

## globalPassThroughEnv

Variables available to tasks but not included in hash.

```json
{
  "globalPassThroughEnv": ["AWS_SECRET_KEY", "GITHUB_TOKEN"]
}
```

Use for credentials that shouldn't affect cache keys.

## cacheDir

Custom cache location. Default: `node_modules/.cache/turbo`.

```json
{
  "cacheDir": ".turbo/cache"
}
```

## daemon

**Deprecated**: The daemon is no longer used for `turbo run` and this option will be removed in version 3.0. The daemon is still used by `turbo watch` and the Turborepo LSP.

## envMode

How unspecified env vars are handled. Default: `"strict"`.

```json
{
  "envMode": "strict"  // Only specified vars available
  // or
  "envMode": "loose"   // All vars pass through
}
```

Strict mode catches missing env declarations.

## ui

Terminal UI mode. Default: `"stream"`.

```json
{
  "ui": "tui"     // Interactive terminal UI
  // or
  "ui": "stream"  // Traditional streaming logs
}
```

TUI provides better UX for parallel tasks.

## remoteCache

Configure remote caching.

```json
{
  "remoteCache": {
    "enabled": true,
    "signature": true,
    "timeout": 30,
    "uploadTimeout": 60
  }
}
```

| Option          | Default                | Description                                            |
| --------------- | ---------------------- | ------------------------------------------------------ |
| `enabled`       | `true`                 | Enable/disable remote caching                          |
| `signature`     | `false`                | Sign artifacts with `TURBO_REMOTE_CACHE_SIGNATURE_KEY` |
| `preflight`     | `false`                | Send OPTIONS request before cache requests             |
| `timeout`       | `30`                   | Timeout in seconds for cache operations                |
| `uploadTimeout` | `60`                   | Timeout in seconds for uploads                         |
| `apiUrl`        | `"https://vercel.com"` | Remote cache API endpoint                              |
| `loginUrl`      | `"https://vercel.com"` | Login endpoint                                         |
| `teamId`        | -                      | Team ID (must start with `team_`)                      |
| `teamSlug`      | -                      | Team slug for querystring                              |

See https://turborepo.dev/docs/core-concepts/remote-caching for setup.

## concurrency

Default: `"10"`

Limit parallel task execution.

```json
{
  "concurrency": "4"     // Max 4 tasks at once
  // or
  "concurrency": "50%"   // 50% of available CPUs
}
```

## futureFlags

Enable experimental features that will become default in future versions.

```json
{
  "futureFlags": {
    "errorsOnlyShowHash": true
  }
}
```

### `errorsOnlyShowHash`

When using `outputLogs: "errors-only"`, show task hashes on start/completion:

- Cache miss: `cache miss, executing <hash> (only logging errors)`
- Cache hit: `cache hit, replaying logs (no errors) <hash>`

### `longerSignatureKey`

Enforce a minimum key length of 32 bytes for `TURBO_REMOTE_CACHE_SIGNATURE_KEY` when `remoteCache.signature` is enabled. Short keys weaken HMAC-SHA256 signatures. Fails the run immediately if the key is too short.

### `globalConfiguration`

Moves global configuration keys under a top-level `global` key for clarity and changes how `global.inputs` (formerly `globalDependencies`) affects task hashing.

When enabled:

- Global config keys move under `global` with cleaner names
- `global.inputs` files are **prepended to every task's inputs** instead of being folded into the global hash — tasks can opt out of specific global inputs using negation globs

```json
{
  "futureFlags": { "globalConfiguration": true },
  "global": {
    "inputs": ["tsconfig.json", ".env"],
    "env": ["CI", "NODE_ENV"],
    "passThroughEnv": ["AWS_SECRET_KEY"],
    "ui": "tui",
    "envMode": "strict",
    "cacheDir": ".turbo/cache",
    "remoteCache": { "enabled": true },
    "concurrency": "50%"
  },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

**Key rename mapping:**

| Old (top-level)                                                                                                                  | New (`global.`)           |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `globalDependencies`                                                                                                             | `inputs`                  |
| `globalEnv`                                                                                                                      | `env`                     |
| `globalPassThroughEnv`                                                                                                           | `passThroughEnv`          |
| `ui`, `envMode`, `cacheDir`, `daemon`, `concurrency`, `noUpdateNotifier`, `dangerouslyDisablePackageManagerCheck`, `remoteCache` | Same names under `global` |

**Behavior change for `global.inputs`:**

With `globalDependencies` (old): files are hashed into the **global hash**, which is embedded in every task's cache key. Changing any of these files invalidates all tasks — there is no opt-out.

With `global.inputs` (new): files are treated as **implicit task inputs** prepended to each task's `inputs` globs. This means:

- Tasks can exclude specific global files: `"inputs": ["$TURBO_DEFAULT$", "!$TURBO_ROOT$/tsconfig.json"]`
- The global hash no longer includes these file hashes (it still includes lockfile, engines, global env, etc.)
- Tasks with no explicit `inputs` still hash all package files plus the global inputs

See the [gotchas doc](./gotchas.md) for guidance on using `$TURBO_DEFAULT$` with `global.inputs`.

## noUpdateNotifier

Disable update notifications when new turbo versions are available.

```json
{
  "noUpdateNotifier": true
}
```

## dangerouslyDisablePackageManagerCheck

Bypass the `packageManager` field requirement. Use for incremental migration.

```json
{
  "dangerouslyDisablePackageManagerCheck": true
}
```

**Warning**: Unstable lockfiles can cause unpredictable behavior.

## Git Worktree Cache Sharing

When working in Git worktrees, Turborepo automatically shares local cache between the main worktree and linked worktrees.

**How it works:**

- Detects worktree configuration
- Redirects cache to main worktree's `.turbo/cache`
- Works alongside Remote Cache

**Benefits:**

- Cache hits across branches
- Reduced disk usage
- Faster branch switching

**Disabled by**: Setting explicit `cacheDir` in turbo.json.
