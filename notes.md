# CI runtime analyst — durable notes
Append dated bullets. **Keep under 240 lines** (231 on 11-23; a 200-line target was tried and abandoned —
reflowing prose saves ~1 line per edit, so only *deleting* a bullet helps). When it grows, cut from the
week-by-week record first: `history/*.json` holds every number, so only the *lesson* needs to live here.

## Standing rules (read these first)
- **NON-GATING JOBS ARE THE BLIND SPOT — two ways** (10-12, 10-19, 10-26). (a) *They fail unnoticed*:
  `tests-fips` failed on **every** run for 9 days after #19339, billing full wall clock, nothing alerted.
  (b) *They corrupt the metrics*: `execution` is the UNION of successful job intervals, so a job spanning the
  run makes the union ≈ the whole window and `runnerWait` "falls" with no queue change — and the run reads
  `failure` while `all-ci-passed` PASSED. **Fixes**: compute **`gated` = `run_started_at` →
  `all-ci-passed.completed_at`** and lead with it; diff the job-name set against last week.
- **"Zero retried tests" on SUCCESSFUL runs is nearly worthless** (10-19). **Analyse every failed
  `merge_group` run, weekly**, and say which population a flake claim rests on. Conversely **a job can fail
  with ZERO failing tests**: read the reporter totals before attributing a failure to a test.
- **Prove flakiness by finding the test PASSING, not by counting retries** (10-26). Strongest form (11-16): the
  reporter prints **`[flaky]` on a run that SUCCEEDED**. Weaker but valid: a retries=3 failure vs a healthy
  run the same week; or (11-23) the test passing in every sampled successful run of the same job. **Vitest
  does NOT print the failure output of a test that eventually passes** — the reporter block is the ONLY
  evidence. Read the source.
- **A weekly delta can be pure WINDOW COMPOSITION** (10-26): W44 read +28% on perceived, yet its daily medians
  fell monotonically and ended *below* W43's aggregate. **Plot the dailies before writing "regression."**
  **Rule out cache and queue before blaming code**: `runnerWait` + `install dependencies` + Turbo cache setup
  flat and **uniform across unrelated jobs** = shared service. r(concurrency@T+60s, perceived) = **0.314**.
- **BUCKET BY START HOUR TO FIND AN EFFECT, THEN FIND THE STEP THAT EXPLAINS IT — the hour is never the
  mechanism** (11-16). Pass 1 saw runs starting **≥17:00Z** at gated **357s vs 247s** and blamed the hour;
  pass 2 saw the same 3.6× e2e `Build` swing inside one **92-minute morning**. 11-23 repeats it: afternoon
  perceived 333-348 vs 260-296, `webBuild` 75-79 vs 53-61. **Read step durations, not clocks.**
- **THE MEDIAN POLE AND THE TAIL POLE ARE DIFFERENT JOBS — AND THE POLE MOVES WHEN YOU FIX IT** (09-11; 11-16;
  11-23). `execution − e2e` went 17.8s (W40) → 36 → 85 → 153.5 (W44) → 78.5 (W47) → **125 (W48)**; redo it
  **net of non-gating jobs** weekly. `tests-fips` finishes last overall in 7 of 9 sampled 11-23 runs yet
  cannot set `gated`. **W48, after #20349 cut e2e by 31.5s, the pole became `test-ai-gateway-e2e`.** Measure
  the pole by "which gating job finished last before `all-ci-passed` started", **split the sample on whether
  a conditional job ran**, and rank by correlation with `gated` — not by how often a job finishes last.
- **Separate NEW COVERAGE from a SLOWDOWN before calling a step a regression** (09-28, again 11-23): pull
  `Test Files`/`Tests`/`Duration` and **divide**. **A regression can also live in the BUILD GRAPH** (09-21):
  read `turbo.json` overrides and the selected package set. **A capacity change swings these 20-35% on its
  own** — wall-clock down + file durations **up** = parallelism.
- **CALENDAR — do not reintroduce two corrected errors.** (a) The window is **Tue..Mon**, never Mon..Sun;
  file by the ISO week of the end Monday (`2026-W48-1123`). (b) The recurring collapse is **SATURDAY, not
  Friday**: 09-19, 09-26, 10-17, 10-24 are Saturdays, and **Sat 11-14 = 0 runs vs Fri 11-13 = 44**. Sat/Sun
  are structurally thin; Friday is not. **German Unity Day blanks CI** (Berlin). **The day the run executes
  is PARTIAL — label it**; a later pass the same day files `-pass2`, it never overwrites pass 1.
- **Persist per-run arrays, not just the daily median** (11-16): pass 1 stored only medians, so pass 2 could
  not repool and had to report two disjoint sub-samples. Store at least p50/p75/p90/p99 per day.
- **Verify last week's follow-ups against the working tree / `git log`, not the metrics** (10-26, 11-16,
  11-23): W43's, W44's and W47's PRIMARY items were all fixed by humans, two differently than suggested. Name
  commit + date. A one-line `grep` of the broken file on `main` settles "is it still broken".
- **Never propose a diff the measurements don't support** (10-05). If the fix can't be verified here, report
  the exact `file:line` and the evidence instead. Never propose a retry/skip to hide a real defect.
- **A SEEDED PROPERTY TEST THAT FAILS ONCE IS NOT A FLAKE** (11-23). `otelReplay.properties.test.ts` draws a
  fresh `randomInt(2**31)` per test and sets `retry: 0`, so a failure means fast-check **found a
  counterexample** — the log carries `Property failed after N tests`, `{ seed, path }`, `Counterexample: […]`.
  W48's instance pinned a real null-deref in `isCodexShellTool`, fixed by `d02b4bd2dd`/#19968 four minutes
  later. **Read the counterexample before classifying.**
- **A BROKEN-COMMIT CASCADE IS NOT N FAILURES** (11-23, seen 11-16 too). Merge-queue batching turns one bad
  commit into a run of identical same-minute ejections. **Cluster failures by (step, error text, minute)
  before counting, and report cascades separately from the base rate**, or the rate reads as chaos.
- **SEMANTIC MERGE CONFLICTS ARE NOW THE #1 FAILURE MODE — and a recurrence is the signal to act** (11-23
  pass 2). Both PRs are green alone; only the queue sees the combination, so no PR CI can catch them. W48
  totalled **five** cascades / **32 of 53** failures, and the 11-20 `policies` break **recurred on 11-23** —
  *check whether a signature has fired before, across days, before calling it one-off.* Mechanism worth
  naming: **hand-rolled object literals of a shared type**; a shared factory makes the fix one file.

## Dead and parked candidates — do not re-attempt
- **DEAD, measured, do not re-open**: `layout.clienttest.ts` hoist; `webhooks.test.ts` fake timers (no timers in
  it); `bufferedStreamUploader.test.ts` 3.00s retry (sleeps are 10-100ms); `json-utils.clienttest.ts` trim
  (`deepParseJson` mutates in place); `analyticsIntegrationSsrfPinning.test.ts` (new coverage); **and (11-23)
  `rate-limit.servertest.ts:597-637` 2.01s ×3** — a documented *real* Redis TTL wait, unmeasurable without
  Redis. **PARKED, weak**: `redisConsumer.test.ts:116 setTimeout(2000)`; `score-comparison-analytics`
  `Promise.all` batching (DB-blocked).
- **otelReplay.properties.test.ts — `numRuns` and `describe.concurrent` DEAD; FILE SPLIT REOPENED 11-23 then
  PARKED.** Lowering `numRuns` cuts coverage (forbidden); `describe.concurrent` races the shared writer
  singleton per the file's **own comment** (~L2440). #20180 took it to **5 tests / 125.9s against a 131.2s
  worker shard** — the file **IS** the shard's wall clock — but `helpers/otelReplayHarness.ts` imports
  `clickhouseClient` (unverifiable here) **and tests-worker is NOT the pole** (~200s vs gate 279s).
- **`web/src/__tests__/fixtures/session-factory.ts` migration — CARRIED, unverifiable 11-23.** `createSession()`
  already backs 20+ server tests. Exactly **three** files still hand-roll a `Session` literal:
  `V4SidebarToggle.stories.tsx` (**ejected 7 runs across 11-20 and 11-23**), `EventsSearchBarRow.stories.tsx`,
  and `in-app-agent-persistence.servertest.ts` (spreads an existing session — **already immune**).
  `web/types/next-auth.d.ts` is littered with *"Optional so existing session mocks need not set it"*;
  `policies: Policy[][]` is the field that was made required. Blockers: no `pnpm`, no Playwright, and
  `createSession` defaults `name: "Demo User"` where the literals omit it.
- **DB-backed, do not re-mine**: `event-repository.servertest.ts` (#1 web file, 25.64s in W48),
  `score-comparison-analytics`, `traces-api`, `ingestion-api`, `queryBuilder`, `dataset-service`,
  `batchExport`, `IngestionService.integration`, `traceBatching.test.ts`. **`scan-client-bundle.mjs`** —
  defect CONFIRMED, fix REJECTED (10-05): memoizing the O(N²) `collectExemptRanges()` is 783× faster on deep
  chains but **55× SLOWER** on flat guard lists.

## Week-by-week record (condensed)
Tuple order: perceived / execution / wait / webBuild / webRunTests / workerRunTests / e2e. Weekly aggregate is
the **MEDIAN of the dense daily medians** — never switch to mean, the series would break.

- **W28..W44 — numbers live in `history/`.** W28 baseline (06-30) p50 396 / p90 522, n=131, **execution-bound
  not queue-bound** (still true). **W44 — FIPS SILENTLY BROKEN**: 372.5/362.5/8.5/55/99.5/110/209, gated 331,
  the worst week. **W45/W46 never analysed.**
- **11-16 (W47) — BEST WEEK ON RECORD.** 273/267.5/6/53/92.5/103.8/189, gated **256**, fipsMax 261,
  exec−e2e 78.5; **173 / 4 (2.3%, best ever)**, 0 infra.
- **11-23 (W48, 11-17..11-23) — analysed TWICE; pass 1 at 05:31Z had NO Monday data. Final, 5 dense days:**
  287 / 281 / 6 / 60 / 93 / **61** / 156, gated **279** (+9.0% vs W47), fipsMax 278, exec−e2e **125**;
  **286 / 53 = 15.6% failures over 339 runs — the worst rate in the series.** `workerRunTests` 61 is a
  **bimodal artefact**: 57-61s before 11-20 15:51Z, **115-124s after and for four straight days since** —
  `d5ab4baca9`/#20180, **new coverage (Tests 3142→3194), a deliberate cost, stop re-investigating.**
  **Wins**: `ca5d33eb70`/#20349 delivered W47's PRIMARY (e2e Build 68.5→44, job 189→156); `364223f2fb`/#20265
  larger worker runners. **Losses**: the pole moved to `test-ai-gateway-e2e`; **Monday alone was 20/80 = 25%**.

### Diff-outcome scorecard
- **W39 — DELIVERED.** `cda2fe27b`/#18012 added `--filter=!worker --filter=!@langfuse/native` to the browser
  e2e build: Build 69→**37s**. **Lesson:** `--filter=!<app>` does not drop that app's workspace deps.
- **W43 — RESOLVED BY A HUMAN, differently** (`5e243a26c2`/#19010: `SignInPage.tsx:816` `setTimeout` →
  `autoFocus`; failure rate 12.8% → 5.3%, largest confirmed win). **W44 — report-only**, FIPS repaired by
  #19406/#19581 (fipsMax 331→261s).
- **W47 — REPORT-ONLY, DELIVERED BY A HUMAN IN THE SUGGESTED SHAPE.** `ca5d33eb70`/#20349 (11-17) made the e2e
  cache **restore-only** over `web/.next/cache` with two `restore-keys`, dropped `~/.npm`, and left
  `warm-caches.yml` the only writer. **e2e Build −35%, job −17%. Five weeks running the real win was
  report-only and three of the five shipped anyway — report-only is the norm, not a failure.**
- **W48 — NO DIFF, both passes.** PRIMARY (merge-queue batching) is a **branch-protection setting, not a repo
  file**; the ai-gateway cache collides with a stated security constraint; the otelReplay split and the
  session-factory migration are real but unverifiable without `pnpm`/DB/Playwright.

## Flaky tracking
- **W48 (11-23): TWO CONFIRMED in pass 1, both new, both proved by finding the test PASSING.** (a)
  `worker/src/__tests__/traceBatchDeleteBatchAction.test.ts > "deletes only selected legacy traces from a
  persisted batch action"`. (b) `web .../DropdownMenu/DropdownMenu.stories.tsx` — **FILE-level**: two
  *different* stories failed on two days while ~20 siblings stayed green. **When no single test name recurs,
  name the FILE and say so.** Pass 2 (11-23): **zero `Retried` and zero `Failed` blocks in all three sampled
  shards**, and **no test failure ejected a single run all day** — every Monday failure was a compile break.
- **W47 (11-16): ONE CONFIRMED.** `worker/src/__tests__/correctionScoreBilling.test.ts > "counts CORRECTION
  score rows from the billing cutoff"` — **`[flaky]`, retries=2, on a SUCCESSFUL run**. **Mechanism certain:**
  3 rows reusing ONE `randomUUID` at cutoff+0ms/+1s/+2s share the **complete** `ReplacingMergeTree` sort key,
  so a merge may collapse them, and both billing queries are bare `count(*)` **without `FINAL`**. **Do not
  just fix the test** — that risk sits in production billing too.
- **WATCHLIST, all quiet — absence is not a fix, do not mark resolved:** `correctionScoreBilling` (above);
  `executeInAppAgentRun.test.ts > "passes repository skills when no managed tag is configured"` (retries=3
  exhausted 11-12, `mode-azure`); `dataRetentionProcessing.test.ts` Asia/Tokyo + `nativeOtelMedia.unit.test.ts`
  — a timezone test failing on one date is usually **date-dependent, not flaky**, check the date first.
  **STILL UNKNOWN:** `web/src/__e2e__/app-shell-overflow.spec.ts` is **Playwright**, invisible to vitest
  sampling — needs an `e2e-tests` log. **RESOLVED 10-26:** `SessionConversationalView.stories.tsx > Sidebar
  Scrolling And Selection` (`c329fa08e5`/#19030, still the slowest storybook file at 23.4s but green);
  `SignInPage.tsx:816` (see scorecard).
- Shard content (files/tests/Duration), **11-23**: web **392 / 7785 / 117.6s** (import 935s — import-bound);
  worker **236 / 3194 / 131.2s**; storybook **409 / 2271 / 111.2s**.

## `scripts/ci/retry-on-merge-queue.sh` (`d22b43062`/#18287, 10-15 — changes flake semantics mid-history)
**Wrapped at `pipeline.yml` 214, 446, 492, 494, 608, 1442 only** (`cargo test`, `@repo/eslint-plugin`,
`@repo/in-app-agent-sandbox-runtime`, `@langfuse/shared`, `web run test:e2e`) — only suites with no own retry;
**NOT** `tests-web-client`/`-web`/`-worker`/`-fips`, `e2e-server-tests`. `merge_group` only; no retry when
exit ≥ 128. **`Both attempts failed` proves DETERMINISM.**

## Known CI waste — report only, never propose (fixes live in edit-forbidden `.github/workflows/**`)
- **The `nextjs-e2e` cache — CLOSED 11-23, delivered by `ca5d33eb70`/#20349.** See the scorecard.
- **`test-ai-gateway-e2e` is the top open runtime item (11-23).** `pipeline.yml` 1685-1790. Gating pole in
  **5 of 5** sampled 11-23 runs where it ran — `all-ci-passed` closes 7-9s after it. **Cost, by splitting the
  sample on whether it ran: gated 300s vs 245.5s = ~55s**, up from ~30s in pass 1. Cache-cold **deliberately**:
  1709-1710 and 1749-1751 keep this secret-bearing job off shared package-manager state (`pnpm/setup
  cache:false`, `setup-node package-manager-cache:false`, direct `golang-migrate` download). It then pays
  `pnpm install`, `docker compose up`, migrate+seed, **two `rustup toolchain install`s** and a cargo build.
  **W47's cache fix CANNOT be copied here**; only a *job-scoped* cache preserves isolation — a human security
  call. **When a workflow comment states a constraint, quote it and hand the tradeoff over.**
- **MERGE-QUEUE BATCHING — the biggest single lever, and it is NOT a repo file (11-23).** Semantic merge
  conflicts caused 32 of W48's 53 failures. Batch size 1 for typecheck-sensitive changes, or requiring queue
  entries to be rebased on the queue head, catches every one. Branch-protection setting — never try to diff it.
- **`tests-fips (web|worker)` gates nothing but bills every merge-queue run** (10-12 → 11-23): last to finish
  in 7 of 9 sampled 11-23 runs (fipsMax 278s) yet it does **not** set `gated`. W44's argument for gating it is
  weaker now the breakage is fixed and the post-gate tail is ~9s. **Its toolchain breaks on base-image
  changes — twice, REPAIRED (11-16)**: upstream `node:24-bookworm-slim` **statically bundles non-FIPS
  OpenSSL** where Red Hat's RPM links the system one, so `getFips()`→0 and `scripts/ci/fips-tests.sh:28-31`
  exits 1. **When a Dockerfile comment states a constraint, grep CI scripts for the guard enforcing it.**
- **turbo + pnpm cache reservation races** (09-03 on, benign): matrix jobs share one key, so `Unable to
  reserve cache with key …` recurs and the loser discards its upload.
- **Storybook shard — GREW 28% IN ONE WEEK and still never investigated; best open lead.** 86.79s → **111.16s**
  for only +6 files / +46 tests, and `setup` went 40.28s → **52.77s = 47.5% of the shard**. The setup file
  (`web/.storybook/vitest.setup.ts`) does one thing — a `beforeEach` pointer reset — so the 129ms/file is
  **browser-mode per-file overhead**, not that file's code. Not on the critical path.

## Output contract
- No PRs, ever. Every run files exactly one issue (title prefixed `CI Runtime Report: `, label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty). **`$GITHUB_STEP_SUMMARY` is NOT
  writable** (09-07, ENOENT) — the filed issue is the only output.
- **No issue-search tool exists** — GitHub MCP offers only `actions_*`/`get_job_logs` + PR readers, so a past
  issue's number/url can never be backfilled; entries stay `number: null`. Filed 08-24, 09-07 — don't re-file.
- Mermaid gate: **4 blocks** (daily Chart 1 + Chart 2, plus the weekly-x-axis versions), palette pinned
  `#3987e5,#de5a20,#8875e0`. Count the literal blocks before submitting. `issues.json` entries carry a
  `status` (`open`/`closed-stale`/`closed-delivered`/`superseded-by-<date>`) — **only refresh `open` ones**;
  as of 11-23 one entry is open and 15 closed, so the refresh pass is cheap — don't re-read them all.
- **Classification table gap**: `run SQL-equivalence tests` (`tests-shared`) is absent from the workflow
  prompt's failing-step table. It is a **test** step — golden-snapshot diff, blocking since #19970.

## Tooling notes
- **Compute the ISO week label, don't assume it** (`-partial-<MMDD>`/`-pass2` when incomplete or colliding);
  `date -u +"%G-W%V"` is rejected (simple_expansion). **`perPage: 100` WORKS on `list_workflow_runs`** (11-16).
  Still **no `created` filter**, and `event`/`branch` have returned **stale** data — **fetch unfiltered, filter
  client-side**. The sweep reaches back ~3 days at 700 runs; **older days must be reused from `history/`, and
  the reused run COUNTS must be reused too** (11-23: a fresh sweep saw 52 runs on 11-20 where pass 1 saw 79).
- **OVERSIZED `get_job_logs` IS THE CHEAP PATH** (10-19): it exceeds the token cap and is saved to a
  tool-result file; extract ~10-30 lines with a Node script. **Tail sizing** (11-23): 230 lines reaches the
  reporter block on **worker** and **storybook** but **not web** — web needs **420**. 1300-1600 for
  `tests-fips`. **A failed `lint`/`typecheck`/`Build` needs a GREP, not a bigger tail**: grep
  `/error TS\d+|##\[error\]|Module not found|Failed to compile/` and it lands in one shot.
- **The vitest reporter prints `N. <duration><unit> <name>` — DURATION FIRST** (11-23); a `name duration`
  regex silently yields `nullms`. Use `/^(?:\d+\.|-)\s*(\d+(?:\.\d+)?)(ms|s)\s+(.+)$/`, then strip a trailing
  `( N tests)` off the file name. The same blocks carry `Test Files`/`Tests`/`Duration` — **pull those too**.
  **An absent `Retried tests (N):` or `Failed tests (N):` block means ZERO** — but strip ANSI
  (`\u001b\[[0-9;]*m`) first or every header misses.
- **⚠ SAVED LOG FILES CONTAIN THE SAME TEXT TWICE** (11-16), once escaped (`\\u003e`) and once not, so every
  reporter row parses twice and medians silently double-count. **Normalise ALL backslash depths before dedup**:
  `replace(/\\+u003e/g,">")` then `replace(/\\+(?=[>&'"<])/g,"")`; key `seen` on the normalised string.
  MCP dumps are a JSON **array of content items**; the payload is the first `.text` >200 chars that parses as
  JSON. Runs nest as `{method, workflow_runs:{workflow_runs:[…]}}`, jobs as `{method, workflow_jobs:{jobs:[…]}}`
  — **handle both depths**. **Never `Read` these files**; parse with a Node script (not Python).
- **Step names are exact, not guessable, AND THEY GET RENAMED** (11-16, bitten again 11-23): the e2e job's run
  step is **`Run e2e tests`**, not `run tests`. `ca5d33eb70` renamed `Cache Next.js builds` → **`Restore
  Next.js build cache`** and the stale matcher returned `null` for 30/32 runs — which reads like an outage.
  **Dump one job's step list every run**; keep matchers as a fallback chain (`stepSec(a) ?? stepSec(b)`).
- Scripts in `/tmp/gh-aw/agent/` are **not persisted** — rewrite each run. Pipeline that works: `runs.js`
  (sweep → deduped `allruns.json`) → `pick.js` → `jobs.js` (**guard `if (!j.steps) continue`**) →
  `metrics.js` (record `pole`/`poleAll`/`gateEnd` per run — the pole analysis is then free), `classify.js`,
  `shard.js`, `vt2.js`, `svg.js`.
- **Write temp scripts with `Write`, never the repo**; copy response paths **including the session-id segment**
  (else ENOENT) and invoke with an absolute path. Sandbox bash blocks **heredocs**, `bash script.sh`, `jq -f`,
  `git -C <abspath>`, inline env prefixes, and — new 11-23 — **`which`, `corepack`, and bare `npm --version`**.
  Compound commands with `&&`/`;`/pipes DO work inside a single `cd <repo> && …`. Use `Glob`/`Grep` and
  `node -e`, and make every parser **idempotent and re-runnable**.
- **`pnpm`/`turbo` are NOT installed and `node_modules` DOES NOT EXIST** (10-05, re-confirmed 10-26, 11-16,
  11-23 **twice**: `pnpm install` exits 0 while printing `pnpm: command not found`, and `corepack`/`npm`/
  `which` probes are **denied**). Only `node`/`npx` from the toolcache. Nothing needing a dependency resolve,
  build, image, browser or test run is verifiable — derive statically and say so; dependency-free logic CAN
  still be benchmarked. `turbo.json` is JSONC: strip `//`. **This is why product-code fixes never ship as
  diffs.** DB is a STANDING block: `host.docker.internal` → `EAI_AGAIN` since 08-03 — don't re-attempt until
  github/gh-aw#52140 or github/gh-aw-firewall#7268 closes.
- `.svg` files DO persist (`charts/` holds 18). Generator: a reusable `panel(oy, ph, title, xs, series, ymax)` —
  **parameterise `ymax`** (hardcoding it overflowed once), `null` for unanalysed weeks bridged by a dashed
  segment, `.toFixed(1)` every coordinate (raw floats emit `62.400000000006`), `&amp;`/`&lt;`-escape labels.
