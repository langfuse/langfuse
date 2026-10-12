# CI runtime analyst — durable notes

Append dated bullets. Keep under 200 lines; prune superseded notes.

## Standing rules (read these first)

- **A long NON-GATING job breaks `perceived` and `runnerWait` at once** (10-12, new and load-bearing). When
  `tests-fips` landed, perceived jumped +16.2% while the real merge gate moved +4.5%. Worse, `runnerWait =
  perceived − execution` and `execution` is the UNION of successful job intervals — a job spanning the whole run
  makes the union ≈ the full window, so wait "fell" 16.5→7.5s with **no queue change at all**. Always compute
  **`gated` = `run_started_at` → `all-ci-passed.completed_at`** alongside perceived, and diff the job-name set
  against last week before explaining any step change. Report perceived (the defined metric) but lead with gated.
- **Check the critical path before mining tests** (09-11; the slack CLOSED on 10-12). `e2e-tests` was effectively
  the WHOLE critical path — `execution − e2e` was 17.8s in W40, 36s in W41, but **~85s in W42**. Shard work is on
  the critical path again (tests-web/tests-worker end ~203-209s vs e2e ~147s). Caveat: part of that 85s is
  `tests-fips`, which gates nothing — redo the arithmetic **net of non-gating jobs** before acting on it.
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
  capacity; W37 recovered -20% when #17122 raised Blacksmith CPUs and set `VITEST_MAX_WORKERS=12`. Check
  `git log` on the CI workflow before blaming code, and to tell added parallelism from cheaper tests compare
  wall-clock `run tests` against summed top-10 file durations — wall down + summed **up** = parallelism.
- **A sub-threshold uptick in a thin week is worth CARRYING, not discarding.** The 9.3% webRunTests uptick
  dismissed as noise on 08-31 reached +17.6% cumulative by W36. But don't over-resolve either: a single ~6-12%
  weekly shard move is barely above its own noise (09-24: the same worker files ran 40-60% slower, no change).
- **Check the failure count before calling a slow day a regression.** 09-04 was W36's slowest *and* carried 14
  of its 18 merge_group failures; 09-30 was W41's slowest *and* carried 3 of its 5. Requeues raise load.
- **Overlapping windows inflate WoW deltas** — state which days are shared. W40→W41 and W41→W42 were clean.
- **Fridays can collapse the merge_group sample** (09-19 zero, 09-26 n=2) — but 10-02 and 10-09 were their
  weeks' BUSIEST days, so don't assume it. **German Unity Day (Oct 3) blanks CI** (Langfuse is Berlin-based) —
  expect that annually. Validate any zero day against an unfiltered fetch.
- **Never propose a diff the measurements don't support** (10-05). If the candidate fix regresses another
  realistic input shape, ship no diff and say why. An honest `## Outcome` beats a speculative patch.

## Dead and parked candidates — do not re-attempt

- **score-comparison-analytics.servertest.ts `Promise.all` batching — PARKED** (07-31):
  `insertLargeTraceLevelScorePairs` L112-161 inserts 120k rows via 12 sequential `await createScoresCh(...)`;
  safe (precedent `scores-api-v2.servertest.ts:104`) but unverifiable (DB blocked).
- **DEAD, measured, do not re-open**: `layout.clienttest.ts` hoist (08-24, 14.81 vs 14.90s noise, and without
  `rowRange` a win cuts coverage); `webhooks.test.ts` fake timers (09-07, no timers in it — the ~23.5s is real
  DB/HTTP); `bufferedStreamUploader.test.ts` 3.00s retry (09-14, internal sleeps are 10-100ms);
  `json-utils.clienttest.ts` trim (`deepParseJson` mutates in place, so clone-per-parser is required);
  `analyticsIntegrationSsrfPinning.test.ts` (08-24, 18.07s/7 → 36.09s/13 is new coverage, not a regression).
- **redisConsumer.test.ts:116 `setTimeout(2000)` — PARKED, weak** (09-14): ~1.5s, and shortening it narrows a
  negative assertion.
- **otelReplay.properties.test.ts `numRuns` / split / concurrency — DEAD** (09-28, re-confirmed 10-12). 13.21s
  over 2 fast-check properties at `numRuns: 128` (L701-711) is ~52ms per generated case — still the worst
  time-per-test ratio in either suite, so it keeps attracting attention. Lowering `numRuns` cuts coverage
  (forbidden). `describe.concurrent` would halve it but the file's **own comment at L682-683** says Vitest
  retries "could overlap an unfinished replay and race the shared writer singleton". Stop re-deriving this.
- **DB-backed, do not re-mine**: `event-repository.servertest.ts` (still #1 web file, 22-28.6s / 104 tests),
  `experiment-score-levels`, `awsLambdaCodeEvalDispatcher.integration`, `batchExport`,
  `IngestionService.integration`, `dataset-service.servertest.ts`, and `traceBatching.test.ts` (#1 worker file,
  15.3s / 13.6s single test — slow but **never flaky**; watch only).

### scripts/scan-client-bundle.mjs — defect CONFIRMED, fix REJECTED (10-05)

Only critical-path item in editable surface (`Scan client bundle`, 7s of a 167s e2e job; run from `pipeline.yml`
as `node scripts/scan-client-bundle.mjs web/.next/static`). `collectExemptRanges()` is genuinely **O(N²)**: every
`LogicalExpression` calls `typeofNamesIn(node.left, new Set())`, re-walking the left subtree, so left-nested
`a&&b&&c&&…` chains (ubiquitous in minified bundles) go quadratic — 40/132/485/1986/7595 ms at N=500/1k/2k/4k/8k
on synthetic ESTree ASTs (walkers touch only plain objects, so they run **without espree**; needs
`node --stack-size=120000`). **Do not re-propose per-node set memoization**: 783× faster on deep chains
(7595→9.7ms at N=8000) but **55× SLOWER** on flat guard-then-use lists (16.9→923ms), since N siblings with
distinct sets force N set copies at the parent. Output identical in both shapes; rejection is purely perf. A real
fix needs a structure cheap for BOTH (persistent sets, or indexing only queried nodes). Upside caps at ~4% of e2e.

## Week-by-week record (condensed)

Weekly tuple order: perceived / execution / wait / webBuild / webRunTests / workerRunTests / e2e.

- **W28 baseline (06-30..07-07)**: p50=396 / p90=522s over 131 runs. Pipeline is **execution-bound, not
  queue-bound** (wait 7-22s) — still true 10-12. `history/2026-W28.json` covers a mostly-W27 window (naming
  collision, open). **08-18**: issue-output regime begins, p50=224 / p90=675.4.
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
- **10-12 (W42) — NEW NON-GATING JOB, NO DIFF.** **251.5 / 242.8 / 7.5 / 49.8 / 86 / 90.5 / 157.5**, gated
  **226.3**, e2eBuild 42, e2eRun 47.5; pooled p50 249.5 / p90 302.4, n=24 over 4 dense days (218 merge_group
  successes, 25 failures — ~4× W41, which was holiday-thinned). Clean non-overlapping pair with W41. Perceived
  +16.2% but gated only +4.5%: `tests-fips (web|worker)` from **`bb1b66451` (#18009, 2026-10-07 08:57:06Z)** runs
  211-401s and is now the longest job in the run while `pipeline.yml` says "Not part of all-ci-passed yet".
  10-06 is the only pre-fips day (perceived 225, i.e. flat vs W41). 10-10 thin (n=4), charted not aggregated.
  Both shard upticks were **pure coverage**: web 5479→6205 tests (per-test cost −5%), worker 2517→2708.

### W39 diff outcome — DELIVERED (verified 10-05)

`cda2fe27b` / PR **#18012** (Tobias Wochinger, **2026-09-28 12:36:54Z**) added `--filter=!worker
--filter=!@langfuse/native` to the browser e2e build. Scorecard vs the W39 prediction: e2e Build 69→**37s** (beat
the predicted 42-48); e2e job 186→**167s**; perceived 234→**216.5s** (-7.5%, short of ~205). #17062 is CLOSED.
**Lesson:** `--filter=!<app>` does not drop that app's workspace deps — exclude each one individually; that is
the likeliest shape of the next build-graph win.

e2e step shape (W41 medians of a 167s job, kept for reference): `Run e2e tests` 50 · `Build` 35 · `Seed DB` 14 ·
`Post Cache Next.js builds` 13 · `Scan client bundle` 7 · four cache/setup steps 5 each · rest ≤3. **The tail is
diffuse — no single dominant target remains inside e2e.** Past incident signature worth keeping: 2026-09-11 main
red 06:35-11:32Z was apt-mirror failures (fixed by `ae2b6dbd3`, #17328) — uniform ~700-725s wall with
`e2e-tests` + `tests-storybook` failing together across all event types.

## Flaky tracking

- **Zero retried tests in every sampled shard for SIX consecutive weeks** (09-07 … 10-12). `35d16971a`
  (#18564, "fix flaky storybook tests") landed 10-09/10-10 and introduced no retries.
  **The watchlist is DROPPED** per the standing instruction carried since 09-28. Reinstate only when a
  `Retried tests (N):` block actually appears in a log.
- Root cause kept in case it returns: `admin-api-keys.servertest.ts > 'invalidates all cached API keys…'`
  (dropped 09-14) asserts an exact `invalidatedCount: 2` against a SHARED Redis DB while the handler scans
  `api-key:*` globally, so a concurrent shard makes it 3+; one-line fix is `>= 2`. Also cleared:
  `unstable-evaluator-v2-api`, `otelToObservationForEval`.
- Shard content for growth-vs-slowdown checks (files/tests/vitest Duration): web 317/5413/69.31s (W40) →
  319/5479/71.99s (W41) → **337/6205/77.28s** (W42, 10-10; 10-06 was 324/5551/82.29s); worker 194/2497/81.74s →
  194/2517/82.8s → **214/2708/89.19s**. Divide before judging: web is **12.45 ms/test**, down from 13.14.
- **Web shard time is import-bound, not test-bound** (10-12, parked candidate). W42 web: `import 581.93s`
  summed across workers vs `tests 312.37s` and `transform 70.61s`. Worker is the opposite (195.20 vs 144.95,
  transform only 4.88s). Any fix is pool/isolate/`deps.optimizer` tuning — unverifiable without `node_modules`.

## Known CI waste — report only, never propose (fixes live in edit-forbidden `.github/workflows/**`)

- **`tests-fips (web|worker)` gates nothing but bills every merge-queue run** (10-12, NEW, biggest item here):
  ~25s of extra wall clock plus two runners (16vcpu + 8vcpu), for a job `pipeline.yml` itself marks "Not part of
  all-ci-passed yet". Add it to `all-ci-passed` (cost then buys merge safety) or move it to a nightly trigger —
  a product call, not a perf tweak. Recommend, never diff.
- **turbo + pnpm cache reservation races** (09-03 onward, persistent): parallel matrix jobs share one key, so
  `Failed to save: Unable to reserve cache with key Linux-X64-node24-turbo-ci-<hash>` (likewise
  `pnpm-lockfile-verified-*`, `node-cache-*`) recurs after tarring 0.8-2.6 GB. The loser silently discards its
  upload — no direct wall cost, degrades later hit rates.
- **Runner queue outliers show per job**: `BLACKSMITH_RUNNER_MESSAGE_WAIT_MS` in the `job_completed.sh` env group,
  typically 109-680 ms (one 09-23 web job hit **201551 ms**). Fleet capacity, not repo code — use it to rule
  queue wait in or out before blaming a step.

## Output contract

- No PRs, ever. Every run files exactly one issue (title prefixed `CI Runtime Report: `, label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty).
- **No issue-search tool exists** — GitHub MCP offers only `actions_get`/`actions_list`/`get_job_logs` + PR
  readers, so backfilling a past issue's number/url is impossible; entries stay `number: null`. `missing_tool`
  filed 08-24 and 09-07 — don't re-file.
- **`$GITHUB_STEP_SUMMARY` is NOT writable** (09-07, ENOENT) — the filed issue is the only output.
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
  that runner's image count, so there is no single right value. **Start ~248 web / ~205 worker and err high** —
  an undershoot costs a whole extra call. Worker: 178 and 205+ hit, 115 badly undershoots. Web: 203 reaches the
  `Test Files`/`Tests`/`Duration` totals but **200 clipped them on 10-12**; 60/112/185 are far too low.
  `Slowest test files` running straight into `Post job cleanup.` IS the zero-retry proof (`Retried tests (N):`
  prints only when N ≥ 1).
- **`git log` is the cheapest attribution tool — use it first.** Bare `git log` and
  `git log --oneline -25 --since=<date> -- <path>` need no approval; `git show <sha> -- <file>` works,
  `git log -S<string>` needs approval.
- **Write temp scripts to `/tmp/gh-aw/agent/` with `Write`, never the repo.** Copy response paths **including the
  session-id segment** or you get ENOENT.
- Sandbox bash blocks compound commands, `bash script.sh`, `jq -f`, heredocs (incl. quoted braces), redirects
  outside the workspace, `ls`/`find`/`wc` outside the repo, `mkdir` under `/tmp/gh-aw`, bare `pnpm`, inline env
  prefixes, and `git -C <abspath>` / `git grep`. Use `Glob`/`Grep`, and `node -e` + `fs` outside the repo.
- A web vitest run needs a placeholder `/…/langfuse/.env.test` (`web/vitest.config.mts` loads `../.env.test`;
  `cp .env.test.example` is not enough): `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `SALT`,
  `ENCRYPTION_KEY` (64 hex), three `CLICKHOUSE_*`, `REDIS_CONNECTION_STRING`. **Delete it before finishing.**
- **`pnpm`/`turbo` are NOT installed and `node_modules` DOES NOT EXIST** (10-05, still true 10-12). Nothing
  needing a dependency resolve or a build is verifiable — verify a filter change by **deriving the task closure
  statically** from `pnpm-workspace.yaml` globs + each `package.json`'s internal deps, walking `^build`, and
  label it a static derivation. `turbo.json` is JSONC: strip `//`. Dependency-free logic CAN be benchmarked.
- DB connectivity is a STANDING blocked condition: `host.docker.internal` → `EAI_AGAIN` since 08-03
  (github/gh-aw#52140, github/gh-aw-firewall#7268). Every top slowest file in both suites is DB-backed, so
  mining ends at "cannot verify". Don't re-attempt until one closes.
- `.svg` files DO persist (`charts/` holds 13). Generator (write it fresh with `node`/`fs` — `head -c` on an old
  chart is BLOCKED outside the repo): 780x430, `X(i)=62+i*174`, `Y(v)=366−v/260*312`, gridlines every 65s,
  in-SVG legend at y=402, `#3987e5` perceived / `#de5a20` execution / `#8875e0` wait.
