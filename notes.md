# CI runtime analyst — durable notes

Append dated bullets. Keep under 200 lines; prune superseded notes.

## Standing rules (read these first)

- **"Zero retried tests" measured on SUCCESSFUL runs is nearly worthless** (10-19, biggest lesson of the regime).
  Seven consecutive weeks were reported retry-free — all from success-path shard logs. The 10-19 run analysed
  **all 35 failed merge_group runs** for the first time and found 4 genuine test flakes, a 13-run product defect,
  and a 515-test infra collapse, none of which can ever appear in a successful run's reporter block. **Analyse
  every failed merge_group run, every week. That is the flake signal; the success-path block only proves the
  passing runs passed.** Say which population a flake claim rests on.
- **A job can fail with ZERO failing tests** (10-19). 13 of 35 failures were `tests-web-client` reporting
  `Test Files 544 passed | 1 skipped` / `Tests 5243 passed | 51 skipped` and still exiting 1, on an unhandled
  timer callback firing after teardown (`❯ Timeout._onTimeout …:819:31` / `❯ listOnTimeout node:internal/timers`).
  **Always read the reporter totals before attributing a failure to a test.** Neither per-test vitest `retry` nor
  a step-level retry catches an unhandled rejection raised outside any test.
- **A long NON-GATING job breaks `perceived`, `runnerWait` AND the failure rate** (10-12, extended 10-19). When
  `tests-fips` landed, perceived jumped +16.2% while the real gate moved +4.5%. Because `runnerWait = perceived −
  execution` and `execution` is the UNION of successful job intervals, a job spanning the run makes the union ≈
  the full window, so wait "fell" with **no queue change at all**. 10-19 adds: 2 runs were marked `failure` while
  `all-ci-passed` PASSED, because only the non-gating job failed — it inflates the headline failure rate too.
  Always compute **`gated` = `run_started_at` → `all-ci-passed.completed_at`**, diff the job-name set against last
  week, and check whether `all-ci-passed` is actually among a run's failing jobs. Report perceived, lead with gated.
- **Check the critical path before mining tests** (09-11; the pole MOVED on 10-19). `e2e-tests` is no longer it:
  `execution − e2e` went 17.8s (W40) → 36 (W41) → 85 (W42) → **123.8s (W43)**. The pole is now
  **`tests-fips (worker)`** (median end-offset 277s, the run's longest job, bimodal 240-285s vs 346-400s — it
  alone drives perceived p90 to 408s). Shards still aren't worth mining, but for a new reason. Redo the
  arithmetic **net of non-gating jobs** every week; the answer changes.
- **Separate NEW COVERAGE from a SLOWDOWN before calling a step a regression** (09-28). Pull
  `Test Files`/`Tests`/`Duration` per sample and **divide**. W43's web +9.9% and worker +19.7% were coverage plus
  a slow-runner tail: per-test cost flat at ~13.0 ms (web, W42 12.45) and ~33.7 ms (worker, W42 32.9).
- **A regression can live in the BUILD GRAPH, not in test code** (09-21). W39's +25.6% came from
  `@langfuse/native` entering the e2e `Build` closure with `"cache": false, "outputs": []`. When a step inflates
  with no matching test change, read `turbo.json` task overrides and the selected package set.
- **A capacity/concurrency change can swing these numbers ~20-35% on its own.** W36 regressed +21% on host
  capacity; W37 recovered −20% via #17122 (Blacksmith CPUs + `VITEST_MAX_WORKERS=12`). Check `git log` on the CI
  workflow before blaming code; wall-clock down + summed file durations **up** = parallelism, not cheaper tests.
- **A sub-threshold uptick in a thin week is worth CARRYING.** The 9.3% webRunTests uptick dismissed as noise on
  08-31 reached +17.6% cumulative by W36. But a single ~6-12% weekly shard move is barely above its own noise.
- **Check the failure count before calling a slow day a regression.** 09-04 carried 14 of W36's 18 failures;
  10-16 carried 13 of W43's 35. Requeues raise load. Conversely a weekly regression can be **concentrated in its
  first days** — W43's daily perceived FELL 330.5 → 247 while the weekly number rose 15.7%. Scan daily before
  attributing a weekly delta to the whole window.
- **Overlapping windows inflate WoW deltas** — state which days are shared. W40→W41→W42→W43 were all clean.
- **Fridays can collapse the merge_group sample** (09-19 zero, 09-26 n=2, **10-17 zero** — now a pattern), but
  10-02 and 10-09 were their weeks' busiest, so don't assume it. **German Unity Day (Oct 3) blanks CI**
  (Berlin-based). Validate any zero day against an unfiltered fetch.
- **Never propose a diff the measurements don't support** (10-05). If the fix can't be verified here, report the
  exact `file:line` and the evidence instead. An honest `## Outcome` beats a speculative patch. And never propose
  a retry/skip to hide a real defect — that is explicitly forbidden, and 10-19 is the case study (wrapping
  `run test-client` in the retry would have buried a product bug *and* not even worked).

## Dead and parked candidates — do not re-attempt

- **score-comparison-analytics.servertest.ts `Promise.all` batching — PARKED** (07-31):
  `insertLargeTraceLevelScorePairs` L112-161 inserts 120k rows via 12 sequential `await createScoresCh(...)`;
  safe (precedent `scores-api-v2.servertest.ts:104`) but unverifiable (DB blocked).
- **DEAD, measured, do not re-open**: `layout.clienttest.ts` hoist (08-24, noise, and a win cuts coverage);
  `webhooks.test.ts` fake timers (09-07, no timers in it — the ~23.5s is real DB/HTTP);
  `bufferedStreamUploader.test.ts` 3.00s retry (09-14, internal sleeps are 10-100ms); `json-utils.clienttest.ts`
  trim (`deepParseJson` mutates in place); `analyticsIntegrationSsrfPinning.test.ts` (08-24, new coverage).
  **PARKED, weak**: `redisConsumer.test.ts:116 setTimeout(2000)` (09-14) — ~1.5s, and shortening it narrows a
  negative assertion.
- **otelReplay.properties.test.ts `numRuns` / split / concurrency — DEAD** (09-28, re-confirmed 10-12). 13.21s
  over 2 fast-check properties at `numRuns: 128` (L701-711) = ~52ms per case, the worst ratio in either suite, so
  it keeps attracting attention. Lowering `numRuns` cuts coverage (forbidden); `describe.concurrent` races the
  shared writer singleton per the file's **own comment at L682-683**. Stop re-deriving this.
- **DB-backed, do not re-mine**: `event-repository.servertest.ts` (still #1 web file, 22.8-25.2s / 104-106 tests),
  `score-comparison-analytics`, `traces-api`, `ingestion-api`, `dataset-service`, `experiment-score-levels`,
  `awsLambdaCodeEvalDispatcher.integration`, `batchExport`, `IngestionService.integration`, and
  `traceBatching.test.ts` (#1 worker file — slow but **never flaky**; watch only).
- **`scripts/scan-client-bundle.mjs` — defect CONFIRMED, fix REJECTED** (10-05). `collectExemptRanges()` is
  genuinely O(N²) (every `LogicalExpression` re-walks its left subtree; 40→7595 ms at N=500→8000 on synthetic
  ESTree ASTs, which run **without espree** under `node --stack-size=120000`). **Do not re-propose per-node set
  memoization**: 783× faster on deep chains but **55× SLOWER** on flat guard lists. Upside caps at ~4% of e2e,
  which is no longer the critical path anyway.

## Week-by-week record (condensed)

Weekly tuple order: perceived / execution / wait / webBuild / webRunTests / workerRunTests / e2e.

- **W28 baseline (06-30..07-07)**: p50=396 / p90=522s, n=131. **Execution-bound, not queue-bound** (wait 6-22s) —
  still true 10-19. **08-18**: issue-output regime begins, p50=224 / p90=675.4.
- **08-24 (W34) — dense comparator.** 198.3 / 185.3 / 15.3 / 48 / 77.8 / 106 / 158.3; p50 198 / p90 284.6, n=37.
- **09-07 (W36) — first real regression.** 240.5 / 224.5 / 15 / 52 / 91.5 / 113.5 / 165.5, +21.3% vs W34, wait
  flat. **Host capacity, not code**: uniform slowdown = CPU contention; write-heavy-only = I/O.
- **09-11 (W37) — best on record.** 192 / 175.3 / 17 / 47.3 / 69 / 72.8 / 155.5; p50 194 / p90 224.2. Cause
  `aa5f60aa8` (#17122). **09-14 (W38) — flat:** 186.3 / 170.3 / 16.8 / 47 / 67.5 / 71.3 / 155.5.
- **09-21 (W39) — LARGE REGRESSION, first suggested diff.** 234 / 217.8 / 14 / 48 / 72 / 72.3 / 186: +25.6% vs W38
  while wait FELL. Localized to the e2e `Build` step (42→69s, **+64%**). Cause `1a2d1f211` (#17062).
- **09-28 (W40) — QUIET, NO DIFF.** 226.5 / 214.8 / 13.5 / 48.5 / 77 / 81.3 / 197, e2eBuild 66; p50 221 / p90 296.
- **10-05 (W41) — IMPROVEMENT, NO DIFF.** 216.5 / 203 / 16.5 / 47 / 77 / 86.5 / 167, e2eBuild 37, e2eRun 50.5;
  p50 210 / p90 302.2, n=29. **e2e Build −44%** (the W39 diff delivered).
- **10-12 (W42) — NEW NON-GATING JOB, NO DIFF.** 251.5 / 242.8 / 7.5 / 49.8 / 86 / 90.5 / 157.5, gated **226.3**,
  e2eBuild 42, e2eRun 47.5; p50 249.5 / p90 302.4, n=24 over 218 successes / 25 failures (10.3%). Perceived +16.2%
  but gated only +4.5%: `tests-fips (web|worker)` from **`bb1b66451` (#18009, 10-07 08:57Z)**. Both shard upticks
  were pure coverage (web 5479→6205 tests, per-test cost −5%).
- **10-19 (W43) — BROAD TIMING REGRESSION, NO DIFF; the FAILURES are the story.** 291 / 286.3 / 6.3 / 55.5 / 94.5 /
  108.3 / 162.5, gated **269.5**, workerBuild 41.3, e2eBuild 53.3, e2eRun 46, fipsMax 274; pooled p50 281 /
  **p90 408** (W42 302.4, +34.9%), n=26 over **239 successes / 35 failures (12.8%)**. 4 dense days (10-13..10-16,
  n=6 each); 10-18 thin (n=2); **10-17 and 10-19 zero**. Daily perceived FALLS 330.5/293/273/289/247 — the
  regression sits in 10-13/10-14, before the 10-15 CI fix batch (`d22b43062` retry, `8c753fe97` sibling-cancel,
  `6efb65e4c`, `415ba0c10`). `825ac84ea` (#18915) added a new 311s conditional `test-ai-gateway-e2e` job.
  **All 35 failures attributed**: 22 product-code defects (9 a TS2322 build break in
  `packages/shared/.../pydantic-ai/fixtures.ts:121` taking down all 15 jobs; 13 the `tests-web-client` false
  failure), 7 infrastructure, 4 genuine test flakes, 2 non-gating-only.

### W39 diff outcome — DELIVERED (verified 10-05)

`cda2fe27b` / PR **#18012** (Tobias Wochinger, **2026-09-28 12:36:54Z**) added `--filter=!worker
--filter=!@langfuse/native` to the browser e2e build. Scorecard: e2e Build 69→**37s** (beat the predicted 42-48);
e2e job 186→**167s**; perceived 234→**216.5s** (−7.5%, short of ~205). **Lesson:** `--filter=!<app>` does not drop
that app's workspace deps — exclude each individually; the likeliest shape of the next build-graph win. Incident
signature kept: 2026-09-11 main red 06:35-11:32Z was apt-mirror failures (`ae2b6dbd3`, #17328) — uniform
~700-725s wall with `e2e-tests` + `tests-storybook` failing together across all event types.

## Flaky tracking

- **Success-path streak: 7 consecutive zero-retry weeks** (09-07 … 10-19, 9/9 shard logs clean in W43). Read this
  narrowly — see the first standing rule. The failed-run population is where flakes actually live.
- **WATCHLIST, both NEW 10-19, 2 occurrences each:**
  `worker/src/__tests__/nativeOtelMedia.unit.test.ts > "compares generated media spellings without canonicalizing
  raw JSON"` — 5012/5013ms against a **5000ms** timeout (0.3% margin), both 10-13, on the `mode-redis-cluster`
  leg; `358f6237d` (#18968) replaced the ClickHouse encoder with ch-core on this surface. And
  `web/src/__e2e__/app-shell-overflow.spec.ts > "a right drawer's absolutely-positioned content does not scroll
  the document"` — `page.waitForURL` 60s timeout at `web/src/__e2e__/utils/auth.ts:54`, both 10-14; it is the
  FIRST test to start (`[1/17]`), i.e. it races the web server's cold start.
- **PRIMARY open item: `web/src/features/auth/SignInPage.tsx:816`** — a bare `setTimeout(…, 100)` whose callback
  calls `document.querySelector('input[name="password"]')` at line 819 with no cleanup. 13 merge-queue dequeues in
  W43 with zero failing tests. Fix = capture the handle and clear it; unverifiable here (needs the web client
  vitest suite). Check next week whether a human cleared it.
- Root cause kept in case it returns: `admin-api-keys.servertest.ts > 'invalidates all cached API keys…'`
  (dropped 09-14) asserts an exact `invalidatedCount: 2` against a SHARED Redis DB; one-line fix is `>= 2`.
- Shard content for growth-vs-slowdown checks (files/tests/Duration): web 317/5413/69.31s (W40) → 319/5479/71.99
  (W41) → 337/6205/77.28 (W42) → **348/6463/82.71 (W43)**; worker 194/2497/81.74 → 194/2517/82.8 →
  214/2708/89.19 → **221/2948/99.29**. Divide first: web **~13.0 ms/test**, worker **~33.7**.
- **Web shard time is import-bound, not test-bound** (10-12, parked): web `import 581.93s` summed vs `tests
  312.37s` and `transform 70.61s`; worker is the opposite (195.20 / 144.95 / 4.88). Any fix is
  pool/isolate/`deps.optimizer` tuning — unverifiable without `node_modules`.

## `scripts/ci/retry-on-merge-queue.sh` (landed `d22b43062` / #18287, 2026-10-15)

Changes flake semantics mid-history — note which side of 10-15 a comparison falls on.
- **Wrapped at `pipeline.yml` lines 214, 446, 492, 494, 608, 1442 only**: `cargo test --locked`;
  `@repo/eslint-plugin run test`; `@repo/in-app-agent-sandbox-runtime run test` and `run test:e2e`;
  `@langfuse/shared run test`; `web run test:e2e`. (1733/1758 are comments in `notify-flaky-merge-queue`.)
- **NOT wrapped**: `tests-web-client` `run test-client` (1002), `tests-web` `run tests` (944), `tests-worker`
  `run tests` (1109), `tests-fips`, `e2e-server-tests`. Header comment explains why: it wraps only suites with no
  retry of their own, because "the second attempt runs against whatever state the first one left behind".
- `merge_group` only (PRs deliberately never retry). Does **not** retry when exit status ≥ 128 (signal/OOM).
  Double failure → `::error title=Merge-queue retry failed::Both attempts failed (exit N, then M)` and exits with
  the **FIRST** status. Retry success → `FLAKY_MARKER="LANGFUSE_CI_FLAKY_RETRY_SUCCEEDED"` + explicit `exit 0`.
- **`Both attempts failed` in a log is proof a failure is DETERMINISTIC, not flaky** — used 10-19 to classify the
  `pydantic-ai` assertion failure.

## Known CI waste — report only, never propose (fixes live in edit-forbidden `.github/workflows/**`)

- **`tests-fips (web|worker)` gates nothing but bills every merge-queue run** (10-12, worse on 10-19 — biggest
  structural item on the board): it is now the **critical path** (277s median end-offset), the **sole driver of
  p90** (bimodal 240-285 vs 346-400s), **~31.5s of pure post-gate wall time** (it ends after `all-ci-passed` in
  21/26 runs), and the cause of **2 runs marked `failure` that never blocked the queue**. `pipeline.yml` itself
  says "Not part of all-ci-passed yet". Add it to `all-ci-passed` or move it to a nightly trigger — a product
  call. Recommend, never diff.
- **turbo + pnpm cache reservation races** (09-03 onward, persistent): parallel matrix jobs share one key, so
  `Unable to reserve cache with key Linux-X64-node24-turbo-ci-<hash>` (likewise `pnpm-lockfile-verified-*`,
  `node-cache-*`) recurs after tarring 0.8-2.6 GB. The loser silently discards its upload.
- **Runner queue outliers show per job**: `BLACKSMITH_RUNNER_MESSAGE_WAIT_MS` in the `job_completed.sh` env group,
  typically 109-680 ms. Fleet capacity, not repo code. In W43 only 1/26 runs had any job queue > 60s.

## Output contract

- No PRs, ever. Every run files exactly one issue (title prefixed `CI Runtime Report: `, label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty).
- **No issue-search tool exists** — GitHub MCP offers only `actions_get`/`actions_list`/`get_job_logs` + PR
  readers, so backfilling a past issue's number/url is impossible; entries stay `number: null`. `missing_tool`
  filed 08-24 and 09-07 — don't re-file.
- **`$GITHUB_STEP_SUMMARY` is NOT writable** (09-07, ENOENT) — the filed issue is the only output.
- Mermaid gate: **4 blocks** now that history holds 2+ weeks (daily Chart 1 + Chart 2, plus the weekly-x-axis
  versions). Palette pinned `#3987e5,#de5a20,#8875e0`. Count the literal blocks before submitting.

## Tooling notes

- **Compute the ISO week label, don't assume it** (`-partial-<MMDD>` when incomplete or colliding);
  `date -u +"%G-W%V"` is rejected (simple_expansion). Check `HEAD..origin/main` = 0 first, every run.
- `list_workflow_runs` caps at ~30 runs/page, ignores `per_page`, has no `created` filter, and its
  `event`/`branch` filters have returned **stale** data — **fetch unfiltered, filter client-side**, paginating
  until `created_at` passes the window start.
- **OVERSIZED `get_job_logs` IS THE CHEAP PATH, not a failure** (10-19, supersedes the old tail-tuning advice).
  Tuning `tail_lines` to land inline wastes calls (an undershoot lands in the docker-manifest cleanup block with
  no reporter output, ~25k chars for nothing). Instead pass **`tail_lines: 300-400`** so the result exceeds the
  token cap and is **saved to a tool-result file**; then extract ~10-30 lines with a Node script. Caveat: at 400
  the smaller e2e job logs still land inline. For a failed `run tests` step, go to **600+** — the failed-test list
  is long and the `Test Files`/`Tests`/`Duration` totals sit *above* it.
- Large tool responses land in a file, payload at `.[0].content[0].text` (a JSON string), jobs at
  **`.data.jobs.jobs[]`** (but `actions_list` sometimes gives `payload.jobs` as a bare array — handle both).
  **Never `Read` those files** — parse with a small Node script written via `Write` (not Python, needs approval).
  Reusable scripts live in `/tmp/gh-aw/agent/`: `failjobs.js` (map all failed runs → failing jobs + steps),
  `jobdur.js` (median duration/queue/end-offset per job name), `queue.js`, `xlog.js`/`xsum.js` (log extractors).
- **`git log` is the cheapest attribution tool — use it first.** Bare `git log` and
  `git log --oneline -25 --since=<date> -- <path>` need no approval; `git show <sha> -- <file>` works,
  `git log -S<string>` needs approval.
- **Write temp scripts to `/tmp/gh-aw/agent/` with `Write`, never the repo.** Copy response paths **including the
  session-id segment** or you get ENOENT. Invoke with an **absolute path** — `cd /tmp/gh-aw/agent && node x.js`
  is blocked ("may only change directories to the allowed working directories").
- Sandbox bash blocks compound commands, `bash script.sh`, `jq -f`, heredocs (incl. quoted braces), redirects
  outside the workspace, `ls`/`find`/`wc` outside the repo, `mkdir` under `/tmp/gh-aw`, bare `pnpm`, inline env
  prefixes, and `git -C <abspath>` / `git grep`. Use `Glob`/`Grep`, and `node -e` + `fs` outside the repo.
- A web vitest run needs a placeholder `/…/langfuse/.env.test` (`web/vitest.config.mts` loads `../.env.test`):
  `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `SALT`, `ENCRYPTION_KEY` (64 hex), three
  `CLICKHOUSE_*`, `REDIS_CONNECTION_STRING`. **Delete it before finishing.**
- **`pnpm`/`turbo` are NOT installed and `node_modules` DOES NOT EXIST** (10-05, still true 10-19). Nothing
  needing a dependency resolve, a build, or a test run is verifiable — verify a filter change by **deriving the
  task closure statically** and label it as such. `turbo.json` is JSONC: strip `//`. Dependency-free logic CAN be
  benchmarked. **This is why product-code fixes (React components, worker tests) can never be shipped as diffs.**
- DB connectivity is a STANDING blocked condition: `host.docker.internal` → `EAI_AGAIN` since 08-03
  (github/gh-aw#52140, github/gh-aw-firewall#7268). Don't re-attempt until one closes.
- `.svg` files DO persist (`charts/` holds 14). Generator (write it fresh with `node`/`fs`): 780x430,
  `X(i)=62+i*174` (fits 5 points), **`Y(v)=366−v/MAX*312` — parameterise MAX, it was hardcoded to 260 and W43's
  330.5s overflowed it**; gridlines every 60s, in-SVG legend at y≈397-402, `#3987e5` / `#de5a20` / `#8875e0`.
