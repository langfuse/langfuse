# CI runtime analyst — durable notes

Append dated bullets. Keep under 200 lines; prune superseded notes.

## Standing rules (read these first)

- **Check the critical path before mining tests** (09-11, re-confirmed 10-05). `e2e-tests` is effectively the
  WHOLE critical path: `execution − e2e` was 17.8s in W40 and 36s in W41, and both shards finish ~80-85s below
  the e2e job (was 115-120s). Shaving seconds off a shard with that much slack cannot move the headline, however
  real the saving. Do the arithmetic; if the candidate is off the critical path, say so and stop. **If that slack
  ever closes, shard test work becomes worth mining again** — recheck the gap every week.
- **Separate NEW COVERAGE from a SLOWDOWN before calling a step a regression** (09-28). Worker `run tests`
  +12.4% looked like one until the reporter totals were lined up: 185 files/2418 tests → 194/2497. Pull
  `Test Files`/`Tests`/`Duration` per sample; a step growing with its test count has not got slower. Conversely
  W41's +6.4% workerRunTests came with FLAT content (194 files, 2497→2517 tests) = runner variance.
- **A regression can live in the BUILD GRAPH, not in test code** (09-21). W39's +25.6% came from
  `@langfuse/native` (a Rust addon) entering the e2e `Build` closure with `"cache": false, "outputs": []` — the
  author reasoned Cargo caches incrementally in `target/`, true on a laptop, false on an ephemeral runner. When a
  step inflates with no matching test change, read `turbo.json` task overrides and the selected package set.
  **Both large findings of this regime (the W39 regression and its W41 fix) were build-graph scope, not tests.**
- **A capacity/concurrency change can swing these numbers ~20-35% on its own.** W36 regressed +21% on host
  capacity; W37 recovered -20% when #17122 raised Blacksmith CPUs and set `VITEST_MAX_WORKERS=12`. So (1) never
  attribute a swing this size to code before checking `git log` on the CI workflow, and (2) to tell added
  parallelism from genuinely cheaper tests, compare wall-clock `run tests` against summed top-10 file durations —
  wall falls while summed **rises** = more parallelism under contention; both fall = cheaper tests.
- **A sub-threshold uptick in a thin week is worth CARRYING, not discarding.** The 9.3% webRunTests uptick
  dismissed as noise on 08-31 reached +17.6% cumulative by W36; that call was wrong. But don't over-resolve
  either: a single ~6-12% weekly move on a shard is barely above that shard's own noise (09-24: the same worker
  files ran 40-60% slower with no content change).
- **Check the failure count before calling a slow day a regression.** 09-04 was W36's slowest day *and* carried
  14 of its 18 merge_group failures; 09-30 was W41's slowest *and* carried 3 of its 5. Failed merge-queue runs
  force requeues, which raise load.
- **Overlapping windows inflate week-over-week deltas.** Trailing-7-day means consecutive reports usually share
  days — state which. W39/W40 were clean; **W40→W41 was the first fully non-overlapping pair.**
- **Fridays can collapse the merge_group sample** (09-19 zero, 09-26 n=2) — but 10-02 was W41's BUSIEST day, so
  don't assume it. **German Unity Day (Oct 3) blanks CI almost completely** (2 runs all day; Langfuse is
  Berlin-based) — expect that annually. Validate any zero day against an unfiltered fetch.
- **Never propose a diff the measurements don't support** (10-05). If the candidate fix regresses another
  realistic input shape, ship no diff and say why. An honest `## Outcome` beats a speculative patch.

## Dead and parked candidates — do not re-attempt

- **score-comparison-analytics.servertest.ts `Promise.all` batching — PARKED** (07-31).
  `insertLargeTraceLevelScorePairs` L112-161 inserts 120k rows via 12 sequential `await createScoresCh(...)`;
  batching is safe (precedent `scores-api-v2.servertest.ts:104`) but unverifiable (DB blocked).
- **layout.clienttest.ts hoist — DEAD** (08-24): 14.81 vs 14.90s, noise; without `rowRange`, `layout()`
  positions all ~140k rows, so a win cuts coverage.
- **webhooks.test.ts fake timers — DEAD** (09-07): no `setTimeout`/`sleep`/`waitFor`/`useFakeTimers` in it, the
  ~23.5s is real DB/HTTP. **bufferedStreamUploader.test.ts 3.00s retry — DEAD** (09-14): internal sleeps are
  10-100ms, the 3s is real orchestration.
- **redisConsumer.test.ts:116 `setTimeout(2000)` — PARKED, weak** (09-14, 2003ms measured). ~1.5s against ~80s
  of slack, and shortening it narrows a negative assertion.
- **json-utils.clienttest.ts — DO NOT trim.** Recursive `deepParseJson` mutates its input in place
  (`packages/shared/src/utils/json.ts`), so clone-per-parser is required.
  **analyticsIntegrationSsrfPinning.test.ts is NOT a regression** (08-24): 18.07s/7 → 36.09s/13 is new coverage.
- **otelReplay.properties.test.ts `numRuns` / file split — DEAD** (09-28). 13.19s over 2 fast-check properties
  at `numRuns: 128` is ~52ms per generated case. Lowering `numRuns` cuts coverage (forbidden); splitting buys
  ~6.6s and disturbs a concurrency-sensitive harness.
- **DB-backed, off the critical path, do not re-mine**: `event-repository.servertest.ts` (still #1 web file,
  26-28.6s over 104 tests), `experiment-score-levels`, `awsLambdaCodeEvalDispatcher.integration`, `batchExport`,
  `IngestionService.integration`, and **`dataset-service.servertest.ts`** (new W41 top-5 entrant, 14.9s).
- **`traceBatching.test.ts`** — #1 worker file in W41 (15.2s file / 13.6s single test) but **never flaky** and
  ~80s below the critical path. Watch only.

### scripts/scan-client-bundle.mjs — defect CONFIRMED, fix REJECTED (10-05)

The only critical-path item in editable repo surface (`Scan client bundle`, 7s median of a 167s e2e job; invoked
from `pipeline.yml` as `node scripts/scan-client-bundle.mjs web/.next/static`). `collectExemptRanges()` is
genuinely **O(N²)**: for every `LogicalExpression` it calls `typeofNamesIn(node.left, new Set())`, re-walking the
entire left subtree, so a left-nested `a&&b&&c&&…` chain (ubiquitous in minified bundles) is quadratic. Measured
on synthetic ESTree ASTs — the walkers touch only plain objects, so they run **without espree installed**:
40/132/485/1986/7595 ms at N=500/1k/2k/4k/8k (≈4× per doubling). Needs `node --stack-size=120000`.

**Do not re-propose per-node set memoization.** 783× faster on deep chains (7595→9.7ms at N=8000) but **55×
SLOWER** on flat guard-then-use statement lists (16.9→923ms at N=8000), because N siblings with distinct
non-empty sets force N successive set copies at the parent. Output verified identical in both shapes; the
rejection is purely on performance. A real fix needs a structure cheap for BOTH shapes (persistent sets, or
indexing only the nodes actually queried). Upside is capped at ~7s of 167s (~4%) either way.

## Week-by-week record (condensed)

Weekly tuple order: perceived / execution / wait / webBuild / webRunTests / workerRunTests / e2e.

- **W28 baseline (06-30..07-07)**: p50=396 / p90=522s over 131 runs. Pipeline is **execution-bound, not
  queue-bound** (wait 7-22s) — still true 10-05. NAMING COLLISION open: `history/2026-W28.json` covers a
  mostly-W27 window. **08-03..08-17**: six fully-blocked runs, never diagnosed, stopped on their own — don't
  re-try `cat /etc/hosts` or `WebFetch` of pipeline.yml. **08-18**: issue-output regime begins, p50=224/p90=675.4.
- **08-24 (W34) — load-bearing dense comparator.** 198.3 / 185.3 / 15.3 / 48 / 77.8 / 106 / 158.3; pooled p50 198
  / p90 284.6 over 37 runs. **08-31** had only 4 successful merge_group runs — excluded from charts.
- **09-07 (W36) — first real regression of the regime.** 240.5 / 224.5 / 15 / 52 / 91.5 / 113.5 / 165.5, +21.3%
  vs W34 with wait flat. **Host capacity, not code**: uniform slowdown = CPU contention; write-heavy-only = I/O.
- **09-11 (W37) — best week on record.** 192 / 175.3 / 17 / 47.3 / 69 / 72.8 / 155.5; pooled p50 194 / p90 224.2.
  Cause `aa5f60aa8` (#17122). **09-14 (W38) — flat, no diff:** 186.3 / 170.3 / 16.8 / 47 / 67.5 / 71.3 / 155.5 —
  the baseline W39 regressed against.
- **09-21 (W39) — LARGE REGRESSION, first suggested diff of the regime.** 234 / 217.8 / 14 / 48 / 72 / 72.3 /
  186: perceived +25.6% vs W38 while runner wait FELL. Localized to the e2e `Build` step (42→69s, **+64%**).
  Cause `1a2d1f211` (#17062, native addon scaffold); `bb65111ff` (#17292) exonerated.
- **09-28 (W40) — QUIET, NO DIFF FILED.** 226.5 / 214.8 / 13.5 / 48.5 / 77 / 81.3 / 197, e2eBuild 66; pooled p50
  221 / p90 296, n=27. workerRunTests +12.4% was **new coverage**. Reported the W39 diff as still unapplied —
  **correct at the time of that check**; it landed hours later.
- **10-05 (W41) — IMPROVEMENT, NO DIFF.** **216.5 / 203 / 16.5 / 47 / 77 / 86.5 / 167**, e2eBuild 37, e2eRun
  50.5; pooled p50 210 / p90 302.2, n=29 over 53 merge_group successes (5 failures). vs W40: perceived -4.4%,
  execution -5.5%, e2e job -15.2%, **e2e Build -44%**. 5 dense days; 10-03 and 10-05 zero.

### W39 diff outcome — DELIVERED (verified 10-05)

`cda2fe27b` / PR **#18012** "fix(ci): skip unused worker build in browser e2e job", Tobias Wochinger,
**2026-09-28 12:36:54 UTC**: `--filter=!ai-gateway` → `--filter=!ai-gateway --filter=!worker
--filter=!@langfuse/native`. W40 is a clean pre-change window, W41 a clean post-change one. Scorecard vs the W39
prediction: e2e Build 69→**37s** (predicted 42-48, beat it); e2e job 186→**167s** (predicted ~160, near hit);
perceived 234→**216.5s** (predicted ~205, short but -7.5%). The #17062 regression is CLOSED. **Lesson that made
it work:** `--filter=!<app>` does not drop that app's workspace deps — exclude each one individually. That is the
likeliest shape of the next build-graph win.

### e2e step breakdown (medians over 29 W41 jobs; job median 167s)

`Run e2e tests` 50 · `Build` 35 · `Seed DB` 14 · `Post Cache Next.js builds` 13 · `Scan client bundle` 7 ·
`Use Node.js 24 w/ pnpm cache` 5 · `Cache Next.js builds` 5 · `Start dev containers` 5 · `Install playwright` 5 ·
`install dependencies` 3 · `Complete runner` 3 · checkout 2 · rest ~1 each. Step medians sum to 151s; ~16s is
runner start/teardown. **With Build down to 35s the overhead tail is diffuse — no single dominant target remains.**

## Incidents

- **2026-09-11 main red ~06:35Z-11:32Z — RESOLVED, infrastructure.** apt mirror failures installing Playwright
  system deps; fixed by `ae2b6dbd3` (#17328). **Signature**: uniform ~700-725s wall with `e2e-tests` +
  `tests-storybook` failing together across all event types. Keep only for the signature.

## Flaky tracking

- **Zero retried tests in every sampled shard for FIVE consecutive weeks** (09-07, 09-14, 09-21, 09-28, 10-05).
  **The watchlist is DROPPED** per the standing instruction carried since 09-28. Reinstate only when a
  `Retried tests (N):` block actually appears in a log.
- Root causes kept in case one returns: `admin-api-keys.servertest.ts > 'invalidates all cached API keys without
  deleting other redis entries'` (dropped 09-14) asserts an exact `invalidatedCount: 2` against a SHARED Redis DB
  while the handler scans `api-key:*` globally, so a concurrent shard makes it 3+; one-line fix is `>= 2`. Also
  cleared: `unstable-evaluator-v2-api`, `otelToObservationForEval`, `traceBatching.test.ts` (slow, never flaky).
- Shard content for growth-vs-slowdown checks: web 317/5413/69.31s (W40) → **319/5479/71.99s**; worker
  194/2497/81.74s → **194/2517-2518/82.6-83.0s**.

## Known CI waste — report only, never propose

Fixes for these live in `.github/workflows/**`, edit-forbidden here.

- **turbo + pnpm cache reservation races** (09-03 through 10-05, persistent): parallel matrix jobs share one key,
  so `Failed to save: Unable to reserve cache with key Linux-X64-node24-turbo-ci-<hash>` (likewise
  `pnpm-lockfile-verified-*`, `node-cache-*`) recurs after tarring 0.8-2.6 GB. W41: worker 09-30, web 09-29 (×5),
  10-01, 10-02 (×2). The loser silently discards its upload — no direct wall cost, degrades later hit rates.
- **Runner queue outliers show per job**: `BLACKSMITH_RUNNER_MESSAGE_WAIT_MS` in the `job_completed.sh` env group.
  Typically 109-680 ms (W41: 109, 113, 205, 261, 284, 599); one 09-23 web job hit **201551 ms**. Fleet capacity,
  not repo code — use it to rule queue wait in or out before blaming a step.

## Output contract

- No PRs, ever. Every run files exactly one issue (title prefixed `CI Runtime Report: `, label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty).
- **No issue-search tool exists** — GitHub MCP offers only `actions_get`, `actions_list`, `get_job_logs`, and the
  PR readers, so backfilling a past issue's number/url is permanently impossible; entries stay `number: null`.
  `missing_tool` filed 08-24 and 09-07 — don't re-file.
- **`$GITHUB_STEP_SUMMARY` is NOT writable** (09-07, ENOENT outside the mount). The filed issue is the only output.
- Mermaid gate: 2 blocks minimum, **4 now that history holds 2+ weeks** (daily Chart 1 + Chart 2, plus the weekly
  versions). Palette is pinned `#3987e5,#de5a20,#8875e0`. Count the literal blocks before submitting.

## Tooling notes

- **Compute the ISO week label, don't assume it** (`-partial-<MMDD>` when incomplete or colliding);
  `date -u +"%G-W%V"` is rejected (simple_expansion). Check `HEAD..origin/main` = 0 first, every run.
- `list_workflow_runs` caps at ~30 runs/page, ignores `per_page`, has no `created` filter, and its
  `event`/`branch` filters have returned **stale** data — **fetch unfiltered, filter client-side**, paginating
  until `created_at` passes the window start.
- Large tool responses land in a file, payload at `.[0].content[0].text` (a JSON string), jobs at
  **`.data.jobs.jobs[]`**. **Never `Read` those files** — parse with a small Node script written via `Write`
  (not Python, which needs extra approval here).
- **`get_job_logs` `tail_lines`.** The trailing cleanup block is a docker image manifest whose length scales with
  that runner's image count, so there is no single right value. **Start ~215 web / ~205 worker and err high** — an
  under-shoot costs a whole extra call. Worker: 178 and 205+ hit, **115 badly undershoots**. Web: 196 and 203
  reach the reporter block (203 captures the `Test Files`/`Tests`/`Duration` totals), 185 only reaches
  slowest-test #3, **60 and 112 land entirely inside post-job cleanup**. `Slowest test files` running straight
  into `Post job cleanup.` IS the zero-retry proof, since `Retried tests (N):` prints only when N ≥ 1.
- **`git log` is the cheapest attribution tool — use it first.** Bare `git log` and
  `git log --oneline -25 --since=<date> -- <path>` need no approval; `git show <sha> -- <file>` works,
  `git log -S<string>` needs approval.
- **Write temp scripts to `/tmp/gh-aw/agent/` with `Write`, never the repo.** Copy response paths **including the
  session-id segment** or you get ENOENT.
- Sandbox bash blocks compound commands, `bash script.sh`, `jq -f`, heredocs (incl. quoted braces), redirects
  outside the workspace, `ls`/`find`/`wc` outside the repo, `mkdir` under `/tmp/gh-aw`, bare `pnpm`, inline env
  prefixes, and `git -C <abspath>` / `git grep`. Use `Glob`/`Grep`, and `node -e` + `fs` outside the repo.
- A web vitest run needs a placeholder `/…/langfuse/.env.test` (`web/vitest.config.mts` loads `../.env.test`;
  `cp .env.test.example` is not enough) with `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
  `SALT`, `ENCRYPTION_KEY` (64 hex), the three `CLICKHOUSE_*`, `REDIS_CONNECTION_STRING`. **Delete it before
  finishing.**
- **`pnpm`/`turbo` are NOT installed and `node_modules` DOES NOT EXIST** (10-05: root and `web/node_modules` both
  absent; espree/eslint-scope/globals unresolvable). Nothing needing a dependency resolve or a build can be
  verified here — verify a filter change by **deriving the task closure statically** from `pnpm-workspace.yaml`
  globs + each `package.json`'s internal deps, walking `^build`, and label it a static derivation. `turbo.json`
  is JSONC: strip `//`. Dependency-free logic CAN be extracted verbatim and benchmarked.
- DB connectivity is a STANDING blocked condition: `host.docker.internal` → `EAI_AGAIN` since 08-03
  (github/gh-aw#52140, github/gh-aw-firewall#7268). Consequence: every top slowest file in both suites is
  DB-backed, so mining ends at "cannot verify". Don't re-attempt until one closes.
- `.svg` files DO persist (`charts/` holds 12). Generator: 780x430, y = 366 − v/260·312, points evenly spaced
  x=62..758, `#3987e5` perceived / `#de5a20` execution / `#8875e0` e2e. Copy last week's and re-point.
