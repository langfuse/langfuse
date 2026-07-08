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

## 2026-07-07 (second run, same-day manual re-trigger — noop)

- `workflow_dispatch` fired ~21:43Z, 2.7h after the W28 baseline window closed
  (07-07T19:00Z). Only **1** new successful merge-group run existed in that gap
  (07-07T19:55Z). Ledger `prs.json` is empty → no PRs to assess. No new ISO week
  elapsed and 1 new run is far below the 10-run threshold, so re-running the
  full W28 analysis would only reproduce `history/2026-W28.json`. Emitted noop;
  left the baseline files untouched. Next scheduled run should pick up a full
  new week (W29+).

## 2026-07-08 (third run, manual re-trigger — noop, data reused)

- `workflow_dispatch` on 2026-07-08. Newest merge-group run is still
  07-07T19:55:03Z (same as the 07-07 second-run noop) — **zero new
  merge-group runs on 07-08**, only the single 07-07T19:55Z run exists past
  the W28 window close (07-07T19:00Z). Well below the 10-run threshold; no new
  ISO week elapsed. Ledger `prs.json` still empty → nothing to assess.
- Recomputing would byte-for-byte reproduce `history/2026-W28.json`, so I
  reused the W28 numbers for the report and emitted noop. Left all memory
  files (history, chart, ledger) untouched except this note. Next scheduled
  run should pick up a full new week.

## 2026-07-08 (fourth run, manual re-trigger — noop, data reused)

- `workflow_dispatch` on 2026-07-08, a few hours after the third-run noop.
  Since the W28 window close (07-07T19:00Z) there are now **2** successful
  merge-group runs, not 1: 07-07T19:55:03Z (pr-14861) and the newly-appeared
  07-08T08:25:16Z (pr-14872). Still far below the 10-run threshold, and 07-08
  holds only that single run so no day-median (≥5 runs) is computable.
- No new ISO week has completed (W28 = 07-06..07-12 is only 3 days elapsed;
  07-06/07-07 already fold into the baseline window). Ledger `prs.json` still
  empty and zero `ci-performance`-labelled PRs exist → no assessment work.
- Recomputing would reproduce `history/2026-W28.json`, so I reused the W28
  numbers for the report and emitted noop. Left all memory files (history,
  chart, ledger) untouched except this note. Next scheduled run should pick
  up a full new week.

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
