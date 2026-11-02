# CI/CD with Turborepo

General principles for running Turborepo in continuous integration environments.

## Core Principles

### Always Use `turbo run` in CI

**Never use the `turbo <tasks>` shorthand in CI or scripts.** Always use `turbo run`:

```bash
# CORRECT - Always use in CI, package.json, scripts
turbo run build test lint

# WRONG - Shorthand is only for one-off terminal commands
turbo build test lint
```

The shorthand `turbo <tasks>` is only for one-off invocations typed directly in terminal by humans or agents. Anywhere the command is written into code (CI, package.json, scripts), use `turbo run`.

### Enable Remote Caching

Remote caching dramatically speeds up CI by sharing cached artifacts across runs.

Required environment variables:

```bash
TURBO_TOKEN=your_vercel_token
TURBO_TEAM=your_team_slug
```

### Use --affected for PR Builds

The `--affected` flag only runs tasks for packages changed since the base branch:

```bash
turbo run build test --affected
```

This requires Git history to compute what changed.

## Git History Requirements

### Fetch Depth

`--affected` needs access to the merge base. Shallow clones break this.

```yaml
# GitHub Actions
- uses: actions/checkout@v4
  with:
    fetch-depth: 2 # Minimum for --affected
    # Use 0 for full history if merge base is far
```

### Why Shallow Clones Break --affected

Turborepo compares the current HEAD to the merge base with `main`. If that commit isn't fetched, `--affected` falls back to running everything.

For PRs with many commits, consider:

```yaml
fetch-depth: 0 # Full history
```

## Environment Variables Reference

| Variable            | Purpose                              |
| ------------------- | ------------------------------------ |
| `TURBO_TOKEN`       | Vercel access token for remote cache |
| `TURBO_TEAM`        | Your Vercel team slug                |
| `TURBO_REMOTE_ONLY` | Skip local cache, use remote only    |
| `TURBO_LOG_ORDER`   | Set to `grouped` for cleaner CI logs |

## See Also

- [github-actions.md](./github-actions.md) - GitHub Actions setup
- [vercel.md](./vercel.md) - Vercel deployment
- [patterns.md](./patterns.md) - CI optimization patterns
