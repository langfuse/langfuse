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
- **turbo cache hit/miss dominates the Build step.** One sampled run (07-01) had
  a 5s Build (warm cache) vs 88–154s otherwise. Build-step medians are only
  meaningful when you know the cache state; don't chase Build variance without
  separating cache hits from misses.
- **json-utils.clienttest.ts is the slowest client file (~8.9s/file; top tests
  4.88s @250K keys, 2.40s @125K keys).** DO NOT trim it to game numbers: the
  recursive `deepParseJson` MUTATES its input in place
  (`packages/shared/src/utils/json.ts`), so the test's
  `JSON.parse(JSON.stringify(input))` clones per parser are REQUIRED, not waste.
  Candidate worth a *human* discussion (not an autonomous PR): dropping the
  recursive call at the 125K/250K sizes (used only for a console.log
  comparison; sole assertion is `expect(iterativeError).toBe(false)`) would
  save ~3–4s but borders on "reducing coverage" → flagged, not actioned.
- **Slowest worker server tests are DB/integration-backed**: `webhooks.test.ts`
  (19.22s/20 tests), `awsLambdaCodeEvalDispatcher.integration.test.ts`
  (12.95s/5), `batchExport.test.ts` (10.07s), `IngestionService.integration.test.ts`
  (10.00s). See sixth-run entry below for why each is unfit for an autonomous
  PR — do not re-investigate without new evidence.
- No flaky/retried tests in the sampled logs (small sample, 2 job logs).

## 2026-07-07/08 (runs 2-4, same-day manual re-triggers — noop, superseded)

- Three back-to-back re-triggers fired before enough post-baseline data existed
  (1-2 new merge-group runs each, all <10 threshold; ledger empty). Each reused
  the W28 baseline numbers and emitted noop without touching memory. Fully
  superseded by the fifth/sixth-run analyses below; condensed to this line.

## 2026-07-08 (fifth run — noop, first real analysis of true-W28 data)

- 16 successful merge-group runs on 07-08 (>10 threshold). Daily medians:
  perceived p50=433s/p90=542s; execution=396s; runner wait=22s; web
  Build=114s; web `run tests`=114s; worker `run tests`=99s; e2e=214s.
- **No regression; the baseline's flagged late-week `run tests` rise did NOT
  persist** (114s vs baseline late-day singles of 130/151s) — receded, not
  sustained.
- **webhooks.test.ts `vi.useFakeTimers()` hypothesis DISPROVEN.** Read the file
  (worker/src/__tests__/webhooks.test.ts, 1827 lines): uses `msw` mocked HTTP,
  no setTimeout/timer calls. Cost is real Postgres+Redis round-trips in
  `for (i<5)` failure-count-accumulation loops (L536/650/710/1316, 5×
  `executeWebhook` each). No safe autonomous win; do not retry this idea.
- **bufferedStreamUploader.test.ts setTimeout calls are load-bearing**
  (L271/297/326/429, inside upload-latency mocks exercising buffering/
  concurrency ordering, not padding). Skip as an optimization target.
- Wrote `history/2026-W28-partial-0708.json` as a checkpoint (does NOT
  overwrite the W27-window baseline file `history/2026-W28.json` — that
  filename is a known naming collision, see below).

## 2026-07-08 (sixth run — noop, first full trailing-7-day daily-median analysis)

- 115 successful merge-group runs, 07-02..07-08, n=5/day segment sample.
  Perceived p50=422/p90=536; execution ~396.5; runner wait ~17-25s all days;
  e2e ~233. vs baseline: all within ±10%, flat.
- **webRunTests 114.5 vs baseline 86 (+33%), workerRunTests 102 vs 80 (+28%) —
  investigated and NOT actionable**: total execution stayed flat (rise
  absorbed off critical path); baseline's 86/80 came from a skewed 6-run
  sample; the step PLATEAUED across the 3 most recent days (116/120/114) — no
  ≥50%-across-3-days shift to trace to a PR. Reads as test-suite growth, not a
  config regression. Continue as WATCH only if it resumes climbing.
- Zero flaky across baseline + 2 checkpoints now. Slowest tests unchanged from
  baseline (json-utils client 8.35s; worker webhooks 19.4s, awsLambda 15.5s,
  evalService, IngestionService, batchExport) — each already investigated and
  found unfit for an autonomous PR (mutation semantics / real DB+Redis
  round-trips that encode the assertion / load-bearing timeouts / integration-
  inherent Lambda dispatch). Do not re-open without new evidence.
- **NAMING COLLISION still open**: `history/2026-W28.json` is the baseline but
  its window (06-30..07-07) is mostly W27. When true full W28 (07-06..07-12)
  completes, write the complete-week file and relabel the baseline to its
  actual W27 window instead of clobbering it. Same for `charts/2026-W28.svg`.

## 2026-07-30 (runs 7-9, three consecutive `workflow_dispatch` — GitHub Actions MCP tools BLOCKED, standing infra issue)

- **Every call to `actions_list`/`actions_get` (any method, any resource_id,
  including bogus ids) returns
  `[Filtered] ... filtered by secrecy policy ... not authorized to access
  private-scoped data`** — confirmed identically across three separate runs
  (ids `30553320896`, `30554268551`, `30556553649`) spanning the same day.
  `list_pull_requests` is blocked the same way per-item. This is a standing
  restriction on this workflow's GitHub identity/token, not run-to-run noise
  or a single bad invocation.
- **`search_pull_requests` (aggregate query) is NOT affected** — still works
  every run and returns `total_count: 0` for `is:pr label:ci-performance`,
  consistent with `prs.json` staying empty. This is the only GitHub-side
  signal available while the blocker persists: it confirms there is no
  ledger-assessment work regardless of the timing-data blocker.
- **None of the timing/vitest-log checklist items are executable** without
  `actions_list`/`actions_get`/`get_job_logs` on real run/job ids — no
  perceived/execution/runner-wait/segment metrics, no vitest slowest/flaky
  sampling. Every such run filed `missing_tool` and emitted `noop` with the
  full report reusing the last real checkpoint (`history/2026-W28-partial-0708.json`,
  dated 07-08) explicitly flagged as stale, rather than fabricating numbers.
- **Next run**: do NOT re-probe the actions tools at all if this recurs again
  — three independent confirmations across one day is enough. Do one
  `search_pull_requests` call only (to check the ledger), read this note, file
  `missing_tool`, and emit `noop` reusing the last checkpoint. Only escalate
  back to full probing if a run ever succeeds, to confirm the blocker actually
  lifted before trusting fresh data again.

## 2026-07-30 (run 10, `workflow_dispatch` — GitHub Actions MCP tools STILL BLOCKED, 22 days after last real data)

- Fourth confirmation of the same-day blocker (ids `30553320896`, `30554268551`,
  `30556553649`, `30558863960`): `actions_list` (`list_workflow_runs`) still
  returns `[Filtered] ... filtered by secrecy policy ... not authorized to
  access private-scoped data`. Per the prior run's guidance, did NOT re-probe
  `actions_get`/`get_job_logs`/other methods — one `list_workflow_runs` call
  was enough to confirm recurrence.
- `search_pull_requests` still works and still returns `total_count: 0` for
  `is:pr label:ci-performance` — ledger (`prs.json`) stays empty, confirmed
  correct.
- **Escalation: this run is 22 days after the last real checkpoint**
  (`history/2026-W28-partial-0708.json`, dated 2026-07-08, trailing window
  07-02..07-08). The chart window this run should cover is 2026-07-24..07-30
  — entirely outside any data this workflow has ever captured. Reusing the
  07-08 checkpoint numbers as "this week's chart" would misrepresent a stale
  3-week-old snapshot as current; the report below states the gap explicitly
  and does not plot fabricated recent days.
- **If this recurs a 5th+ time**: this is no longer a transient/one-day
  blocker — it has now spanned at least 22 days across two calendar months.
  A human should check whether the workflow's GitHub App/token permissions
  or the MCP server's secrecy-policy config changed, since in-run retries
  cannot fix an authorization-scope issue. Keep doing the minimal
  single-probe + noop pattern until either a probe succeeds or a human
  intervenes.

## Tooling notes (for future runs)

- The GitHub Actions MCP `list_workflow_runs` caps at ~30 runs/page regardless
  of `per_page`, and has no `created` date filter. Filter by
  `event: merge_group` + paginate `page: 1..N` until the oldest `created_at`
  passes the week start (≈5 pages ≈ 150 runs covers a week here). (Unusable
  while the 2026-07-30 secrecy-policy block, above, is in effect.)
- Tool responses overflow the token limit and are saved to a file; the real
  payload is nested at `.[0].content[0].text` (a JSON string) — extract with
  `jq -r '.[0].content[0].text' <file> > out.json` then query `out.json`.
- Jobs API payload is nested at `.jobs.jobs[]` with `.jobs.total_count`.
- Sandbox bash blocks compound commands (`;`, `for`, `&&`), `bash script.sh`,
  `jq -f`, and redirects outside the workspace. Use single jq invocations with
  inline programs and redirect only into the repo working dir.
