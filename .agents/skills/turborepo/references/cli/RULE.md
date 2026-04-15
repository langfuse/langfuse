# turbo run

The primary command for executing tasks across your monorepo.

## Basic Usage

```bash
# Full form (use in CI, package.json, scripts)
turbo run <tasks>

# Shorthand (only for one-off terminal invocations)
turbo <tasks>
```

## When to Use `turbo run` vs `turbo`

**Always use `turbo run` when the command is written into code:**

- `package.json` scripts
- CI/CD workflows (GitHub Actions, etc.)
- Shell scripts
- Documentation
- Any static/committed configuration

**Only use `turbo` (shorthand) for:**

- One-off commands typed directly in terminal
- Ad-hoc invocations by humans or agents

```json
// package.json - ALWAYS use "turbo run"
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test"
  }
}
```

```yaml
# CI workflow - ALWAYS use "turbo run"
- run: turbo run build --affected
- run: turbo run test --affected
```

```bash
# Terminal one-off - shorthand OK
turbo build --filter=web
```

## Running Tasks

Tasks must be defined in `turbo.json` before running.

```bash
# Single task
turbo build

# Multiple tasks
turbo run build lint test

# See available tasks (run without arguments)
turbo run
```

## Passing Arguments to Scripts

Use `--` to pass arguments through to the underlying package scripts:

```bash
turbo run build -- --sourcemap
turbo test -- --watch
turbo lint -- --fix
```

Everything after `--` goes directly to the task's script.

## Package Selection

By default, turbo runs tasks in all packages. Use `--filter` to narrow scope:

```bash
turbo build --filter=web
turbo test --filter=./apps/*
```

See `filtering/` for complete filter syntax.

## Quick Reference

| Goal                | Command                    |
| ------------------- | -------------------------- |
| Build everything    | `turbo build`              |
| Build one package   | `turbo build --filter=web` |
| Multiple tasks      | `turbo build lint test`    |
| Pass args to script | `turbo build -- --arg`     |
| Preview run         | `turbo build --dry`        |
| Force rebuild       | `turbo build --force`      |
