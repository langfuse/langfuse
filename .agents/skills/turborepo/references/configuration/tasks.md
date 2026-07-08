# Task Configuration Reference

Full docs: https://turborepo.dev/docs/reference/configuration#tasks

## dependsOn

Controls task execution order.

```json
{
  "tasks": {
    "build": {
      "dependsOn": [
        "^build", // Dependencies' build tasks first
        "codegen", // Same package's codegen task first
        "shared#build" // Specific package's build task
      ]
    }
  }
}
```

| Syntax     | Meaning                              |
| ---------- | ------------------------------------ |
| `^task`    | Run `task` in all dependencies first |
| `task`     | Run `task` in same package first     |
| `pkg#task` | Run specific package's task first    |

The `^` prefix is crucial - without it, you're referencing the same package.

### Transit Nodes for Parallel Tasks

For tasks like `lint` and `check-types` that can run in parallel but need dependency-aware caching:

```json
{
  "tasks": {
    "transit": { "dependsOn": ["^transit"] },
    "lint": { "dependsOn": ["transit"] },
    "check-types": { "dependsOn": ["transit"] }
  }
}
```

**DO NOT use `dependsOn: ["^lint"]`** - this forces sequential execution.
**DO NOT use `dependsOn: []`** - this breaks cache invalidation.

The `transit` task creates dependency relationships without running anything (no matching script), so tasks run in parallel with correct caching.

## outputs

Glob patterns for files to cache. **If omitted, nothing is cached.**

```json
{
  "tasks": {
    "build": {
      "outputs": ["dist/**", "build/**"]
    }
  }
}
```

**Framework examples:**

```json
// Next.js
"outputs": [".next/**", "!.next/cache/**"]

// Vite
"outputs": ["dist/**"]

// TypeScript (tsc)
"outputs": ["dist/**", "*.tsbuildinfo"]

// No file outputs (lint, typecheck)
"outputs": []
```

Use `!` prefix to exclude patterns from caching.

## inputs

Files considered when calculating task hash. Defaults to all tracked files in package.

```json
{
  "tasks": {
    "test": {
      "inputs": ["src/**", "tests/**", "vitest.config.ts"]
    }
  }
}
```

**Special values:**

| Value                 | Meaning                                 |
| --------------------- | --------------------------------------- |
| `$TURBO_DEFAULT$`     | Include default inputs, then add/remove |
| `$TURBO_ROOT$/<path>` | Reference files from repo root          |

```json
{
  "tasks": {
    "build": {
      "inputs": [
        "$TURBO_DEFAULT$",
        "!README.md",
        "$TURBO_ROOT$/tsconfig.base.json"
      ]
    }
  }
}
```

### Interaction with `global.inputs`

When `futureFlags.globalConfiguration` is enabled, files listed in `global.inputs` are prepended to every task's `inputs`. The combined list is then used to compute the task hash.

This is different from `globalDependencies`, where files were hashed into the **global** hash and could not be influenced by task-level `inputs`.

**With `globalDependencies` (old behavior):**

- `globalDependencies` files contribute to the global hash
- Task `inputs` only control which **package** files are hashed
- There is no way for a task to "opt out" of a `globalDependencies` file

**With `global.inputs` (new behavior):**

- `global.inputs` files are merged into each task's `inputs` globs
- Task `inputs` and `global.inputs` are combined, then the full list is hashed into the **task** hash
- Tasks can exclude specific global files with negation globs

```json
{
  "futureFlags": { "globalConfiguration": true },
  "global": {
    "inputs": ["tsconfig.json", ".env"]
  },
  "tasks": {
    "build": {},
    "lint": {
      "inputs": ["$TURBO_DEFAULT$", "!$TURBO_ROOT$/.env"]
    }
  }
}
```

In this example:

- `build` hashes all package files + `tsconfig.json` + `.env` (from `global.inputs`)
- `lint` hashes all package files + `tsconfig.json`, but **excludes** `.env` because of the negation glob

Tasks with no explicit `inputs` key still hash all package files (the default behavior) plus the `global.inputs` files.

## env

Environment variables to include in task hash.

```json
{
  "tasks": {
    "build": {
      "env": [
        "API_URL",
        "NEXT_PUBLIC_*", // Wildcard matching
        "!DEBUG" // Exclude from hash
      ]
    }
  }
}
```

Variables listed here affect cache hits - changing the value invalidates cache.

## cache

Enable/disable caching for a task. Default: `true`.

```json
{
  "tasks": {
    "dev": { "cache": false },
    "deploy": { "cache": false }
  }
}
```

Disable for: dev servers, deploy commands, tasks with side effects.

## persistent

Mark long-running tasks that don't exit. Default: `false`.

```json
{
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Required for dev servers - without it, dependent tasks wait forever.

## interactive

Allow task to receive stdin input. Default: `false`.

```json
{
  "tasks": {
    "login": {
      "cache": false,
      "interactive": true
    }
  }
}
```

## outputLogs

Control when logs are shown. Options: `full`, `hash-only`, `new-only`, `errors-only`, `none`.

```json
{
  "tasks": {
    "build": {
      "outputLogs": "new-only" // Only show logs on cache miss
    }
  }
}
```

## with

Run tasks alongside this task. For long-running tasks that need runtime dependencies.

```json
{
  "tasks": {
    "dev": {
      "with": ["api#dev"],
      "persistent": true,
      "cache": false
    }
  }
}
```

Unlike `dependsOn`, `with` runs tasks concurrently (not sequentially). Use for dev servers that need other services running.

## interruptible

Allow `turbo watch` to restart the task on changes. Default: `false`.

```json
{
  "tasks": {
    "dev": {
      "persistent": true,
      "interruptible": true,
      "cache": false
    }
  }
}
```

Use for dev servers that don't automatically detect dependency changes.

## description

Human-readable description of the task.

```json
{
  "tasks": {
    "build": {
      "description": "Compiles the application for production deployment"
    }
  }
}
```

For documentation only - doesn't affect execution or caching.

## passThroughEnv

Environment variables available at runtime but NOT included in cache hash.

```json
{
  "tasks": {
    "build": {
      "passThroughEnv": ["AWS_SECRET_KEY", "GITHUB_TOKEN"]
    }
  }
}
```

**Warning**: Changes to these vars won't cause cache misses. Use `env` if changes should invalidate cache.

## extends (Package Configuration only)

Control task inheritance in Package Configurations.

```json
// packages/ui/turbo.json
{
  "extends": ["//"],
  "tasks": {
    "lint": {
      "extends": false // Exclude from this package
    }
  }
}
```

| Value            | Behavior                                                       |
| ---------------- | -------------------------------------------------------------- |
| `true` (default) | Inherit from root turbo.json                                   |
| `false`          | Exclude task from package, or define fresh without inheritance |
