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

## 2026-08-03 (run 12) and 2026-08-06 (run 13) — both fully blocked, back-to-back

- **GitHub Actions MCP block recurred identically on both runs**, despite
  run 11's "resolved" note. `actions_list` (all methods, incl. plain
  `list_workflows`) and `actions_get` fail on the very first call with the
  same secrecy-policy filter text. `get_job_logs` itself is NOT filtered
  (returns a normal 404 for a bogus job id on 08-06) but is useless without
  a run/job id, which only `actions_list` can supply — so the practical
  effect is a full block on all timing/vitest-log gathering.
  `search_pull_requests` is unaffected both times (ledger reconfirmed
  empty). **08-06 ran from this workflow's own checkout at HEAD
  `fix(ci): upgrade gh-aw to v0.85.4 to pick up the DIFC secrecy fix` —
  i.e. a fix targeting this exact class of issue was already in the
  checkout, and the block still occurred.** Treat as an unresolved,
  recurring infra issue, not self-fixed — a human should look at the
  guard-policy/DIFC config directly rather than trust prior runs' "resolved"
  notes.
- **DB connectivity also dead both runs.** `/tmp/gh-aw/db-stack-ready`
  exists (provisioning claimed success) but
  `dns.lookup('host.docker.internal')` fails `EAI_AGAIN` both times. Per
  this workflow's own rule this is an infra signal, not a regression/flaky
  signal — blocks all DB-backed sandbox verification, including the
  standing `score-comparison-analytics.servertest.ts` candidate fix above.
  `npx` itself works fine both runs (confirmed `npx --version` on 08-06) —
  the constraint is DB reachability, not command execution.
- **Net effect both runs: zero fresh timing/vitest data**, no new
  `history/*.json`. Last real numbers remain
  `history/2026-W31-partial-0731.json` (2026-07-31). Filed `missing_tool`
  (Actions API) + `missing_data` (DB connectivity) both runs.

## 2026-08-06 (run 14, later same day as run 13) — third consecutive fully-blocked run

- **Both hard blockers persist, unchanged from runs 12/13.** `actions_list`
  (`list_workflow_runs`, `event: merge_group`, `status: completed`) failed on
  the first call with the identical secrecy-policy filter text
  ("not authorized to access private-scoped data"). `node -e
  "require('dns').lookup('host.docker.internal',...)"` again returned
  `EAI_AGAIN` despite `/tmp/gh-aw/db-stack-ready` existing. `npx --version`
  and `.env` both fine, confirming (again) the constraint is DB reachability
  and Actions-API authorization specifically, not general sandbox breakage.
  `search_pull_requests` confirmed working, ledger reconfirmed empty
  (`total_count: 0` for `label:ci-performance is:pr`).
- **This is now 3 blocked runs in a row (08-03, 08-06 run 13, 08-06 run 14)
  and 2 on the same calendar day** — strong evidence this is a standing
  infra/guard-policy misconfiguration, not transient flakiness. A human
  should check the DIFC/guard-policy config for `resource:actions_list`
  directly (run 11's "self-fixed" belief was wrong — see 08-03/08-06 above)
  and separately check why the dev-stack DNS entry for
  `host.docker.internal` isn't resolving despite the ready-marker.
  **Recommend a human investigate before the next scheduled run**, since no
  further autonomous run can make progress on either the timing analysis or
  the standing `score-comparison-analytics.servertest.ts` sandbox
  verification until at least one of the two blockers clears.
- No new `history/*.json` written this run (nothing to compute). Last real
  numbers remain `history/2026-W31-partial-0731.json` (2026-07-31), now 6
  days stale relative to this run's trailing-7-day window
  (2026-07-31..2026-08-06). Filed `missing_tool` (Actions API) +
  `missing_data` (DB connectivity) + `noop` (full report) this run.

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
