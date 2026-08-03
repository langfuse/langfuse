# turbo run Flags Reference

Full docs: https://turborepo.dev/docs/reference/run

## Package Selection

### `--filter` / `-F`

Select specific packages to run tasks in.

```bash
turbo build --filter=web
turbo build -F=@repo/ui -F=@repo/utils
turbo test --filter=./apps/*
```

See `filtering/` for complete syntax (globs, dependencies, git ranges).

### Task Identifier Syntax (v2.2.4+)

Run specific package tasks directly:

```bash
turbo run web#build              # Build web package
turbo run web#build docs#lint    # Multiple specific tasks
```

### `--affected`

Run only in packages changed since the base branch.

```bash
turbo build --affected
turbo test --affected --filter=./apps/*  # combine with filter
```

**How it works:**

- Default: compares `main...HEAD`
- In GitHub Actions: auto-detects `GITHUB_BASE_REF`
- Override base: `TURBO_SCM_BASE=development turbo build --affected`
- Override head: `TURBO_SCM_HEAD=your-branch turbo build --affected`

**Requires git history** - shallow clones may fall back to running all tasks.

## Execution Control

### `--dry` / `--dry=json`

Preview what would run without executing.

```bash
turbo build --dry          # human-readable
turbo build --dry=json     # machine-readable
```

### `--force`

Ignore all cached artifacts, re-run everything.

```bash
turbo build --force
```

### `--concurrency`

Limit parallel task execution.

```bash
turbo build --concurrency=4      # max 4 tasks
turbo build --concurrency=50%    # 50% of CPU cores
```

### `--continue`

Keep running other tasks when one fails.

```bash
turbo build test --continue
```

### `--only`

Run only the specified task, skip its dependencies.

```bash
turbo build --only  # skip running dependsOn tasks
```

### `--parallel` (Discouraged)

Ignores task graph dependencies, runs all tasks simultaneously. **Avoid using this flag**—if tasks need to run in parallel, configure `dependsOn` correctly instead. Using `--parallel` bypasses Turborepo's dependency graph, which can cause race conditions and incorrect builds.

## Cache Control

### `--cache`

Fine-grained cache behavior control.

```bash
# Default: read/write both local and remote
turbo build --cache=local:rw,remote:rw

# Read-only local, no remote
turbo build --cache=local:r,remote:

# Disable local, read-only remote
turbo build --cache=local:,remote:r

# Disable all caching
turbo build --cache=local:,remote:
```

## Output & Debugging

### `--graph`

Generate task graph visualization.

```bash
turbo build --graph                # opens in browser
turbo build --graph=graph.svg      # SVG file
turbo build --graph=graph.png      # PNG file
turbo build --graph=graph.json     # JSON data
turbo build --graph=graph.mermaid  # Mermaid diagram
```

### `--summarize`

Generate JSON run summary for debugging.

```bash
turbo build --summarize
# creates .turbo/runs/<run-id>.json
```

### `--output-logs`

Control log output verbosity.

```bash
turbo build --output-logs=full        # all logs (default)
turbo build --output-logs=new-only    # only cache misses
turbo build --output-logs=errors-only # only failures
turbo build --output-logs=none        # silent
```

### `--profile`

Generate Chrome tracing profile for performance analysis.

```bash
turbo build --profile=profile.json
# open chrome://tracing and load the file
```

### `--verbosity` / `-v`

Control turbo's own log level.

```bash
turbo build -v      # verbose
turbo build -vv     # more verbose
turbo build -vvv    # maximum verbosity
```

## Environment

### `--env-mode`

Control environment variable handling.

```bash
turbo build --env-mode=strict  # only declared env vars (default)
turbo build --env-mode=loose   # include all env vars in hash
```

## UI

### `--ui`

Select output interface.

```bash
turbo build --ui=tui     # interactive terminal UI (default in TTY)
turbo build --ui=stream  # streaming logs (default in CI)
```

---

# turbo-ignore

Full docs: https://turborepo.dev/docs/reference/turbo-ignore

Skip CI work when nothing relevant changed. Useful for skipping container setup.

## Basic Usage

```bash
# Check if build is needed for current package (uses Automatic Package Scoping)
npx turbo-ignore

# Check specific package
npx turbo-ignore web

# Check specific task
npx turbo-ignore --task=test
```

## Exit Codes

- `0`: No changes detected - skip CI work
- `1`: Changes detected - proceed with CI

## CI Integration Example

```yaml
# GitHub Actions
- name: Check for changes
  id: turbo-ignore
  run: npx turbo-ignore web
  continue-on-error: true

- name: Build
  if: steps.turbo-ignore.outcome == 'failure'  # changes detected
  run: pnpm build
```

## Comparison Depth

Default: compares to parent commit (`HEAD^1`).

```bash
# Compare to specific commit
npx turbo-ignore --fallback=abc123

# Compare to branch
npx turbo-ignore --fallback=main
```

---

# Other Commands

## turbo boundaries

Check workspace violations (experimental).

```bash
turbo boundaries
```

See `references/boundaries/` for configuration.

## turbo watch

Re-run tasks on file changes.

```bash
turbo watch build test
```

See `references/watch/` for details.

## turbo prune

Create sparse checkout for Docker.

```bash
turbo prune web --docker
```

## turbo link / unlink

Connect/disconnect Remote Cache.

```bash
turbo link    # connect to Vercel Remote Cache
turbo unlink  # disconnect
```

## turbo login / logout

Authenticate with Remote Cache provider.

```bash
turbo login   # authenticate
turbo logout  # log out
```

## turbo generate

Scaffold new packages.

```bash
turbo generate
```
