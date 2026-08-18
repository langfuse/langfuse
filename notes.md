# CI runtime analyst — durable notes

Append dated bullets. Keep under 200 lines; prune superseded notes.

## 2026-07-07 (week 2026-W28, first run — baseline)

- **Baseline established.** merge-group perceived p50=396s, p90=522s over 131
  successful runs (150 total: 18 failure, 1 cancelled) for 2026-06-30..07-07.
  Reference point for judging future weeks.
- **Pipeline is execution-bound, not queue-bound.** Runner wait was 7–22s on
  4/6 sampled runs; only 07-01 (119s) and 07-02 (175s) spiked. Optimize the
  pipeline itself, not runner capacity, most weeks.
- **turbo cache hit/miss dominates the Build step.** Don't chase Build
  variance without separating cache hits from misses.
- **json-utils.clienttest.ts** slowest client file (~8.9s). DO NOT trim: the
  recursive `deepParseJson` mutates its input in place
  (`packages/shared/src/utils/json.ts`), so the clone-per-parser cost is
  required. Flagged for human discussion only, not an autonomous PR.
- Slowest worker server tests are DB/integration-backed (`webhooks.test.ts`,
  `awsLambdaCodeEvalDispatcher.integration.test.ts`,
  `batchExport.test.ts`, `IngestionService.integration.test.ts`) — each
  already investigated and found unfit for an autonomous PR (real DB+Redis
  round-trips / load-bearing timeouts / integration-inherent). Do not
  re-investigate without new evidence.
- No flaky/retried tests in the sampled logs (small sample).

## 2026-07-08 (runs 2-6, condensed)

- Runs 2-4: same-day re-triggers before enough post-baseline data existed;
  noop, no memory changes.
- Run 6: full trailing-7-day analysis (07-02..07-08). webRunTests 114.5 vs
  baseline 86 (+33%) investigated and found NOT actionable — execution flat,
  baseline sample skewed low, step plateaued the 3 most recent days. Wrote
  `history/2026-W28-partial-0708.json`. Zero flaky across 3 samples.
- **NAMING COLLISION still open**: `history/2026-W28.json` is the baseline
  but its window (06-30..07-07) is mostly W27. Rename when a true full
  W28/W31 week completes. Unresolved through 08-06 (run 13) —
  deprioritized every run in favor of higher-signal findings; needs a
  one-time human rename.

## 2026-07-30/07-31 (runs 7-11, GH Actions MCP block — thought resolved, see 08-03/08-06)

- Four `workflow_dispatch` runs on 07-30 got a secrecy-policy filter error
  from every `actions_list`/`actions_get` call
  ("not authorized to access private-scoped data"). `search_pull_requests`
  unaffected throughout.
- Run 11 (07-31, branch `fix/analyst-guard-policy`) found the tools working
  again and attributed the block to the analyst's own guard-policy config,
  believed self-fixed. **This turned out to be wrong/incomplete — see
  08-03 and 08-06 below: the block recurred on later runs despite that
  fix.**
- Run 11 also root-caused a sustained web `run tests` step regression
  (86s baseline → 114.5s → 147s across three checkpoints) to
  `score-comparison-analytics.servertest.ts`
  (`web/src/__tests__/server/`): the 120,000-row test
  (`insertLargeTraceLevelScorePairs`, L112-161) inserts via 12 SEQUENTIAL
  `for` + `await createScoresCh(...)` batches of 20,000 rows.
  `createScoresCh` (`packages/shared/src/server/test-utils/clickhouse-helpers.ts`)
  is a stateless single-insert call, per-row values are independent
  (`Math.random()`-based), and the file has zero `beforeEach`/`afterEach`
  hooks (grep-confirmed) — safe to parallelize with `Promise.all`.
  Precedent: `scores-api-v2.servertest.ts:104`. Same pattern applies to
  `insertLargeIdenticalTraceLevelScores` (L163-197, smaller row counts).
  Full detail in `history/2026-W31-partial-0731.json`.
  **STILL NOT SANDBOX-VERIFIED as of 08-06 (run 13)** — blocked by a
  different reason every time it's been attempted (07-31: pnpm/corepack
  invocation hung on a never-resolving approval gate; 08-03 and 08-06:
  DB connectivity dead, see below). Whichever run gets BOTH a working
  Actions API AND live DB connectivity should verify this immediately.

## 2026-08-03 through 2026-08-17 (runs 12-17) — six consecutive fully-blocked
   runs, condensed; Actions API RESOLVED 08-18 (see below)

- Both hard blockers first appeared 08-03: `actions_list`/`actions_get`
  filtered by secrecy policy on every call; `dns.lookup
  ('host.docker.internal')` failed `EAI_AGAIN` despite
  `/tmp/gh-aw/db-stack-ready` always present. `npx` and
  `search_pull_requests` worked throughout — block was scoped to Actions
  API + DB reachability, not general sandbox breakage.
- Workarounds tried and exhausted, don't re-try: `cat /etc/hosts`
  (sandboxed to repo dir only), `WebFetch` of the public pipeline.yml page
  (no permission grant headless). A 08-06 HEAD claiming to fix the DIFC
  issue did not help at the time.
- Net effect: zero fresh timing/vitest data for six straight runs
  (08-03..08-17); last real numbers were frozen at
  `history/2026-W31-partial-0731.json` (07-31) until 08-18. Root cause of
  the Actions API block was never conclusively diagnosed by any run.

## 2026-08-18 (run 18) — Actions API working again; full 7-day data recovered

- **Actions API resolved**, first working run since 07-31 — no diagnosis
  of *why* it started working again; watch for recurrence. `get_job_logs`
  also confirmed working (large payloads still need saving to file + a
  Node extraction script, see Tooling notes).
- **DB connectivity still broken** — `host.docker.internal:5432` EAI_AGAIN,
  confirmed via a raw `net.Socket` connect (not just `dns.lookup`).
  Streak now spans 08-03 → 08-18 (15+ days) with zero change in symptom.
  Blocks verification of the standing score-comparison-analytics fix
  candidate again this run (Actions API alone isn't sufficient — both
  must work per the verify-before-PR rule).
- Full trailing-7-day analysis (08-12..08-18, 25 merge_group runs, 5
  sampled days — 08-15 Sat had 0 runs). Pooled p50=260s/p90~700s vs
  baseline p50=396/p90=522: **median is lower**, tail is heavier, driven
  entirely by 08-13 (3/5 runs slow) and 08-14 (2/5 slow). Root-caused via
  side-by-side vitest log comparison to whole-suite-proportional slowdown
  (transform/import/tests all ~5x on both web and worker shards, same
  file/test counts) — CI-runner contention (Blacksmith), not a code
  regression. Does not meet the >=50%-across-3-consecutive-days threshold
  (only 2 days affected) — not actionable. Full detail in
  `history/2026-W34-partial-0818.json`.
- **The 07-31-flagged sustained webRunTests climb (86→114.5→147s) does NOT
  appear to be continuing** — this week's day medians are back to
  77-96s on 4 of 5 days (08-13's 347s is the runner-contention outlier
  above). Can't rule out that it was itself noise, given the 18-day gap
  with zero data in between.
- `score-comparison-analytics.servertest.ts` is still the dominant slow
  file every sampled day (unchanged from every prior run back to 07-30) —
  candidate fix (parallelize batch inserts, see 07-30/07-31 entry above)
  remains valid and unverified.
- **Flaky test recurrence**: `otelToObservationForEval.test.ts` (same
  test, same `[retries=1]`) flagged flaky again, 3 weeks after its first
  07-30 occurrence — now a 2-instance pattern, still low-frequency (1 of 7
  samples this run). Worth a closer look if it recurs a 3rd time.
- noop filed with full report; `missing_data` filed for the DB blocker
  (no `missing_tool` needed this run since Actions API worked).

## 2026-08-18 (run 19, second workflow_dispatch same day) — filled the 08-18 chart gap, no new findings

- Same-day re-trigger of run 18. Ledger (`prs.json`) still empty, so no
  assessment-loop work. Reused run 18's vitest sampling and 08-12..08-17
  day data unchanged; the only new work was pulling 08-18's own
  merge-group runs (4 by this point in the day) to fill the gap run 18
  left in the trailing-7-day chart window.
- 08-18's 4 runs (perceived 193-207s, webRunTests 75-79s) land squarely in
  the same stable band as 08-16/08-17 — reinforces, doesn't change, run
  18's conclusion that no sustained (>=3-day) intra-week shift exists and
  the 08-13/08-14 spike was CI-runner contention, not a code regression.
- DB connectivity (`host.docker.internal:5432`) re-checked and still
  EAI_AGAIN — same broken state as every run since 08-03, now confirmed
  twice in one day. Standing score-comparison-analytics.servertest.ts fix
  remains unverified for the same reason as run 18.
- Updated `history/2026-W34-partial-0818.json` in place (same file,
  supersedes the run-18 version) rather than writing a new checkpoint
  file, since this is the same calendar day and same trailing-7-day
  window, just with one more day of data filled in.

## Tooling notes (for future runs)

- `list_workflow_runs` caps at ~30 runs/page, no `created` filter — filter
  `event: merge_group`, paginate until `created_at` passes week start.
- Large tool responses are saved to a file; payload nested at
  `.[0].content[0].text` (a JSON string) — `jq -r '.[0].content[0].text' <file>`.
  Jobs payload nested at `.jobs.jobs[]`, `.jobs.total_count`.
- Sandbox bash blocks compound commands (some `;`, `&&`, `for`, `...`
  revspecs), `bash script.sh`, `jq -f`, redirects outside the workspace,
  `ls`/`find`/`getent`/`wc` outside the repo working dir, and bare
  `pnpm`/`corepack pnpm` (hangs on a never-resolving approval gate).
  `npx <bin>` (e.g. `npx vitest run ...`) DOES work even when bare
  `pnpm` doesn't — confirmed again 08-06.
- Check DB connectivity early, before trusting
  `/tmp/gh-aw/db-stack-ready`: `node -e
  "require('dns').lookup('host.docker.internal',(e,a)=>console.log(e?String(e):a))"`.
  Failed `EAI_AGAIN` on 08-03 AND 08-06 despite the ready-marker being
  present both times — now a recurring pattern, not a one-off.
- `mcp__safeoutputs__missing_tool`/`missing_data` have worked cleanly since
  08-03 (the 07-31 DIFC rejection of `missing_tool` has not recurred).
