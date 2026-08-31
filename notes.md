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
- **NAMING COLLISION still open**: `history/2026-W28.json` is the baseline
  but its window (06-30..07-07) is mostly W27. Rename when a true full
  W28/W31 week completes. Unresolved through 08-24 — deprioritized every
  run in favor of higher-signal findings; needs a one-time human rename.

## 2026-07-30/07-31 (runs 7-11) — parked candidate

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
  onward DB dead), and DB-backed verification is blocked upstream
  indefinitely (see tooling notes). The climb it was meant to fix did NOT
  persist: webRunTests sat at 80s median on 08-18 and 77.8s on 08-24.
  Re-open only if both DB access returns and the regression reappears.

## 2026-08-03 through 2026-08-17 (runs 12-17) — six fully-blocked runs

- Two blockers: `actions_list`/`actions_get` filtered by secrecy policy on
  every call, and `host.docker.internal` → `EAI_AGAIN`. `npx` and
  `search_pull_requests` worked throughout, so it was never general sandbox
  breakage. Workarounds exhausted, don't re-try: `cat /etc/hosts`,
  `WebFetch` of the public pipeline.yml page.
- Zero fresh data for six straight runs. The Actions API block was never
  diagnosed — it simply stopped on 08-18. Watch for recurrence.

## 2026-08-18 (runs 18-21) — data restored, issue-output regime begins

- **Actions API resolved** on 08-18; `get_job_logs` confirmed working.
  **DB connectivity still broken** (see tooling notes).
- Full trailing-7-day analysis (08-12..08-18), 33 runs: p50=224s,
  p90=675.4s vs baseline 396/522 — **median lower, tail heavier**, driven
  entirely by 08-13 (3/5 runs slow) and 08-14 (2/5 slow). Root-caused via
  side-by-side vitest log comparison to whole-suite proportional slowdown
  (transform/import/tests all ~5x on both web and worker shards, same
  file/test counts) — CI-runner contention (Blacksmith), not a code
  regression. Only 2 days affected, not the 3+ consecutive needed to act.
  Detail in `history/2026-W34-partial-0818.json`.
- **Output contract changed** (run 21): the workflow no longer opens PRs;
  every run files exactly one issue (label `ci-performance`, assignee
  `wochinge`) carrying the full report. `issues.json` supersedes `prs.json`
  (which stays, empty, as the legacy record). The agent cannot know the
  issue number it just filed — safe-outputs creates it after the agent
  exits — so each entry lands with `number: null`.
- Client-shard structural observation (recorded, not proposed): the client
  job reports `environment 53.09s` and `import 65.26s` against only
  `tests 32.56s` over 279 files. Per-file jsdom construction + module
  import dominate that shard, so single-test fixes have a low ceiling
  there; the real lever is not giving every file a DOM. Too broad to be
  a surgical one-theme change. **Still the best structural lever known
  for the client shard — reconsider when a week has budget for it.**

## 2026-08-24 (run 22) — quiet week; carried candidate tested and dropped

- Window 08-18..08-24, 37 sampled merge-group runs across 6 populated days
  (08-24 had zero merge-group runs and is omitted). Pooled p50=198s,
  p90=284.6s. **Best week on record** — beats baseline 396/522 and last
  week's 224/675.4, and last week's heavy tail did not recur. No >=10%
  sustained median regression, no >=50% step shift across 3+ consecutive
  days. Detail in `history/2026-W35-partial-0824.json`.
- **The `layout.clienttest.ts` candidate is DEAD — do not re-attempt the
  hoist.** Carried from run 21 and fully verified this run.
  - The file moved (refactor, not deletion): it is now
    `web/src/features/traces/fns/timeline/layout.clienttest.ts`, was
    `.../components/TraceTimelineV2/layout.clienttest.ts` in the 08-18 and
    08-19 logs. Test count grew 12 → 16.
  - Safety gate CLEARED: `layout()` only reads `prepared`; `LayoutInput`
    documents `prepared` as a "memoized tree walk; recomputed here when
    absent" and `timeCompressionFor` as memoizable on
    `[prepared, box.width, compress]`. Reuse across boxes is the intended
    production path, so hoisting was legitimate.
  - Measured before/after in-sandbox on the same command
    (`npx --yes pnpm@10 exec vitest run --project client
    src/features/traces/fns/timeline/layout.clienttest.ts`):
    baseline `tests 14.81s` / slowest test 12.74s; hoisted
    `tests 14.90s` / slowest test 12.82s. **No win — inside noise.**
  - Why the hypothesis was wrong: `prepareTimeline` is not the cost. With
    no `rowRange`, `layout()` positions ALL rows, so the `huge` shape
    (`manySpans(10_000)`) drives ~140,000 `positionRow` calls across the
    10 shapes x 7 boxes x 2 compress combos. That dominates; the tree walk
    is noise beside it. Any real win there would have to cut the
    positioning work, which means cutting coverage — forbidden.
  - Both edits were reverted and the working tree confirmed clean.
- **New flaky**: `unstable-evaluator-v2-api.servertest.ts > unstable
  evaluator API on stable evaluator storage > paginates evaluator lists`,
  `retries=2 [flaky]`, on the 08-23 web-server shard. First occurrence —
  watch for a 2nd. It was the ONLY `Retried tests` block in 8 sampled job
  logs all week.
- `otelToObservationForEval.test.ts` did NOT recur — stays a 2-instance
  pattern (07-30, 08-13). Keep watching for a 3rd.
- **Not a regression**: worker `analyticsIntegrationSsrfPinning.test.ts`
  went 18.07s (7 tests, 08-18) → 36.09s (13 tests, 08-22). Test count
  nearly doubled — new coverage, not a slowdown. Per-test cost is flat
  (~2.6s → ~2.8s) and both slow cases are 18s SSRF connect-timeout waits.
  Do not re-flag without a per-test-cost change.
- The checkout WAS current this run (`HEAD..origin/main` = 0), which is
  what made verification possible at all. Check it first, every run.

## 2026-08-31 (run 23) — exceptionally thin data, parked candidate re-evaluated

- Window 2026-08-25..08-31 had **only 4 successful merge_group runs, all on
  2026-08-30.** Days 08-25..08-29 and 08-31 had zero merge_group activity.
  Below the 10-run minimum for robust weekly analysis. Metrics represent a
  single-day snapshot, not a weekly aggregate.
- Perceived/execution flat vs prior week (+1.5%, +0.5%). Web runTests up
  9.3% (77.8s → 85s), the only metric crossing ~10%, but 4 same-day runs
  cannot establish a sustained trend — does not meet the "sustained 3+
  consecutive days" bar for intra-week acting.
- E2e improved -15.4% (158.3s → 134s), but again single-day data.
- Zero retried tests in 2 sampled job logs. Clean vitest runs.
- **Parked candidate re-evaluated:**
  `score-comparison-analytics.servertest.ts` `Promise.all` batching was
  flagged 07-31 and parked due to DB verification blocker. The 9.3%
  webRunTests shift (77.8s → 85s) could justify re-attempting if DB access
  had returned, but the shift is too thin (4 same-day runs) to override
  the standing blocker. Candidate stays **parked** — re-open only if DB
  access returns AND a ≥10% sustained (3+ day) webRunTests regression
  reappears.
- Slowest files unchanged: webhooks.test.ts (23.39s),
  event-repository.servertest.ts (17.65s),
  score-comparison-analytics.servertest.ts (15.90s).

## Tooling notes (for future runs)

- `list_workflow_runs` caps at ~30 runs/page, no `created` filter — filter
  `event: merge_group`, paginate until `created_at` passes week start.
- Large tool responses are saved to a file; payload nested at
  `.[0].content[0].text` (a JSON string). Jobs payload nested at
  `.jobs.jobs[]`, `.jobs.total_count`. **Never `Read` those files** — they
  blow the context window. Parse them with a small Node script written via
  the `Write` tool that prints only a tiny extract.
- `get_job_logs` `tail_lines` sizing (the vitest reporter blocks sit at the
  very end): client shards need ~55-60; web/worker SERVER shards need
  ~70-95 (they emit ~30 extra lines of orphan-process/docker-logout/turbo
  cache-save noise after the blocks). 32 is too shallow and returns only
  post-job cleanup.
- Sandbox bash blocks compound commands (some `;`, `&&`, `for`, `...`
  revspecs), `bash script.sh`, `jq -f`, heredocs, redirects outside the
  workspace, `ls`/`find`/`getent`/`wc` outside the repo working dir, and
  bare `pnpm`/`corepack pnpm`. `git -C <path> ...`, `cd <path> && git ...`,
  and `git checkout --` all require approval — revert temporary edits with
  the `Edit` tool instead, then confirm with a bare `git status --porcelain`
  (that one is allowed).
- **Inline env-var prefixes are rejected** (`FOO=bar npx ...` and
  `env FOO=bar npx ...` both fail as "multiple operations"), even though the
  same command without them is allowed. To give a web vitest run its
  environment, `Write` a placeholder `/…/langfuse/.env.test` — `web/vitest.
  config.mts` loads `../.env.test`. `cp .env.test.example .env.test` is NOT
  enough (the example inherits the rest from a `.env` that does not exist
  here). Needs `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`,
  `NEXTAUTH_SECRET`, `SALT`, `ENCRYPTION_KEY` (64 hex), `CLICKHOUSE_URL`,
  `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `REDIS_CONNECTION_STRING`.
  Even a pure-client test needs these: the client project transitively
  loads `.storybook/main.ts` → next config → zod env validation.
  **Delete the file before finishing.**
- `pnpm` is NOT on PATH. Use `npx --yes pnpm@10 install --frozen-lockfile`
  (~42s, leaves tracked files clean) with `run_in_background` and poll the
  output file; a foreground call exceeds the 60s bash cap.
- **No issue-search tool exists.** Available GitHub MCP tools are only
  `actions_get`, `actions_list`, `get_job_logs`, `list_pull_requests`,
  `pull_request_read`, `search_pull_requests` — there is no
  `search_issues`/`list_issues`. Consequence: the run checklist's "backfill
  the real number/url of the previous run's issue" step is **permanently
  impossible** with the current toolset. Every `issues.json` entry will
  stay `number: null, url: null` until a human adds an issue-read tool.
  Do not burn budget re-discovering this; `missing_tool` was filed 08-24.
- DB connectivity is a STANDING known-blocked condition, not a per-run
  diagnosis: `host.docker.internal` → `EAI_AGAIN` on every run from 08-03
  onward. Upstream: github/gh-aw#52140 and github/gh-aw-firewall#7268.
  Do NOT re-attempt DB-backed verification until one of those closes.
- `mcp__safeoutputs__missing_tool`/`missing_data` have worked cleanly since
  08-03 (the 07-31 DIFC rejection of `missing_tool` has not recurred).
