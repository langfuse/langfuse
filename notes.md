# CI runtime analyst — durable notes

Append dated bullets. Keep under 200 lines; prune superseded notes.

## 2026-07-07 (week 2026-W28, first run — baseline)

- **Baseline established.** merge-group perceived p50=396s, p90=522s over 131
  successful runs (150 total: 18 failure, 1 cancelled) for 2026-06-30..07-07.
  This is the reference point for judging future weeks.
- **Pipeline is execution-bound, not queue-bound.** Runner wait (perceived −
  execution) was 7–22s on 4 of 6 sampled runs; only 07-01 (119s) and 07-02
  (175s) showed queue spikes. Optimizing the pipeline itself, not runner
  capacity, is where the wins are — most weeks.
- **Intra-week upward drift in the web `run tests` step**: sampled tests-web
  server `run tests` median rose from ~66–78s early week (06-30/07-01) to
  ~99–151s late week (07-06/07-07); execution time 253→494s over the same
  span. Single-sample-per-day, so noisy — could be heavier merged changes late
  in the week rather than a config regression. WATCH next week: if the late-week
  level persists into a full week, it becomes a confirmable regression worth a
  targeted fix.
- **turbo cache hit/miss dominates the Build step.** One sampled run (07-01) had
  a 5s Build (warm cache) vs 88–154s otherwise. Build-step medians are only
  meaningful when you know the cache state; don't chase Build variance without
  separating cache hits from misses.
- **json-utils.clienttest.ts is the slowest client file (~8.9s/file; top tests
  4.88s @250K keys, 2.40s @125K keys).** DO NOT trim it to game numbers: the
  recursive `deepParseJson` MUTATES its input in place
  (`packages/shared/src/utils/json.ts`), so the test's
  `JSON.parse(JSON.stringify(input))` clones per parser are REQUIRED, not waste.
  Candidate worth a *human* discussion (not an autonomous PR): the recursive
  parser is run on the 125K/250K sizes only to `console.log` a comparison — the
  sole assertion is `expect(iterativeError).toBe(false)`. Dropping the recursive
  call at those two sizes would save ~3–4s with no assertion loss, but removes
  the large-scale recursive-vs-iterative comparison the suite exists for →
  borderline "reducing coverage", so flagged, not actioned.
- **Slowest worker server tests are DB/integration-backed** and can't be
  verified or safely changed in this sandbox: `webhooks.test.ts` (19.22s/20
  tests; the failure-count / auto-disable tests are 3.6–7.2s each — smell like
  real retry/backoff timing or Redis round-trips → possible `vi.useFakeTimers()`
  win, needs investigation), `awsLambdaCodeEvalDispatcher.integration.test.ts`
  (12.95s/5; ~6.5s per Lambda-dispatch test), `batchExport.test.ts` (10.07s),
  `IngestionService.integration.test.ts` (10.00s). Top candidate for a future
  targeted PR once the mechanism is confirmed.
- **No flaky/retried tests** (`[retries=N]`/`[flaky]`) in the sampled logs, but
  the sample was small (2 job logs). Keep sampling more `run tests` logs next
  week to build a reliable flaky-tracking baseline.

## 2026-07-07/08 (runs 2-4, same-day manual re-triggers — noop, superseded)

- Three back-to-back re-triggers fired before enough post-baseline data existed
  (1-2 new merge-group runs each, all <10 threshold; ledger empty). Each reused
  the W28 baseline numbers and emitted noop without touching memory. Fully
  superseded by the fifth/sixth-run analyses below; condensed to this line.

## 2026-07-08 (fifth run, manual re-trigger — noop, FIRST real analysis of true-W28 data)

- `workflow_dispatch` at 07-08T14:59Z. Unlike the prior four noops, **07-08 now
  has 16 successful merge-group runs** (>10 threshold, ≥5/day → daily median
  computable). First run with enough true-W28 (07-06..07-12) data to actually
  test the baseline's late-week `run tests` drift watch item. Wrote
  `history/2026-W28-partial-0708.json` (checkpoint, does NOT overwrite baseline).
- **07-08 daily medians (7-run segment sample + 16-run perceived):** perceived
  p50=433s/p90=542s; execution=396s; runner wait=22s; web Build step=114s; web
  `run tests` step=114s; worker `run tests` step=99s; e2e-tests job=214s.
- **No regression; the flagged intra-week `run tests` rise did NOT persist.**
  Baseline late-day single-samples were web run tests 130s (07-06) / 151s
  (07-07); 07-08's 7-run median is 114s — BELOW those, i.e. the late-week bump
  receded rather than becoming a sustained shift. Execution flat (396 vs 401),
  e2e down (214 vs 232), Build flat (114 vs 114). Worker run tests 99 vs 80
  (+24%) is the only up-mover — single-day sample, WATCH but not actionable.
- **NAMING COLLISION to fix on the next full-week run:** `history/2026-W28.json`
  is the established baseline but its window (06-30..07-07) is mostly W27. When
  the real full W28 (07-06..07-12) completes, do NOT clobber the baseline — write
  the complete-week file and rename/relabel the baseline to reflect its W27
  window (or keep it as an explicitly-named baseline snapshot). Same for
  `charts/2026-W28.svg`. This run left both baseline artifacts untouched.
- **webhooks.test.ts `vi.useFakeTimers()` hypothesis DISPROVEN.** The baseline
  note speculated the 19s webhooks suite was retry/backoff-timing-bound and a
  fake-timers win. Read the file (worker/src/__tests__/webhooks.test.ts, 1827
  lines): it uses `msw` for mocked HTTP (no real network) and has **no**
  setTimeout/sleep/timer calls. The cost is real Postgres+Redis round-trips in
  the `for (i<5)` failure-count-accumulation loops (tests at L536/650/710/1316
  call `executeWebhook` 5× each). No safe autonomous win — reducing round-trips
  would touch integration semantics. Do not retry the fake-timers idea.
- **bufferedStreamUploader.test.ts setTimeout calls are load-bearing.** The
  `setTimeout(r, 10/50/100)` at L271/297/326/429 live inside upload-latency
  mocks that exercise buffering/concurrency ordering — not padding. Not safe to
  strip. Skip as an optimization target.
- **json-utils.clienttest.ts remains the top client slow file** (6.63s this run,
  was 8.91s baseline — runner variance). Still flagged do-not-touch (mutation
  semantics + borderline coverage); unchanged from baseline note above.
- Ledger `prs.json` still empty; zero `ci-performance`-labelled PRs exist in the
  repo (confirmed via search) → no assessment work.

## 2026-07-08 (sixth run, manual re-trigger — noop, first full trailing-7-day daily-median analysis)

- `workflow_dispatch` at 07-08T15:48Z, ~50min after the fifth run. Unlike the
  fifth run (which computed only the single 07-08 day), this run computed proper
  daily segment medians (n=5 jobs sample per weekday) across the WHOLE trailing-7
  window (07-02..07-08). Enriched history/2026-W28-partial-0708.json (superseded
  the fifth run's single-day version) and wrote charts/2026-W28-partial-0708.svg
  (did NOT touch the misnamed W27-baseline artifacts 2026-W28.json / .svg).
- **Window: 115 successful merge-group runs (07-02..07-08), well over threshold.**
  Perceived p50=422/p90=536; execution ~396.5; runner wait stable ~17-25s all
  days; e2e ~233. Failures: 07-02×4, 07-03×8, 07-05×1, 07-07×1 (context only).
- **No regression.** vs baseline (06-30..07-07): perceived p50 +6.6% (<10%),
  execution flat (-1%), e2e flat, runner wait flat. The pipeline stayed
  execution-bound with negligible queue wait, same as baseline.
- **webRunTests step 114.5 vs baseline 86 (+33%), workerRunTests 102 vs 80
  (+28%) — NOT actionable.** Three reasons, now on firm n=5 footing: (1) total
  execution is flat, so the step rise is absorbed off the critical path; (2) the
  baseline 86/80 came from a 6-run sample skewed to early-week-low singles; (3)
  the step PLATEAUED on the 3 recent consecutive days (webRT 116/120/114 flat) —
  no >=50%-across-3-days acceleration to trace to a day/PR. The baseline's scary
  late-week singles (07-06=130, 07-07=151) were high outliers: true n=5 medians
  are 116 and 120. Watch item continues but the rise is test-suite growth, not a
  config regression.
- **Zero flaky, three fresh samples.** tests-worker 07-03 + 07-07 and tests-web
  client 07-07 all printed no 'Retried tests (N):' block. Zero-flaky now holds
  across baseline + two checkpoints.
- **No new optimization candidate.** Slowest tests unchanged from baseline
  (json-utils client 8.35s; worker webhooks 19.4s, awsLambda 15.5s, evalService,
  IngestionService, batchExport, bufferedStreamUploader). Each was already
  investigated and found unfit for an autonomous coverage-preserving PR (see the
  fifth-run and baseline notes: mutation semantics, real DB/Redis round-trips
  that ENCODE the assertion, load-bearing timeouts, integration-inherent Lambda
  dispatch). DB stack was ready this run (/tmp/gh-aw/db-stack-ready present) but
  the webhooks blocker is semantic, not verifiability — nothing to re-verify.
- Ledger prs.json still empty; zero `ci-performance` PRs → no assessment work.

## Tooling notes (for future runs)

- The GitHub Actions MCP `list_workflow_runs` caps at ~30 runs/page regardless
  of `per_page`, and has no `created` date filter. Filter by
  `event: merge_group` + paginate `page: 1..N` until the oldest `created_at`
  passes the week start (≈5 pages ≈ 150 runs covers a week here).
- Tool responses overflow the token limit and are saved to a file; the real
  payload is nested at `.[0].content[0].text` (a JSON string) — extract with
  `jq -r '.[0].content[0].text' <file> > out.json` then query `out.json`.
- Jobs API payload is nested at `.jobs.jobs[]` with `.jobs.total_count`.
- Sandbox bash blocks compound commands (`;`, `for`, `&&`), `bash script.sh`,
  `jq -f`, and redirects outside the workspace. Use single jq invocations with
  inline programs and redirect only into the repo working dir.
