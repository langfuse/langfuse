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

## 2026-08-03/08-06 (runs 12-14) — three consecutive fully-blocked runs, condensed

- Both hard blockers below first appeared here: `actions_list`/`actions_get`
  (all methods, incl. plain `list_workflows`) filtered by secrecy policy on
  every call across all three runs, and `dns.lookup('host.docker.internal')`
  failing `EAI_AGAIN` despite `/tmp/gh-aw/db-stack-ready` existing, both
  runs on 08-06 (including one at a HEAD that specifically claimed to fix
  the DIFC secrecy issue — did not help). `npx`, `search_pull_requests`,
  and `missing_tool`/`missing_data` all confirmed working throughout — the
  block is scoped to Actions API + DB reachability, not general sandbox
  breakage. Recommended a human check the guard-policy/DIFC config and the
  dev-stack DNS entry directly. Zero fresh data any of the three runs; last
  real numbers stayed at `history/2026-W31-partial-0731.json` (2026-07-31).

## 2026-08-10 (run 15) — fourth consecutive fully-blocked run, both blockers unchanged

- **`actions_list` still filtered**, identical error text, on
  `list_workflow_runs` (event=merge_group/completed) AND plain
  `list_workflows` — confirms this is a blanket resource-level block, not
  argument-specific. **DB connectivity still `EAI_AGAIN`** on
  `host.docker.internal` despite `/tmp/gh-aw/db-stack-ready` present.
  `npx --version` (11.16.0) fine; `search_pull_requests` fine (ledger
  reconfirmed empty, `total_count: 0`); no `ci-perf/*` remote branches
  exist. This is now **4 blocked runs across 3 separate calendar days
  (08-03, 08-06 x2, 08-10) spanning a full week** with zero change in
  symptom — this is a standing infra/guard-policy misconfiguration, not
  transient flakiness, and no further autonomous run can make progress on
  timing analysis, vitest-log mining, or verifying the standing
  `score-comparison-analytics.servertest.ts` candidate fix until a human
  fixes at least one of the two blockers. Last real numbers now 10 days
  stale (`history/2026-W31-partial-0731.json`, 2026-07-31); the current
  trailing-7-day window (08-04..08-10) has zero computable data points.
  Filed `missing_tool` (Actions API) + `missing_data` (DB connectivity) +
  `noop` (full report) this run.

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
