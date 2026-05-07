# CI Optimization Patterns

Strategies for efficient CI/CD with Turborepo.

## PR vs Main Branch Builds

### PR Builds: Only Affected

Test only what changed in the PR:

```yaml
- name: Test (PR)
  if: github.event_name == 'pull_request'
  run: turbo run build test --affected
```

### Main Branch: Full Build

Ensure complete validation on merge:

```yaml
- name: Test (Main)
  if: github.ref == 'refs/heads/main'
  run: turbo run build test
```

## Custom Git Ranges with --filter

For advanced scenarios, use `--filter` with git refs:

```bash
# Changes since specific commit
turbo run test --filter="...[abc123]"

# Changes between refs
turbo run test --filter="...[main...HEAD]"

# Changes in last 3 commits
turbo run test --filter="...[HEAD~3]"
```

## Caching Strategies

### Remote Cache (Recommended)

Best performance - shared across all CI runs and developers:

```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}
```

### actions/cache Fallback

When remote cache isn't available:

```yaml
- uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ runner.os }}-${{ github.sha }}
    restore-keys: |
      turbo-${{ runner.os }}-${{ github.ref }}-
      turbo-${{ runner.os }}-
```

Limitations:

- Cache is branch-scoped
- PRs restore from base branch cache
- Less efficient than remote cache

## Matrix Builds

Test across Node versions:

```yaml
strategy:
  matrix:
    node: [18, 20, 22]

steps:
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node }}

  - run: turbo run test
```

## Parallelizing Across Jobs

Split tasks into separate jobs:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: turbo run lint --affected

  test:
    runs-on: ubuntu-latest
    steps:
      - run: turbo run test --affected

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - run: turbo run build
```

### Cache Considerations

When parallelizing:

- Each job has separate cache writes
- Remote cache handles this automatically
- With actions/cache, use unique keys per job to avoid conflicts

```yaml
- uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ runner.os }}-${{ github.job }}-${{ github.sha }}
```

## Conditional Tasks

Skip expensive tasks on draft PRs:

```yaml
- name: E2E Tests
  if: github.event.pull_request.draft == false
  run: turbo run test:e2e --affected
```

Or require label for full test:

```yaml
- name: Full Test Suite
  if: contains(github.event.pull_request.labels.*.name, 'full-test')
  run: turbo run test
```
