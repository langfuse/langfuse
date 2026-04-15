# Creating Internal Packages

How to create and structure internal packages in your monorepo.

## Package Creation Checklist

1. Create directory in `packages/`
2. Add `package.json` with name and exports
3. Add source code in `src/`
4. Add `tsconfig.json` if using TypeScript
5. Install as dependency in consuming packages
6. Run package manager install to update lockfile

## Package Compilation Strategies

### Just-in-Time (JIT)

Export TypeScript directly. The consuming app's bundler compiles it.

```json
// packages/ui/package.json
{
  "name": "@repo/ui",
  "exports": {
    "./button": "./src/button.tsx",
    "./card": "./src/card.tsx"
  },
  "scripts": {
    "lint": "eslint .",
    "check-types": "tsc --noEmit"
  }
}
```

**When to use:**

- Apps use modern bundlers (Turbopack, webpack, Vite)
- You want minimal configuration
- Build times are acceptable without caching

**Limitations:**

- No Turborepo cache for the package itself
- Consumer must support TypeScript compilation
- Can't use TypeScript `paths` (use Node.js subpath imports instead)

### Compiled

Package handles its own compilation.

```json
// packages/ui/package.json
{
  "name": "@repo/ui",
  "exports": {
    "./button": {
      "types": "./src/button.tsx",
      "default": "./dist/button.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

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

**When to use:**

- You want Turborepo to cache builds
- Package will be used by non-bundler tools
- You need maximum compatibility

**Remember:** Add `dist/**` to turbo.json outputs!

## Defining Exports

### Multiple Entrypoints

```json
{
  "exports": {
    ".": "./src/index.ts", // @repo/ui
    "./button": "./src/button.tsx", // @repo/ui/button
    "./card": "./src/card.tsx", // @repo/ui/card
    "./hooks": "./src/hooks/index.ts" // @repo/ui/hooks
  }
}
```

### Conditional Exports (Compiled)

```json
{
  "exports": {
    "./button": {
      "types": "./src/button.tsx",
      "import": "./dist/button.mjs",
      "require": "./dist/button.cjs",
      "default": "./dist/button.js"
    }
  }
}
```

## Installing Internal Packages

### Add to Consuming Package

```json
// apps/web/package.json
{
  "dependencies": {
    "@repo/ui": "workspace:*" // pnpm/bun
    // "@repo/ui": "*"         // npm/yarn
  }
}
```

### Run Install

```bash
pnpm install  # Updates lockfile with new dependency
```

### Import and Use

```typescript
// apps/web/src/page.tsx
import { Button } from '@repo/ui/button';

export default function Page() {
  return <Button>Click me</Button>;
}
```

## One Purpose Per Package

### Good Examples

```
packages/
├── ui/                  # Shared UI components
├── utils/               # General utilities
├── auth/                # Authentication logic
├── database/            # Database client/schemas
├── eslint-config/       # ESLint configuration
├── typescript-config/   # TypeScript configuration
└── api-client/          # Generated API client
```

### Avoid Mega-Packages

```
// BAD: One package for everything
packages/
└── shared/
    ├── components/
    ├── utils/
    ├── hooks/
    ├── types/
    └── api/

// GOOD: Separate by purpose
packages/
├── ui/          # Components
├── utils/       # Utilities
├── hooks/       # React hooks
├── types/       # Shared TypeScript types
└── api-client/  # API utilities
```

## Config Packages

### TypeScript Config

```json
// packages/typescript-config/package.json
{
  "name": "@repo/typescript-config",
  "exports": {
    "./base.json": "./base.json",
    "./nextjs.json": "./nextjs.json",
    "./library.json": "./library.json"
  }
}
```

### ESLint Config

```json
// packages/eslint-config/package.json
{
  "name": "@repo/eslint-config",
  "exports": {
    "./base": "./base.js",
    "./next": "./next.js"
  },
  "dependencies": {
    "eslint": "^8.0.0",
    "eslint-config-next": "latest"
  }
}
```

## Common Mistakes

### Forgetting to Export

```json
// BAD: No exports defined
{
  "name": "@repo/ui"
}

// GOOD: Clear exports
{
  "name": "@repo/ui",
  "exports": {
    "./button": "./src/button.tsx"
  }
}
```

### Wrong Workspace Syntax

```json
// pnpm/bun
{ "@repo/ui": "workspace:*" }  // Correct

// npm/yarn
{ "@repo/ui": "*" }            // Correct
{ "@repo/ui": "workspace:*" }  // Wrong for npm/yarn!
```

### Missing from turbo.json Outputs

```json
// Package builds to dist/, but turbo.json doesn't know
{
  "tasks": {
    "build": {
      "outputs": [".next/**"]  // Missing dist/**!
    }
  }
}

// Correct
{
  "tasks": {
    "build": {
      "outputs": [".next/**", "dist/**"]
    }
  }
}
```

## TypeScript Best Practices

### Use Node.js Subpath Imports (Not `paths`)

TypeScript `compilerOptions.paths` breaks with JIT packages. Use Node.js subpath imports instead (TypeScript 5.4+).

**JIT Package:**

```json
// packages/ui/package.json
{
  "imports": {
    "#*": "./src/*"
  }
}
```

```typescript
// packages/ui/button.tsx
import { MY_STRING } from "#utils.ts"; // Uses .ts extension
```

**Compiled Package:**

```json
// packages/ui/package.json
{
  "imports": {
    "#*": "./dist/*"
  }
}
```

```typescript
// packages/ui/button.tsx
import { MY_STRING } from "#utils.js"; // Uses .js extension
```

### Use `tsc` for Internal Packages

For internal packages, prefer `tsc` over bundlers. Bundlers can mangle code before it reaches your app's bundler, causing hard-to-debug issues.

### Enable Go-to-Definition

For Compiled Packages, enable declaration maps:

```json
// tsconfig.json
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true
  }
}
```

This creates `.d.ts` and `.d.ts.map` files for IDE navigation.

### No Root tsconfig.json Needed

Each package should have its own `tsconfig.json`. A root one causes all tasks to miss cache when changed. Only use root `tsconfig.json` for non-package scripts.

### Avoid TypeScript Project References

They add complexity and another caching layer. Turborepo handles dependencies better.
