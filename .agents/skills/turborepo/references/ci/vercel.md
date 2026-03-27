# Vercel Deployment

Turborepo integrates seamlessly with Vercel for monorepo deployments.

## Remote Cache

Remote caching is **automatically enabled** when deploying to Vercel. No configuration needed - Vercel detects Turborepo and enables caching.

This means:

- No `TURBO_TOKEN` or `TURBO_TEAM` setup required on Vercel
- Cache is shared across all deployments
- Preview and production builds benefit from cache

## turbo-ignore

Skip unnecessary builds when a package hasn't changed using `turbo-ignore`.

### Installation

```bash
npx turbo-ignore
```

Or install globally in your project:

```bash
pnpm add -D turbo-ignore
```

### Setup in Vercel

1. Go to your project in Vercel Dashboard
2. Navigate to Settings > Git > Ignored Build Step
3. Select "Custom" and enter:

```bash
npx turbo-ignore
```

### How It Works

`turbo-ignore` checks if the current package (or its dependencies) changed since the last successful deployment:

1. Compares current commit to last deployed commit
2. Uses Turborepo's dependency graph
3. Returns exit code 0 (skip) if no changes
4. Returns exit code 1 (build) if changes detected

### Options

```bash
# Check specific package
npx turbo-ignore web

# Use specific comparison ref
npx turbo-ignore --fallback=HEAD~1

# Verbose output
npx turbo-ignore --verbose
```

## Environment Variables

Set environment variables in Vercel Dashboard:

1. Go to Project Settings > Environment Variables
2. Add variables for each environment (Production, Preview, Development)

Common variables:

- `DATABASE_URL`
- `API_KEY`
- Package-specific config

## Monorepo Root Directory

For monorepos, set the root directory in Vercel:

1. Project Settings > General > Root Directory
2. Set to the package path (e.g., `apps/web`)

Vercel automatically:

- Installs dependencies from monorepo root
- Runs build from the package directory
- Detects framework settings

## Build Command

Vercel auto-detects `turbo run build` when `turbo.json` exists at root.

Override if needed:

```bash
turbo run build --filter=web
```

Or for production-only optimizations:

```bash
turbo run build --filter=web --env-mode=strict
```
