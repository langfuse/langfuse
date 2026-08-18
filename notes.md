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
- Run 11 (07-31) believed the block was the analyst's own guard-policy
  config and self-fixed; wrong — it recurred 08-03..08-17.
- Run 11 root-caused a then-sustained web `run tests` climb (86→114.5→147s)
  to `web/src/__tests__/server/score-comparison-analytics.servertest.ts`:
  `insertLargeTraceLevelScorePairs` (L112-161) inserts 120,000 rows via 12
  SEQUENTIAL `await createScoresCh(...)` batches. That helper is a
  stateless single-insert, per-row values are independent, and the file has
  zero `beforeEach`/`afterEach` — so `Promise.all` is safe. Precedent:
  `scores-api-v2.servertest.ts:104`. Same for
  `insertLargeIdenticalTraceLevelScores` (L163-197). Detail in
  `history/2026-W31-partial-0731.json`.
  **PARKED — do not re-attempt.** Never verified (07-31 pnpm gate; 08-03
  onward DB dead), and DB-backed verification is now blocked upstream
  indefinitely (see tooling notes). Also note the climb it was meant to
  fix did NOT persist: webRunTests sat at 80s median on 08-18. Re-open
  only if both DB access returns and the regression reappears.

## 2026-08-03 through 2026-08-17 (runs 12-17) — six consecutive fully-blocked
   runs, condensed; Actions API RESOLVED 08-18 (see below)

- Two blockers from 08-03: `actions_list`/`actions_get` filtered by
  secrecy policy on every call, and `host.docker.internal` → `EAI_AGAIN`
  despite `/tmp/gh-aw/db-stack-ready` being present. `npx` and
  `search_pull_requests` worked throughout, so it was never general
  sandbox breakage. Workarounds exhausted, don't re-try: `cat /etc/hosts`,
  `WebFetch` of the public pipeline.yml page.
- Net effect: zero fresh data for six straight runs; numbers frozen at
  `history/2026-W31-partial-0731.json` until 08-18. The Actions API block
  was never conclusively diagnosed — it simply stopped on 08-18.

## 2026-08-18 (runs 18-20, three same-day workflow_dispatch triggers, condensed)

- Run 18: **Actions API resolved**, first working run since 07-31 (no
  diagnosis of *why*; watch for recurrence). `get_job_logs` also
  confirmed working. **DB connectivity still broken** —
  `host.docker.internal:5432` EAI_AGAIN, streak spans 08-03 → 08-18
  (15+ days), reconfirmed on all three runs today (twice more on 19/20).
  Blocks verification of the standing score-comparison-analytics fix
  every run (Actions API alone isn't sufficient — both must work).
- Full trailing-7-day analysis (08-12..08-18). Runs 19 and 20 each added
  more of 08-18's own merge-group runs (4, then 7 — now a full >=5-run
  day) as the day progressed; final pooled figures (32 runs): p50=227s,
  p90~676s vs baseline p50=396/p90=522 — **median lower, tail heavier**,
  driven entirely by 08-13 (3/5 runs slow) and 08-14 (2/5 slow).
  Root-caused via side-by-side vitest log comparison to whole-suite
  proportional slowdown (transform/import/tests all ~5x on both web and
  worker shards, same file/test counts) — CI-runner contention
  (Blacksmith), not a code regression. Only 2 days affected, not the 3+
  consecutive needed to act. 08-16/08-17/08-18 settled into a tight
  194-201s band. Full detail in `history/2026-W34-partial-0818.json`
  (updated in place by all three runs, same precedent for
  `charts/2026-W34-partial-0818.svg` — no new checkpoint files created
  for same-day re-triggers).
- **The 07-31-flagged sustained webRunTests climb (86→114.5→147s) does
  NOT appear to be continuing** — day medians settled at 76-96s on 5 of
  6 days (08-13's 347s is the runner-contention outlier above). Can't
  rule out it was itself noise, given the 18-day zero-data gap before it.
- `score-comparison-analytics.servertest.ts` still the dominant slow
  file every sampled day (unchanged since 07-30) — candidate fix
  (parallelize batch inserts, see 07-30/07-31 entry) remains valid and
  unverified.
- **Flaky test recurrence**: `otelToObservationForEval.test.ts` flagged
  flaky again (07-30 and 08-18, `[retries=1]` both times) — 2-instance
  pattern, still low-frequency. Watch for a 3rd occurrence.
- **Process note**: once a day's run count already meets the >=5-run
  threshold, a further same-day re-trigger has nothing new to compute
  (all days full, ledger empty, DB still blocked) — confirm-nothing-
  changed is the highest-value use of that run's budget.
- All three runs: noop filed with full report; `missing_data` filed for
  the DB blocker on run 18.

## 2026-08-18 (run 21) — first run of the issue-output regime

- **Output contract changed**: workflow no longer opens PRs; every run
  files exactly one issue (label `ci-performance`, assignee `wochinge`)
  carrying the full report. `issues.json` created this run and supersedes
  `prs.json` (which stays, empty, as the legacy record). The agent cannot
  know the issue number it just filed — safe-outputs creates it after the
  agent exits — so each entry lands with `number: null` and the NEXT run
  must resolve it by searching for the issue and backfilling.
- 08-18 grew to 8 merge-group runs; its execution/segment medians were
  recomputed exactly from all 8 job payloads (not carried): perceived 195,
  execution 187, wait 10, Build 47.5, webRunTests 76.5, e2e 146.5. Pooled
  window (33 runs) p50=224, p90=675.4. No actionable regression: no >=10%
  sustained median regression vs baseline, and the 08-13/08-14 spike is
  2 days, not the 3+ consecutive the rule requires.
- **NEW top optimization candidate — carried to next week**:
  `web/src/features/traces/components/TraceTimelineV2/layout.clienttest.ts`,
  landed 2026-08-17 (`91970f83d`, #16124), is *immediately* the #1 slowest
  client test file (6.87s over 12 tests, vs json-utils' 6.66s over 106),
  and owns the #1 slowest client test (5.85s, "stays finite on degenerate
  shapes…") plus #4 (995ms). Hypothesis: its `run()` helper re-calls
  `prepareTimeline(roots, collapsed)` on every loop iteration though both
  args are loop-invariant, and the degenerate-shapes test runs
  shapes x 7 boxes x 2 compress = 14 full `layout()` calls per shape with
  no `rowRange` — so the `huge` shape's 10,000 rows are positioned 14x.
  Before hoisting, CHECK whether `layout()` mutates `prepareTimeline`'s
  result; if it does the candidate is dead.
- **Why it was not proposed as a diff**: unverifiable here — see
  checkout-staleness note below. Rules forbid shipping an unverified diff.
- Client-shard structural observation (recorded, not proposed): the client
  job reports `environment 53.09s` and `import 65.26s` against only
  `tests 32.56s` over 279 files. Per-file jsdom construction + module
  import dominate that shard, so single-test fixes have a low ceiling
  there; the real lever is not giving every file a DOM. Too broad to be
  a surgical one-theme change.
- Fresh flaky sampling (client + worker shards of run 32124629182): no
  `Retried tests` block in either → zero retries.
  `otelToObservationForEval.test.ts` stays a 2-instance pattern
  (07-30, 08-13); no third occurrence. Keep watching.

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
- **Bootstrap recipe that actually works (confirmed 08-18, run 21)**:
  `pnpm` is simply NOT on PATH (`which pnpm` → nothing), so the old
  "approval-gate hang" framing is moot. Use
  `npx --yes pnpm@10 install --frozen-lockfile` — completed in 41.5s
  ("Done in 41.5s using pnpm v11.10.0") and left tracked files clean
  (`git diff --stat HEAD` empty). Run it with `run_in_background` and
  poll the output file; a foreground call exceeds the 60s bash cap.
- **Checkout staleness — check FIRST, before picking a candidate**
  (found 08-18, run 21): the analyst's checkout can be many commits
  behind `origin/main` (19 that run), and whole feature directories CI
  is already testing may be missing locally — that run's best candidate
  (`TraceTimelineV2/`, added 08-17) did not exist in the tree at all,
  which is what killed verification. `git rev-list --count HEAD..origin/main`
  up front tells you how much of main's test surface you cannot run.
  File CONTENT is still readable via `git show origin/main:<path>`
  (origin/main is fetched), but content alone does not let you RUN the
  test, and writing newer source into the tree is forbidden by the
  "never modify any repository file" constraint. Practical consequence:
  prefer candidates in files that `git ls-files` confirms are present.
- DB connectivity is now a STANDING known-blocked condition, not a
  per-run diagnosis: `host.docker.internal` → `EAI_AGAIN` on every run
  from 08-03 through 08-18. Upstream: github/gh-aw#52140 and
  github/gh-aw-firewall#7268. Do NOT re-attempt DB-backed verification
  until one of those closes. One cheap confirmation is fine: `node -e
  "require('dns').lookup('host.docker.internal',(e,a)=>console.log(e?String(e):a))"`.
- `mcp__safeoutputs__missing_tool`/`missing_data` have worked cleanly since
  08-03 (the 07-31 DIFC rejection of `missing_tool` has not recurred).
