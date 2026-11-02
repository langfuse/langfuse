# Environment Variables in Turborepo

Turborepo provides fine-grained control over which environment variables affect task hashing and runtime availability.

## Configuration Keys

### `env` - Task-Specific Variables

Variables that affect a specific task's hash. When these change, only that task rebuilds.

```json
{
  "tasks": {
    "build": {
      "env": ["DATABASE_URL", "API_KEY"]
    }
  }
}
```

### `globalEnv` - Variables Affecting All Tasks

Variables that affect EVERY task's hash. When these change, all tasks rebuild.

```json
{
  "globalEnv": ["CI", "NODE_ENV"]
}
```

### `passThroughEnv` - Runtime-Only Variables (Not Hashed)

Variables available at runtime but NOT included in hash. **Use with caution** - changes won't trigger rebuilds.

```json
{
  "tasks": {
    "deploy": {
      "passThroughEnv": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
    }
  }
}
```

### `globalPassThroughEnv` - Global Runtime Variables

Same as `passThroughEnv` but for all tasks.

```json
{
  "globalPassThroughEnv": ["GITHUB_TOKEN"]
}
```

## Wildcards and Negation

### Wildcards

Match multiple variables with `*`:

```json
{
  "env": ["MY_API_*", "FEATURE_FLAG_*"]
}
```

This matches `MY_API_URL`, `MY_API_KEY`, `FEATURE_FLAG_DARK_MODE`, etc.

### Negation

Exclude variables (useful with framework inference):

```json
{
  "env": ["!NEXT_PUBLIC_ANALYTICS_ID"]
}
```

## With `futureFlags.globalConfiguration`

When the `globalConfiguration` future flag is enabled, global environment keys move under the `global` key with cleaner names:

| Old (top-level)        | New (`global.`)  |
| ---------------------- | ---------------- |
| `globalEnv`            | `env`            |
| `globalPassThroughEnv` | `passThroughEnv` |

`global.env` and `global.passThroughEnv` behave identically to their top-level counterparts — they affect the global hash and all tasks, respectively. The rename is purely organizational.

```json
{
  "futureFlags": { "globalConfiguration": true },
  "global": {
    "env": ["CI", "NODE_ENV"],
    "passThroughEnv": ["GITHUB_TOKEN", "NPM_TOKEN"]
  },
  "tasks": {
    "build": {
      "env": ["DATABASE_URL", "API_*"],
      "passThroughEnv": ["SENTRY_AUTH_TOKEN"]
    }
  }
}
```

## Complete Example

```json
{
  "$schema": "https://v2-8-21-canary-9.turborepo.dev/schema.json",
  "globalEnv": ["CI", "NODE_ENV"],
  "globalPassThroughEnv": ["GITHUB_TOKEN", "NPM_TOKEN"],
  "tasks": {
    "build": {
      "env": ["DATABASE_URL", "API_*"],
      "passThroughEnv": ["SENTRY_AUTH_TOKEN"]
    },
    "test": {
      "env": ["TEST_DATABASE_URL"]
    }
  }
}
```
