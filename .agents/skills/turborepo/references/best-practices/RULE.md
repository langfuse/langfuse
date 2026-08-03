# Monorepo Best Practices

Essential patterns for structuring and maintaining a healthy Turborepo monorepo.

## Repository Structure

### Standard Layout

```
my-monorepo/
├── apps/                    # Application packages (deployable)
│   ├── web/
│   ├── docs/
│   └── api/
├── packages/                # Library packages (shared code)
│   ├── ui/
│   ├── utils/
│   └── config-*/           # Shared configs (eslint, typescript, etc.)
├── package.json            # Root package.json (minimal deps)
├── turbo.json              # Turborepo configuration
├── pnpm-workspace.yaml     # (pnpm) or workspaces in package.json
└── pnpm-lock.yaml          # Lockfile (required)
```

### Key Principles

1. **`apps/` for deployables**: Next.js sites, APIs, CLIs - things that get deployed
2. **`packages/` for libraries**: Shared code consumed by apps or other packages
3. **One purpose per package**: Each package should do one thing well
4. **No nested packages**: Don't put packages inside packages

## Package Types

### Application Packages (`apps/`)

- **Deployable**: These are the "endpoints" of your package graph
- **Not installed by other packages**: Apps shouldn't be dependencies of other packages
- **No shared code**: If code needs sharing, extract to `packages/`

```json
// apps/web/package.json
{
  "name": "web",
  "private": true,
  "dependencies": {
    "@repo/ui": "workspace:*",
    "next": "latest"
  }
}
```

### Library Packages (`packages/`)

- **Shared code**: Utilities, components, configs
- **Namespaced names**: Use `@repo/` or `@yourorg/` prefix
- **Clear exports**: Define what the package exposes

```json
// packages/ui/package.json
{
  "name": "@repo/ui",
  "exports": {
    "./button": "./src/button.tsx",
    "./card": "./src/card.tsx"
  }
}
```

## Package Compilation Strategies

### Just-in-Time (Simplest)

Export TypeScript directly; let the app's bundler compile it.

```json
{
  "name": "@repo/ui",
  "exports": {
    "./button": "./src/button.tsx"
  }
}
```

**Pros**: Zero build config, instant changes
**Cons**: Can't cache builds, requires app bundler support

### Compiled (Recommended for Libraries)

Package compiles itself with `tsc` or bundler.

```json
{
  "name": "@repo/ui",
  "exports": {
    "./button": {
      "types": "./src/button.tsx",
      "default": "./dist/button.js"
    }
  },
  "scripts": {
    "build": "tsc"
  }
}
```

**Pros**: Cacheable by Turborepo, works everywhere
**Cons**: More configuration

## Dependency Management

### Install Where Used

Install dependencies in the package that uses them, not the root.

```bash
# Good: Install in the package that needs it
pnpm add lodash --filter=@repo/utils

# Avoid: Installing everything at root
pnpm add lodash -w  # Only for repo-level tools
```

### Root Dependencies

Only these belong in root `package.json`:

- `turbo` - The build system
- `husky`, `lint-staged` - Git hooks
- Repository-level tooling

### Internal Dependencies

Use workspace protocol for internal packages:

```json
// pnpm/bun
{ "@repo/ui": "workspace:*" }

// npm/yarn
{ "@repo/ui": "*" }
```

## Exports Best Practices

### Use `exports` Field (Not `main`)

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./button": "./src/button.tsx",
    "./utils": "./src/utils.ts"
  }
}
```

### Avoid Barrel Files

Don't create `index.ts` files that re-export everything:

```typescript
// BAD: packages/ui/src/index.ts
export * from './button';
export * from './card';
export * from './modal';
// ... imports everything even if you need one thing

// GOOD: Direct exports in package.json
{
  "exports": {
    "./button": "./src/button.tsx",
    "./card": "./src/card.tsx"
  }
}
```

### Namespace Your Packages

```json
// Good
{ "name": "@repo/ui" }
{ "name": "@acme/utils" }

// Avoid (conflicts with npm registry)
{ "name": "ui" }
{ "name": "utils" }
```

## Common Anti-Patterns

### Accessing Files Across Package Boundaries

```typescript
// BAD: Reaching into another package
import { Button } from "../../packages/ui/src/button";

// GOOD: Install and import properly
import { Button } from "@repo/ui/button";
```

### Shared Code in Apps

```
// BAD
apps/
  web/
    shared/        # This should be a package!
      utils.ts

// GOOD
packages/
  utils/           # Proper shared package
    src/utils.ts
```

### Too Many Root Dependencies

```json
// BAD: Root has app dependencies
{
  "dependencies": {
    "react": "^18",
    "next": "^14",
    "lodash": "^4"
  }
}

// GOOD: Root only has repo tools
{
  "devDependencies": {
    "turbo": "latest",
    "husky": "latest"
  }
}
```

## See Also

- [structure.md](./structure.md) - Detailed repository structure patterns
- [packages.md](./packages.md) - Creating and managing internal packages
- [dependencies.md](./dependencies.md) - Dependency management strategies
