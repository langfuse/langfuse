# CI runtime analyst — durable notes

Append dated bullets. **Keep under 235 lines**; when it grows, cut from the week-by-week record first.

## Standing rules (read these first)

- **NON-GATING JOBS ARE THE BLIND SPOT — two ways** (10-12, 10-19, 10-26). (a) *They can fail 100% of the time
  unnoticed*: `tests-fips` failed on **every** run for 9 days after `f6c3660ced` (#19339), billing full wall
  clock, nothing blocked or alerted. (b) *They corrupt the metrics*: `execution` is the UNION of successful job
  intervals, so a job spanning the run makes the union ≈ the whole window and `runnerWait` "falls" with no
  queue change — and the run reads `failure` while `all-ci-passed` PASSED, inflating the failure rate.
  **Fixes**: compute **`gated` = `run_started_at` → `all-ci-passed.completed_at`** and lead with it; diff the
  job-name set against last week; check whether `all-ci-passed` is among a run's failing jobs.
- **"Zero retried tests" on SUCCESSFUL runs is nearly worthless** (10-19) — it only proves the passing runs
  passed. **Analyse every failed `merge_group` run, weekly**, and say which population a flake claim rests on.
- **Prove flakiness by finding the test PASSING, not by counting retries** (10-26). `SessionConversationalView
  .stories.tsx > Sidebar Scrolling And Selection`: **63.04s with retries=3 failing** vs **1.72s healthy**, same
  week. Weaker but valid variant (11-16): the same PR, unchanged, failing a job then landing through it.
- **A job can fail with ZERO failing tests** (10-19) — read the reporter totals before attributing a failure to
  a test; neither vitest `retry` nor a step retry catches a rejection raised outside any test.
- **A weekly delta can be pure WINDOW COMPOSITION** (10-26). W44 read +28% on perceived, yet its daily medians
  fell monotonically and ended *below* W43's aggregate. **Plot the dailies before writing "regression."**
- **Rule out cache and queue before blaming code for a broad slowdown** (10-26). Triad: `runnerWait` (→ not
  queueing), `install dependencies` (→ not a cold pnpm store), Turbo remote-cache setup. All three flat +
  **uniform across unrelated jobs** = shared service, not code. Raw run count is not the predictor:
  r(concurrency@T+60s, perceived) = **0.314**; 10-23 had its week's highest volume (424 runs) and a *lower*
  median than 10-20 (252). Burst shape is.
- **BUCKET THE RUNS BY START HOUR — every week** (11-16, found only because the daily medians were flat).
  W47: runs starting **≥17:00Z** (24/165, 15%) had gated median **357s vs 247s** (+45%) — that evening median
  *is* the week's p90 (360s). Amplifier: e2e `Build` **50.5 → 148s (2.9×)**, all 5 runs over 100s starting
  17:11-20:06Z; but web Build +25%, web run tests +19%, worker Build +18% moved too — **a uniform multi-job
  lift with flat `runnerWait` (4-14s) and flat `install dependencies` (1-2s) means a shared SERVICE, not code
  and not the runner queue.** Prime suspect: Actions cache churn (see Known CI waste). **Always split the day.**
- **Check the critical path before mining tests** (09-11; pole moved 10-19). `execution − e2e` went 17.8s (W40)
  → 36 → 85 → 123.8 → 153.5 (W44) → **87s (W47)**; `tests-fips` ends last in **21/34 (62%)**. Redo the
  arithmetic **net of non-gating jobs** every week.
- **THE MEDIAN POLE AND THE TAIL POLE ARE DIFFERENT JOBS** (11-16). `tests-fips` ends last in 62% of runs, but
  it is non-gating, so it cannot set `gated`. Correlate instead: r(gated, `e2e-tests`) = **0.69** vs
  r(gated, fipsMaxEnd) = 0.50 — **`e2e-tests` owns the slow tail**. Rank segments by correlation with `gated`,
  not by how often they finish last.
- **Separate NEW COVERAGE from a SLOWDOWN before calling a step a regression** (09-28). Pull `Test
  Files`/`Tests`/`Duration` and **divide**: W44's step increases were coverage + contention, per-test cost
  *fell* to 12.1 ms (web) / 32.7 ms (worker).
- **A regression can live in the BUILD GRAPH, not in test code** (09-21) — read `turbo.json` task overrides and
  the selected package set. **A capacity change swings these numbers 20-35% on its own** (W36 +21%, W37 −20%
  via #17122): check `git log` on the CI workflow first; wall-clock down + file durations **up** = parallelism.
- **CALENDAR — two errors corrected 11-16, do not reintroduce.** (a) The window is **Tue..Mon**, never Mon..Sun:
  10-19, 10-26, 11-09 and 11-16 are all **Mondays**. W44's "10-26 is the Sunday of ISO W44" is false. File by
  the ISO week of the end Monday (`2026-W47-1116`); say which days overlap the comparator.
  (b) The recurring collapse is **SATURDAY, not Friday**: 09-19, 09-26, 10-17, 10-24 are *all* Saturdays, and
  **Sat 11-14 = 0 runs against Fri 11-13 = 44, the densest day of its week**. 5 occurrences, no exceptions.
  **Sat/Sun are structurally thin; Friday is not** — never aggregate them, and validate any zero day against an
  unfiltered fetch (10-02, 10-09 were their weeks' busiest). **German Unity Day blanks CI** (Berlin).
- **Verify last week's follow-ups against `git log`, not the metrics** (10-26, again 11-16). Both W43's and
  W44's PRIMARY items were fixed by humans, in different ways than suggested, and the metric moves only made
  sense once the commits were found. Always name the commit, author and date in the outcome.
- **Never propose a diff the measurements don't support** (10-05). If the fix can't be verified here, report
  the exact `file:line` and the evidence instead — an honest `## Outcome` beats a speculative patch. Never
  propose a retry/skip to hide a real defect.

## Dead and parked candidates — do not re-attempt

- **DEAD, measured, do not re-open**: `layout.clienttest.ts` hoist; `webhooks.test.ts` fake timers (no timers in
  it); `bufferedStreamUploader.test.ts` 3.00s retry (sleeps are 10-100ms); `json-utils.clienttest.ts` trim
  (`deepParseJson` mutates in place); `analyticsIntegrationSsrfPinning.test.ts` (new coverage). **PARKED, weak**:
  `redisConsumer.test.ts:116 setTimeout(2000)`; `score-comparison-analytics` `Promise.all` batching (DB-blocked).
- **otelReplay.properties.test.ts `numRuns` / split / concurrency — DEAD** (09-28, re-confirmed 10-12, 10-26).
  Worst per-test density in the repo (**22.81s / 2 tests**). Lowering `numRuns` cuts coverage (forbidden);
  `describe.concurrent` races the shared writer singleton per the file's **own comment at L682-683**. Only
  untried angle: shrink the generated-value *depth*, not the run count.
- **DB-backed, do not re-mine**: `event-repository.servertest.ts` (#1 web file, 23.35s/110),
  `score-comparison-analytics`, `traces-api`, `ingestion-api`, `dataset-service`, `experiment-score-levels`,
  `batchExport`, `IngestionService.integration`, `traceBatching.test.ts` (slow but **never flaky**).
  **`scripts/scan-client-bundle.mjs`** — defect CONFIRMED, fix REJECTED (10-05): `collectExemptRanges()` is
  O(N²), but per-node set memoization is 783× faster on deep chains and **55× SLOWER** on flat guard lists, and
  the step costs only 7-13s.

## Week-by-week record (condensed)

Tuple order: perceived / execution / wait / webBuild / webRunTests / workerRunTests / e2e. Weekly aggregate is
the **MEDIAN of the dense daily medians** — never switch to mean, the series would break.

- **W28 baseline (06-30..07-07)** p50 396 / p90 522, n=131 — **execution-bound, not queue-bound**, still true.
  **W34 08-24** 198.3 / 185.3 / 15.3 / 48 / 77.8 / 106 / 158.3. **W36 09-07** 240.5 / 224.5 / 15 / 52 / 91.5 /
  113.5 / 165.5, +21.3% with wait flat — **host capacity, not code**. **W37 09-11** 192 / 175.3 / 17 / 47.3 /
  69 / 72.8 / 155.5 (`aa5f60aa8`, #17122). **W38 09-14** 186.3 / 170.3 / 16.8 / 47 / 67.5 / 71.3 / 155.5.
- **W39 09-21 — regression, first suggested diff.** 234 / 217.8 / 14 / 48 / 72 / 72.3 / 186, +25.6% while wait
  FELL; localized to e2e `Build` (42→69s), cause `1a2d1f211` (#17062). **W40 09-28** 226.5 / 214.8 / 13.5 /
  48.5 / 77 / 81.3 / 197. **W41 10-05** 216.5 / 203 / 16.5 / 47 / 77 / 86.5 / 167, **e2e Build −44%** (W39 diff
  delivered). **W42 10-12** 251.5 / 242.8 / 7.5 / 49.8 / 86 / 90.5 / 157.5, gated 226.3, p90 302.4, 10.3% —
  perceived +16.2% but gated only +4.5%: the new non-gating `tests-fips` from `bb1b66451`.
- **10-19 (W43) — timing regression, no diff; the FAILURES were the story.** 291 / 286.3 / 6.3 / 55.5 / 94.5 /
  108.3 / 162.5, gated **269.5**; p90 408, n=26 over 239/35 (**12.8%**). All 35 attributed: 22 product-code
  (13 of them the `tests-web-client` false failure), 7 infra, 4 flakes, 2 non-gating-only.
- **10-26 (W44) — FIPS SILENTLY BROKEN; timing a non-story.** 372.5 / 362.5 / 8.5 / 55 / 99.5 / 110 / 209, gated
  **331**, fipsMax 331; p90 529, n=28 over 179/10 (5.3%). +28% vs W43 was window composition, not a regression.
  All 10 attributed: 4 storybook sidebar flake in one 6-min cluster (self-fixed by `c329fa08e5`/#19030), 2 FIPS
  node-bump, 2 infra, 1 worker timezone, 1 unattributed `lint web`. New jobs: `build-storybook`,
  `notify-flaky-merge-queue`.
- **11-16 (W47, 11-10..11-16) — BEST WEEK ON RECORD; no logs available.** 276 / 270 / 6 / 53 / 96 / 105 / 183,
  gated **260**, fipsMax 262, exec−e2e 87; p50 283 / **p90 366**, n=34 over **165 / 4 (2.4%, best ever)**,
  0 cancelled, 0 infra. **3-week gap — W45/W46 never analysed.** `tests-fips` GREEN 34/34: W44's PRIMARY fixed
  (#19406 10-27 and/or `426ba058eb` #19581 11-03). All 4 failures: **2 are one `typecheck` break** ejecting a
  stacked batch (19911 culprit, re-pushed; 20024 stacked behind it, collateral), 1 `tests-worker (mode-azure)
  run tests` (probable flake), 1 `tests-shared run SQL-equivalence tests` (newly blocking via #19970 — ejected
  PR 20188, still unmerged). **2 runs un-inspected at test level.** Real finding: the ≥17:00Z bucket.

### Diff-outcome scorecard

- **W39 — DELIVERED.** `cda2fe27b` / #18012 (Tobias Wochinger, 09-28) added `--filter=!worker
  --filter=!@langfuse/native` to the browser e2e build: e2e Build 69→**37s**, perceived 234→**216.5s**.
  **Lesson:** `--filter=!<app>` does not drop that app's workspace deps — exclude each individually.
- **W43 — RESOLVED BY A HUMAN, differently.** `5e243a26c2` / #19010 (Nimar, 10-20) replaced the
  `SignInPage.tsx:816` focus `setTimeout` with `autoFocus`; failure rate 12.8% → 5.3%. Largest confirmed win.
- **W44 — RESOLVED BY HUMANS, report-only.** FIPS repaired by #19406/#19581; fipsMax 331→262s, 2.4% rate.
  **W47 — NO DIFF**: the one finding (≥17:00Z cache penalty) is in edit-forbidden `pipeline.yml` and every
  test-level source was filtered. Two weeks running, the real win was report-only.

## Flaky tracking

- **W47 (11-16) collected NO flake data at all** — logs filtered, so neither success-path reporter blocks nor
  failed-run tails were readable. Streak counter **paused** at 8 weeks (09-07 … 10-26), not extended. An empty
  `failuresByTest` that week means *unmeasured*, not *clean*.
- **WATCHLIST (new 11-16, 1 occurrence, UNNAMED):** `tests-worker (node24, pg15, mode-azure)` → `run tests`
  failed on run 43285356968 (11-12) for PR 20151, a **web-only** change that landed unchanged the next morning
  (`7d483527b3`) — same job passed later, so probably flaky. No test name (no logs). First `mode-azure` entry,
  though `mode-azure` also carried the 10-23 timezone failure below.
- **WATCHLIST (new 10-26, 1 occurrence):** `worker/src/__tests__/dataRetentionProcessing.test.ts >
  DataRetentionProcessingJob > "uses UTC retention boundaries in the Asia/Tokyo session timezone"` — failed
  10-23 with retries=3 on **both** `mode-azure` and `mode-redis-cluster`; also the worker's slowest test
  (17.43s). A timezone-boundary test failing on one date is usually **date-dependent, not flaky** — check the
  date first. Still unverified at 11-16 (no logs).
- **WATCHLIST, lowered 10-26 (0 occurrences in W44, but only 10 failures there — do NOT declare fixed):**
  `nativeOtelMedia.unit.test.ts > "compares generated media spellings…"` (5012ms against a 5000ms timeout);
  `web/src/__e2e__/app-shell-overflow.spec.ts > "a right drawer's absolutely-positioned content does not scroll
  the document"` (races the web server cold start as `[1/17]`).
- **RESOLVED 10-26:** `SessionConversationalView.stories.tsx > Sidebar Scrolling And Selection` (`c329fa08e5`/
  #19030); `SignInPage.tsx:816` (see scorecard).
- Shard content (files/tests/Duration), **last measured W44 — no W47 data**: web 337/6205/77.28 (W42) →
  348/6463/82.71 → **353/7057/85.39**; worker 214/2708/89.19 → 221/2948/99.29 → **225/3062/100.08**; storybook
  **341/1769/77.88**. Divide first: web **~12.1 ms/test**, worker **~32.7**, storybook **~44.0**. **Web shard
  time is import-bound** (summed `import 671.22s` vs `tests 319.46s`; worker is the opposite, 201.79/179.86) —
  any fix is pool/isolate/`deps.optimizer` tuning, unverifiable here.

## `scripts/ci/retry-on-merge-queue.sh` (landed `d22b43062` / #18287, 2026-10-15)

Changes flake semantics mid-history — note which side of 10-15 a comparison falls on.
- **Wrapped at `pipeline.yml` 214, 446, 492, 494, 608, 1442 only**: `cargo test --locked`; `@repo/eslint-plugin`;
  `@repo/in-app-agent-sandbox-runtime` (`test`, `test:e2e`); `@langfuse/shared`; `web run test:e2e`. **NOT
  wrapped**: `tests-web-client`, `tests-web`, `tests-worker`, `tests-fips`, `e2e-server-tests` — it wraps only
  suites with no retry of their own ("the second attempt runs against whatever state the first one left").
- `merge_group` only (PRs never retry); no retry when exit ≥ 128 (signal/OOM); double failure exits with the
  **FIRST** status; retry success emits `LANGFUSE_CI_FLAKY_RETRY_SUCCEEDED`.
- **`Both attempts failed` in a log is proof a failure is DETERMINISTIC, not flaky.**

## Known CI waste — report only, never propose (fixes live in edit-forbidden `.github/workflows/**`)

- **The `nextjs-e2e` cache is the top open item (new 11-16).** `pipeline.yml` ~1417-1427: `actions/cache` over
  `~/.npm` + `web/.next/cache`, key `${os}-nextjs-e2e-${hash(pnpm-lock)}-${hash(web/**/*.{js,jsx,ts,tsx})}`.
  The second hash changes on nearly every PR, so the exact key rarely hits and it **still saves a fresh entry
  every run** (8-21s of `Post Cache Next.js builds`). For a human: restore everywhere, **save only on
  `merge_group`**, drop `~/.npm` (pnpm is the package manager).
- **`tests-fips (web|worker)` gates nothing but bills every merge-queue run** (10-12 → 10-26). Last-to-finish
  in 62% of runs but it does **not** set `gated` (`pipeline.yml`: "Not part of all-ci-passed yet"). W44's
  argument for gating it is weaker now the breakage is fixed and the post-gate tail is ~16s (was ~41s).
- **FIPS toolchain breaks on base-image changes — twice, now REPAIRED (11-16).** `f964009483` reverted #18449
  (Iron Bank Alpine); `f6c3660ced` (#19339) broke it again by swapping Red Hat's `nodejs` RPM for upstream
  `node:24.22.1-bookworm-slim` in `worker/Dockerfile`'s UBI stage — the RPM Node links the **system** OpenSSL
  and honours `OPENSSL_FORCE_FIPS_MODE=1`, upstream Node **statically bundles non-FIPS OpenSSL**, so `getFips()`
  returns 0 and `scripts/ci/fips-tests.sh:28-31` exits 1. Fixed by `426ba058eb`/#19581. **When a Dockerfile
  comment states a constraint, grep the CI scripts for the guard that enforces it.**
- **turbo + pnpm cache reservation races** (09-03 onward, persistent, benign): parallel matrix jobs share one
  key, so `Unable to reserve cache with key Linux-X64-node24-turbo-ci-<hash>` recurs and the loser discards its
  upload. **Runner queue outliers** show per job via `BLACKSMITH_RUNNER_MESSAGE_WAIT_MS` — fleet capacity, not
  repo code.

## Output contract

- No PRs, ever. Every run files exactly one issue (title prefixed `CI Runtime Report: `, label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty). **`$GITHUB_STEP_SUMMARY` is NOT
  writable** (09-07, ENOENT) — the filed issue is the only output.
- **No issue-search tool exists** — GitHub MCP offers only `actions_*`/`get_job_logs` + PR readers, so a past
  issue's number/url can never be backfilled; entries stay `number: null`. Filed 08-24, 09-07 — don't re-file.
- Mermaid gate: **4 blocks** (daily Chart 1 + Chart 2, plus the weekly-x-axis versions). Palette pinned
  `#3987e5,#de5a20,#8875e0`. Count the literal blocks before submitting.
- `issues.json` entries carry a `status` (`open` / `closed-stale` / `closed-delivered` / `superseded-by-<date>`)
  — **only refresh `open` ones**. Swept 11-16: 10-19 and 10-26 both `closed-delivered` (both PRIMARYs fixed on
  main by humans), leaving `2026-11-16` the only open entry.
- **Classification table gap**: `run SQL-equivalence tests` (`tests-shared`) is absent from the workflow
  prompt's failing-step table. It is a **test** step — golden-snapshot diff, blocking since #19970.

## Tooling notes

- **Compute the ISO week label, don't assume it** (`-partial-<MMDD>` when incomplete or colliding);
  `date -u +"%G-W%V"` is rejected (simple_expansion). Check `HEAD..origin/main` = 0 first, every run.
- **`perPage: 100` WORKS on `list_workflow_runs`** (corrected 11-16; the old "~30/page" note was stale) —
  25 pages × 100 = 2500 runs covered 8 days. Still **no `created` filter**, and `event`/`branch` have returned
  **stale** data — **fetch unfiltered, filter client-side**.
- **⚠ `get_job_logs` CAN BE BLOCKED ENTIRELY** (11-16, new): `[Filtered] … filtered by integrity policy …
  cannot read data with integrity below "approved"`. The same filter hit `pull_request_read` (`get_commits`
  returned `[]` + "7 item(s) removed"). Recoveries that **do not work**: `run_id`+`failed_only`;
  `get_workflow_run_logs_url` (signed ZIP URL, unfetchable here). **Stop after two and fall back to `git log`**
  — step names + conclusions from `list_workflow_jobs` still classify a failure to job and step, just not to a
  test. `missing_tool` filed 11-16. Report how many runs went un-inspected at test level.
- **WHEN LOGS DO WORK, OVERSIZED `get_job_logs` IS THE CHEAP PATH** (10-19). Pass **`tail_lines: 300-400`** so
  the result exceeds the token cap and is saved to a tool-result file; extract ~10-30 lines with a Node script.
  Failed `run tests` → **600+**; failed `lint` → **800+** (400 reaches only the Turbo teardown epilogue);
  `tests-fips` → **1600** (it shells out to `fips-tests.sh`, which builds inside the step).
- Large tool responses land in a file: payload at `.[0].content[0].text` (a JSON string), jobs at
  **`.data.jobs.jobs[]`** (`actions_list` sometimes gives `payload.jobs` as a bare array — handle both).
  **Never `Read` those files** — parse with a Node script written via `Write` (not Python).
- Scripts in `/tmp/gh-aw/agent/` are **not persisted** — rewrite each run. Pipeline that works: `collect.js`
  (sweep `actions_list` results → deduped `allruns.json`) → `plan.js` → `jobs.js` (→ `jobsByRun.json`; **guard
  `if (!j.steps) continue`**) → `metrics.js`, `path.js`, `steps.js`, `fail.js`, `load.js`, `logx.js`, `svg.js`.
- **`git log` is the cheapest attribution tool — use it first.** Bare `git log`, `--oneline -25 --since=<date>
  -- <path>`, `git show <sha> --stat|-- <file>` work without approval; `-S<string>`, `branch --contains` don't.
  **GitHub stamps a squash commit at queue-entry time and keeps it across re-queues, so author-date ==
  committer-date tells which PR in an ejected batch was re-pushed (culprit) vs merely re-queued (collateral)**
  — 11-16, PR 19911 vs 20024.
- **Write temp scripts with `Write`, never the repo**; copy response paths **including the session-id segment**
  (else ENOENT) and invoke with an absolute path. Sandbox bash blocks compound commands, `bash script.sh`,
  `jq -f`, **heredocs (any `{` next to a quote — "expansion obfuscation")**, redirects/`ls`/`find`/`wc`/`mkdir`
  outside the repo, bare `pnpm`, inline env prefixes, `git -C <abspath>`. Use `Glob`/`Grep` and `node -e`+`fs`.
- **`pnpm`/`turbo` are NOT installed, `node_modules` DOES NOT EXIST, there is no docker build** (10-05, re-
  confirmed 10-26; only `npx` from the hosted toolcache). Nothing needing a dependency resolve, build, image or
  test run is verifiable — derive statically and say so. `turbo.json` is JSONC: strip `//`. Dependency-free
  logic CAN be benchmarked. **This is why product-code and Dockerfile fixes never ship as diffs.** DB
  connectivity is a STANDING block: `host.docker.internal` → `EAI_AGAIN` since 08-03 (github/gh-aw#52140,
  github/gh-aw-firewall#7268) — don't re-attempt until one closes.
- `.svg` files DO persist (`charts/` holds 16). Generator: a reusable
  `panel(oy, ph, title, xs, series, ymax, gapAfter)` — **parameterise `ymax`** (hardcoding it once overflowed),
  pass `null` for unanalysed weeks and bridge with a dashed segment, legend in a **right margin** (under the
  plot it collides with `n=` labels), no per-point value labels, `.toFixed(1)` every coordinate (raw floats
  emit `62.400000000006`), `&amp;`/`&lt;`-escape every label.
