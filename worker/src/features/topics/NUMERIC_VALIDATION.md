# Numerical backend replacement validation

Checked 2026-09-17 with `holomap=0.3.0`, `hdbscan-rs=0.6.1`, Rust 1.98.
The replacement is suitable for the local PoC. It is not numerically identical
to the previous backend, and these synthetic cohorts do not establish production
topic quality.

## Comparison before removing the reference implementation

Replayed saved facet-summary embeddings through the original Python implementation
and the actual Node child / NAPI path. Both results went through the unchanged
TypeScript prototype builder and serving classifier. Compared assignments after
aligning cluster labels; compared neighborhoods rather than raw 2D positions.
No summary, embedding, or naming API calls were made.

| Saved cohort                                          | Same final assignment | Topics, reference → Rust | Outliers, reference → Rust | Final adjusted Rand index |
| ----------------------------------------------------- | --------------------- | ------------------------ | -------------------------- | ------------------------- |
| Intent, 100 summaries                                 | 99/100                | 4 → 4                    | 6 → 6                      | 0.9700                    |
| Intent, alternate 100-summary revision                | 100/100               | 4 → 4                    | 6 → 6                      | 1.0000                    |
| Intent, 12-summary smoke                              | 12/12                 | 3 → 3                    | 0 → 0                      | 1.0000                    |
| Intent, 15-summary smoke                              | 15/15                 | 3 → 3                    | 0 → 0                      | 1.0000                    |
| Issues, 84 applicable summaries, exploratory settings | 68/84                 | 6 → 6                    | 15 → 16                    | 0.7161                    |

The two 100-summary cohorts are revisions of the same seeded trace population,
not independent datasets. All five fits produced exactly repeatable labels and
coordinates on macOS arm64. The existing continuity matcher preserved all four
main Intent IDs, all three small-cohort Intent IDs, and four of six Issues IDs.
The three later traces outside the 12-summary discovery cohort received the same
assignments under both classifiers. Naming evidence uses every final member, so
its membership changes exactly with these assignments; model naming was not rerun.

The Issues difference is material. Rust creates a coherent four-member group of
code-validation fixes, where the reference rejected those summaries. It also
rejects more timeout examples and retains a mixed billing/data-access group.
Using the seeder's known failure categories, assigned-cluster majority purity is
85.3% versus 87.0% for the reference (58/68 versus 60/69). This is an imperfect
diagnostic, not a definition of the facet's desired topics. Both implementations
also inherit false-positive applicable summaries such as successful requests.
The observed tradeoff is acceptable for exploration, not proof of equivalent
production behavior.

Five-neighbor map trustworthiness (original cosine space; 1 is best):
main Intent 0.9599 → 0.9611, alternate Intent 0.9626 → 0.9566, Issues
0.9041 → 0.9359. Both small-cohort scores improved. No exact layout parity is
expected across random-number generators and floating-point implementations.

Additional full-pipeline numerical fixtures matched reference grouping exactly
(adjusted Rand index 1.0): 1,002 vectors in two separated populations, three
populations plus diffuse points, identical vectors, and insufficient population.
Both backends clustered the diffuse points as a fourth group; this fixture does
not establish correct outlier rejection. The real worker integration test also
fits 1,002 vectors and assigns held-out centers using the resulting prototypes.

Raw local comparison harness/results were retained outside the repository at
`/tmp/langfuse-topics-native-validation`; the retired environment is archived
there for reference. No trace data is included in this document.

## Repeatable checks

```sh
pnpm --filter @langfuse/native run lint
pnpm --filter @langfuse/native run build
pnpm --filter @langfuse/native exec cargo test --features napi/dyn-symbols topics
env -u RUST_LOG pnpm --filter worker run test features/topics nativeHello
pnpm exec turbo run lint typecheck --force
pnpm exec knip
```

Clear `RUST_LOG` for the hello logging test: an ambient override otherwise masks
the test's requested debug level. Native numerical tests need the compiled addon.
The child-process tests cover deadline termination, output limits, errors, and
serialization failure before allocating a process;
pipeline tests cover frozen cohorts and reuse of accepted fits on retry.

Observed checks: Rust `5 passed; 0 failed`; worker Topics plus native health tests
`68 passed (68)`; forced lint/typecheck `16 successful, 16 total`,
`0 cached, 16 total`; Knip and agent-guidance checks exited successfully.

The final Linux arm64 worker Docker image built successfully with the existing
Dockerfile. Under Node 24, all five saved cohorts produced the same final
assignments as macOS, the image's `/api/health` route returned HTTP 200 against
local Postgres/Redis, and fitting succeeded with no Python executable present.
The health smoke mounted the packaged API router without starting competing queue
consumers. A separate `pnpm deploy --prod` artifact also fitted successfully
without development source files. No deployment to a shared environment occurred.

The final native source also built for Linux amd64 musl with Rust 1.98.0. Its
Node 24.21.0 smoke passed loading, seeded fitting, repeatability, finite projection,
minimum-population, identical-input and invalid-vector checks. All five saved
cohorts also produced the same final assignments as macOS using that addon and
the compiled serving classifier. This was an addon container check; the full
worker-image and health checks above ran on arm64.

Exact nearest-neighbor search remains quadratic, with the existing 120-second
process deadline. There is no new trace-count cap. Larger representative cohorts
and production load still need evaluation before expanding deployment.
