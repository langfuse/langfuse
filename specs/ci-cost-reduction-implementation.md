# CI cost reduction: implementation and benchmark handoff

2026-09-05. Implements the selected cleanup, caching and eight-core experiments in `nimarc/ci-runner-benchmark`. Every existing test command, project, deployment mode and retry policy remains. Cross-job application-build sharing and test sharding remain deferred.

## What is implemented

### Resource cleanup

Web test cleanup reads the existing Redis singleton without importing a module that could open a new connection. ClickHouse cleanup uses a narrow shared-package entry point instead of the server barrel and still awaits all existing clients closing. The shared-context guard remains.

The new ClickHouse entry point uses a small index wrapper: pointing directly at the client file produced a second module identity under Vitest's compiled CommonJS path. Regressions cover compiled and source aliases, unopened and existing Redis, delayed ClickHouse close, and the shared-context exception.

### Caching

| State                  | Default behavior                                    | Invalidation and limits                                                                                                                                                                |
| ---------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint file cache      | Persisted for trusted repository runs               | Exact runtime, workspace contents and tracked path inventory; no fallback prefix. Type-aware rules require cross-file invalidation. Forced benchmarks also disable ESLint's own cache. |
| Storybook static build | Cached Turbo task                                   | Workspace dependency tasks propagate shared source changes; Storybook inputs, env files, runtime and relevant build variables are hashed. Story tests execute directly on every run.   |
| Vitest transforms      | Manual dispatch only: `test_cache=vitest` or `both` | Pinned Vitest 4 experimental API. Source hashes plus compiler/config/plugin/env inputs and source path inventory. Browser mode explicitly disabled.                                    |
| Node compiled modules  | Manual dispatch only: `test_cache=node` or `both`   | Exact Node runtime plus Node's own source validation; separate job/deployment namespaces.                                                                                              |

ESLint's conservative key principally helps reruns and changes outside lint inputs. It does **not** promise incremental cache hits after arbitrary TypeScript edits. Declaring `NODE_ENV` for the Storybook task makes one existing Turbo ESLint suppression redundant; that comment is removed without changing database behavior.

Compilation caches store executable transforms, not passing test results. The existing four-core ESLint-plugin job now also runs a regression probe that executes real Vitest tests nine times: cold, warm, changed source, Markdown, Vite config, TypeScript alias, environment, plugin, and a newly preferred extensionless import target. Future plugins reading additional external files or variables must extend the cache inputs and this regression.

The GitHub cache action retains the existing same-repository trust boundary. Cache transport and archive growth still need measurement on hosted runners. Experimental compilation caching stays off for ordinary CI until that comparison is successful.

### Eight-core benchmark profile

`runner_size=8` is available on every existing benchmark target. Ordinary CI retains its current runner allocation. With `tune_concurrency=true`, the eight-core profile uses:

| Job                   | Concurrency                       |
| --------------------- | --------------------------------- |
| Web server tests      | 8 Vitest workers                  |
| Shared and web client | 6 Vitest workers                  |
| Worker and Storybook  | 4 Vitest workers                  |
| Server E2E            | 4 Vitest workers                  |
| Browser E2E           | 3 Playwright workers              |
| Lint                  | 3 packages, 2 ESLint workers each |

These are bounded starting points, not measured optima. The installed Vitest version gives `VITEST_MAX_WORKERS` precedence over the existing web CLI flag; the web test command does not need changing.

## Local verification

- Cleanup regressions and related mock-heavy suites: `Test Files 6 passed (6)`; `Tests 21 passed (21)`; `Duration 6.46s` on Node 24.
- Compilation-cache probe: `tests 1`, `pass 1`, `fail 0`, with all nine internal Vitest invocations executing their assertion and marker write. Enabled-cache representative web/shared/worker suites also passed: 13 / 5 / 10 tests.
- Local worker warm-cache sample: 498 transform reads, zero writes; transform time 2.35s → 0.627s and complete invocation 5.48s → 4.15s. This is a local example, not a CI savings estimate.
- Storybook build: `Tasks: 1 successful, 1 total`; `Cached: 0 cached, 1 total`; `Time: 53.688s`. A stable-input replay reported `Cached: 1 cached, 1 total` and `Time: 109ms`. A shared-source probe changed its task hash and removing the probe restored the original hash. Hosted restore/save overhead is excluded.
- Runner helper: 224 profile/job/flag combinations passed; 168 legacy combinations unchanged; seven invalid-input cases rejected. Workflow review checked 70 runner routes and 280 compilation-cache guard combinations. Existing job dependencies and test commands were preserved.
- Agent guidance synchronization and validation passed. Final lint, typecheck, Knip and formatting status is recorded in the handoff below.

## Hosted comparison after push

The published workflow at `0c3bce6e2283b601d58e385d4d71bbc036fab34c` does not support the new inputs. No eight-core result exists for these changes yet. The owner commits and pushes this staged patch, then the following matched pair can run against that revision:

```bash
gh workflow run pipeline.yml --repo langfuse/langfuse --ref nimarc/ci-runner-benchmark \
  -f runner_size=8 -f tune_concurrency=true -f force_recompute=false -f test_cache=off
gh workflow run pipeline.yml --repo langfuse/langfuse --ref nimarc/ci-runner-benchmark \
  -f runner_size=16 -f tune_concurrency=true -f force_recompute=false -f test_cache=off
```

Repeat with `force_recompute=true` to measure task execution while retaining dependency/compiler caches; it also bypasses ESLint result reuse. For a credible allocation decision, alternate 8/16 execution order across at least three pairs within each cache cohort. Initial cache population is its own cohort, not a warm sample.

Compare `test_cache=off`, `node`, `vitest`, and `both` at a fixed runner size before combining winners. Run each enabled mode once to populate its cache and again to measure a warm restore. Include a source-changing revision and retain the automatic invalidation regression. Do not compare a cold eight-core job against a warm sixteen-core job.

Record complete job and gate times, cache restore/save time and bytes, test inventories, retries/failures, and summed allocated vCPU-minutes. Choose eight cores per job only when it reduces paid compute and still meets the whole-workflow green target. At equal per-core pricing, an eight-core job costs less if it finishes in less than twice the sixteen-core time; acceptable feedback latency is a separate requirement.

## Final handoff checks

- Fresh full lint, forcing both Turbo and ESLint execution: `Tasks: 7 successful, 7 total`; `Cached: 0 cached, 7 total`; `Time: 1m48.679s`.
- Full root typecheck reached `Tasks: 7 successful, 8 total`; `Cached: 3 cached, 8 total`, then failed in web on stale `.next-check/types/validator.ts` route references and two pre-existing untracked tests importing absent components. A temporary web configuration excluding only those generated types and the two incomplete tests passed with exit 0. The temporary configuration was removed; user files were preserved.
- Ordinary Knip reported five unused files inside pre-existing untracked workflow logs and unresolved imports in those same two tests. Knip with a temporary config excluding only those paths passed with exit 0. The repository Knip configuration was unchanged.
- Prettier: `All matched files use Prettier code style!`; `git diff --check`: exit 0. Agent guidance sync/check: exit 0. `actionlint` and `shellcheck` were unavailable; workflow syntax, routing and shell behavior were checked with the targeted validators described above.
- The full hosted test suite, all deployment modes and eight-core performance were not rerun locally. They require the pushed workflow; no CI speedup or cost reduction is claimed for this patch yet.
