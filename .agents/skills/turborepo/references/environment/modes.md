# Environment Modes

Turborepo supports different modes for handling environment variables during task execution.

## Strict Mode (Default)

Only explicitly configured variables are available to tasks.

**Behavior:**

- Tasks only see vars listed in `env`, `globalEnv`, `passThroughEnv`, or `globalPassThroughEnv`
- Unlisted vars are filtered out
- Tasks fail if they require unlisted variables

**Benefits:**

- Guarantees cache correctness
- Prevents accidental dependencies on system vars
- Reproducible builds across machines

```bash
# Explicit (though it's the default)
turbo run build --env-mode=strict
```

## Loose Mode

All system environment variables are available to tasks.

```bash
turbo run build --env-mode=loose
```

**Behavior:**

- Every system env var is passed through
- Only vars in `env`/`globalEnv` affect the hash
- Other vars are available but NOT hashed

**Risks:**

- Cache may restore incorrect results if unhashed vars changed
- "Works on my machine" bugs
- CI vs local environment mismatches

**Use case:** Migrating legacy projects or debugging strict mode issues.

## Framework Inference (Automatic)

Turborepo automatically detects frameworks and includes their conventional env vars.

### Inferred Variables by Framework

| Framework        | Pattern             |
| ---------------- | ------------------- |
| Next.js          | `NEXT_PUBLIC_*`     |
| Vite             | `VITE_*`            |
| Create React App | `REACT_APP_*`       |
| Gatsby           | `GATSBY_*`          |
| Nuxt             | `NUXT_*`, `NITRO_*` |
| Expo             | `EXPO_PUBLIC_*`     |
| Astro            | `PUBLIC_*`          |
| SvelteKit        | `PUBLIC_*`          |
| Remix            | `REMIX_*`           |
| Redwood          | `REDWOOD_ENV_*`     |
| Sanity           | `SANITY_STUDIO_*`   |
| Solid            | `VITE_*`            |

### Disabling Framework Inference

Globally via CLI:

```bash
turbo run build --framework-inference=false
```

Or exclude specific patterns in config:

```json
{
  "tasks": {
    "build": {
      "env": ["!NEXT_PUBLIC_*"]
    }
  }
}
```

### Why Disable?

- You want explicit control over all env vars
- Framework vars shouldn't bust the cache (e.g., analytics IDs)
- Debugging unexpected cache misses

## Checking Environment Mode

Use `--dry` to see which vars affect each task:

```bash
turbo run build --dry=json | jq '.tasks[].environmentVariables'
```
