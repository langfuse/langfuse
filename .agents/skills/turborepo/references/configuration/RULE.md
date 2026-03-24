# turbo.json Configuration Overview

Configuration reference for Turborepo. Full docs: https://turborepo.dev/docs/reference/configuration

## File Location

Root `turbo.json` lives at repo root, sibling to root `package.json`:

```
my-monorepo/
├── turbo.json        # Root configuration
├── package.json
└── packages/
    └── web/
        ├── turbo.json  # Package Configuration (optional)
        └── package.json
```

## Always Prefer Package Tasks Over Root Tasks

**Always use package tasks. Only use Root Tasks if you cannot succeed with package tasks.**

Package tasks enable parallelization, individual caching, and filtering. Define scripts in each package's `package.json`:

```json
// packages/web/package.json
{
  "scripts": {
    "build": "next build",
    "lint": "eslint .",
    "test": "vitest",
    "typecheck": "tsc --noEmit"
  }
}

// packages/api/package.json
{
  "scripts": {
    "build": "tsc",
    "lint": "eslint .",
    "test": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

```json
// Root package.json - delegates to turbo
{
  "scripts": {
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  }
}
```

When you run `turbo run lint`, Turborepo finds all packages with a `lint` script and runs them **in parallel**.

**Root Tasks are a fallback**, not the default. Only use them for tasks that truly cannot run per-package (e.g., repo-level CI scripts, workspace-wide config generation).

```json
// AVOID: Task logic in root defeats parallelization
{
  "scripts": {
    "lint": "eslint apps/web && eslint apps/api && eslint packages/ui"
  }
}
```

## Basic Structure

```json
{
  "$schema": "https://v2-8-21-canary-9.turborepo.dev/schema.json",
  "globalEnv": ["CI"],
  "globalDependencies": ["tsconfig.json"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

The `$schema` key enables IDE autocompletion and validation.

### With `futureFlags.globalConfiguration`

When the `globalConfiguration` future flag is enabled, global options move under a `global` key with cleaner names:

```json
{
  "$schema": "https://v2-8-21-canary-9.turborepo.dev/schema.json",
  "futureFlags": { "globalConfiguration": true },
  "global": {
    "inputs": ["tsconfig.json"],
    "env": ["CI"],
    "ui": "tui"
  },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

See the [global options reference](./global-options.md) for the full rename mapping and behavior changes.

## Configuration Sections

**Global options** - Settings affecting all tasks:

- Without flag: `globalEnv`, `globalDependencies`, `globalPassThroughEnv`, `cacheDir`, `daemon`, `envMode`, `ui`, `remoteCache`
- With `globalConfiguration` flag: all of the above move under the `global` key (see [global options](./global-options.md))

**Task definitions** - Per-task settings in `tasks` object:

- `dependsOn`, `outputs`, `inputs`, `env`
- `cache`, `persistent`, `interactive`, `outputLogs`

## Package Configurations

Use `turbo.json` in individual packages to override root settings:

```json
// packages/web/turbo.json
{
  "extends": ["//"],
  "tasks": {
    "build": {
      "outputs": [".next/**", "!.next/cache/**"]
    }
  }
}
```

The `"extends": ["//"]` is required - it references the root configuration.

**When to use Package Configurations:**

- Framework-specific outputs (Next.js, Vite, etc.)
- Package-specific env vars
- Different caching rules for specific packages
- Keeping framework config close to the framework code

### Extending from Other Packages

You can extend from config packages instead of just root:

```json
// packages/web/turbo.json
{
  "extends": ["//", "@repo/turbo-config"]
}
```

### Adding to Inherited Arrays with `$TURBO_EXTENDS$`

By default, array fields in Package Configurations **replace** root values. Use `$TURBO_EXTENDS$` to **append** instead:

```json
// Root turbo.json
{
  "tasks": {
    "build": {
      "outputs": ["dist/**"]
    }
  }
}
```

```json
// packages/web/turbo.json
{
  "extends": ["//"],
  "tasks": {
    "build": {
      // Inherits "dist/**" from root, adds ".next/**"
      "outputs": ["$TURBO_EXTENDS$", ".next/**", "!.next/cache/**"]
    }
  }
}
```

Without `$TURBO_EXTENDS$`, outputs would only be `[".next/**", "!.next/cache/**"]`.

**Works with:**

- `dependsOn`
- `env`
- `inputs`
- `outputs`
- `passThroughEnv`
- `with`

### Excluding Tasks from Packages

Use `extends: false` to exclude a task from a package:

```json
// packages/ui/turbo.json
{
  "extends": ["//"],
  "tasks": {
    "e2e": {
      "extends": false // UI package doesn't have e2e tests
    }
  }
}
```

## `turbo.jsonc` for Comments

Use `turbo.jsonc` extension to add comments with IDE support:

```jsonc
// turbo.jsonc
{
  "tasks": {
    "build": {
      // Next.js outputs
      "outputs": [".next/**", "!.next/cache/**"]
    }
  }
}
```
