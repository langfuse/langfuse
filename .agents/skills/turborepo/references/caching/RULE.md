# How Turborepo Caching Works

Turborepo's core principle: **never do the same work twice**.

## The Cache Equation

```
fingerprint(inputs) → stored outputs
```

If inputs haven't changed, restore outputs from cache instead of re-running the task.

## What Determines the Cache Key

### Global Hash Inputs

These affect ALL tasks in the repo:

- `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`
- Files listed in `globalDependencies` (or `global.env` when using `globalConfiguration`)
- Environment variables in `globalEnv` (or `global.env`)
- `turbo.json` configuration

```json
{
  "globalDependencies": [".env", "tsconfig.base.json"],
  "globalEnv": ["CI", "NODE_ENV"]
}
```

### Task Hash Inputs

These affect specific tasks:

- All files in the package (unless filtered by `inputs`)
- `package.json` contents
- Environment variables in task's `env` key
- Task configuration (command, outputs, dependencies)
- Hashes of dependent tasks (`dependsOn`)
- Files from `global.inputs` (when using `futureFlags.globalConfiguration` — see below)

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "package.json", "tsconfig.json"],
      "env": ["API_URL"]
    }
  }
}
```

### How `global.inputs` Changes the Hash Equation

When `futureFlags.globalConfiguration` is enabled, `global.inputs` files are **not** part of the global hash. Instead, they are prepended to every task's `inputs` and folded into the **task hash**. This is a fundamental change from `globalDependencies`.

**With `globalDependencies` (default):**

```
task cache key = hash(global hash, task hash)
                      ↑ includes globalDependencies file hashes
```

Changing a `globalDependencies` file invalidates **every** task, regardless of task-level `inputs`. There is no way for a task to opt out.

**With `global.inputs` (`futureFlags.globalConfiguration`):**

```
task cache key = hash(global hash, task hash)
                                   ↑ includes global.inputs file hashes (merged with task inputs)
```

`global.inputs` files are merged into each task's input globs. This means:

- Tasks can **exclude** specific global files with negation globs: `"inputs": ["$TURBO_DEFAULT$", "!$TURBO_ROOT$/tsconfig.json"]`
- The global hash is smaller (it still includes lockfile, engines, `global.env`, etc. — but not file hashes from `global.inputs`)
- The task hash correctly includes the global input file hashes alongside the task's own inputs

```json
{
  "futureFlags": { "globalConfiguration": true },
  "global": {
    "inputs": ["tsconfig.json", ".env"]
  },
  "tasks": {
    "build": {
      "outputs": ["dist/**"]
    },
    "lint": {
      "inputs": ["$TURBO_DEFAULT$", "!$TURBO_ROOT$/tsconfig.json"]
    }
  }
}
```

In this example, changing `tsconfig.json` invalidates `build` (it's in the task's inputs) but **not** `lint` (which explicitly excludes it). With `globalDependencies`, both would have been invalidated.

## What Gets Cached

1. **File outputs** - files/directories specified in `outputs`
2. **Task logs** - stdout/stderr for replay on cache hit

```json
{
  "tasks": {
    "build": {
      "outputs": ["dist/**", ".next/**"]
    }
  }
}
```

## Local Cache Location

```
.turbo/cache/
├── <hash1>.tar.zst    # compressed outputs
├── <hash2>.tar.zst
└── ...
```

Add `.turbo` to `.gitignore`.

## Cache Restoration

On cache hit, Turborepo:

1. Extracts archived outputs to their original locations
2. Replays the logged stdout/stderr
3. Reports the task as cached (shows `FULL TURBO` in output)

## Example Flow

```bash
# First run - executes build, caches result
turbo build
# → packages/ui: cache miss, executing...
# → packages/web: cache miss, executing...

# Second run - same inputs, restores from cache
turbo build
# → packages/ui: cache hit, replaying output
# → packages/web: cache hit, replaying output
# → FULL TURBO
```

## Key Points

- Cache is content-addressed (based on input hash, not timestamps)
- Empty `outputs` array means task runs but nothing is cached
- Tasks without `outputs` key cache nothing (use `"outputs": []` to be explicit)
- Cache is invalidated when ANY input changes
