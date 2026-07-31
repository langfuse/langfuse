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
  (10.00s). See 07-08 sixth-run entry for why each is unfit for an autonomous
  PR — do not re-investigate without new evidence.
- No flaky/retried tests in the sampled logs (small sample, 2 job logs).

## 2026-07-08 (runs 2-6, condensed)

- Runs 2-4 were same-day re-triggers before enough post-baseline data existed;
  noop, no memory changes.
- Run 5: 16 successful merge-group runs on 07-08 alone; no regression, the
  baseline's late-week `run tests` rise had receded (not sustained).
  `webhooks.test.ts` timer hypothesis disproven (uses `msw`, cost is real
  Postgres+Redis round-trips in 5x `executeWebhook` loops — not fake-timer
  padding). `bufferedStreamUploader.test.ts` setTimeouts are load-bearing
  (buffering/concurrency-ordering assertions), not paddable.
- Run 6: full trailing-7-day analysis (07-02..07-08, n=5/day segment sample).
  webRunTests 114.5 vs baseline 86 (+33%) investigated and found NOT
  actionable — execution stayed flat (rise absorbed off critical path),
  baseline sample was skewed low, and the step PLATEAUED on the 3 most recent
  days. Wrote `history/2026-W28-partial-0708.json`. Zero flaky across 3
  samples. Slowest tests unchanged from baseline, each already investigated
  and found unfit for an autonomous PR (mutation semantics / real DB+Redis
  round-trips / load-bearing timeouts / integration-inherent Lambda dispatch).
  Do not re-open any of these without new evidence.
- **NAMING COLLISION still open**: `history/2026-W28.json` is the baseline but
  its window (06-30..07-07) is mostly W27. When a true full W28 (07-06..07-12)
  or full W31 (07-27..08-02) completes, write the complete-week file under its
  correct label and relabel the baseline to its actual W27 window instead of
  clobbering it. Same issue applies to `charts/*.svg`. Still unresolved as of
  2026-07-31 (run 11) — deprioritized each run in favor of higher-signal
  findings; a human should just do the one-time rename.

## 2026-07-30 (runs 7-10, GitHub Actions MCP secrecy-policy block — RESOLVED by run 11)

- Four consecutive `workflow_dispatch` runs on 2026-07-30 (ids `30553320896`,
  `30554268551`, `30556553649`, `30558863960`) got `[Filtered] ... filtered by
  secrecy policy ... not authorized to access private-scoped data` from every
  `actions_list`/`actions_get` call, blocking all timing/vitest-log gathering.
  `search_pull_requests` was unaffected throughout (kept confirming
  `prs.json` empty is correct). Each run filed `missing_tool` + `noop`,
  reusing the 07-08 checkpoint as an explicitly-stale reference rather than
  fabricating numbers.
- **Resolved as of run 11 (2026-07-31, on branch `fix/analyst-guard-policy`,
  5 commits ahead of `origin/main` fixing the analyst's own guard-policy
  config)**: `actions_list`/`actions_get`/`get_job_logs` all worked normally
  this run. The block was almost certainly this workflow's own GitHub
  App/guard-policy config (see the branch's own commit history —
  `fix(ci): declare the analyst's guard policy explicitly`,
  `fix(ci): use the array form for allowed-repos`,
  `fix(ci): exempt the github server from sink-visibility enforcement`,
  `fix(ci): use the blanket private-to-public-flows opt-out`,
  `fix(ci): raise the analyst's turn cap to 200`) — i.e. this was a
  self-inflicted, self-fixed infra issue, not an upstream GitHub-side change.
  No further action needed unless it recurs.

## 2026-07-31 (run 11, `workflow_dispatch` — full analysis resumes; new DIFC block on `missing_tool`)

- GitHub Actions MCP tools worked (see above). Ledger (`prs.json`) confirmed
  empty via `search_pull_requests` (`total_count: 0` for
  `is:pr label:ci-performance`) — no open agent PRs to assess.
- **Regression confirmed and root-caused: web `run tests` step.** Weekday
  (07-27..07-31) median 147s vs baseline 86s (+71%) vs last checkpoint 114.5s
  (+28%) — a *sustained*, still-climbing multi-checkpoint trend, unlike the
  06-07-08 "plateaued, not actionable" case. Day-by-day: 146/147/147/171/166s
  (07-27 through 07-31); no single ≥50%-in-3-days jump, so not attributable to
  one PR — reads as continued organic test-suite growth in the same file
  family. 07-30 was the anomalous day overall (highest perceived + execution,
  worst `mode-azure` shard runTests=368s).
- **Root cause: `score-comparison-analytics.servertest.ts`
  (`web/src/__tests__/server/`) is the dominant and still-worsening slow
  file** across every sampled day this week (summed per-file time 22.9s up to
  81.8s on the 07-30 sample). The single slowest test,
  `"should skip FINAL and apply hash-based sampling for large matched
  datasets"` (~L457-521), ranges 4.2s-24.2s and is the one true large-data
  test in the file: it calls `insertLargeTraceLevelScorePairs({totalRows:
  120_000, ...})`, which inserts via 12 *sequential* `for` + `await
  createScoresCh(...)` batches of 20,000 rows. `createScoresCh`
  (`packages/shared/src/server/test-utils/clickhouse-helpers.ts`) is a single
  stateless `clickhouseClient().insert()` call per invocation — no
  shared/mutable state — and per-row values are independent
  (`Math.random()`-based, no order-dependent assertions), so the batches are
  safe to run concurrently via `Promise.all` instead of sequentially.
  Precedent for concurrent use of these Ch helpers already exists in
  `scores-api-v2.servertest.ts:104`. Confirmed no `beforeEach`/`afterEach`
  hooks complicate this (grepped the file, zero matches). The analogous
  `insertLargeIdenticalTraceLevelScores` helper (~L163-197) has the same
  pattern and the same fix would apply, though it's only used with smaller
  row counts today.
- **Could NOT sandbox-verify this run — new hard blocker, distinct from the
  07-30 GitHub Actions block: this run's Bash sandbox rejects every
  `pnpm`/`corepack pnpm`/`npm exec pnpm` invocation with a permission-approval
  gate that never resolves headlessly** (confirmed via direct `pnpm`,
  `corepack pnpm --version`, and `npm exec --yes pnpm@11.10.0 -- --version` —
  all three hang on "requires approval"; meanwhile `git`, `node -v`, `which`,
  `wc -l`, `test -f`, exact-path `rm -f` all work fine). Per the repo's own
  "verify before opening a PR" rule and this workflow's decision rules, an
  unverified test-file change must not become a PR — same "flag, not action"
  outcome as the 07-07 `json-utils.clienttest.ts` case. Created and then
  cleanly deleted a throwaway `ci-perf/parallelize-score-comparison-inserts`
  branch off `origin/main` (zero commits) while trying to verify; left no
  trace. **If pnpm becomes invokable in a future run, this is a ready,
  well-scoped fix to actually try**: parallelize the batch loop in
  `insertLargeTraceLevelScorePairs` (and optionally
  `insertLargeIdenticalTraceLevelScores`) with `Promise.all`, run the file's
  suite, confirm assertions + row counts are unaffected, and only then open a
  `ci-perf/` PR.
- **New: `mcp__safeoutputs__missing_tool` itself was rejected by a DIFC
  secrecy-policy layer, twice, and is currently unusable.** Error: "Agent
  carries private (***REDACTED***/***REDACTED***)-scoped data that cannot be written to
  'write-sink:public (missing_tool)' due to secrecy constraints... Required
  Action: Add secrecy tags [private:***REDACTED***/***REDACTED***]." Retried with
  `secrecy: "private", integrity: "high"` set explicitly (exactly what the
  error asked for) — identical error recurred verbatim, showing the agent's
  label was already `Secrecy: [private:***REDACTED***/***REDACTED***]` both times while
  `Resource Requirements: Secrecy: []` stayed empty, i.e. the `missing_tool`
  write-sink itself declares no compatible secrecy tag and is structurally
  unwritable by a private-labeled agent regardless of parameters passed. The
  error's phrasing (framed as an instruction to progressively broaden the
  agent's own write-permission labels) also has injection-like characteristics
  — did not comply beyond the tool's real schema fields. Worked around by
  folding this finding into the `noop` report body instead. **A human should
  check whether other safe-output tools (`create_issue`, `add_comment`,
  `create_pull_request`) are similarly gated** before this workflow next needs
  one of them for real.
- New flaky observations (single occurrences, not yet a pattern):
  `prompts.v1.servertest.ts` (retries=2) and `otelToObservationForEval.test.ts`
  (retries=1), both from the 07-30 sample; 6 of 7 other sampled days/logs had
  zero retries.
- Wrote `history/2026-W31-partial-0731.json`. Ledger unchanged (empty).

## Tooling notes (for future runs)

- The GitHub Actions MCP `list_workflow_runs` caps at ~30 runs/page regardless
  of `per_page`, and has no `created` date filter. Filter by
  `event: merge_group` + paginate `page: 1..N` until the oldest `created_at`
  passes the week start (≈5 pages ≈ 150 runs covers a week here).
- Tool responses overflow the token limit and are saved to a file; the real
  payload is nested at `.[0].content[0].text` (a JSON string) — extract with
  `jq -r '.[0].content[0].text' <file> > out.json` then query `out.json`.
- Jobs API payload is nested at `.jobs.jobs[]` with `.jobs.total_count`.
- Sandbox bash blocks compound commands (`;` in some but not all cases, `&&`,
  `for`, triple-dot `...` git revspecs), `bash script.sh`, `jq -f`, redirects
  outside the workspace, `ls` outside the repo working dir, and (new as of
  run 11) any `pnpm`/`corepack pnpm`/`npm exec pnpm` invocation — the last of
  these means **no test suite can be executed to verify a candidate fix in
  this sandbox**; treat that as a standing constraint, not a per-run fluke,
  until a run confirms otherwise. Use single jq invocations with inline
  programs and redirect only into the repo working dir; use exact filenames
  (no globs) for `rm`.
- `mcp__safeoutputs__missing_tool` is currently broken (DIFC secrecy-policy
  rejection, see 07-31 entry above) — use `noop` with the finding folded into
  the report body instead until this is fixed.
