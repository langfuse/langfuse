# Repository Structure

Detailed guidance on structuring a Turborepo monorepo.

## Workspace Configuration

### pnpm (Recommended)

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

### npm/yarn/bun

```json
// package.json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

## Root package.json

```json
{
  "name": "my-monorepo",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "latest"
  }
}
```

Key points:

- `private: true` - Prevents accidental publishing
- `packageManager` - Enforces consistent package manager version
- **Scripts only delegate to `turbo run`** - No actual build logic here!
- Minimal devDependencies (just turbo and repo tools)

## Always Prefer Package Tasks

**Always use package tasks. Only use Root Tasks if you cannot succeed with package tasks.**

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

Package tasks enable Turborepo to:

1. **Parallelize** - Run `web#lint` and `api#lint` simultaneously
2. **Cache individually** - Each package's task output is cached separately
3. **Filter precisely** - Run `turbo run test --filter=web` for just one package

**Root Tasks are a fallback** for tasks that truly cannot run per-package:

```json
// AVOID unless necessary - sequential, not parallelized, can't filter
{
  "scripts": {
    "lint": "eslint apps/web && eslint apps/api && eslint packages/ui"
  }
}
```

## Root turbo.json

```json
{
  "$schema": "https://v2-8-21-canary-9.turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "lint": {},
    "test": {
      "dependsOn": ["build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

With `futureFlags.globalConfiguration`, global settings move under a `global` key:

```json
{
  "$schema": "https://v2-8-21-canary-9.turborepo.dev/schema.json",
  "futureFlags": { "globalConfiguration": true },
  "global": {
    "inputs": ["tsconfig.json"],
    "env": ["CI"]
  },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "lint": {},
    "test": {
      "dependsOn": ["build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

## Directory Organization

### Grouping Packages

You can group packages by adding more workspace paths:

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "packages/config/*" # Grouped configs
  - "packages/features/*" # Feature packages
```

This allows:

```
packages/
├── ui/
├── utils/
├── config/
│   ├── eslint/
│   ├── typescript/
│   └── tailwind/
└── features/
    ├── auth/
    └── payments/
```

### What NOT to Do

```yaml
# BAD: Nested wildcards cause ambiguous behavior
packages:
  - "packages/**" # Don't do this!
```

## Package Anatomy

### Minimum Required Files

```
packages/ui/
├── package.json    # Required: Makes it a package
├── src/            # Source code
│   └── button.tsx
└── tsconfig.json   # TypeScript config (if using TS)
```

### package.json Requirements

```json
{
  "name": "@repo/ui", // Unique, namespaced name
  "version": "0.0.0", // Version (can be 0.0.0 for internal)
  "private": true, // Prevents accidental publishing
  "exports": {
    // Entry points
    "./button": "./src/button.tsx"
  }
}
```

## TypeScript Configuration

### Shared Base Config

Create a shared TypeScript config package:

```
packages/
└── typescript-config/
    ├── package.json
    ├── base.json
    ├── nextjs.json
    └── library.json
```

```json
// packages/typescript-config/base.json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022"
  }
}
```

### Extending in Packages

```json
// packages/ui/tsconfig.json
{
  "extends": "@repo/typescript-config/library.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### No Root tsconfig.json

You likely don't need a `tsconfig.json` in the workspace root. Each package should have its own config extending from the shared config package.

## ESLint Configuration

### Shared Config Package

```
packages/
└── eslint-config/
    ├── package.json
    ├── base.js
    ├── next.js
    └── library.js
```

```json
// packages/eslint-config/package.json
{
  "name": "@repo/eslint-config",
  "exports": {
    "./base": "./base.js",
    "./next": "./next.js",
    "./library": "./library.js"
  }
}
```

### Using in Packages

```js
// apps/web/.eslintrc.js
module.exports = {
  extends: ["@repo/eslint-config/next"]
};
```

## Lockfile

A lockfile is **required** for:

- Reproducible builds
- Turborepo to understand package dependencies
- Cache correctness

Without a lockfile, you'll see unpredictable behavior.
