# Dependency Management

Best practices for managing dependencies in a Turborepo monorepo.

## Core Principle: Install Where Used

Dependencies belong in the package that uses them, not the root.

```bash
# Good: Install in specific package
pnpm add react --filter=@repo/ui
pnpm add next --filter=web

# Avoid: Installing in root
pnpm add react -w  # Only for repo-level tools!
```

## Benefits of Local Installation

### 1. Clarity

Each package's `package.json` lists exactly what it needs:

```json
// packages/ui/package.json
{
  "dependencies": {
    "react": "^18.0.0",
    "class-variance-authority": "^0.7.0"
  }
}
```

### 2. Flexibility

Different packages can use different versions when needed:

```json
// packages/legacy-ui/package.json
{ "dependencies": { "react": "^17.0.0" } }

// packages/ui/package.json
{ "dependencies": { "react": "^18.0.0" } }
```

### 3. Better Caching

Installing in root changes workspace lockfile, invalidating all caches.

### 4. Pruning Support

`turbo prune` can remove unused dependencies for Docker images.

## What Belongs in Root

Only repository-level tools:

```json
// Root package.json
{
  "devDependencies": {
    "turbo": "latest",
    "husky": "^8.0.0",
    "lint-staged": "^15.0.0"
  }
}
```

**NOT** application dependencies:

- react, next, express
- lodash, axios, zod
- Testing libraries (unless truly repo-wide)

## Installing Dependencies

### Single Package

```bash
# pnpm
pnpm add lodash --filter=@repo/utils

# npm
npm install lodash --workspace=@repo/utils

# yarn
yarn workspace @repo/utils add lodash

# bun
cd packages/utils && bun add lodash
```

### Multiple Packages

```bash
# pnpm
pnpm add jest --save-dev --filter=web --filter=@repo/ui

# npm
npm install jest --save-dev --workspace=web --workspace=@repo/ui

# yarn (v2+)
yarn workspaces foreach -R --from '{web,@repo/ui}' add jest --dev
```

### Internal Packages

```bash
# pnpm
pnpm add @repo/ui --filter=web

# This updates package.json:
{
  "dependencies": {
    "@repo/ui": "workspace:*"
  }
}
```

## Keeping Versions in Sync

### Option 1: Tooling

```bash
# syncpack - Check and fix version mismatches
npx syncpack list-mismatches
npx syncpack fix-mismatches

# manypkg - Similar functionality
npx @manypkg/cli check
npx @manypkg/cli fix

# sherif - Rust-based, very fast
npx sherif
```

### Option 2: Package Manager Commands

```bash
# pnpm - Update everywhere
pnpm up --recursive typescript@latest

# npm - Update in all workspaces
npm install typescript@latest --workspaces
```

### Option 3: pnpm Catalogs (pnpm 9.5+)

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"

catalog:
  react: ^18.2.0
  typescript: ^5.3.0
```

```json
// Any package.json
{
  "dependencies": {
    "react": "catalog:" // Uses version from catalog
  }
}
```

## Internal vs External Dependencies

### Internal (Workspace)

```json
// pnpm/bun
{ "@repo/ui": "workspace:*" }

// npm/yarn
{ "@repo/ui": "*" }
```

Turborepo understands these relationships and orders builds accordingly.

### External (npm Registry)

```json
{ "lodash": "^4.17.21" }
```

Standard semver versioning from npm.

## Peer Dependencies

For library packages that expect the consumer to provide dependencies:

```json
// packages/ui/package.json
{
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "react": "^18.0.0", // For development/testing
    "react-dom": "^18.0.0"
  }
}
```

## Common Issues

### "Module not found"

1. Check the dependency is installed in the right package
2. Run `pnpm install` / `npm install` to update lockfile
3. Check exports are defined in the package

### Version Conflicts

Packages can use different versions - this is a feature, not a bug. But if you need consistency:

1. Use tooling (syncpack, manypkg)
2. Use pnpm catalogs
3. Create a lint rule

### Hoisting Issues

Some tools expect dependencies in specific locations. Use package manager config:

```yaml
# .npmrc (pnpm)
public-hoist-pattern[]=*eslint*
public-hoist-pattern[]=*prettier*
```

## Lockfile

**Required** for:

- Reproducible builds
- Turborepo dependency analysis
- Cache correctness

```bash
# Commit your lockfile!
git add pnpm-lock.yaml  # or package-lock.json, yarn.lock
```
