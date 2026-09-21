# CI runtime analyst — durable notes

Append dated bullets. Keep under 200 lines; prune superseded notes.

## Standing rules (read these first)

- **Check the critical path before mining tests for optimisations** (09-11,
  sharpened 09-21). `e2e-tests` is now effectively the WHOLE critical path:
  `execution − e2e` was only 2-22s/day across 09-15..09-20, and shard slack has
  widened from ~84s to ~114s. Shaving seconds off a shard with that much slack
  cannot move the headline number, however real the saving. Do the arithmetic
  first; if the candidate is off the critical path, say so and stop.
- **A regression can live in the BUILD GRAPH, not in test code** (09-21). W39's
  +25.6% came from a new workspace package (`@langfuse/native`, a Rust addon)
  entering the e2e `Build` closure with `"cache": false, "outputs": []` in
  `turbo.json` — deliberately uncacheable, because the author reasoned that
  Cargo caches incrementally in `target/`. True on a laptop; false on an
  ephemeral runner with no persisted `target/`. So when a step inflates with
  no matching test change, read `turbo.json` task overrides and the selected
  package set, not just the test suite.
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
  `insertLargeTraceLevelScorePairs` L112-161 inserts 120k rows via 12 sequential
  `await createScoresCh(...)`; batching is safe (precedent
  `scores-api-v2.servertest.ts:104`). **PARKED** — unverifiable (DB blocked) and
  the climb it targeted did not persist.
- **layout.clienttest.ts hoist — DEAD.** 14.81s vs 14.90s (08-24), inside noise;
  without `rowRange`, `layout()` positions all ~140k rows, so any real win means
  cutting coverage.
- **webhooks.test.ts fake timers — DEAD** (09-07). ~23.5s/22 tests, but no
  `setTimeout`/`sleep`/`waitFor`/`useFakeTimers` anywhere in it — real DB/HTTP.
- **bufferedStreamUploader.test.ts 3.00s retry test — DEAD** (re-confirmed
  09-14). Internal sleeps are only 10-100ms; the 3s is real orchestration.
- **redisConsumer.test.ts:116 `setTimeout(2000)` — PARKED, weak** (re-confirmed
  at 2003ms, 09-14). Worth ~1.5s on a shard with ~84s of slack, and shortening
  it narrows a negative assertion. Only revisit if the shards become critical.
- **json-utils.clienttest.ts — DO NOT trim.** Recursive `deepParseJson` mutates
  its input in place (`packages/shared/src/utils/json.ts`), so the
  clone-per-parser cost is required.
- **analyticsIntegrationSsrfPinning.test.ts is NOT a regression** (08-24):
  18.07s/7 → 36.09s/13 is new coverage; both slow cases are 18s SSRF timeouts.
- **event-repository.servertest.ts** (09-14, still #1 web file 09-21 at
  19.6-23.1s) and `experiment-score-levels.servertest.ts`: DB-backed, off the
  critical path, do not re-mine. Same verdict for
  `awsLambdaCodeEvalDispatcher.integration.test.ts`, `batchExport.test.ts`,
  `IngestionService.integration.test.ts`.

## Week-by-week record (condensed)

- **W28 baseline (06-30..07-07)**: p50=396s / p90=522s over 131 runs. Pipeline
  is **execution-bound, not queue-bound** (wait 7-22s) — still true 09-21.
  NAMING COLLISION open: `history/2026-W28.json` covers a mostly-W27 window.
- **08-03..08-17 — six fully-blocked runs**, never diagnosed, stopped on their
  own. Don't re-try `cat /etc/hosts` or `WebFetch` of pipeline.yml.
- **08-18 — issue-output regime begins.** 33 runs, p50=224s / p90=675.4s.
- **08-24 (W34) — the load-bearing dense comparator.** 37 sampled over 6 days;
  pooled p50=198 / p90=284.6; weekly 198.3 / 185.3 / 15.3 / 48 / 77.8 / 106 /
  158.3. **08-31** had only 4 successful merge_group runs — excluded from charts.
- **09-07 (W36) — first real regression of the regime.** 28 sampled; weekly
  240.5 / 224.5 / 15 / 52 / 91.5 / 113.5 / 165.5, +21.3% vs W34 with wait flat.
  **Host capacity, not code**: a same-day 09-03 fast/slow pair showed wall +90%
  while summed top-10 durations grew only 23%. Uniform slowdown = CPU
  contention; write-heavy-only inflation = container I/O pressure.
- **09-11 (W37) — best week on record.** 25 sampled; pooled p50 194 / p90 224.2;
  weekly 192 / 175.3 / 17 / 47.3 / 69 / 72.8 / 155.5. Cause: `aa5f60aa8`
  (#17122, more Blacksmith CPUs + concurrency tuning, 09-07T10:24:32Z) —
  same-day split webRunTests 89→64s, workerRunTests 107→72s.
- **09-14 (W38, 09-08..09-14) — flat, no diff.** 4 dense days. Weekly 186.3 /
  170.3 / 16.8 / 47 / 67.5 / 71.3 / 155.5 — marginal new best, but -3.0% vs W37
  is mostly **window shift**. This is the baseline W39 regressed against.

- **09-21 (09-15..09-21, W39) — LARGE REGRESSION, first suggested diff of the
  regime.** First window sharing NO days with a previously reported one, so the
  delta is genuinely independent. 4 dense days (09-15..09-18, 6 sampled each);
  09-19 Fri and 09-21 Mon had ZERO merge_group runs (09-19 validated against an
  unfiltered fetch — real, not a stale filter); 09-20 had 1 (charted, thin,
  excluded from the aggregate). Weekly 234 / 217.8 / 14 / 48 / 72 / 72.3 / 186:
  perceived +25.6%, execution +27.9%, e2e +19.6% vs W38 — while runner wait
  FELL 16.8→14s. Execution-bound. Localized to the e2e `Build` step (42s
  pre-window → 69s, **+64%**); `Run e2e tests` flat at 47→49s and `tests-web`
  Build flat at ~43→47s, so it is the build, not the tests. Cause:
  `1a2d1f211` (#17062, native addon scaffold, 09-15T12:32:33Z — day one of the
  window). Split on 09-15: pre-#17062 52s (n=3) vs post 71.5s (n=22, only 4/22
  under 50s). `bb65111ff` (#17292) exonerated — 09-11/13/14 are post-#17292
  and fast. Caveats kept honest in the issue: the worst outlier (09-15T07:55,
  Build 122s) predates #17062, the pre-window baseline is n=3, and cargo/napi
  execution is inferred from the turbo graph, not read off a log line.

## Incidents

- **2026-09-11 main red ~06:35Z-11:32Z — RESOLVED, infrastructure.** apt mirror
  failures installing Playwright system deps; fixed by `ae2b6dbd3` (#17328).
  **Signature**: uniform ~700-725s wall with `e2e-tests` + `tests-storybook`
  failing together across all event types (`all-ci-passed` is just the gate).

## Flaky tracking

- `admin-api-keys.servertest.ts > 'invalidates all cached API keys without
  deleting other redis entries'` — **DROPPED 09-14** after two quiet weeks
  (lifetime 2: 09-04, 09-06). Root cause if it returns: it asserts an exact
  `invalidatedCount: 2` against a SHARED Redis DB while the handler scans
  `api-key:*` globally, so any concurrent shard with an API-key entry makes it
  3+. One-line fix (assert `>= 2`, or scope to the two keys created). Needs
  Redis — first thing to ship if DB access returns.
- Previously cleared and dropped: `unstable-evaluator-v2-api` (1 lifetime,
  08-23), `otelToObservationForEval` (2, 07-30 / 08-13). **Zero retried tests in
  every sampled shard for three consecutive weeks** (09-21 sample was n=3, not
  the usual 5 — two log tails under-shot the reporter block).
- `worker/src/.../traceBatching.test.ts` — NOT flaky, just slow (09-21): 12.08s
  for one test inside a 13.42s / 38-test file, ~4× the next slowest worker test
  and a recent feature area. Off the critical path (~114s shard slack), so
  recorded, not mined.

## Known CI waste — report only, never propose

Fixes for these live in `.github/workflows/**`, edit-forbidden here.

- **turbo + pnpm cache reservation races** (09-03 through 09-21, persistent):
  parallel jobs share one cache key, so `Failed to save: Unable to reserve cache
  with key Linux-X64-node24-turbo-ci-<hash>` (and the same for
  `pnpm-lockfile-verified-*`, `node-cache-*`) recurs after tarring 0.8-2.6 GB.
  Off the critical path; worth a human reviewing cache key scoping.

## Output contract

- No PRs, ever. Every run files exactly one issue (label `ci-performance`,
  assignee `wochinge`). `issues.json` supersedes `prs.json` (kept, empty).
- **No issue-search tool exists** — GitHub MCP offers only `actions_get`,
  `actions_list`, `get_job_logs`, and the PR readers. Backfilling a past
  issue's number/url is permanently impossible; entries stay `number: null`.
  `missing_tool` filed 08-24 and 09-07 — don't re-file.
- **`$GITHUB_STEP_SUMMARY` is NOT writable** (09-07, ENOENT outside the mount).
  The filed issue is the only output.

## Tooling notes

- **Compute the ISO week label, don't assume it.** Label = the ISO week the
  window predominantly covers, `-partial-<MMDD>` when incomplete or colliding.
- `list_workflow_runs` caps at ~30 runs/page, ignores `per_page`, has no
  `created` filter — filter `event: merge_group` and paginate until
  `created_at` passes the window start. Validate a zero-run day against an
  unfiltered sample; the filter has returned stale data.
- Large tool responses land in a file, payload at `.[0].content[0].text` (a
  JSON string), jobs at `.jobs.jobs[]`. **Never `Read` those files** — parse
  with a small Node script written via `Write`.
- **`get_job_logs` `tail_lines`.** The trailing cleanup block is a docker image
  manifest whose length scales with that runner's image count, so there is no
  single right value. **Start at 190-215 for web, ~245 for worker**, step up on
  a miss; 130-142 works only on small worker shards, and 30-60 returns cleanup
  only (two shards under-shot on 09-21, leaving the zero-retry claim at n=3).
  You need just enough to catch `Slowest test files` running into `Post job
  cleanup.` — that boundary is itself the zero-retry proof, since
  `Retried tests (N):` prints only on retry.
- **`git log` is the cheapest attribution tool — use it first.** Bare `git log`
  and `git log --oneline -25 --since=<date> -- <path>` need no approval;
  `git show <sha> -- <file>` works, but `git log -S<string>` needs approval.
  Use it to pin a step-time inflection to a commit and to check whether a
  suggested diff landed.
- **Write temp scripts to `/tmp/gh-aw/agent/` with `Write`, never the repo.**
  Copy response paths **including the session-id segment** or you get ENOENT.
- Sandbox bash blocks compound commands, `bash script.sh`, `jq -f`, heredocs,
  redirects outside the workspace, `ls`/`find`/`wc` outside the repo, and bare
  `pnpm`; `git -C`, `cd && git`, `git checkout --` need approval. It also
  rejects a `node -e` one-liner containing a newline followed by `#` — put
  anything with markdown headings in a `Write`-created script file instead.
  Use `Glob`/`Grep` over `find`/`ls`, `node -e` + `fs` for paths outside the
  repo, one operation per call, and quote paths.
- **Inline env-var prefixes are rejected** (`FOO=bar npx ...`). A web vitest run
  needs a placeholder `/…/langfuse/.env.test` (`web/vitest.config.mts` loads
  `../.env.test`; `cp .env.test.example` is not enough) with `DATABASE_URL`,
  `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `SALT`, `ENCRYPTION_KEY`
  (64 hex), the three `CLICKHOUSE_*`, `REDIS_CONNECTION_STRING` — even for
  client tests. **Delete it before finishing.**
- **`pnpm` and `turbo` are NOT installed in this sandbox** (confirmed 09-21 —
  `which` finds only `node`), and CLAUDE.md forbids `./node_modules/.bin/*`.
  So `turbo run build --dry=json` is unavailable: verify a turbo/filter change
  by **deriving the task closure statically** — read `pnpm-workspace.yaml`
  globs, each `package.json`'s internal deps, then walk `^build` from the
  selected set. Label it in the issue as a static derivation, not a turbo run.
  `turbo.json` is JSONC: strip `//` lines before `JSON.parse`.
- **A `--filter=!<app>` exclusion does NOT drop that app's workspace deps**
  (09-21). `--filter=!worker` still built `@langfuse/native#build`, because
  the addon is itself a selected workspace package with a build script. Exclude
  every package you mean to exclude, and prove it with the closure script.
- DB connectivity is a STANDING blocked condition: `host.docker.internal` →
  `EAI_AGAIN` since 08-03 (upstream github/gh-aw#52140, github/gh-aw-firewall#7268).
  Don't re-attempt DB-backed verification until one closes. Consequence: every
  top slowest file in both suites is DB-backed, so mining ends at "cannot verify".
- `.svg` files DO persist in repo memory (`charts/` holds 10). The checkout
  being current (`HEAD..origin/main` = 0) is what makes in-sandbox verification
  possible — check it first, every run.
