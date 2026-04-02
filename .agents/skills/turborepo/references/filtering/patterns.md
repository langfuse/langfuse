# Common Filter Patterns

Practical examples for typical monorepo scenarios.

## Single Package

Run task in one package:

```bash
turbo run build --filter=web
turbo run test --filter=@acme/api
```

## Package with Dependencies

Build a package and everything it depends on:

```bash
turbo run build --filter=web...
```

Useful for: ensuring all dependencies are built before the target.

## Package Dependents

Run in all packages that depend on a library:

```bash
turbo run test --filter=...ui
```

Useful for: testing consumers after changing a shared package.

## Dependents Only (Exclude Target)

Test packages that depend on ui, but not ui itself:

```bash
turbo run test --filter=...^ui
```

## Changed Packages

Run only in packages with file changes since last commit:

```bash
turbo run lint --filter=[HEAD^1]
```

Since a specific branch point:

```bash
turbo run lint --filter=[main...HEAD]
```

## Changed + Dependents (PR Builds)

Run in changed packages AND packages that depend on them:

```bash
turbo run build test --filter=...[HEAD^1]
```

Or use the shortcut:

```bash
turbo run build test --affected
```

## Directory-Based

Run in all apps:

```bash
turbo run build --filter=./apps/*
```

Run in specific directories:

```bash
turbo run build --filter=./apps/web --filter=./apps/api
```

## Scope-Based

Run in all packages under a scope:

```bash
turbo run build --filter=@acme/*
```

## Exclusions

Run in all apps except admin:

```bash
turbo run build --filter=./apps/* --filter=!admin
```

Run everywhere except specific packages:

```bash
turbo run lint --filter=!legacy-app --filter=!deprecated-pkg
```

## Complex Combinations

Apps that changed, plus their dependents:

```bash
turbo run build --filter=...[HEAD^1] --filter=./apps/*
```

All packages except docs, but only if changed:

```bash
turbo run build --filter=[main...HEAD] --filter=!docs
```

## Debugging Filters

Use `--dry` to see what would run without executing:

```bash
turbo run build --filter=web... --dry
```

Use `--dry=json` for machine-readable output:

```bash
turbo run build --filter=...[HEAD^1] --dry=json
```

## CI/CD Patterns

PR validation (most common):

```bash
turbo run build test lint --affected
```

Deploy only changed apps:

```bash
turbo run deploy --filter=./apps/* --filter=[main...HEAD]
```

Full rebuild of specific app and deps:

```bash
turbo run build --filter=production-app...
```
