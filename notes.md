# CI runtime analyst — durable notes

Append dated bullets. Keep under 200 lines; prune superseded notes.

## Standing rules (read these first)

- **Check the critical path before mining tests for optimisations** (09-11).
  `e2e-tests` has been the long pole for many weeks (155.5s against a 186.3s
  total on 09-08..09-14) while the web and worker shards run fully parallel to
  it at ~67.5s and ~71.3s — roughly **84s of slack**. Shaving seconds off a
  shard with that much slack cannot move the headline number, however real the
  saving. Do the arithmetic first; if the candidate is off the critical path,
  say so and stop. This is also the honest answer to "why no diff again this
  week": a structural fact about the pipeline, not a failure to find candidates.
- **A capacity/concurrency change can swing these numbers ~20-35% on its own.**
  W36 regressed +21% on host capacity; W37 recovered -20% and beat the prior
  record when #17122 raised Blacksmith CPUs and set `VITEST_MAX_WORKERS=12`.
  So: (1) never attribute a swing this size to code without checking `git log`
  on the CI workflow first; (2) to tell added parallelism apart from genuinely
  cheaper tests, compare wall-clock `run tests` against summed top-10 file
  durations — wall falls while summed **rises** = more parallelism under
  contention (structural win); both fall = tests got cheaper. Works both ways.
- **A sub-threshold uptick in a thin week is worth CARRYING, not discarding.**
  The 9.3% webRunTests uptick dismissed as noise on 08-31 continued to 91.5s
  (+17.6% cumulative) by W36. That call was wrong; don't repeat it.
- **Check the failure count before calling a slow day a regression.** 09-04 was
  W36's slowest day (288s) *and* carried 14 of its 18 merge_group failures;
  failed merge-queue runs force requeues, which raise load.
- **Overlapping windows inflate week-over-week deltas.** The trailing-7-day
  rule means consecutive reports share days — always state which days are
  shared and whether the delta is a real gain or just window shift.

## Dead and parked candidates — do not re-attempt

- **score-comparison-analytics.servertest.ts `Promise.all` batching** (07-31).
  `insertLargeTraceLevelScorePairs` (L112-161) inserts 120,000 rows via 12
  SEQUENTIAL `await createScoresCh(...)`; batching is safe (stateless helper,
  independent rows, no `beforeEach`); precedent `scores-api-v2.servertest.ts:104`.
  **PARKED** — never verifiable (DB blocked) and the climb it targeted did not
  persist. Re-open only if DB access returns AND a >=10% sustained regression does.
- **layout.clienttest.ts hoist — DEAD.** Measured 08-24: 14.81s vs 14.90s,
  inside noise. With no `rowRange`, `layout()` positions ALL rows, so
  `manySpans(10_000)` drives ~140,000 `positionRow` calls; any real win means
  cutting coverage — forbidden.
- **webhooks.test.ts fake timers — DEAD** (09-07). #1 slowest worker file most
  weeks (~23.5s / 22 tests) but grep found NO `setTimeout`/`sleep`/`waitFor`/
  `useFakeTimers` in the file. The time is real DB and HTTP work.
- **bufferedStreamUploader.test.ts 3.00s retry test — DEAD** (re-confirmed
  09-14). Internal sleeps are only 10-100ms; the 3s is real orchestration.
- **redisConsumer.test.ts:116 `setTimeout(2000)` — PARKED, weak** (re-confirmed
  at 2003ms, 09-14). Worth ~1.5s on a shard with ~84s of slack, and shortening
  it narrows a negative assertion. Only revisit if the shards become critical.
- **json-utils.clienttest.ts — DO NOT trim.** Recursive `deepParseJson` mutates
  its input in place (`packages/shared/src/utils/json.ts`), so the
  clone-per-parser cost is required.
- **analyticsIntegrationSsrfPinning.test.ts is NOT a regression** (08-24):
  18.07s/7 → 36.09s/13 tests is new coverage, per-test cost flat; both slow
  cases are 18s SSRF connect-timeout waits.
- **event-repository.servertest.ts / experiment-score-levels.servertest.ts**
  (09-14). New #1 web file (20.2-21.8s) and 5 of the top-10 slowest individual
  tests. Both DB-backed, both off the critical path — recorded so they are not
  re-mined. Same verdict for `awsLambdaCodeEvalDispatcher.integration.test.ts`,
  `batchExport.test.ts`, `IngestionService.integration.test.ts`.

## Week-by-week record (condensed)

- **W28 baseline (06-30..07-07)**: perceived p50=396s, p90=522s over 131 runs.
  Pipeline is **execution-bound, not queue-bound** (runner wait 7-22s) — still
  true. turbo cache hit/miss dominates the Build step; don't chase Build
  variance without separating hits from misses. NAMING COLLISION open:
  `history/2026-W28.json` covers a mostly-W27 window.
- **08-03..08-17 — six fully-blocked runs.** Actions API filtered by secrecy
  policy plus `host.docker.internal` → `EAI_AGAIN`; never diagnosed, stopped on
  its own. Don't re-try `cat /etc/hosts` or `WebFetch` of pipeline.yml.
- **08-18 — issue-output regime begins.** 33 runs, p50=224s / p90=675.4s; heavy
  tail from 08-13/08-14 only, root-caused to Blacksmith runner contention.
- **08-24 (W34) — the load-bearing dense comparator.** 37 sampled over 6
  populated days. Pooled p50=198 / p90=284.6; weekly 198.3 / 185.3 / 15.3 / 48
  / 77.8 / 106 / 158.3. Densest clean week we have. **08-31** by contrast had
  only 4 successful merge_group runs, all on 08-30 — excluded from charts.
- **09-07 (W36) — first real regression of the regime.** 145 successful, 28
  sampled; weekly 240.5 / 224.5 / 15 / 52 / 91.5 / 113.5 / 165.5. +21.3% vs W34
  with runner wait flat. **Host capacity, not code**, via a same-day fast/slow
  pair on 09-03 (webRunTests 86s at 10:39 vs 163s at 17:45): wall grew 90% while
  summed top-10 durations grew 23%, and inflation hit only write-heavy files
  while read-heavy got faster. Uniform slowdown = CPU contention; write-only =
  container I/O pressure.
- **09-11 (W37) — best week on record.** 25 sampled; pooled p50 194 / p90
  224.2; weekly 192 / 175.3 / 17 / 47.3 / 69 / 72.8 / 155.5. Attributed to
  `aa5f60aa8 chore(ci): increase Blacksmith CPUs and tune concurrency (#17122)`
  merged 09-07T10:24:32Z (same-day split: webRunTests 89→64s, workerRunTests
  107→72s, client step 79-82→44-45s).
- **09-14 (09-08..09-14) — flat, no regression, no diff.** 4 dense days
  (09-08/09/10 reused from W37 history; 09-11 fresh, 42 successes). 09-12 Sat
  had ZERO merge_group runs; 09-13 and 09-14 had 1 each (charted, flagged thin,
  excluded from the aggregate). Weekly 186.3 / 170.3 / 16.8 / 47 / 67.5 / 71.3
  / 155.5 — marginal new best, but -3.0% vs W37 is mostly **window shift**
  (dropping 09-07 at 213.5, adding 09-11 at 182). #17122 gain confirmed durable.
  Filed as `2026-W38-partial-0914.json` to preserve the `2026-W37.json` baseline.

## Incidents

- **2026-09-11 main red ~06:35Z-11:32Z (~5h) — RESOLVED, infrastructure.** apt
  / Ubuntu mirror failures installing Playwright system deps; fixed by
  `ae2b6dbd3 fix(ci): add apt retries for Playwright dependencies (#17328)` at
  11:32:19Z. **Signature to recognise next time**: uniform ~700-725s wall time
  with `e2e-tests` + `tests-storybook` failing together across all event types
  (`all-ci-passed` is just the gate). Found with `git log` on
  `.github/workflows/` — the only workflow commit that day, matching exactly.

## Flaky tracking

- `admin-api-keys.servertest.ts > 'invalidates all cached API keys without
  deleting other redis entries'` — **DROPPED 09-14** after two quiet weeks
  (lifetime 2: 09-04, 09-06). Root cause if it returns: it asserts an exact
  `invalidatedCount: 2` against a SHARED Redis DB while the handler scans
  `api-key:*` globally, so any concurrent shard with an API-key entry makes it
  3+. One-line fix (assert `>= 2`, or scope to the two keys created). Needs
  Redis — first thing to ship if DB access returns.
- Previously cleared and dropped: `unstable-evaluator-v2-api` (1 lifetime,
  08-23), `otelToObservationForEval` (2, 07-30 / 08-13). Zero retried tests in
  every sampled shard for two consecutive weeks.

## Known CI waste — report only, never propose

Fixes for these live in `.github/workflows/**`, edit-forbidden here.

- **turbo cache reservation race**: both `tests-web` shards share one cache key,
  so `Failed to save: Unable to reserve cache with key
  Linux-X64-node24-turbo-ci-<hash>` appears on 09-13/09-14 (as
  `Linux-turbo-tests-web-compile-<hash>` on 09-03) after tarring 0.8-2.6 GB.
- **pnpm cache reservation race (NEW 09-14, warning-level)**: same for
  `pnpm-lockfile-verified-Linux-x64-<hash>` and `node-cache-Linux-x64-pnpm-<hash>`.
  Both off the critical path; worth a human reviewing cache key scoping.

## Output contract

- No PRs, ever. Every run files exactly one issue (label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty).
- **No issue-search tool exists.** The GitHub MCP tools are only `actions_get`,
  `actions_list`, `get_job_logs`, `list_pull_requests`, `pull_request_read`,
  `search_pull_requests`. Backfilling a past issue's number/url is
  **permanently impossible**; entries stay `number: null, url: null`.
  `missing_tool` filed 08-24 and 09-07 — don't re-file.
- **`$GITHUB_STEP_SUMMARY` is NOT writable** (09-07): path outside the sandbox
  mount, `appendFileSync` fails ENOENT. The filed issue is the only output.

## Tooling notes

- **Compute the ISO week label, don't assume it.** Convention: label = the ISO
  week the window predominantly covers; `-partial-<MMDD>` when the week is not
  fully covered or the record would collide with a published one. A wrong label
  silently corrupts the series.
- `list_workflow_runs` caps at ~30 runs/page, ignores `per_page`, has no
  `created` filter — filter `event: merge_group` (cut W36 from ~40 pages to 7)
  and paginate until `created_at` passes the window start. Validate against an
  unfiltered sample once; it has returned stale data.
- Large tool responses are saved to a file, payload nested at
  `.[0].content[0].text` (a JSON string), jobs at `.jobs.jobs[]`. **Never
  `Read` those files** — parse with a small Node script written via `Write`.
- **`get_job_logs` `tail_lines` — recalibrated 09-14.** The trailing cleanup
  block is a docker image manifest, one line per image, so its length **scales
  with that runner's manifest** — there is no single right value. Measured: 215
  on a 25-image web shard, 190 on a 16-image web shard, 245 on a 59-image
  worker shard, 130-142 on small worker shards; 135 and 60 returned cleanup
  only. The old "use 265" is safe but costs ~15k tokens. **Start at 190-215 for
  web, ~245 for worker**, step up only on a miss. You need just enough to catch
  `Slowest test files` running into `Post job cleanup.` — that boundary is
  itself proof of zero retries, since `Retried tests (N):` prints only on retry.
- **`git log` is the cheapest attribution tool — use it first.** A bare
  `git log` in the working dir needs no approval, and
  `git log --oneline -25 --since=<date> -- .github/workflows/pipeline.yml`
  works. Two uses weekly: pin a step-time inflection to a commit, and check
  whether a suggested diff landed.
- **Write temp scripts to `/tmp/gh-aw/agent/`, never the repo.** When a large
  response is saved to a file, copy the path **including the session-id
  segment** — dropping it yields ENOENT.
- Sandbox bash blocks compound commands, `bash script.sh`, `jq -f`, heredocs,
  redirects outside the workspace, `ls`/`find`/`wc` outside the repo dir, and
  bare `pnpm`. `git -C`, `cd && git`, `git checkout --` need approval — revert
  temporary edits with `Edit`, confirm with `git status --porcelain`. Use
  `Glob`/`Grep` instead of `find`/`ls`; `node -e` + `fs.readdirSync` to list
  paths outside the repo. Keep commands single and quote paths.
- **Inline env-var prefixes are rejected** (`FOO=bar npx ...`, `env FOO=bar
  ...`). To give a web vitest run its environment, `Write` a placeholder
  `/…/langfuse/.env.test` (`web/vitest.config.mts` loads `../.env.test`);
  `cp .env.test.example` is NOT enough. Needs `DATABASE_URL`, `DIRECT_URL`,
  `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `SALT`, `ENCRYPTION_KEY` (64 hex), the
  three `CLICKHOUSE_*`, and `REDIS_CONNECTION_STRING` — even for pure-client
  tests. **Delete the file before finishing.** `pnpm` is NOT on PATH; use
  `npx --yes pnpm@10 install --frozen-lockfile` (~42s) with
  `run_in_background` and poll, since foreground exceeds the 60s cap.
- DB connectivity is a STANDING blocked condition: `host.docker.internal` →
  `EAI_AGAIN` since 08-03 (upstream github/gh-aw#52140, github/gh-aw-firewall#7268).
  Don't re-attempt DB-backed verification until one closes. Consequence: every
  top slowest file in both suites is DB-backed, so mining ends at "cannot verify".
- `.svg` files DO persist in repo memory (`charts/` holds 9; verified 09-14).
  The checkout being current (`HEAD..origin/main` = 0) is what makes in-sandbox
  verification possible — check it first, every run. `missing_tool`/
  `missing_data` safe outputs have worked cleanly since 08-03.
