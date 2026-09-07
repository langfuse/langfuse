# CI runtime analyst — durable notes

Append dated bullets. Keep under 200 lines; prune superseded notes.

## 2026-07-07 (week 2026-W28, first run — baseline)

- **Baseline established.** merge-group perceived p50=396s, p90=522s over 131
  successful runs (150 total: 18 failure, 1 cancelled) for 2026-06-30..07-07.
  Reference point for judging future weeks.
- **Pipeline is execution-bound, not queue-bound.** Runner wait was 7–22s on
  4/6 sampled runs. Optimize the pipeline itself, not runner capacity, most
  weeks. Held true through W36.
- **turbo cache hit/miss dominates the Build step.** Don't chase Build
  variance without separating cache hits from misses.
- **json-utils.clienttest.ts** slowest client file (~8.9s). DO NOT trim: the
  recursive `deepParseJson` mutates its input in place
  (`packages/shared/src/utils/json.ts`), so the clone-per-parser cost is
  required. Flagged for human discussion only, not an autonomous PR.
- Slowest worker server tests are DB/integration-backed (`webhooks.test.ts`,
  `awsLambdaCodeEvalDispatcher.integration.test.ts`, `batchExport.test.ts`,
  `IngestionService.integration.test.ts`) — each investigated and found unfit
  for an autonomous PR (real DB+Redis round-trips / load-bearing timeouts /
  integration-inherent). Do not re-investigate without new evidence.
- **NAMING COLLISION still open**: `history/2026-W28.json` is the baseline but
  its window (06-30..07-07) is mostly W27. Needs a human rename; open at 09-07.

## Dead and parked candidates — do not re-attempt

- **score-comparison-analytics.servertest.ts `Promise.all` batching**
  (flagged 07-31). `insertLargeTraceLevelScorePairs` (L112-161) inserts
  120,000 rows via 12 SEQUENTIAL `await createScoresCh(...)`; the helper is
  stateless, per-row values independent, file has no `beforeEach`/
  `afterEach`, so batching is safe. Precedent: `scores-api-v2.servertest.ts:104`.
  **PARKED** — never verifiable (DB blocked since 08-03), and the climb it
  targeted did not persist. Re-open only if DB access returns AND a >=10%
  sustained (3+ day) webRunTests regression reappears.
- **layout.clienttest.ts hoist — DEAD.** Verified in-sandbox 08-24 with real
  before/after measurement: baseline `tests 14.81s` vs hoisted `tests 14.90s`
  — inside noise. `prepareTimeline` is not the cost; with no `rowRange`,
  `layout()` positions ALL rows, so the `huge` shape (`manySpans(10_000)`)
  drives ~140,000 `positionRow` calls. Any real win means cutting coverage —
  forbidden. File now lives at `web/src/features/traces/fns/timeline/`.
- **webhooks.test.ts fake timers — DEAD** (checked 09-07). It is the #1
  slowest worker file every week (23.5s / 22 tests), but grep found NO
  `setTimeout`/`sleep`/`waitFor`/`useFakeTimers`/`advanceTimers` anywhere in
  the file. The time is real DB and HTTP work.
- **analyticsIntegrationSsrfPinning.test.ts is NOT a regression** (08-24):
  18.07s/7 tests → 36.09s/13 tests is new coverage. Per-test cost flat
  (~2.6s → ~2.8s); both slow cases are 18s SSRF connect-timeout waits.

## 2026-08-03 through 2026-08-17 (runs 12-17) — six fully-blocked runs

- Actions API filtered by secrecy policy on every call, plus
  `host.docker.internal` → `EAI_AGAIN`. Zero fresh data for six runs; the
  Actions block was never diagnosed and simply stopped on 08-18. Watch for
  recurrence. Exhausted, don't re-try: `cat /etc/hosts`, `WebFetch` of the
  public pipeline.yml page.

## 2026-08-18 (runs 18-21) — data restored, issue-output regime begins

- 08-12..08-18, 33 runs: p50=224s, p90=675.4s — median lower than baseline,
  tail heavier, driven by 08-13 and 08-14 only. Root-caused via side-by-side
  vitest log comparison to whole-suite proportional slowdown (transform/
  import/tests all ~5x on both shards, same file/test counts) — Blacksmith
  runner contention, not a code regression. 2 days, short of the 3+ bar.
- **Output contract**: no PRs; every run files exactly one issue (label
  `ci-performance`, assignee `wochinge`). `issues.json` supersedes `prs.json`
  (kept, empty, as legacy record). The agent cannot know the issue number it
  files, so every entry lands `number: null`.
- **Client-shard structural lever (still the best one known).** The client
  job reports `environment 53.09s` and `import 65.26s` against only
  `tests 32.56s` over 279 files. Per-file jsdom construction + module import
  dominate, so single-test fixes have a low ceiling; the real lever is not
  giving every file a DOM. Too broad for a one-theme change.

## 2026-08-24 (run 22) — best week on record

- 08-18..08-24, 37 sampled runs, 6 populated days. Pooled p50=198s,
  p90=284.6s; weekly medians perceived 198.3 / execution 185.3 / wait 15.3 /
  webBuild 48 / webRunTests 77.8 / workerRunTests 106 / e2e 158.3.
  **This is the load-bearing comparator** — the densest clean week we have.
- The checkout WAS current (`HEAD..origin/main` = 0), which is what made
  verification possible. Check it first, every run.

## 2026-08-31 (run 23) — exceptionally thin data

- Only 4 successful merge_group runs, all on 08-30. Below the 10-run minimum.
  Metrics are a single-day snapshot, not a weekly aggregate.
- Web runTests up 9.3% (77.8s → 85s) was dismissed as thin-data noise.
  **That call was wrong** — see the W36 lesson below.

## 2026-09-07 (run 24, week 2026-W36) — first real regression of the regime

- Window 09-01..09-07, 145 successful merge_group runs (18 failures), 28
  sampled across 4 populated days (09-05/06/07 had zero merge_group runs).
  Weekly medians: perceived 240.5 / execution 224.5 / wait 15 / webBuild 52 /
  webRunTests 91.5 / workerRunTests 113.5 / e2e 165.5. Pooled p50 239 / p90 333.
- **+21.3% perceived and +21.2% execution vs the dense 08-18..08-24
  checkpoint, with runner wait flat** — execution-bound, not queue-bound.
  Still -39.6% against the W28 baseline, so this is a regression against
  recent form, not against the long run.
- **Attributed to host capacity, not code**, via a same-day fast/slow pair on
  09-03 (webRunTests 86s at 10:39 vs 163s at 17:45). **Technique worth
  reusing**: compare wall-step growth vs summed-test-duration growth. Wall
  grew 90% while summed top-10 file durations grew 23% — the extra seconds
  are scheduling/IO stalls, not test bodies. Second tell: inflation hit only
  write-heavy files (score-comparison 16→34s, traces-api 14→22s) while
  read-heavy got FASTER (event-repository 22→16s, queryBuilder 14→9s).
  Uniform slowdown = CPU contention; write-only = container I/O pressure.
- **Lesson from the 08-31 miss**: a sub-threshold uptick in a thin week is
  worth CARRYING, not discarding. The 9.3% webRunTests uptick dismissed on
  08-31 continued to 91.5s (+17.6% cumulative).
- **09-04 anomaly**: slowest day (288s) AND carried 14 of the week's 18
  merge_group failures (27% vs 0-9% elsewhere); failed merge-queue runs force
  requeues, raising load. Check the failure count before calling a slow day a
  regression.
- **New flaky, already recurring**: `admin-api-keys.servertest.ts >
  'invalidates all cached API keys without deleting other redis entries'`,
  retries=1 on 09-04 (merge_group) and 09-06 (pull_request). Root cause: it
  asserts an exact `invalidatedCount: 2` against a SHARED Redis DB while the
  handler scans `api-key:*` globally — any concurrent shard holding an
  API-key entry makes it 3+. One-line fix (assert `>= 2`, or scope to the two
  keys created; per-key assertions on L84-88 already cover real behaviour).
  Needs Redis to verify. **First thing to ship if DB access returns.**
- Both prior flaky watchlist entries CLEARED: `unstable-evaluator-v2-api`
  (stays 1 lifetime, 08-23) and `otelToObservationForEval` (stays 2, 07-30 /
  08-13). Dropped from the watchlist.
- **turbo compile-cache save race**: both `tests-web` shards share one cache
  key, so on 09-03 both logged `Failed to save: Unable to reserve cache with
  key Linux-turbo-tests-web-compile-<hash>` after tarring 0.8-2.6 GB. Waste,
  but off the critical path AND the fix lives in `.github/workflows/**`,
  edit-forbidden here. Report only; never propose.
- **PR #17103 'chore(ci): test fast'** (open since 09-05) sets
  `VITEST_MAX_WORKERS: 12`. A colleague is already on vitest concurrency — do
  NOT propose competing concurrency work. Also: the 09-06 `pull_request` run
  carries that env, so its timings are not representative of main.
- Critical path unchanged: `all-ci-passed` last; gating jobs `tests-web`
  (196-209s), `e2e-server-tests` (~175s), `tests-worker` (~175s), `e2e-tests`
  (~165s), `tests-storybook` (~160s). `tests-web`: `run tests` 93s + `Build`
  54s = ~147s of the ~201.5s step-median sum.

## Tooling notes (for future runs)

- **Compute the ISO week label, don't assume it.** 09-07 is a Monday and
  opens W37, but all four data days (09-01..09-04) sit in W36, so the file is
  `2026-W36.json`. Convention: label = the ISO week the window predominantly
  covers. Verify with a date computation before naming the file — a wrong
  label silently corrupts the series.
- `list_workflow_runs` caps at ~30 runs/page and ignores `per_page`, with no
  `created` filter — filter `event: merge_group` (cut W36 from ~40 pages to
  7) and paginate until `created_at` passes week start. Validate the filtered
  result against an unfiltered sample once; the filter has returned stale
  data before.
- Large tool responses are saved to a file; payload nested at
  `.[0].content[0].text` (a JSON string). Jobs payload nested at
  `.jobs.jobs[]`, `.jobs.total_count`. **Never `Read` those files** — they
  blow the context window. Parse them with a small Node script written via
  the `Write` tool that prints only a tiny extract.
- `get_job_logs` `tail_lines` sizing (the vitest reporter blocks sit at the
  very end): client shards need ~55-60; web/worker SERVER shards need 70-95.
  **Just use 92 for server shards — do not economize.** 32 and 40 both return
  only post-job cleanup; two calls were wasted re-discovering this on 09-07.
- Sandbox bash blocks compound commands (some `;`, `&&`, `for`, `...`
  revspecs), `bash script.sh`, `jq -f`, heredocs, redirects outside the
  workspace, `ls`/`find`/`getent`/`wc` outside the repo working dir, and
  bare `pnpm`/`corepack pnpm`. `git -C <path> ...`, `cd <path> && git ...`,
  and `git checkout --` all require approval — revert temporary edits with
  the `Edit` tool instead, then confirm with a bare `git status --porcelain`
  (that one is allowed). Use `Glob`/`Grep` instead of `find`/`ls`.
- **Inline env-var prefixes are rejected** (`FOO=bar npx ...` and
  `env FOO=bar npx ...` both fail as "multiple operations"). To give a web
  vitest run its environment, `Write` a placeholder `/…/langfuse/.env.test` —
  `web/vitest.config.mts` loads `../.env.test`. `cp .env.test.example` is NOT
  enough. Needs `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`,
  `NEXTAUTH_SECRET`, `SALT`, `ENCRYPTION_KEY` (64 hex), `CLICKHOUSE_URL`,
  `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `REDIS_CONNECTION_STRING`.
  Even a pure-client test needs these (client project transitively loads
  `.storybook/main.ts` → next config → zod env validation).
  **Delete the file before finishing.**
- `pnpm` is NOT on PATH. Use `npx --yes pnpm@10 install --frozen-lockfile`
  (~42s, leaves tracked files clean) with `run_in_background` and poll the
  output file; a foreground call exceeds the 60s bash cap.
- **No issue-search tool exists.** Available GitHub MCP tools are only
  `actions_get`, `actions_list`, `get_job_logs`, `list_pull_requests`,
  `pull_request_read`, `search_pull_requests`. Consequence: backfilling the
  real number/url of a previous run's issue is **permanently impossible**.
  Every `issues.json` entry stays `number: null, url: null` until a human
  adds an issue-read tool. `missing_tool` filed 08-24; do not re-file.
- DB connectivity is a STANDING known-blocked condition: `host.docker.internal`
  → `EAI_AGAIN` on every run from 08-03 onward. Upstream: github/gh-aw#52140
  and github/gh-aw-firewall#7268. Do NOT re-attempt DB-backed verification
  until one closes. Consequence: every top slowest file in both suites is
  DB-backed, so weekly optimisation mining keeps ending at "cannot verify".
- **`$GITHUB_STEP_SUMMARY` is NOT writable** (checked 09-07): the var is set
  but its path `/home/runner/work/_temp/_runner_file_commands/step_summary_*`
  is outside the sandbox mount and `appendFileSync` fails ENOENT. The run
  checklist's "also write the report to the job summary" step is impossible;
  the filed issue is the only output channel. `missing_tool` filed 09-07.
- `missing_tool`/`missing_data` safe outputs have worked cleanly since 08-03.
