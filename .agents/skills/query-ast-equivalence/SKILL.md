---
name: query-ast-equivalence
description: Prove a query-AST migration emits the same ClickHouse SQL as the raw-SQL code it replaces, before review. Use when writing, reviewing, or rebasing a PR that moves a repository read onto the query AST (`compileClickhouseQuery`, `packages/shared/src/server/query-ast`), adds or changes `*.golden.test.ts` snapshots, or when asked "is the migrated SQL equivalent", "did the migration drop a fix", or "why do the golden tests drift".
---

# Query-AST migration equivalence

A golden snapshot recorded from the migrated code proves nothing about the code
it replaced. This skill renders every golden case on both sides with one
formatter, classifies each difference, checks that fixes merged upstream
survived the migration, and answers the standing review questions.

Run everything from the repo root of a checkout with `pnpm install` done.
Docker (or a local `clickhouse` at the CI pin) is required.

## 1. Render both sides and classify

```bash
node .agents/skills/query-ast-equivalence/scripts/golden-equivalence.mjs \
  [--base <ref>] [--head <ref>] [--out <dir>] [--overlay <path>]... [test-file...]
```

- Defaults: base = `merge-base HEAD origin/main`, head = `HEAD` (committed
  state only), tests = every `*.golden.test.ts` whose test or snapshot changed.
- Each side runs in a throwaway worktree. The head's golden tests and
  `goldenHarness.ts` are copied onto the base, so only the implementation
  differs. Use `--overlay` for other test-only files the head tests import, such
  as fixtures.
- The formatter is the CI pin (`CLICKHOUSE_VERSION` in
  `.github/workflows/pipeline.yml`) via `scripts/clickhouse-ci.sh` unless
  `CLICKHOUSE_BIN` is set. The header flags any mismatch.
- The script writes `report.md` (a case table plus a diff per non-identical
  case) and exits 1 when any case needs a justification.

| Class                  | Meaning                                                   | Required action                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identical`            | byte-equal after formatting                               | none                                                                                                                                                                    |
| `bind`                 | only param-vs-literal or bind types differ                | confirm each type matches the compared column (`LIMIT Int32→Int64` is fine; `DateTime64(3)` on a timezone string is not)                                                |
| `params/tags`          | SQL equal, but bound values, exec fn, or route tag differ | justify, because a value-type change (string → `Date`) changes serialization                                                                                            |
| `reorder`              | same lines, different order                               | **semantic**: column order must match the legacy builder exactly, since clustered reads align result blocks by position and swapping two `Map` columns fails with a 500 |
| `semantic`             | anything else, including an added alias                   | explicit reason in the PR                                                                                                                                               |
| `missing-on-base/head` | the case did not render on one side                       | read `base.log`/`head.log`; a head test that cannot import at base means the function's contract changed, which needs its own reason                                    |

Before calling any difference benign, read the history of the legacy line that
produced the old form (`git log -L` or `git blame` on the base). **If a comment
explains why it is written that way, stop**: the old form is load-bearing.

A golden diff only covers code paths that a golden case exercises. If a fix
from step 2 touches a path with no case, add the case first.

## 2. Check fixes merged upstream

```bash
node .agents/skills/query-ast-equivalence/scripts/upstream-fixes.mjs \
  [--base <ref>] [--head <ref>] [--target origin/main] [--since <date>]
```

This lists commits on the target that touched each changed file, plus every
query-layer module that file imported at the base. The imported modules matter
most: builder maps such as `event-query-builder.ts`. The window starts at the
author date of the branch's oldest commit, because a rebase moves the
merge-base past fixes the copied code never received. For each listed `fix`
or `perf` commit, run `git show <sha>` and confirm that its effect is in the
migrated query.

The root cause is usually an expression _copied_ out of a builder map that
still serves other call sites. Derive it from the map instead
(`eventsFieldSetSelectExpressions`, `EVENTS_AGGREGATION_FIELDS`). Read the map
lazily if the repository module sits in an import cycle with the builder.

## 3. Answer the review questions

```bash
node .agents/skills/query-ast-equivalence/scripts/scan-diff.mjs [--base <ref>] [--head <ref>]
```

This greps the added lines for raw SQL, TypeScript escape hatches,
infrastructure concerns at call sites, multi-project scope, copied
expressions, and changed comments. Every hit needs an answer, not
necessarily a change. Read
[references/review-questions.md](references/review-questions.md) for what
counts as an acceptable answer.

## 4. Snapshots and commits (for authors)

- Commit a **baseline-only** change first: the golden test and its snapshot,
  recorded on unchanged code. The migration commit's snapshot diff then serves
  as the equivalence proof that reviewers read.
- Record snapshots with the CI formatter, or every case drifts. Local 26.9
  differs from 26.4 on every case:

  ```bash
  CLICKHOUSE_BIN="$PWD/.agents/skills/query-ast-equivalence/scripts/clickhouse-ci.sh" \
    pnpm --filter @langfuse/shared run test .golden.test -- -u
  ```

- A new compiler pass (bind typing, date wrappers, and so on) needs a test for
  every argument shape it matches, not only the shape the PR uses. For example,
  `toStartOfDay(start_time, 'UTC')` as well as `toStartOfDay(start_time)`.

## Output

Return valid Markdown that can be pasted into the PR description:

1. The class table from `report.md`, with a one-line reason under every case
   that is not `identical`.
2. Upstream fixes: each `fix`/`perf` commit, with "present" (and where) or
   "missing".
3. Review answers: one line per scan category, or "none".
4. The formatter version used, and whether it matches the CI pin.

Check the result for broken tables and unclosed code fences before returning
it.
