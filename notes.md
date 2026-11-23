# CI runtime analyst — durable notes
Append dated bullets. **Keep under 235 lines**; when it grows, cut from the week-by-week record first.

## Standing rules (read these first)
- **NON-GATING JOBS ARE THE BLIND SPOT — two ways** (10-12, 10-19, 10-26). (a) *They fail unnoticed*:
  `tests-fips` failed on **every** run for 9 days after #19339, billing full wall clock, nothing alerted.
  (b) *They corrupt the metrics*: `execution` is the UNION of successful job intervals, so a job spanning the
  run makes the union ≈ the whole window and `runnerWait` "falls" with no queue change — and the run reads
  `failure` while `all-ci-passed` PASSED, inflating the failure rate. **Fixes**: compute **`gated` =
  `run_started_at` → `all-ci-passed.completed_at`** and lead with it; diff the job-name set against last week;
  check whether `all-ci-passed` is among a run's failing jobs.
- **"Zero retried tests" on SUCCESSFUL runs is nearly worthless** (10-19) — it only proves the passing runs
  passed. **Analyse every failed `merge_group` run, weekly**, and say which population a flake claim rests on.
  Conversely **a job can fail with ZERO failing tests**: read the reporter totals before attributing a failure
  to a test; neither vitest `retry` nor a step retry catches a rejection raised outside any test.
- **Prove flakiness by finding the test PASSING, not by counting retries** (10-26). Strongest form (11-16): the
  reporter prints **`[flaky]` on a run that SUCCEEDED**. Weaker but valid: a retries=3 failure vs a healthy
  run the same week; the same unchanged PR failing a job then landing through it; or (11-23) the test passing
  in every sampled successful run of the same job. **Vitest does NOT print the failure output of a test that
  eventually passes** — for a `[flaky]` entry the reporter block is the ONLY log evidence. Read the source.
- **A weekly delta can be pure WINDOW COMPOSITION** (10-26): W44 read +28% on perceived, yet its daily medians
  fell monotonically and ended *below* W43's aggregate. **Plot the dailies before writing "regression."**
  Likewise **rule out cache and queue before blaming code**: `runnerWait` + `install dependencies` + Turbo
  remote-cache setup all flat and **uniform across unrelated jobs** = shared service. Run count is not the
  predictor — r(concurrency@T+60s, perceived) = **0.314**; burst shape is.
- **BUCKET BY START HOUR TO FIND AN EFFECT, THEN FIND THE STEP THAT EXPLAINS IT — the hour is never the
  mechanism** (11-16, corrected same day). Pass 1 saw runs starting **≥17:00Z** at gated **357s vs 247s** and
  blamed the hour; pass 2 saw the same 3.6× e2e `Build` swing inside one **92-minute morning**, driven by the
  Next.js cache restore. **Read step durations, not clocks.** (The W47 "restore ≤2s ⇒ Build 86-110s"
  separation is **void since #20349** — the fallback key now always lands; see the W48 record.)
- **Check the critical path before mining tests, and remember THE MEDIAN POLE AND THE TAIL POLE ARE DIFFERENT
  JOBS — AND THE POLE MOVES WHEN YOU FIX IT** (09-11; 11-16; 11-23). `execution − e2e` went 17.8s (W40) → 36 →
  85 → 153.5 (W44) → 78.5 (W47) → **122 (W48)**; redo it **net of non-gating jobs** every week. `tests-fips`
  finishes last in 62% of runs yet is non-gating and cannot set `gated`. W47: `e2e-tests` owned the tail
  (r=0.69). **W48, after #20349 cut e2e by 31.5s, the pole became `test-ai-gateway-e2e`** — conditional on
  `llm-connections-filter`, ran in 16/32 sampled runs, **last gating job in 14 of those 16**; `e2e-tests` was
  the pole in 1/32; **gated 285s when it runs vs 255s when it doesn't.** Measure the pole by "which gating job
  finished last before `all-ci-passed` started", **split the sample on whether a conditional job ran**, and
  rank by correlation with `gated` — not by how often a job finishes last overall.
- **Separate NEW COVERAGE from a SLOWDOWN before calling a step a regression** (09-28, again 11-23): pull
  `Test Files`/`Tests`/`Duration` and **divide**. **A regression can also live in the BUILD GRAPH, not in
  test code** (09-21): read `turbo.json` overrides and the selected package set. **A capacity change swings
  these 20-35% on its own** — wall-clock down + file durations **up** = parallelism.
- **CALENDAR — two errors corrected 11-16, do not reintroduce.** (a) The window is **Tue..Mon**, never Mon..Sun
  (10-19, 10-26, 11-09, 11-16 are all **Mondays**); file by the ISO week of the end Monday (`2026-W47-1116`).
  (b) The recurring collapse is **SATURDAY, not Friday**: 09-19, 09-26, 10-17, 10-24 are all Saturdays, and
  **Sat 11-14 = 0 runs against Fri 11-13 = 44, the densest day of its week**. **Sat/Sun are structurally thin;
  Friday is not** — never aggregate them. **German Unity Day blanks CI** (Berlin). **The day the run executes
  is PARTIAL — label it.**
- **Persist per-run arrays, not just the daily median** (11-16): pass 1 stored only medians, so pass 2 could
  not repool and had to report two disjoint sub-samples. Store at least p50/p75/p90/p99 per day.
- **Verify last week's follow-ups against `git log`, not the metrics** (10-26, 11-16, 11-23): W43's, W44's and
  W47's PRIMARY items were all fixed by humans, two of them differently than suggested. Name commit + date.
- **Never propose a diff the measurements don't support** (10-05). If the fix can't be verified here, report
  the exact `file:line` and the evidence instead — an honest `## Outcome` beats a speculative patch. Never
  propose a retry/skip to hide a real defect.
- **A SEEDED PROPERTY TEST THAT FAILS ONCE IS NOT A FLAKE** (11-23). `otelReplay.properties.test.ts` draws a
  fresh `randomInt(2**31)` per test and sets `retry: 0`, so a failure means fast-check **found a
  counterexample**. The log carries `Property failed after N tests`, `{ seed, path }`, `Counterexample: […]`,
  `Shrunk N time(s)`, then the real stack. W48's instance pinned a null-deref in `isCodexShellTool`
  (`packages/shared/src/features/skills/toolArguments.ts`) — a genuine defect **fixed on main four minutes
  later** by `d02b4bd2dd`/#19968. **Read the counterexample and `git log` the implicated file before
  classifying**; the label must come from evidence, not from the symptom.
- **A BROKEN-COMMIT CASCADE IS NOT N FAILURES** (11-23, seen 11-16 too). Merge-queue batching turns one bad
  commit into a run of identical same-minute ejections — W48 had **three** = 12 of 33 failures, all
  **semantic merge conflicts** (each PR green alone). **Cluster failures by (step, error text, minute) before
  counting, and report cascades separately from the base rate**, or the rate reads as chaos.

## Dead and parked candidates — do not re-attempt
- **DEAD, measured, do not re-open**: `layout.clienttest.ts` hoist; `webhooks.test.ts` fake timers (no timers in
  it); `bufferedStreamUploader.test.ts` 3.00s retry (sleeps are 10-100ms); `json-utils.clienttest.ts` trim
  (`deepParseJson` mutates in place); `analyticsIntegrationSsrfPinning.test.ts` (new coverage); **and (11-23)
  `rate-limit.servertest.ts:597-637` 2.01s ×3** — a documented *real* Redis TTL wait with a 1s safety margin,
  unmeasurable without Redis and a flake trade if shortened blind. **PARKED, weak**: `redisConsumer.test.ts:116
  setTimeout(2000)`; `score-comparison-analytics` `Promise.all` batching (DB-blocked).
- **otelReplay.properties.test.ts — `numRuns` and `describe.concurrent` still DEAD; FILE-LEVEL SPLIT REOPENED
  11-23.** Lowering `numRuns` cuts coverage (forbidden); `describe.concurrent` races the shared writer
  singleton per the file's **own comment** (~L2440). **The premise changed**: #20180 took it from **2 tests /
  25-36s** to **5 tests / 111.6-113.5s** against a worker shard wall clock of **115.4s** — vitest runs a
  file's tests serially, so **this one file now IS the shard's wall clock**. A split into separate *files*
  gives separate workers and module registries; needs a real suite run (ClickHouse) to prove independence.
- **DB-backed, do not re-mine**: `event-repository.servertest.ts` (#1 web file, 24.3s in W48),
  `score-comparison-analytics`, `traces-api`, `ingestion-api`, `queryBuilder`, `dataset-service`,
  `batchExport`, `IngestionService.integration`, `traceBatching.test.ts`. **`scan-client-bundle.mjs`** —
  defect CONFIRMED, fix REJECTED (10-05): memoizing the O(N²) `collectExemptRanges()` is 783× faster on deep
  chains but **55× SLOWER** on flat guard lists.

## Week-by-week record (condensed)
Tuple order: perceived / execution / wait / webBuild / webRunTests / workerRunTests / e2e. Weekly aggregate is
the **MEDIAN of the dense daily medians** — never switch to mean, the series would break.

- **W28..W44 — detail lives in `charts/` and `history/`, keep only the anchors.** W28 baseline (06-30) p50 396
  / p90 522, n=131, **execution-bound not queue-bound** (still true); perceived ran 186-240 through W34-W41.
  **W42** 251.5/242.8/7.5, gated 226.3, 10.3%. **W43** 291/286.3/6.3/55.5/94.5/108.3/162.5, gated 269.5,
  239/35 (**12.8%**). **W44 — FIPS SILENTLY BROKEN**: 372.5/362.5/8.5/55/99.5/110/209, gated 331, 179/10.
- **11-16 (W47, 11-10..11-16) — BEST WEEK ON RECORD. Analysed TWICE the same day.** 273 / 267.5 / 6 / 53 / 92.5
  / 103.8 / 189, gated **256**, fipsMax 261, exec−e2e 78.5; **173 / 4 (2.3%, best ever)**, 0 infra.
  **3-week gap — W45/W46 never analysed.** Pass 1 had **no log access**; pass 2, after #20284, named all 4.
- **11-23 (W48, 11-17..11-20 dense) — TWO WINS CANCELLED BY TWO LOSSES; the FAILURES are the story.**
  286.5 / 279.5 / 6 / 60 / 99 / **59.5** / 157.5, gated **273.5** (+6.8% vs W47), fipsMax 275, exec−e2e **122**;
  p90 405, n=28 over **226 / 33 (12.7%**, 2nd worst ever; 12.0% blocking). **Wins**: `ca5d33eb70`/#20349
  delivered W47's PRIMARY (e2e Build 68.5→44.5, job 189→157.5); `364223f2fb`/#20265 larger worker runners
  (96→57s). **Losses**: the pole moved to `test-ai-gateway-e2e` (+30s on gated); `d5ab4baca9`/#20180 doubled
  `workerRunTests` 57→~116s from 11-20 15:51Z (**new coverage — Tests 3142→3179 — a deliberate cost**).
  All 33 attributed: 21 test, 5 `typecheck`, 5 infra (after a zero week), 2 provider, 0 ambiguous;
  **12 of 33 = three cascades**. `e2eCacheRestore` ≥2s on **32/32**.

### Diff-outcome scorecard
- **W39 — DELIVERED.** `cda2fe27b`/#18012 added `--filter=!worker --filter=!@langfuse/native` to the browser
  e2e build: Build 69→**37s**. **Lesson:** `--filter=!<app>` does not drop that app's workspace deps.
- **W43 — RESOLVED BY A HUMAN, differently** (`5e243a26c2`/#19010: `SignInPage.tsx:816` `setTimeout` →
  `autoFocus`; failure rate 12.8% → 5.3%, largest confirmed win). **W44 — report-only**, FIPS repaired by
  #19406/#19581 (fipsMax 331→261s).
- **W47 — REPORT-ONLY, DELIVERED BY A HUMAN IN THE SUGGESTED SHAPE.** `ca5d33eb70`/#20349 (11-17 10:40) made
  the e2e cache **restore-only** over `web/.next/cache` with two `restore-keys` fallbacks, dropped `~/.npm`,
  and left `warm-caches.yml`'s `nextjs-e2e` the only writer — exactly the recommendation. **e2e Build −35%,
  e2e job −16.7%, the 10-15s `Post Cache` save gone. Four weeks running the real win was report-only and two
  of the four shipped anyway. Report-only is the norm here, not a failure.**
- **W48 — NO DIFF.** PRIMARY is in edit-forbidden `pipeline.yml` *and* collides with a stated security
  constraint; the otelReplay split needs a real suite run; the 2.01s `rate-limit` sleep is a documented
  real-TTL wait with no Redis here to re-measure the margin against.

## Flaky tracking
- **W48 (11-23): TWO CONFIRMED, both new, both proved by finding the test PASSING.** (a)
  `worker/src/__tests__/traceBatchDeleteBatchAction.test.ts > "deletes only selected legacy traces from a
  persisted batch action"` — failed 11-17, passes at 2.8-3.6s in all 3 sampled successful worker runs.
  (b) `web .../DropdownMenu/DropdownMenu.stories.tsx` — **FILE-level**: two *different* stories failed on two
  days while ~20 siblings stayed green. **When no single test name recurs, name the FILE and say so.**
- **W47 (11-16): ONE CONFIRMED.** `worker/src/__tests__/correctionScoreBilling.test.ts > "counts CORRECTION
  score rows from the billing cutoff"` — tagged **`[flaky]`, retries=2, on a SUCCESSFUL run**. **Mechanism
  schema-level and certain:** 3 rows reusing ONE `randomUUID` at cutoff+0ms/+1s/+2s share the **complete**
  `ReplacingMergeTree` sort key, so a background merge may collapse them, and both billing queries are bare
  `count(*)` **without `FINAL`**. **Do not just fix the test** — that risk sits in production billing too.
- **WATCHLIST, all quiet in W48 — absence is not a fix, do not mark resolved:** `correctionScoreBilling` (see
  above); `executeInAppAgentRun.test.ts > "passes repository skills when no managed tag is configured"`
  (retries=3 exhausted 11-12, `mode-azure`); `dataRetentionProcessing.test.ts` Asia/Tokyo +
  `nativeOtelMedia.unit.test.ts` — a timezone test failing on one date is usually **date-dependent, not
  flaky**, check the date first.
- **STILL UNKNOWN:** `web/src/__e2e__/app-shell-overflow.spec.ts` is a **Playwright** spec, invisible to
  vitest reporter sampling — needs an `e2e-tests` job log. **RESOLVED 10-26:**
  `SessionConversationalView.stories.tsx > Sidebar Scrolling And Selection` (`c329fa08e5`/#19030) — still the
  slowest storybook file (17.15s in W48) but no longer flaky; and `SignInPage.tsx:816` (see scorecard).
- Shard content (files/tests/Duration), **W48**: web **380-381 / 7616-7623 / 77.9-91.0s** (import-bound);
  worker **233-235 / 3109-3142 / 52.5-57.0s** pre-#20180 and **235 / 3179 / 115.4-117.2s** after; storybook
  **403 / 2225 / 86.79s**.

## `scripts/ci/retry-on-merge-queue.sh` (`d22b43062`/#18287, 2026-10-15 — changes flake semantics mid-history)
**Wrapped at `pipeline.yml` 214, 446, 492, 494, 608, 1442 only** (`cargo test`, `@repo/eslint-plugin`,
`@repo/in-app-agent-sandbox-runtime`, `@langfuse/shared`, `web run test:e2e`) — only suites with no own retry;
**NOT** `tests-web-client`/`-web`/`-worker`/`-fips`, `e2e-server-tests`. `merge_group` only; no retry when
exit ≥ 128 (signal/OOM); double failure exits with the **FIRST** status. **`Both attempts failed` in a log is
proof a failure is DETERMINISTIC, not flaky.**

## Known CI waste — report only, never propose (fixes live in edit-forbidden `.github/workflows/**`)
- **The `nextjs-e2e` cache — CLOSED 11-23, delivered by `ca5d33eb70`/#20349.** See the scorecard.
- **`test-ai-gateway-e2e` is the top open item (11-23).** `pipeline.yml` 1685-1790. Gating pole in 14/16 runs
  where it ran; `Build` **109s**, test step **97s**, job median **265s**. It has no Next.js build cache, and
  **that is deliberate**: 1709-1710 keeps this secret-bearing job cache-cold so provider credentials are not
  exposed to poisoned shared package-manager state, enforced by `pnpm/setup cache:false` + `setup-node
  package-manager-cache:false`. **So W47's cache fix CANNOT be copied here**; only a *job-scoped* cache
  preserves the isolation, and that is a security call. **When a workflow comment states a constraint, quote
  it and hand the tradeoff to a human.**
- **`tests-fips (web|worker)` gates nothing but bills every merge-queue run** (10-12 → 11-23): last-to-finish
  in 62% of runs yet it does **not** set `gated` ("Not part of all-ci-passed yet"). W44's argument for gating
  it is weaker now the breakage is fixed and the post-gate tail is ~17s (was ~41s).
- **FIPS toolchain breaks on base-image changes — twice, REPAIRED (11-16).** Swapping Red Hat's `nodejs` RPM
  (links **system** OpenSSL, honours `OPENSSL_FORCE_FIPS_MODE=1`) for upstream `node:24-bookworm-slim`
  (**statically bundles non-FIPS OpenSSL**) made `getFips()`→0 and `scripts/ci/fips-tests.sh:28-31` exit 1.
  **When a Dockerfile comment states a constraint, grep the CI scripts for the guard enforcing it.**
- **turbo + pnpm cache reservation races** (09-03 on, persistent, benign): parallel matrix jobs share one key,
  so `Unable to reserve cache with key …` recurs and the loser discards its upload. Runner queue outliers show
  per job via `BLACKSMITH_RUNNER_MESSAGE_WAIT_MS` — fleet capacity, not repo code.
- **Storybook shard `setup` = 40.28s of an 86.79s wall clock (46%)**, unique to that shard, unchanged W47→W48,
  **never investigated — the best open lead.**

## Output contract
- No PRs, ever. Every run files exactly one issue (title prefixed `CI Runtime Report: `, label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty). **`$GITHUB_STEP_SUMMARY` is NOT
  writable** (09-07, ENOENT) — the filed issue is the only output.
- **No issue-search tool exists** — GitHub MCP offers only `actions_*`/`get_job_logs` + PR readers, so a past
  issue's number/url can never be backfilled; entries stay `number: null`. Filed 08-24, 09-07 — don't re-file.
- Mermaid gate: **4 blocks** (daily Chart 1 + Chart 2, plus the weekly-x-axis versions), palette pinned
  `#3987e5,#de5a20,#8875e0`. Count the literal blocks before submitting. `issues.json` entries carry a
  `status` (`open`/`closed-stale`/`closed-delivered`/`superseded-by-<date>`) — **only refresh `open` ones**.
- **Classification table gap**: `run SQL-equivalence tests` (`tests-shared`) is absent from the workflow
  prompt's failing-step table. It is a **test** step — golden-snapshot diff, blocking since #19970.

## Tooling notes
- **Compute the ISO week label, don't assume it** (`-partial-<MMDD>` when incomplete or colliding);
  `date -u +"%G-W%V"` is rejected (simple_expansion). Check `HEAD..origin/main` = 0 first, every run.
  **`perPage: 100` WORKS on `list_workflow_runs`** (11-16) — 25 pages × 100 covered 8 days. Still **no `created`
  filter**, and `event`/`branch` have returned **stale** data — **fetch unfiltered, filter client-side**.
- **`get_job_logs` integrity block — RESOLVED 2026-11-16 by `efa754e00e`/#20284.** Symptom if it regresses:
  `[Filtered] … cannot read data with integrity below "approved"`. **`missing_tool` already filed — do NOT
  re-file.** Non-recoveries: `run_id`+`failed_only`; `get_workflow_run_logs_url` (signed ZIP, unfetchable).
- **OVERSIZED `get_job_logs` IS THE CHEAP PATH** (10-19): it exceeds the token cap and is saved to a
  tool-result file; extract ~10-30 lines with a Node script. **NEVER go below `tail_lines: 400`** (11-23) — a
  300-line tail came back **INLINE and cost ~25k tokens**, and **200 lines is worse than useless** (consumed
  entirely by post-job cleanup, never reaches the vitest summary). **Use 700 for `run tests`**, 1600 for
  `tests-fips`. **A failed `lint`/`typecheck` needs a GREP, not a bigger tail** (11-16): at 800 lines the log
  showed only `exit code 1`; grepping `/error TS\d+|\.tsx?\(\d+,\d+\)/` found it at once.
- **The vitest reporter prints `N. <duration><unit> <name>` — DURATION FIRST** (11-23). A `name duration`
  regex silently yields `nullms` on every row. Correct: `/^(?:\d+\.|-)\s*(\d+(?:\.\d+)?)(ms|s)\s+(.+)$/`, then
  strip a trailing `( N tests)` off the file name. The same blocks carry `Test Files` / `Tests` / `Duration`
  — **pull those too**, they are what separates new coverage from a slowdown.
- **⚠ SAVED LOG FILES CONTAIN THE SAME TEXT TWICE** (11-16), once escaped (`\\u003e`) and once not, so every
  reporter row parses twice and medians silently double-count. **Normalise ALL backslash depths before dedup**:
  `replace(/\\+u003e/g,">")` then `replace(/\\+(?=[>&'"<])/g,"")`; key `seen` on the normalised string.
  Payload is at `.[0].content[0].text` (a JSON string), jobs at **`.data.jobs.jobs[]`** (sometimes a bare
  `payload.jobs` array — handle both). **Never `Read` these files**; parse with a Node script (not Python).
- **Step names are exact, not guessable, AND THEY GET RENAMED** (11-16, bitten again 11-23): the e2e job's run
  step is **`Run e2e tests`**, not `run tests`. `ca5d33eb70` renamed `Cache Next.js builds` → **`Restore
  Next.js build cache`** and the stale matcher returned `null` for 30/32 runs — which reads exactly like "the
  cache stopped running". **Dump one job's step list every run**; when a step metric goes all-null suspect a
  rename before an outage; keep matchers as a fallback chain (`stepSec(a) ?? stepSec(b)`).
- Scripts in `/tmp/gh-aw/agent/` are **not persisted** — rewrite each run. Pipeline that works: `runs.js`
  (sweep `actions_list` → deduped `allruns.json`) → `pick.js` → `jobs.js` (**guard `if (!j.steps) continue`**)
  → `metrics.js`, `classify.js`, `shard.js`, `vt2.js`, `svg.js`. **`allruns.json` starts EMPTY each run.**
- **`git log` is the cheapest attribution tool — use it first.** Bare `git log`, `--oneline -25 --since=<date>
  -- <path>`, `git show <sha> --stat` work without approval; `-S<string>`, `branch --contains` don't. GitHub
  stamps a squash commit at queue-entry time, so author-date == committer-date tells which PR in an ejected
  batch was re-pushed (culprit) vs merely re-queued — but `git log -- <path>` beats that inference.
  **Queue head SHAs newer than this checkout are NOT inspectable locally.**
- **Write temp scripts with `Write`, never the repo**; copy response paths **including the session-id segment**
  (else ENOENT) and invoke with an absolute path. Sandbox bash blocks **compound commands (`;`, `&&`, pipes into
  `head`), `for` loops**, `bash script.sh`, `jq -f`, **heredocs**, redirects/`ls`/`find`/`wc`/`mkdir` outside the
  repo, bare `pnpm`, **inline env prefixes (`N=18 node x.js`)**, `git -C <abspath>`. Use `Glob`/`Grep` and
  single `node -e` calls; give a parser a `force` argv flag rather than `rm`-ing its cache (the `&&` is
  denied), and make every parser **idempotent and re-runnable**.
- **`pnpm`/`turbo` are NOT installed, `node_modules` DOES NOT EXIST, there is no docker build** (10-05, re-
  confirmed 10-26, 11-16, 11-23; only `npx` from the toolcache). Nothing needing a dependency resolve, build,
  image or test run is verifiable — derive statically and say so; dependency-free logic CAN still be
  benchmarked. `turbo.json` is JSONC: strip `//`. **This is why product-code and Dockerfile fixes never ship
  as diffs.** DB connectivity is a STANDING block: `host.docker.internal` → `EAI_AGAIN` since 08-03 — don't
  re-attempt until github/gh-aw#52140 or github/gh-aw-firewall#7268 closes.
- `.svg` files DO persist (`charts/` holds 17). Generator: a reusable `panel(oy, ph, title, xs, series, ymax)` —
  **parameterise `ymax`** (hardcoding it overflowed once), `null` for unanalysed weeks bridged by a dashed
  segment, legend in a **right margin**, `.toFixed(1)` every coordinate (raw floats emit `62.400000000006`),
  `&amp;`/`&lt;`-escape every label.
