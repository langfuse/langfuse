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
  Conversely **a job can fail with ZERO failing tests**: read the reporter totals before attributing a failure
  to a test; neither vitest `retry` nor a step retry catches a rejection raised outside any test.
- **Prove flakiness by finding the test PASSING, not by counting retries** (10-26). Strongest form (11-16): the
  reporter prints **`[flaky]` on a run that SUCCEEDED** — it watched the test fail then pass, so no inference is
  needed. Weaker but valid: a 63.04s/retries=3 failure vs 1.72s healthy the same week; or the same PR,
  unchanged, failing a job then landing through it. **Vitest does NOT print the failure output of a test that
  eventually passes**, so for a `[flaky]` entry the reporter block is the ONLY evidence in the log — grepping a
  2892-line log for `AssertionError` returns nothing. Read the test source instead.
- **A weekly delta can be pure WINDOW COMPOSITION** (10-26). W44 read +28% on perceived, yet its daily medians
  fell monotonically and ended *below* W43's aggregate. **Plot the dailies before writing "regression."**
- **Rule out cache and queue before blaming code for a broad slowdown** (10-26). Triad: `runnerWait`, `install
  dependencies`, Turbo remote-cache setup — all three flat + **uniform across unrelated jobs** = shared service,
  not code. Run count is not the predictor: r(concurrency@T+60s, perceived) = **0.314**. Burst shape is.
- **BUCKET BY START HOUR TO FIND AN EFFECT, THEN FIND THE STEP THAT EXPLAINS IT — the hour is never the
  mechanism** (11-16, corrected same day). Pass 1 saw runs starting **≥17:00Z** at gated **357s vs 247s**, e2e
  `Build` **50.5→148s**, and blamed the hour; pass 2 saw the same 3.6× Build swing inside one **92-minute
  morning**. The real discriminator is the **`Cache Next.js builds` RESTORE duration**: **≤2s ⇒ nothing
  restored ⇒ Build 86-110s**; **≥3s ⇒ Build 26-28s** — perfect separation on 8/8. `Run e2e tests` holds
  43-51s throughout, **only `Build` moves**. `Post Cache …` cost 10-15s on *every* run incl. the fast ones, so
  the exact key missed every time; the fast runs rode a warm `restore-keys` fallback. **Read step durations.**
- **Check the critical path before mining tests, and remember THE MEDIAN POLE AND THE TAIL POLE ARE DIFFERENT
  JOBS** (09-11; 11-16). `execution − e2e` went 17.8s (W40) → 36 → 85 → 123.8 → 153.5 (W44) → **78.5 (W47)**;
  redo it **net of non-gating jobs** every week. `tests-fips` finishes last in **62%** of runs yet is non-gating
  and cannot set `gated`: r(gated, `e2e-tests`) = **0.69** vs r(gated, fipsMaxEnd) = 0.50, so **`e2e-tests` owns
  the slow tail**. Rank segments by correlation with `gated`, not by how often they finish last.
- **Separate NEW COVERAGE from a SLOWDOWN before calling a step a regression** (09-28): pull `Test Files`/
  `Tests`/`Duration` and **divide** — W44's increases were coverage + contention, per-test cost *fell* to
  12.1 ms (web) / 32.7 ms (worker). **And a regression can live in the BUILD GRAPH, not in test code** (09-21):
  read `turbo.json` overrides and the selected package set. **A capacity change swings these numbers 20-35% on
  its own** (W36 +21%, W37 −20% via #17122) — wall-clock down + file durations **up** = parallelism.
- **CALENDAR — two errors corrected 11-16, do not reintroduce.** (a) The window is **Tue..Mon**, never Mon..Sun:
  10-19, 10-26, 11-09 and 11-16 are all **Mondays**. File by the ISO week of the end Monday (`2026-W47-1116`);
  say which days overlap the comparator. (b) The recurring collapse is **SATURDAY, not Friday**: 09-19, 09-26,
  10-17, 10-24 are *all* Saturdays, and **Sat 11-14 = 0 runs against Fri 11-13 = 44, the densest day of its
  week**. 5 occurrences, no exceptions. **Sat/Sun are structurally thin; Friday is not** — never aggregate them,
  and validate any zero day against an unfiltered fetch. **German Unity Day blanks CI** (Berlin). **The day the
  run executes is PARTIAL — label it**: 11-16's 8 runs covered 06:50-08:22Z, the whole day *so far*.
- **Persist per-run arrays, not just the daily median** (11-16, learned the hard way). Pass 1 stored only daily
  medians for its 34 runs, so pass 2 could not repool its 8 new runs and had to report two disjoint sub-samples.
  Store at least p50/p75/p90/p99 per day.
- **Verify last week's follow-ups against `git log`, not the metrics** (10-26, again 11-16): both W43's and
  W44's PRIMARY items were fixed by humans in different ways than suggested. Name commit, author and date.
- **Never propose a diff the measurements don't support** (10-05). If the fix can't be verified here, report
  the exact `file:line` and the evidence instead — an honest `## Outcome` beats a speculative patch. Never
  propose a retry/skip to hide a real defect.

## Dead and parked candidates — do not re-attempt
- **DEAD, measured, do not re-open**: `layout.clienttest.ts` hoist; `webhooks.test.ts` fake timers (no timers in
  it); `bufferedStreamUploader.test.ts` 3.00s retry (sleeps are 10-100ms); `json-utils.clienttest.ts` trim
  (`deepParseJson` mutates in place); `analyticsIntegrationSsrfPinning.test.ts` (new coverage). **PARKED, weak**:
  `redisConsumer.test.ts:116 setTimeout(2000)`; `score-comparison-analytics` `Promise.all` batching (DB-blocked).
- **otelReplay.properties.test.ts `numRuns` / split / concurrency — DEAD** (09-28, re-confirmed 10-12, 10-26).
  Worst per-test density in the repo: **23.92s / 2 tests** (W47; 22.81s in W44 — **flat, stop re-measuring**).
  Lowering `numRuns` cuts coverage (forbidden); `describe.concurrent` races the shared writer singleton per the
  file's **own comment at L682-683**. Only untried angle: shrink the generated-value *depth*, not the count.
- **DB-backed, do not re-mine**: `event-repository.servertest.ts` (#1 web file, **28.14s/110** in W47),
  `score-comparison-analytics` (17.13s/46), `traces-api`, `ingestion-api`, `queryBuilder`, `dataset-service`,
  `batchExport`, `IngestionService.integration`, `traceBatching.test.ts` (slow but **never flaky**).
  **`scripts/scan-client-bundle.mjs`** — defect CONFIRMED, fix REJECTED (10-05): `collectExemptRanges()` is
  O(N²), but per-node set memoization is 783× faster on deep chains, **55× SLOWER** on flat guard lists, 6-13s.

## Week-by-week record (condensed)
Tuple order: perceived / execution / wait / webBuild / webRunTests / workerRunTests / e2e. Weekly aggregate is
the **MEDIAN of the dense daily medians** — never switch to mean, the series would break.

- **W28..W41 — detail lives in `charts/`, keep only the anchors.** W28 baseline (06-30..07-07) p50 396 / p90 522,
  n=131, **execution-bound not queue-bound** (still true). Perceived ran 186-240 through W34-W41; W39 09-21 was
  the first suggested diff (+25.6% while wait FELL, e2e `Build` 42→69s via `1a2d1f211`/#17062). **W42 10-12**
  251.5/242.8/7.5, gated 226.3, 10.3% — perceived +16.2% but gated only +4.5%: the new non-gating FIPS job.
- **10-19 (W43) — timing regression, no diff; the FAILURES were the story.** 291 / 286.3 / 6.3 / 55.5 / 94.5 /
  108.3 / 162.5, gated **269.5**; p90 408, n=26 over 239/35 (**12.8%**). All 35 attributed: 22 product-code
  (13 the `tests-web-client` false failure), 7 infra, 4 flakes, 2 non-gating-only.
- **10-26 (W44) — FIPS SILENTLY BROKEN; timing a non-story.** 372.5 / 362.5 / 8.5 / 55 / 99.5 / 110 / 209, gated
  **331**, fipsMax 331; p90 529, n=28 over 179/10 (5.3%). +28% vs W43 was window composition, not a regression.
  All 10 attributed: 4 storybook sidebar flake in one 6-min cluster (`c329fa08e5`/#19030), 2 FIPS node-bump,
  2 infra, 1 worker timezone, 1 unattributed `lint web`. New: `build-storybook`, `notify-flaky-mq`.
- **11-16 (W47, 11-10..11-16) — BEST WEEK ON RECORD. Analysed TWICE the same day.** 273 / 267.5 / 6 / 53 / 92.5 /
  103.8 / 189, gated **256**, fipsMax 261, exec−e2e 78.5; **173 / 4 (2.3%, best ever)**, 0 cancelled, 0 infra.
  **3-week gap — W45/W46 never analysed.** `tests-fips` GREEN 42/42: W44's PRIMARY fixed (#19406 and/or
  `426ba058eb` #19581). Pass 1 (08:0xZ) had **no log access**, published 276/260 over 5 dense days; pass 2
  (08:26Z), after `efa754e00e`/#20284 restored logs at 08:16Z, added 11-16 as a 6th dense day and named all 4
  failures: **2 are one `typecheck` break** ejecting a stacked batch (19911 culprit, 20024 collateral — TS2353
  in `projectsRouter-defaultScoreConfigs.servertest.ts(48,7)`, a file 19911 owns), 1 `tests-worker (mode-azure)
  run tests` (`executeInAppAgentRun.test.ts`, probable flake), 1 `tests-shared run SQL-equivalence tests`
  (`experiments.golden.test.ts` snapshot mismatch in 7s — deterministic, newly blocking via #19970).

### Diff-outcome scorecard
- **W39 — DELIVERED.** `cda2fe27b` / #18012 (Tobias Wochinger, 09-28) added `--filter=!worker
  --filter=!@langfuse/native` to the browser e2e build: e2e Build 69→**37s**, perceived 234→**216.5s**.
  **Lesson:** `--filter=!<app>` does not drop that app's workspace deps — exclude each individually.
- **W43 — RESOLVED BY A HUMAN, differently.** `5e243a26c2` / #19010 (Nimar, 10-20) replaced the
  `SignInPage.tsx:816` focus `setTimeout` with `autoFocus`; failure rate 12.8% → 5.3%. Largest confirmed win.
- **W44 — report-only**, FIPS repaired by #19406/#19581 (fipsMax 331→261s). **W47 — NO DIFF**: the cache fix is
  in edit-forbidden `pipeline.yml`, the one confirmed flake needs a **product decision**, and nothing is
  verifiable in-sandbox. **Three weeks running the real win was report-only — the norm here, not a failure.**

## Flaky tracking
- **W47 (11-16): ONE CONFIRMED FLAKE, the first since W44.** `worker/src/__tests__/correctionScoreBilling.test.ts
  > "counts CORRECTION score rows from the billing cutoff"` — tagged **`[flaky]`, retries=2, on a SUCCESSFUL
  run** (43748763040). **Mechanism schema-level and certain:** it writes 3 rows reusing ONE `randomUUID` at
  cutoff+0ms/+1s/+2s and asserts all 3 count. `scores` is `ReplacingMergeTree(event_ts, is_deleted) ORDER BY
  (project_id, toDate(timestamp), name, id)` and `CORRECTION_SCORES_BILLABLE_FROM` = `2026-11-23T00:00:00Z`, an
  **exact UTC day boundary**, so `toDate` matches for all 3 — they share the **complete sort key** and a
  background merge may collapse them at any time. Both billing queries are bare `count(*)` **without `FINAL`**.
  **Do not just fix the test**: the same non-determinism sits in production billing — needs a product answer.
- **WATCHLIST (11-16, 1 occurrence, NAMED):** `worker/src/features/in-app-agent/executeInAppAgentRun.test.ts >
  "passes repository skills when no managed tag is configured"` exhausted **retries=3** on 43285356968 (11-12,
  `mode-azure`); PR 20151 was **web-only** and landed unchanged (`7d483527b3`), so the job passed later.
  Probable, not confirmed. Second `mode-azure` entry (see the 10-23 timezone failure).
- **WATCHLIST (10-26):** `dataRetentionProcessing.test.ts > "uses UTC retention boundaries in the Asia/Tokyo
  session timezone"` — failed 10-23 retries=3 on **both** `mode-azure` and `mode-redis-cluster`. A
  timezone-boundary test failing on one date is usually **date-dependent, not flaky** — check the date first.
  **Lowered 11-16**: absent from retried and from the top-14 slowest across 8 sampled jobs, as is
  `nativeOtelMedia.unit.test.ts`. **Absence from a sample is not a fix** — do not mark either resolved.
- **STILL UNKNOWN:** `web/src/__e2e__/app-shell-overflow.spec.ts` is a **Playwright** spec, so vitest reporter
  sampling can never see it — needs an `e2e-tests` job log. **RESOLVED 10-26:**
  `SessionConversationalView.stories.tsx > Sidebar Scrolling And Selection` (`c329fa08e5`/#19030), still the
  **#3 slowest file** (18.82s/23) but no longer flaky; and `SignInPage.tsx:816` (see scorecard).
- Shard content (files/tests/Duration), **W47**: web **380-381 / 7616-7623 / 77.94-91.02s**; worker
  **232-233 / 3158-3162 / ~96.2s**; storybook **396-397 / 2155-2167 / 91.67-111.86s**. **Web is import-bound**
  (import **567-687s** vs tests **335-390s**, ~1.8×); worker is the opposite (199-215 vs 153-168). **Storybook
  `setup` is 36-46s ≈ 40% of its wall time and unique to that shard — never investigated, best open lead.**

## `scripts/ci/retry-on-merge-queue.sh` (landed `d22b43062` / #18287, 2026-10-15)
Changes flake semantics mid-history — note which side of 10-15 a comparison falls on.
- **Wrapped at `pipeline.yml` 214, 446, 492, 494, 608, 1442 only**: `cargo test --locked`; `@repo/eslint-plugin`;
  `@repo/in-app-agent-sandbox-runtime` (`test`, `test:e2e`); `@langfuse/shared`; `web run test:e2e`. **NOT
  wrapped**: `tests-web-client`/`-web`/`-worker`/`-fips`, `e2e-server-tests` — only suites with no own retry.
- `merge_group` only (PRs never retry); no retry when exit ≥ 128 (signal/OOM); double failure exits with the
  **FIRST** status; retry success emits `LANGFUSE_CI_FLAKY_RETRY_SUCCEEDED`. **`Both attempts failed` in a log
  is proof a failure is DETERMINISTIC, not flaky.**

## Known CI waste — report only, never propose (fixes live in edit-forbidden `.github/workflows/**`)
- **The `nextjs-e2e` cache is the top open item (11-16, now with hard evidence).** `pipeline.yml` ~1417-1427:
  `actions/cache` over `~/.npm` + `web/.next/cache`, key
  `${os}-nextjs-e2e-${hash(pnpm-lock)}-${hash(web/**/*.{js,jsx,ts,tsx})}`. The second hash changes on nearly
  every PR, so the exact key **never** hit in 8/8 measured runs and a fresh entry was saved every time (10-15s).
  Restore duration predicts `Build` exactly (≤2s → 86-110s; ≥3s → 26-28s), i.e. **~60-80s recoverable on the
  majority of runs**. For a human: restore everywhere, **save only on `merge_group`**, drop `~/.npm` (pnpm is
  the package manager). *Unproven*: why the fallback is warm on some runs — no cache-API reader exists here.
- **`tests-fips (web|worker)` gates nothing but bills every merge-queue run** (10-12 → 11-16): last-to-finish in
  62% of runs yet it does **not** set `gated` (`pipeline.yml`: "Not part of all-ci-passed yet"). W44's argument
  for gating it is weaker now the breakage is fixed and the post-gate tail is ~17s (was ~41s).
- **FIPS toolchain breaks on base-image changes — twice, now REPAIRED (11-16).** `f964009483` reverted #18449
  (Iron Bank Alpine); `f6c3660ced` (#19339) broke it again by swapping Red Hat's `nodejs` RPM for upstream
  `node:24.22.1-bookworm-slim` in `worker/Dockerfile`'s UBI stage — the RPM Node links the **system** OpenSSL
  and honours `OPENSSL_FORCE_FIPS_MODE=1`, upstream Node **statically bundles non-FIPS OpenSSL**, so `getFips()`
  → 0 and `scripts/ci/fips-tests.sh:28-31` exits 1. Fixed by `426ba058eb`/#19581. **When a Dockerfile comment
  states a constraint, grep the CI scripts for the guard enforcing it.**
- **turbo + pnpm cache reservation races** (09-03 on, persistent, benign): parallel matrix jobs share one key,
  so `Unable to reserve cache with key …` recurs and the loser discards its upload. **Runner queue outliers**
  show per job via `BLACKSMITH_RUNNER_MESSAGE_WAIT_MS` — fleet capacity, not repo code.

## Output contract
- No PRs, ever. Every run files exactly one issue (title prefixed `CI Runtime Report: `, label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty). **`$GITHUB_STEP_SUMMARY` is NOT
  writable** (09-07, ENOENT) — the filed issue is the only output.
- **No issue-search tool exists** — GitHub MCP offers only `actions_*`/`get_job_logs` + PR readers, so a past
  issue's number/url can never be backfilled; entries stay `number: null`. Filed 08-24, 09-07 — don't re-file.
- Mermaid gate: **4 blocks** (daily Chart 1 + Chart 2, plus the weekly-x-axis versions), palette pinned
  `#3987e5,#de5a20,#8875e0`. Count the literal blocks before submitting.
- `issues.json` entries carry a `status` (`open` / `closed-stale` / `closed-delivered` / `superseded-by-<date>`)
  — **only refresh `open` ones**. 11-16 produced **two** entries for one window (first =
  `superseded-by-2026-11-16-pass2`): if a window is re-analysed, supersede rather than overwrite.
- **Classification table gap**: `run SQL-equivalence tests` (`tests-shared`) is absent from the workflow
  prompt's failing-step table. It is a **test** step — golden-snapshot diff, blocking since #19970.

## Tooling notes
- **Compute the ISO week label, don't assume it** (`-partial-<MMDD>` when incomplete or colliding);
  `date -u +"%G-W%V"` is rejected (simple_expansion). Check `HEAD..origin/main` = 0 first, every run.
  **`perPage: 100` WORKS on `list_workflow_runs`** (11-16) — 25 pages × 100 covered 8 days. Still **no `created`
  filter**, and `event`/`branch` have returned **stale** data — **fetch unfiltered, filter client-side**.
- **`get_job_logs` integrity block — RESOLVED 2026-11-16 by `efa754e00e`/#20284** (`GH_AW_GITHUB_MIN_INTEGRITY:
  'none'`, repo-scoped). Symptom if it regresses: `[Filtered] … cannot read data with integrity below
  "approved"`, also hitting `pull_request_read` (gh-aw ≥1.2.2 forces `approved` on public repos; Actions logs
  carry `none`). **`missing_tool` already filed — do NOT re-file.** Non-recoveries: `run_id`+`failed_only`;
  `get_workflow_run_logs_url` (signed ZIP, unfetchable here).
- **OVERSIZED `get_job_logs` IS THE CHEAP PATH** (10-19). Pass **`tail_lines: 300-400`** so the result exceeds
  the token cap and is saved to a tool-result file; extract ~10-30 lines with a Node script. Failed `run tests`
  → **600+**; `tests-fips` → **1600**. **A failed `lint`/`typecheck` needs a GREP, not a bigger tail** (11-16):
  at 800 lines the log showed only `##[error]Process completed with exit code 1`; grepping
  `/error TS\d+|\.tsx?\(\d+,\d+\)/` surfaced the real TS2353 at once.
- **⚠ SAVED LOG FILES CONTAIN THE SAME TEXT TWICE** (11-16), once escaped (`\\u003e`) and once not, so every
  reporter row parses twice and medians silently double-count. **Normalise ALL backslash depths before dedup**:
  `replace(/\\+u003e/g,">")` then `replace(/\\+(?=[>&'"<])/g,"")`; key `seen` on the normalised string.
  Payload is at `.[0].content[0].text` (a JSON string), jobs at **`.data.jobs.jobs[]`** (`actions_list`
  sometimes gives `payload.jobs` as a bare array — handle both). **Never `Read` these files** — parse with a
  Node script written via `Write` (not Python).
- **Step names are exact and not guessable** (11-16): the e2e job's run step is **`Run e2e tests`**, not
  `run tests`; its cache steps are `Cache Next.js builds` / `Post Cache Next.js builds`; `tests-web`/
  `tests-worker` do use `Build` and `run tests`. **Dump one job's step list before writing a step matcher.**
  Scripts in `/tmp/gh-aw/agent/` are **not persisted** — rewrite each run. Pipeline that works: `runs.js`
  (sweep `actions_list` → deduped `allruns.json`) → `pick.js` → `jobs.js` (**guard `if (!j.steps) continue`**)
  → `metrics.js`, `steps.js`, `logx.js`, `agg.js`, `hours.js`, `svg.js`. **`allruns.json` starts EMPTY each
  run** — a second pass cannot reuse the first pass's census without re-paging.
- **`git log` is the cheapest attribution tool — use it first.** Bare `git log`, `--oneline -25 --since=<date>
  -- <path>`, `git show <sha> --stat` work without approval; `-S<string>`, `branch --contains` don't.
  **GitHub stamps a squash commit at queue-entry time and keeps it across re-queues, so author-date ==
  committer-date tells which PR in an ejected batch was re-pushed (culprit) vs merely re-queued (collateral)**
  — 11-16, 19911 vs 20024, where `git log -- <path>` beat timestamp inference by proving 19911 owns the file
  that failed typecheck. **Queue head SHAs newer than this checkout are NOT inspectable locally.**
- **Write temp scripts with `Write`, never the repo**; copy response paths **including the session-id segment**
  (else ENOENT) and invoke with an absolute path. Sandbox bash blocks **compound commands (`;`, `&&`, pipes into
  `head`), `for` loops**, `bash script.sh`, `jq -f`, **heredocs**, redirects/`ls`/`find`/`wc`/`mkdir` outside the
  repo, bare `pnpm`, inline env prefixes, `git -C <abspath>`. Use `Glob`/`Grep` and single `node -e` calls.
- **`pnpm`/`turbo` are NOT installed, `node_modules` DOES NOT EXIST, there is no docker build** (10-05, re-
  confirmed 10-26 and 11-16; only `npx` from the toolcache). Nothing needing a dependency resolve, build, image
  or test run is verifiable — derive statically and say so; dependency-free logic CAN still be benchmarked.
  `turbo.json` is JSONC: strip `//`. **This is why product-code and Dockerfile fixes never ship as diffs.** DB
  connectivity is a STANDING block: `host.docker.internal` → `EAI_AGAIN` since 08-03 (github/gh-aw#52140,
  github/gh-aw-firewall#7268) — don't re-attempt until one closes.
- `.svg` files DO persist (`charts/` holds 16). Generator: a reusable `panel(oy, ph, title, xs, series, ymax)` —
  **parameterise `ymax`** (hardcoding it overflowed once), `null` for unanalysed weeks bridged by a dashed
  segment, legend in a **right margin** (under the plot it collides with `n=`), no per-point labels,
  `.toFixed(1)` every coordinate (raw floats emit `62.400000000006`), `&amp;`/`&lt;`-escape every label.
