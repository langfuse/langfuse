# Environment Variable Gotchas

Common mistakes and how to fix them.

## .env Files Must Be in `inputs`

Turbo does NOT read `.env` files. Your framework (Next.js, Vite, etc.) or `dotenv` loads them. But Turbo needs to know when they change.

**Wrong:**

```json
{
  "tasks": {
    "build": {
      "env": ["DATABASE_URL"]
    }
  }
}
```

**Right:**

```json
{
  "tasks": {
    "build": {
      "env": ["DATABASE_URL"],
      "inputs": ["$TURBO_DEFAULT$", ".env", ".env.local", ".env.production"]
    }
  }
}
```

## Strict Mode Filters CI Variables

In strict mode, CI provider variables (GITHUB_TOKEN, GITLAB_CI, etc.) are filtered unless explicitly listed.

**Symptom:** Task fails with "authentication required" or "permission denied" in CI.

**Solution:**

```json
{
  "globalPassThroughEnv": ["GITHUB_TOKEN", "GITLAB_CI", "CI"]
}
```

## passThroughEnv Doesn't Affect Hash

Variables in `passThroughEnv` are available at runtime but changes WON'T trigger rebuilds.

**Dangerous example:**

```json
{
  "tasks": {
    "build": {
      "passThroughEnv": ["API_URL"]
    }
  }
}
```

If `API_URL` changes from staging to production, Turbo may serve a cached build pointing to the wrong API.

**Use passThroughEnv only for:**

- Auth tokens that don't affect output (SENTRY_AUTH_TOKEN)
- CI metadata (GITHUB_RUN_ID)
- Variables consumed after build (deploy credentials)

## Runtime-Created Variables Are Invisible

Turbo captures env vars at startup. Variables created during execution aren't seen.

**Won't work:**

```bash
# In package.json scripts
"build": "export API_URL=$COMPUTED_VALUE && next build"
```

**Solution:** Set vars before invoking turbo:

```bash
API_URL=$COMPUTED_VALUE turbo run build
```

## Different .env Files for Different Environments

If you use `.env.development` and `.env.production`, both should be in inputs.

```json
{
  "tasks": {
    "build": {
      "inputs": [
        "$TURBO_DEFAULT$",
        ".env",
        ".env.local",
        ".env.development",
        ".env.development.local",
        ".env.production",
        ".env.production.local"
      ]
    }
  }
}
```

## Complete Next.js Example

```json
{
  "$schema": "https://v2-8-21-canary-9.turborepo.dev/schema.json",
  "globalEnv": ["CI", "NODE_ENV", "VERCEL"],
  "globalPassThroughEnv": ["GITHUB_TOKEN", "VERCEL_URL"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "env": ["DATABASE_URL", "NEXT_PUBLIC_*", "!NEXT_PUBLIC_ANALYTICS_ID"],
      "passThroughEnv": ["SENTRY_AUTH_TOKEN"],
      "inputs": [
        "$TURBO_DEFAULT$",
        ".env",
        ".env.local",
        ".env.production",
        ".env.production.local"
      ],
      "outputs": [".next/**", "!.next/cache/**"]
    }
  }
}
```

This config:

- Hashes DATABASE*URL and NEXT_PUBLIC*\* vars (except analytics)
- Passes through SENTRY_AUTH_TOKEN without hashing
- Includes all .env file variants in the hash
- Makes CI tokens available globally

### With `futureFlags.globalConfiguration`

The same config using the `global` key. The `.env` files move to `global.inputs`, which means they get folded into each task's hash individually rather than the global hash. This lets tasks exclude specific `.env` files if needed.

```json
{
  "$schema": "https://v2-8-21-canary-9.turborepo.dev/schema.json",
  "futureFlags": { "globalConfiguration": true },
  "global": {
    "env": ["CI", "NODE_ENV", "VERCEL"],
    "passThroughEnv": ["GITHUB_TOKEN", "VERCEL_URL"],
    "inputs": [".env", ".env.local", ".env.production", ".env.production.local"]
  },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "env": ["DATABASE_URL", "NEXT_PUBLIC_*", "!NEXT_PUBLIC_ANALYTICS_ID"],
      "passThroughEnv": ["SENTRY_AUTH_TOKEN"],
      "outputs": [".next/**", "!.next/cache/**"]
    }
  }
}
```

With this approach, a task that doesn't care about `.env.production` can exclude it:

```json
"lint": {
  "inputs": ["$TURBO_DEFAULT$", "!$TURBO_ROOT$/.env.production"]
}
```

This wouldn't have been possible with `globalDependencies`, where `.env.production` would be baked into the global hash and affect every task unconditionally.
