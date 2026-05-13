---
name: rebase-clickhouse-test-branch
description: Rebase the clickhouse-js-client-release-test branch onto main. Use this skill whenever the user asks to rebase, sync, or update the clickhouse test branch, or says something like "rebase the clickhouse branch" or "sync the test branch with main". This branch is a long-lived e2e testing branch that tests the ClickHouse JS client HEAD builds against Langfuse — it is never merged, only rebased.
---

# Rebase the ClickHouse JS Client Test Branch

`clickhouse-js-client-release-test` is a permanent e2e testing branch that is **never merged into main**. It exists solely to test `@clickhouse/client` HEAD builds against Langfuse. Because it never lands, it must be periodically rebased as main moves forward.

## Branch structure

The branch always looks like this (top to bottom):

```
<lockfile-only commit>   ← message "pnpm i", only touches pnpm-lock.yaml — always drop this
<real change commits>    ← e.g. "approve", "use head" — keep these
<main history>
```

The lockfile commit is the one that always conflicts on rebase, so the workflow is: drop it, rebase the real commits, then regenerate the lockfile fresh.

## Steps

### 1. Fetch latest main

```bash
git fetch origin main
```

### 2. Identify and drop the lockfile-only commit

Find the top commit(s) that touch only `pnpm-lock.yaml`. The simplest check: if the top commit's diff is exclusively `pnpm-lock.yaml`, it's the lockfile commit. Note the commit hash of the oldest real change commit — that's your rebase base.

```bash
git show --stat HEAD   # confirm it's lockfile-only
```

The real commits sit below it. You need to rebase `HEAD~N` (excluding the lockfile commit) onto `origin/main`, where N depends on how many real commits there are.

Use `--onto` to be explicit:

```bash
# Drop top 1 lockfile commit, rebase the rest onto origin/main
git rebase --onto origin/main <lockfile-commit-hash> HEAD~1
```

Or equivalently, identify the merge-base and rebase with an interactive-style onto. The key is that `pnpm-lock.yaml` must NOT be part of what you rebase — it will be regenerated.

### 3. Resolve conflicts

During rebase, conflicts are most likely in `.npmrc` (the `npmPreapprovedPackages` list). When resolving:

- **Keep both sides** — don't drop entries that main added. The list should contain all entries from both sides.

After resolving:
```bash
git add <conflicted-file>
GIT_EDITOR=true git rebase --continue
```

### 4. Verify the change is complete

All packages that depend on `@clickhouse/client` must pin to `"head"`. After rebase, check:

```bash
grep -r "@clickhouse/client" packages/*/package.json
```

Every hit should show `"head"`, not a semver like `"^1.x.x"`. Currently the relevant files are:
- `packages/common-utils/package.json` — `@clickhouse/client`, `@clickhouse/client-common`, `@clickhouse/client-web`
- `packages/cli/package.json` — `@clickhouse/client`, `@clickhouse/client-common`

If any package still has a semver version, update it to `"head"` and amend the relevant commit.

### 5. Regenerate the lockfile

```bash
pnpm i
```

This resolves `@clickhouse/client*` to the current HEAD build (e.g. `1.x.x-head.<sha>.1`). The existing `pnpm-lock.yaml` entries for those packages will be replaced.

### 6. Commit the lockfile

```bash
git add pnpm-lock.yaml
git commit -m "pnpm i"
```

### 7. Force-push

```bash
git push --force-with-lease origin clickhouse-js-client-release-test
```

`--force-with-lease` is safe here because this branch is intentionally non-fast-forward after every rebase.

## After the rebase

Confirm the branch log looks right:

```bash
git log --oneline origin/main..HEAD
```

Expected output: the lockfile commit on top, the real change commits below it, nothing else.
