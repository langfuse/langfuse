# CI runtime analyst — durable notes

Append dated bullets. Keep under 200 lines; prune superseded notes.

## Standing rules (read these first)

- **Check the critical path before mining tests** (09-11, sharpened 09-21,
  re-confirmed 09-28). `e2e-tests` is effectively the WHOLE critical path:
  `execution − e2e` was 17.8s in W40, and both shards sit ~115-120s below the
  e2e job. Shaving seconds off a shard with that much slack cannot move the
  headline, however real the saving. Do the arithmetic; if the candidate is off
  the critical path, say so and stop.
- **Separate NEW COVERAGE from a SLOWDOWN before calling a step regression**
  (09-28). Worker `run tests` +12.4% looked like one until the reporter totals
  were lined up: 185 files/2418 tests → 194/2497. Pull `Test Files`/`Tests`/
  `Duration` per sample; a step growing with its test count has not got slower.
- **A regression can live in the BUILD GRAPH, not in test code** (09-21). W39's
  +25.6% came from `@langfuse/native` (a Rust addon) entering the e2e `Build`
  closure with `"cache": false, "outputs": []` — the author reasoned Cargo
  caches incrementally in `target/`, true on a laptop, false on an ephemeral
  runner. When a step inflates with no matching test change, read `turbo.json`
  task overrides and the selected package set.
- **A capacity/concurrency change can swing these numbers ~20-35% on its own.**
  W36 regressed +21% on host capacity; W37 recovered -20% when #17122 raised
  Blacksmith CPUs and set `VITEST_MAX_WORKERS=12`. So (1) never attribute a
  swing this size to code before checking `git log` on the CI workflow, and
  (2) to tell added parallelism from genuinely cheaper tests, compare wall-clock
  `run tests` against summed top-10 file durations — wall falls while summed
  **rises** = more parallelism under contention; both fall = cheaper tests.
- **A sub-threshold uptick in a thin week is worth CARRYING, not discarding.**
  The 9.3% webRunTests uptick dismissed as noise on 08-31 reached +17.6%
  cumulative by W36. That call was wrong; don't repeat it. But don't over-
  resolve either: on 09-24 the same worker files ran 40-60% slower than on
  09-22/09-25 with no content change (`evalService` 15.69 vs 8.95/9.23s), so a
  single ~12% weekly move is barely above this shard's own noise.
- **Check the failure count before calling a slow day a regression.** 09-04 was
  W36's slowest day (288s) *and* carried 14 of its 18 merge_group failures;
  failed merge-queue runs force requeues, which raise load.
- **Overlapping windows inflate week-over-week deltas.** Trailing-7-day means
  consecutive reports usually share days — state which, and whether the delta is
  a real gain or window shift. (W39 and W40 were both clean, no shared days.)
- **Fridays can collapse the merge_group sample**: 09-19 zero, 09-26 n=2. Expect
  thin Fridays and say so; validate a zero day against an unfiltered fetch.

## Dead and parked candidates — do not re-attempt

- **score-comparison-analytics.servertest.ts `Promise.all` batching — PARKED**
  (07-31). `insertLargeTraceLevelScorePairs` L112-161 inserts 120k rows via 12
  sequential `await createScoresCh(...)`; batching is safe (precedent
  `scores-api-v2.servertest.ts:104`) but unverifiable (DB blocked).
- **layout.clienttest.ts hoist — DEAD** (08-24): 14.81 vs 14.90s, noise; without
  `rowRange`, `layout()` positions all ~140k rows, so a win cuts coverage.
- **webhooks.test.ts fake timers — DEAD** (09-07): no `setTimeout`/`sleep`/
  `waitFor`/`useFakeTimers` in it, the ~23.5s is real DB/HTTP.
  **bufferedStreamUploader.test.ts 3.00s retry — DEAD** (09-14): internal sleeps
  are 10-100ms, the 3s is real orchestration.
- **redisConsumer.test.ts:116 `setTimeout(2000)` — PARKED, weak** (09-14, 2003ms
  measured). ~1.5s against ~115s of slack, and shortening it narrows a negative
  assertion. Only revisit if the shards ever become critical.
- **json-utils.clienttest.ts — DO NOT trim.** Recursive `deepParseJson` mutates
  its input in place (`packages/shared/src/utils/json.ts`), so clone-per-parser
  is required. **analyticsIntegrationSsrfPinning.test.ts is NOT a regression**
  (08-24): 18.07s/7 → 36.09s/13 is new coverage, both slow cases 18s SSRF
  timeouts.
- **DB-backed, off the critical path, do not re-mine**:
  `event-repository.servertest.ts` (still #1 web file on 09-28, 26.77s over 104
  tests — its within-file serialisation was re-examined 09-28 and still loses to
  ~120s of web slack), `experiment-score-levels`, `awsLambdaCodeEvalDispatcher.
  integration`, `batchExport`, `IngestionService.integration`.
- **otelReplay.properties.test.ts `numRuns` / file split — DEAD** (09-28).
  13.19s over 2 fast-check properties at `numRuns: 128` is ~52ms per generated
  case — efficient. Lowering `numRuns` cuts coverage (forbidden); splitting the
  properties buys ~6.6s against ~115s of slack and disturbs a harness the author
  marked concurrency-sensitive (`retry: 0`, shared-writer-singleton comment).

## Week-by-week record (condensed)

Weekly tuple order: perceived / execution / wait / webBuild / webRunTests /
workerRunTests / e2e.

- **W28 baseline (06-30..07-07)**: p50=396 / p90=522s over 131 runs. Pipeline is
  **execution-bound, not queue-bound** (wait 7-22s) — still true 09-28. NAMING
  COLLISION open: `history/2026-W28.json` covers a mostly-W27 window.
  **08-03..08-17**: six fully-blocked runs, never diagnosed, stopped on their
  own — don't re-try `cat /etc/hosts` or `WebFetch` of pipeline.yml. **08-18**:
  issue-output regime begins, 33 runs, p50=224 / p90=675.4s.
- **08-24 (W34) — load-bearing dense comparator.** 198.3 / 185.3 / 15.3 / 48 /
  77.8 / 106 / 158.3; pooled p50 198 / p90 284.6 over 37 runs. **08-31** had
  only 4 successful merge_group runs — excluded from charts.
- **09-07 (W36) — first real regression of the regime.** 240.5 / 224.5 / 15 /
  52 / 91.5 / 113.5 / 165.5, +21.3% vs W34 with wait flat. **Host capacity, not
  code**: a 09-03 same-day fast/slow pair showed wall +90% while summed top-10
  durations grew only 23%. Uniform slowdown = CPU contention; write-heavy-only
  inflation = container I/O pressure.
- **09-11 (W37) — best week on record.** 192 / 175.3 / 17 / 47.3 / 69 / 72.8 /
  155.5; pooled p50 194 / p90 224.2. Cause `aa5f60aa8` (#17122, more Blacksmith
  CPUs + concurrency tuning): same-day split webRunTests 89→64s, worker 107→72s.
  **09-14 (W38) — flat, no diff:** 186.3 / 170.3 / 16.8 / 47 / 67.5 / 71.3 /
  155.5, a marginal new best but -3.0% vs W37 is mostly window shift. This is
  the baseline W39 regressed against.
- **09-21 (W39) — LARGE REGRESSION, first suggested diff of the regime.** 234 /
  217.8 / 14 / 48 / 72 / 72.3 / 186: perceived +25.6%, execution +27.9%, e2e
  +19.6% vs W38 while runner wait FELL 16.8→14s. Localized to the e2e `Build`
  step (42→69s, **+64%**); `Run e2e tests` and `tests-web` Build both flat, so
  it is the build, not the tests. Cause `1a2d1f211` (#17062, native addon
  scaffold, day one of the window); 09-15 split pre 52s (n=3) vs post 71.5s
  (n=22). `bb65111ff` (#17292) exonerated. Caveats in the issue: the worst
  outlier predates #17062, the pre-window baseline is n=3, and cargo/napi
  execution is inferred from the turbo graph, never read off a log line.
- **09-28 (W40) — QUIET, NO DIFF FILED.** 226.5 / 214.8 / 13.5 / 48.5 / 77 /
  81.3 / 197; pooled p50 221 / p90 296, n=27; 4 dense days, Fri n=2, Sun zero.
  Perceived -3.2%, execution -1.4%, e2e +5.9%; workerRunTests +12.4% is **new
  coverage** (+9 files / +79 tests, chiefly `otelReplay.properties.test.ts` from
  #17741/#17742), not a slowdown. **The W39 diff was never applied** —
  `pipeline.yml` ~1183/~1293 still read `pnpm run build --filter=!ai-gateway`
  and `@langfuse/native#build` is still `cache:false` — so e2e `Build` stayed
  flat 69→66s and the prediction is untested, not refuted. Left open per the
  do-not-chase rule; two new candidates rejected on merit (see Dead/parked).

## Incidents

- **2026-09-11 main red ~06:35Z-11:32Z — RESOLVED, infrastructure.** apt mirror
  failures installing Playwright system deps; fixed by `ae2b6dbd3` (#17328).
  **Signature**: uniform ~700-725s wall with `e2e-tests` + `tests-storybook`
  failing together across all event types (`all-ci-passed` is just the gate).
  Keep only for the signature; drop this entry once a newer incident lands.

## Flaky tracking

- **Zero retried tests in every sampled shard for FOUR consecutive weeks.**
  09-28 got a full reporter block from all 5 samples (4 worker + 1 web), unlike
  09-21's n=3. If W41 is clean too, stop carrying the watchlist below.
- `admin-api-keys.servertest.ts > 'invalidates all cached API keys without
  deleting other redis entries'` — **DROPPED 09-14** (lifetime 2: 09-04, 09-06).
  Root cause if it returns: it asserts an exact `invalidatedCount: 2` against a
  SHARED Redis DB while the handler scans `api-key:*` globally, so a concurrent
  shard makes it 3+. One-line fix (assert `>= 2`). Needs Redis.
- Cleared and dropped earlier: `unstable-evaluator-v2-api` (1 lifetime, 08-23),
  `otelToObservationForEval` (2, 07-30 / 08-13), `traceBatching.test.ts` (never
  flaky, just slow; absent from every 09-28 worker top-10).

## Known CI waste — report only, never propose

Fixes for these live in `.github/workflows/**`, edit-forbidden here.

- **turbo + pnpm cache reservation races** (09-03 through 09-28, persistent):
  parallel jobs share one cache key, so `Failed to save: Unable to reserve cache
  with key Linux-X64-node24-turbo-ci-<hash>` (likewise `pnpm-lockfile-verified-*`,
  `node-cache-*`) recurs after tarring 0.8-2.6 GB. 5 occurrences in one 09-28
  web sample, `save 1302.95ms / get 1866.26ms` average. Off the critical path.
- **Runner queue outliers show per job**: `BLACKSMITH_RUNNER_MESSAGE_WAIT_MS` in
  the `job_completed.sh` env group. Typically 159-680 ms; one 09-23 web job hit
  **201551 ms**. Fleet capacity, not repo code — use it to rule queue wait in or
  out before blaming a step.

## Output contract

- No PRs, ever. Every run files exactly one issue (label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty).
- **No issue-search tool exists** — GitHub MCP offers only `actions_get`,
  `actions_list`, `get_job_logs`, and the PR readers, so backfilling a past
  issue's number/url is permanently impossible; entries stay `number: null`.
  `missing_tool` filed 08-24 and 09-07 — don't re-file.
- **`$GITHUB_STEP_SUMMARY` is NOT writable** (09-07, ENOENT outside the mount).
  The filed issue is the only output.

## Tooling notes

- **Compute the ISO week label, don't assume it.** Label = the ISO week the
  window predominantly covers, `-partial-<MMDD>` when incomplete or colliding.
- `list_workflow_runs` caps at ~30 runs/page, ignores `per_page`, has no
  `created` filter — filter `event: merge_group` and paginate until
  `created_at` passes the window start. Validate a zero-run day against an
  unfiltered sample; the filter has returned stale data.
- Large tool responses land in a file, payload at `.[0].content[0].text` (a
  JSON string), jobs at `.jobs.jobs[]`. **Never `Read` those files** — parse
  with a small Node script written via `Write`.
- **`get_job_logs` `tail_lines`.** The trailing cleanup block is a docker image
  manifest whose length scales with that runner's image count (17-67 observed),
  so there is no single right value. Measured on 09-28: worker hits at 135/205/
  255, misses at 62/88/120; web hit at **213**, 128 gave cleanup only and 180
  landed mid-block. **Start ~215 web / ~205 worker** and err high — an
  under-shoot costs a whole extra call. You need `Test Files`/`Tests`/`Duration`
  through `Slowest test files` running into `Post job cleanup.`; that last
  boundary IS the zero-retry proof, since `Retried tests (N):` prints on retry.
- **`git log` is the cheapest attribution tool — use it first.** Bare `git log`
  and `git log --oneline -25 --since=<date> -- <path>` need no approval;
  `git show <sha> -- <file>` works, `git log -S<string>` needs approval.
- **Write temp scripts to `/tmp/gh-aw/agent/` with `Write`, never the repo.**
  Copy response paths **including the session-id segment** or you get ENOENT.
- Sandbox bash blocks compound commands, `bash script.sh`, `jq -f`, heredocs,
  redirects outside the workspace, `ls`/`find`/`wc` outside the repo, `mkdir`
  under `/tmp/gh-aw`, bare `pnpm`, and inline env prefixes (`FOO=bar npx …`);
  `git -C`, `cd && git`, `git checkout --` need approval. It also rejects a
  `node -e` one-liner containing a newline followed by `#`. Use `Glob`/`Grep`
  over `find`/`ls`, `node -e` + `fs` outside the repo, one op per call.
- A web vitest run needs a placeholder `/…/langfuse/.env.test`
  (`web/vitest.config.mts` loads `../.env.test`; `cp .env.test.example` is not
  enough) with `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
  `SALT`, `ENCRYPTION_KEY` (64 hex), the three `CLICKHOUSE_*`,
  `REDIS_CONNECTION_STRING`. **Delete it before finishing.**
- **`pnpm`/`turbo` are NOT installed** (09-21) and CLAUDE.md forbids
  `./node_modules/.bin/*`, so `turbo run build --dry=json` is unavailable:
  verify a filter change by **deriving the task closure statically** from
  `pnpm-workspace.yaml` globs + each `package.json`'s internal deps, walking
  `^build`. Label it a static derivation. `turbo.json` is JSONC: strip `//`.
- **A `--filter=!<app>` exclusion does NOT drop that app's workspace deps**
  (09-21). `--filter=!worker` still built `@langfuse/native#build`, since the
  addon is itself a selected package with a build script. Exclude each one.
- DB connectivity is a STANDING blocked condition: `host.docker.internal` →
  `EAI_AGAIN` since 08-03 (github/gh-aw#52140, github/gh-aw-firewall#7268).
  Consequence: every top slowest file in both suites is DB-backed, so mining
  ends at "cannot verify". Don't re-attempt until one closes.
- `.svg` files DO persist (`charts/` holds 11). Generator: 780x430,
  y = 366 − v/260·312, 8 points x=62..758, `#3987e5` perceived / `#de5a20`
  execution / `#8875e0` e2e. Copy last week's script, append one point.
- Check `HEAD..origin/main` = 0 first, every run; a current checkout is what
  makes in-sandbox verification meaningful.
