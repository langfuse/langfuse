# CI runtime analyst — durable notes

Append dated bullets. **Keep under 235 lines** (raised from 200 on 10-26 after pruning everything superseded —
the standing-rules section earns its length; if it grows again, cut from the week-by-week record first).

## Standing rules (read these first)

- **NON-GATING JOBS ARE THE BLIND SPOT — three ways** (10-12, 10-19, and the biggest lesson of 10-26).
  (a) *They can fail 100% of the time and nobody finds out*: `tests-fips (web|worker)` failed on **every** run
  since `f6c3660ced` (#19339) landed 10-25 07:50Z, so FIPS coverage was **zero** while the jobs still billed
  full wall clock and stamped every run red. Nothing blocked, nothing alerted.
  (b) *They corrupt the metrics*: since `runnerWait = perceived − execution` and `execution` is the UNION of
  successful job intervals, a job spanning the run makes the union ≈ the full window, so wait "falls" with no
  queue change at all — and a run is marked `failure` while `all-ci-passed` PASSED, inflating the failure rate.
  **Fixes**: always compute **`gated` = `run_started_at` → `all-ci-passed.completed_at`** and lead with it;
  diff the job-name set against last week; check whether `all-ci-passed` is actually among a run's failing jobs;
  and **check each non-gating job's pass rate on `push`-to-main runs separately from the queue numbers**.
- **"Zero retried tests" measured on SUCCESSFUL runs is nearly worthless** (10-19). The success-path block only
  proves the passing runs passed. **Analyse every failed `merge_group` run, every week — that is the flake
  signal.** Say which population a flake claim rests on.
- **Prove flakiness by finding the test PASSING, not by counting retries** (10-26). `SessionConversationalView
  .stories.tsx > Sidebar Scrolling And Selection` took **63.04s with retries=3 when failing** and **1.72s in a
  healthy run** — same test, same week. The duration gap *is* the evidence. Retry count alone never is.
- **A job can fail with ZERO failing tests** (10-19). Always read the reporter totals before attributing a
  failure to a test. Neither per-test vitest `retry` nor a step-level retry catches an unhandled rejection
  raised outside any test.
- **A weekly delta can be pure WINDOW COMPOSITION** (10-26, the counterpart to the 10-19 lesson). W44 read +28%
  on perceived, yet the daily medians fall monotonically 380→421→365→304→277→277 and end *below* W43's weekly
  aggregate. The window simply contained two peak-load weekdays that W43's did not. **Before writing the word
  "regression", plot the dailies and check whether the last days of the window are better than the comparator's
  average.** Compare like days (Mon/Tue vs Mon/Tue), not week-blobs.
- **Rule out cache and queue before blaming code for a broad slowdown** (10-26). Diagnostic triad: `runnerWait`
  (5-11s all week → not queueing), `install dependencies` (flat 2-4s → not a cold cache), Turbo remote-cache
  setup (~0s). If all three are flat and the slowdown is **uniform across unrelated jobs** (W44: web tests −24%,
  worker tests −22%, web FIPS −32%, worker FIPS −25%, e2e −40% over the same days), it is runner throughput, not
  code. Pearson r(concurrency@T+60s, perceived) was only **0.314** — and 10-23 had the week's *highest* volume
  (424 runs) with a *lower* median than 10-20 (252 runs). Raw run count is not the predictor; burst shape is.
- **Check the critical path before mining tests** (09-11; pole moved 10-19, confirmed 10-26). `e2e-tests` is not
  it: `execution − e2e` went 17.8s (W40) → 36 → 85 → 123.8 → **153.5s (W44)**. The pole is **`tests-fips`**,
  last-to-finish in **20/28 runs (71%)**. Redo the arithmetic **net of non-gating jobs** every week.
- **Separate NEW COVERAGE from a SLOWDOWN before calling a step a regression** (09-28). Pull
  `Test Files`/`Tests`/`Duration` and **divide**. W44's step increases were coverage + contention: per-test cost
  *fell* to **12.1 ms** (web, from 13.0) and **32.7 ms** (worker, from 33.7).
- **A regression can live in the BUILD GRAPH, not in test code** (09-21). When a step inflates with no matching
  test change, read `turbo.json` task overrides and the selected package set.
- **A capacity/concurrency change can swing these numbers ~20-35% on its own.** W36 regressed +21% on host
  capacity; W37 recovered −20% via #17122. Check `git log` on the CI workflow before blaming code; wall-clock
  down + summed file durations **up** = parallelism, not cheaper tests. Requeues also raise load — check the
  failure count before calling a slow day a regression.
- **Overlapping windows inflate WoW deltas** — state which days are shared. W44 (10-20..10-26) is the first
  window that aligns exactly to an ISO week (Mon..Sun); W43 and earlier overlapped.
- **Fri/Sat/Sun structurally collapse the merge_group sample** (09-19 zero, 09-26 n=2, 10-17 zero, **10-24 n=3**
  — 4th occurrence, now reliable). Never aggregate them; chart them with the `n=` annotation in red. But 10-02
  and 10-09 were their weeks' busiest, so validate any zero day against an unfiltered fetch. **German Unity Day
  (Oct 3) blanks CI** (Berlin-based).
- **Verify last week's follow-ups against `git log`, not against the metrics** (10-26). W43's PRIMARY item was
  fixed by a human 1 day after filing (`5e243a26c2`, #19010) in a *different* way than suggested — setTimeout
  deleted and replaced with `autoFocus`, and the fake-timer test dropped. The metric move (12.8% → 5.3% failure
  rate) only made sense once the commit was found. Always name the commit, author and date in the outcome.
- **Never propose a diff the measurements don't support** (10-05). If the fix can't be verified here, report the
  exact `file:line` and the evidence instead. An honest `## Outcome` beats a speculative patch. Never propose a
  retry/skip to hide a real defect.

## Dead and parked candidates — do not re-attempt

- **DEAD, measured, do not re-open**: `layout.clienttest.ts` hoist (08-24); `webhooks.test.ts` fake timers
  (09-07, no timers in it); `bufferedStreamUploader.test.ts` 3.00s retry (09-14, internal sleeps are 10-100ms);
  `json-utils.clienttest.ts` trim (`deepParseJson` mutates in place); `analyticsIntegrationSsrfPinning.test.ts`
  (08-24, new coverage). **PARKED, weak**: `redisConsumer.test.ts:116 setTimeout(2000)` (09-14);
  `score-comparison-analytics.servertest.ts` `Promise.all` batching (07-31, safe but DB-blocked).
- **otelReplay.properties.test.ts `numRuns` / split / concurrency — DEAD** (09-28, re-confirmed 10-12 and
  10-26). Still the worst per-test density in the repo: **22.81s over 2 tests = 11.4s each**. Lowering `numRuns`
  cuts coverage (forbidden); `describe.concurrent` races the shared writer singleton per the file's **own
  comment at L682-683**. Stop re-deriving this — if it is re-raised, the only untried angle is shrinking the
  generated-value *depth*, not the run count.
- **DB-backed, do not re-mine**: `event-repository.servertest.ts` (still #1 web file, 23.35s / 110 tests),
  `score-comparison-analytics`, `traces-api`, `ingestion-api`, `dataset-service`, `experiment-score-levels`,
  `batchExport`, `IngestionService.integration`, and `traceBatching.test.ts` (#1-2 worker file — slow but
  **never flaky**; watch only).
- **`scripts/scan-client-bundle.mjs` — defect CONFIRMED, fix REJECTED** (10-05). `collectExemptRanges()` is
  genuinely O(N²). **Do not re-propose per-node set memoization**: 783× faster on deep chains but **55× SLOWER**
  on flat guard lists. Upside caps at ~4% of e2e, which is no longer the critical path anyway.

## Week-by-week record (condensed)

Weekly tuple order: perceived / execution / wait / webBuild / webRunTests / workerRunTests / e2e.
Weekly aggregate method is **MEDIAN of the dense daily medians** — never switch to mean, the series would break.

- **W28 baseline (06-30..07-07)**: p50=396 / p90=522s, n=131. **Execution-bound, not queue-bound** (wait 6-22s)
  — still true 10-26. **08-18**: issue-output regime begins.
- **W34 08-24** 198.3 / 185.3 / 15.3 / 48 / 77.8 / 106 / 158.3 (dense comparator). **W36 09-07** 240.5 / 224.5 /
  15 / 52 / 91.5 / 113.5 / 165.5, +21.3%, wait flat — **host capacity, not code**. **W37 09-11 best on record**
  192 / 175.3 / 17 / 47.3 / 69 / 72.8 / 155.5 (`aa5f60aa8`, #17122). **W38 09-14 flat** 186.3 / 170.3 / 16.8 /
  47 / 67.5 / 71.3 / 155.5.
- **W39 09-21 — LARGE REGRESSION, first suggested diff.** 234 / 217.8 / 14 / 48 / 72 / 72.3 / 186, +25.6% while
  wait FELL; localized to the e2e `Build` step (42→69s), cause `1a2d1f211` (#17062). **W40 09-28** quiet
  226.5 / 214.8 / 13.5 / 48.5 / 77 / 81.3 / 197. **W41 10-05** 216.5 / 203 / 16.5 / 47 / 77 / 86.5 / 167,
  **e2e Build −44%** (the W39 diff delivered).
- **W42 10-12 — NEW NON-GATING JOB, NO DIFF.** 251.5 / 242.8 / 7.5 / 49.8 / 86 / 90.5 / 157.5, gated **226.3**;
  p90 302.4, n=24 over 218/25 (10.3%). Perceived +16.2% but gated only +4.5%: `tests-fips` from `bb1b66451`.
- **10-19 (W43) — BROAD TIMING REGRESSION, NO DIFF; the FAILURES are the story.** 291 / 286.3 / 6.3 / 55.5 /
  94.5 / 108.3 / 162.5, gated **269.5**, fipsMax 274; p50 281 / **p90 408**, n=26 over **239 successes / 35
  failures (12.8%)**. All 35 attributed: 22 product-code defects (13 of them the `tests-web-client` false
  failure), 7 infrastructure, 4 genuine flakes, 2 non-gating-only.
- **10-26 (W44) — FIPS SILENTLY BROKEN; timing a non-story.** 372.5 / 362.5 / 8.5 / 55 / 99.5 / 110 / 209, gated
  **331**, fipsMax 331, exec−e2e 153.5; p50 376.5 / p90 529, n=28 over **179 successes / 10 failures (5.3%, best
  on record)**. Dense 10-20..10-23 (n=6), thin 10-24 (n=3) / 10-25 (n=1), empty 10-26. +28% vs W43 is window
  composition, not a regression (see standing rule). **All 10 failures attributed**: 4 the storybook sidebar
  flake in one 6-minute cluster on 10-20 (self-fixed on main by `c329fa08e5`/#19030 ~100 min later), 2 the FIPS
  node-bump break, 2 infrastructure, 1 worker timezone test, 1 unattributed `lint web`. New jobs:
  `build-storybook` (`5005e702a6`, 10-23) and `notify-flaky-merge-queue`.

### Diff-outcome scorecard

- **W39 — DELIVERED.** `cda2fe27b` / PR **#18012** (Tobias Wochinger, 2026-09-28) added `--filter=!worker
  --filter=!@langfuse/native` to the browser e2e build: e2e Build 69→**37s**, perceived 234→**216.5s**.
  **Lesson:** `--filter=!<app>` does not drop that app's workspace deps — exclude each individually.
- **W43 — RESOLVED BY A HUMAN, differently.** `5e243a26c2` / #19010 (Nimar, 2026-10-20 09:11Z) deleted the
  `SignInPage.tsx:816` focus `setTimeout` and used `autoFocus={authProviders.sso}` instead. The 13-run
  `tests-web-client` zero-failing-tests bucket went to **zero**; failure rate 12.8% → 5.3%. Largest confirmed
  win in the series.

## Flaky tracking

- **Success-path streak: 8 consecutive zero-retry weeks** (09-07 … 10-26). Read this narrowly — see the
  standing rules. The failed-run population is where flakes actually live.
- **WATCHLIST (new 10-26, 1 occurrence):** `worker/src/__tests__/dataRetentionProcessing.test.ts >
  DataRetentionProcessingJob > "uses UTC retention boundaries in the Asia/Tokyo session timezone"` — failed
  10-23 with retries=3 on **both** `mode-azure` and `mode-redis-cluster`, and is the worker's slowest test
  (17.43s). A timezone-boundary test failing on one specific date is usually **date-dependent, not flaky** —
  check the date before classifying.
- **WATCHLIST, lowered 10-26 (zero occurrences in W44, but W44 had only 10 failures — weak evidence, do NOT
  declare fixed):** `nativeOtelMedia.unit.test.ts > "compares generated media spellings…"` (5012ms against a
  5000ms timeout); `web/src/__e2e__/app-shell-overflow.spec.ts > "a right drawer's absolutely-positioned content
  does not scroll the document"` (races the web server cold start as `[1/17]`).
- **RESOLVED 10-26:** `SessionConversationalView.stories.tsx > Sidebar Scrolling And Selection` (4 dequeues
  10-20, fixed same day by `c329fa08e5`/#19030). `SignInPage.tsx:816` (see scorecard).
- Shard content for growth-vs-slowdown (files/tests/Duration): web 337/6205/77.28 (W42) → 348/6463/82.71 (W43)
  → **353/7057/85.39 (W44)**; worker 214/2708/89.19 → 221/2948/99.29 → **225/3062/100.08**; storybook W44
  **341/1769/77.88**. Divide first: web **~12.1 ms/test**, worker **~32.7**, storybook **~44.0**.
- **Web shard time is import-bound, not test-bound** (10-12, still true 10-26): web `import 671.22s` summed vs
  `tests 319.46s` and `transform 96.85s`; worker is the opposite (201.79 / 179.86 / 5.41). Any fix is
  pool/isolate/`deps.optimizer` tuning — unverifiable without `node_modules`.

## `scripts/ci/retry-on-merge-queue.sh` (landed `d22b43062` / #18287, 2026-10-15)

Changes flake semantics mid-history — note which side of 10-15 a comparison falls on.
- **Wrapped at `pipeline.yml` lines 214, 446, 492, 494, 608, 1442 only**: `cargo test --locked`;
  `@repo/eslint-plugin run test`; `@repo/in-app-agent-sandbox-runtime run test` and `run test:e2e`;
  `@langfuse/shared run test`; `web run test:e2e`. **NOT wrapped**: `tests-web-client` `run test-client` (1002),
  `tests-web` `run tests` (944), `tests-worker` `run tests` (1109), `tests-fips`, `e2e-server-tests` — the
  header explains it wraps only suites with no retry of their own, because "the second attempt runs against
  whatever state the first one left behind".
- `merge_group` only (PRs deliberately never retry). Does **not** retry when exit status ≥ 128 (signal/OOM).
  Double failure → `::error title=Merge-queue retry failed::…` and exits with the **FIRST** status. Retry
  success → `FLAKY_MARKER="LANGFUSE_CI_FLAKY_RETRY_SUCCEEDED"` + explicit `exit 0`.
- **`Both attempts failed` in a log is proof a failure is DETERMINISTIC, not flaky.**

## Known CI waste — report only, never propose (fixes live in edit-forbidden `.github/workflows/**`)

- **`tests-fips (web|worker)` gates nothing but bills every merge-queue run** (10-12, worse 10-19, an actual
  incident by 10-26 — the biggest structural item on the board). **Critical path in 71% of runs** (end-offset
  305-308s vs `all-ci-passed` 314s), driver of p90 529s, source of the extreme tails (run 39797170491:
  perceived **816s** vs gated 314s). `pipeline.yml` says "Not part of all-ci-passed yet". **The W43 argument
  against gating was queue latency; W44 inverts it — non-gating is what hid a total coverage loss for 2 days.**
- **FIPS toolchain breaks on base-image changes — twice now.** `f964009483` reverted #18449 (Iron Bank Alpine);
  `f6c3660ced` (#19339) broke it again by swapping Red Hat's `nodejs` RPM for the upstream
  `node:24.22.1-bookworm-slim` binary in `worker/Dockerfile`'s UBI stage: the RPM Node links the **system**
  OpenSSL and honours `OPENSSL_FORCE_FIPS_MODE=1`, upstream Node **statically bundles non-FIPS OpenSSL**, so
  `getFips()` returns 0 and `scripts/ci/fips-tests.sh:28-31` exits 1. Both the commit's own added comment and
  the pre-existing `worker/Dockerfile` header say so out loud — **when a Dockerfile comment states a
  constraint, grep the CI scripts for the guard that enforces it.** Not verifiable here (no docker build).
- **turbo + pnpm cache reservation races** (09-03 onward, persistent, benign): parallel matrix jobs share one
  key, so `Unable to reserve cache with key Linux-X64-node24-turbo-ci-<hash>` recurs; the loser discards its
  upload. **Runner queue outliers** show per job via `BLACKSMITH_RUNNER_MESSAGE_WAIT_MS` — fleet capacity, not
  repo code; in W44 only **1/28** runs had any job queue > 60s.

## Output contract

- No PRs, ever. Every run files exactly one issue (title prefixed `CI Runtime Report: `, label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty).
- **No issue-search tool exists** — GitHub MCP offers only `actions_get`/`actions_list`/`get_job_logs` + PR
  readers, so backfilling a past issue's number/url is impossible; entries stay `number: null`. `missing_tool`
  filed 08-24 and 09-07 — don't re-file.
- **`$GITHUB_STEP_SUMMARY` is NOT writable** (09-07, ENOENT) — the filed issue is the only output.
- Mermaid gate: **4 blocks** (daily Chart 1 + Chart 2, plus the weekly-x-axis versions). Palette pinned
  `#3987e5,#de5a20,#8875e0`. Count the literal blocks before submitting.
- `issues.json` entries now carry a `status` field (`open` / `closed-stale` / `closed-delivered` /
  `superseded-by-<date>`). Swept 10-26: everything before 10-19 is closed. **Only refresh `open` entries.**

## Tooling notes

- **Compute the ISO week label, don't assume it** (`-partial-<MMDD>` when incomplete or colliding);
  `date -u +"%G-W%V"` is rejected (simple_expansion). Check `HEAD..origin/main` = 0 first, every run.
- `list_workflow_runs` caps at ~30 runs/page, ignores `per_page`, has no `created` filter, and its
  `event`/`branch` filters have returned **stale** data — **fetch unfiltered, filter client-side**.
- **OVERSIZED `get_job_logs` IS THE CHEAP PATH, not a failure** (10-19). Pass **`tail_lines: 300-400`** so the
  result exceeds the token cap and is saved to a tool-result file; extract ~10-30 lines with a Node script. For
  a failed `run tests` step go to **600+**. For a failed **`lint`** step go to **800+** (10-26: 400 reached only
  the Turbo cache-teardown epilogue and the diagnostic was lost). For **`tests-fips`** go to **1600** — its
  single step shells out to `fips-tests.sh`, which installs and builds inside the step, so hundreds of buildx
  cache lines sit between the error and the end.
- Large tool responses land in a file, payload at `.[0].content[0].text` (a JSON string), jobs at
  **`.data.jobs.jobs[]`** (but `actions_list` sometimes gives `payload.jobs` as a bare array — handle both).
  **Never `Read` those files** — parse with a small Node script written via `Write` (not Python).
- Reusable scripts in `/tmp/gh-aw/agent/` (rewrite if missing, they are not persisted): `collect.js` (sweep all
  `actions_list` results → deduped `allruns.json`), `plan.js` (sample picker → `sample.json`), `jobs.js`
  (→ `jobsByRun.json`; **guard `if (!j.steps) continue`**, skipped jobs have none), `metrics.js`
  (→ `recs.json`/`daily.json`), `path.js` (critical path), `steps.js` (per-day step medians), `fail.js`
  (failed run → failing jobs + steps), `load.js` (concurrency correlation), `logx.js`
  (`node logx.js <file> <regex> [before] [after]`, deep-finds `logs_content`, strips ANSI+timestamps),
  `chart.js`, `issues-update.js`.
- **`git log` is the cheapest attribution tool — use it first.** Bare `git log`,
  `git log --oneline -25 --since=<date> -- <path>`, `git show <sha> --stat` and `git show <sha> -- <file>` all
  work without approval; `git log -S<string>` needs approval. `git log -- <path>` on a suspect test file is how
  the 10-26 storybook flake was shown to be already fixed.
- **Write temp scripts to `/tmp/gh-aw/agent/` with `Write`, never the repo**; copy response paths **including
  the session-id segment** or you get ENOENT, and invoke with an **absolute path**. Sandbox bash blocks
  compound commands, `bash script.sh`, `jq -f`, **heredocs (including any `{` next to a quote — "expansion
  obfuscation")**, redirects outside the workspace, `ls`/`find`/`wc` outside the repo, `mkdir` under
  `/tmp/gh-aw`, bare `pnpm`, inline env prefixes, `git -C <abspath>` and `git grep`. Use `Glob`/`Grep`/`Write`,
  and `node -e` + `fs` outside the repo.
- **`pnpm`/`turbo` are NOT installed and `node_modules` DOES NOT EXIST** (10-05, re-confirmed 10-26: only `npx`
  from the hosted toolcache). There is **no docker build** either. Nothing needing a dependency resolve, a
  build, an image, or a test run is verifiable — derive statically and label it as such. `turbo.json` is JSONC:
  strip `//`. Dependency-free logic CAN be benchmarked. **This is why product-code and Dockerfile fixes can
  never be shipped as diffs.**
- DB connectivity is a STANDING blocked condition: `host.docker.internal` → `EAI_AGAIN` since 08-03
  (github/gh-aw#52140, github/gh-aw-firewall#7268). Don't re-attempt until one closes.
- `.svg` files DO persist (`charts/` holds 15). Generator (`chart.js`, rewrite fresh with `node`/`fs`): 780x440,
  **`X(i)=62+i*(696/(n−1))`** so it fits any point count, **`Y(v)=366−v/MAX*312` — parameterise MAX** (it was
  once hardcoded to 260 and overflowed); gridlines every 60s; legend at y≈410-416 and footnote at y=434 (**not
  y≈397, that collides with the `n=` labels**); `#3987e5` / `#de5a20` / `#8875e0`. **Offset the three value
  labels** (perceived dy −11, execution dy +17, gated dy −11 with dx ±33, flipped on the last point) or they
  overlap on days where the series converge. `.toFixed(1)` every coordinate — raw floats emit `62.400000000006`.
