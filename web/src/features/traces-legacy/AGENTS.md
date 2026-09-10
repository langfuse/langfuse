# Agent Guidelines for `traces-legacy`

Frozen snapshot of the trace detail view as of 2026-09-10, copied from
`src/features/traces`.

- Rendered when the internal `updatedTraceView` feature flag is OFF.
  `src/features/traces` is rendered when it is ON.
- Do not add features, fix bugs, or refactor here. Change
  `src/features/traces` instead; this tree only exists so the old view stays
  reachable while the updated one is built.
- Tests, stories, and docs were deliberately not copied.
- Delete this whole folder when the `updatedTraceView` flag is removed.
