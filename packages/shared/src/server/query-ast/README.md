# query-ast (server)

Server-only half of the query-builder AST module. Compiler,
validation passes, physical registry, execution context, exec integration, and
golden-check test utils live here, behind the `@langfuse/shared/src/server`
export boundary. The client-safe half (node types, predicate AST, builder
sugar, semantic field metadata, `FilterState` embedding) will land under
`packages/shared/src/query-ast/`.

## What's here today

Only the golden-SQL harness — the thing every later migration is tested
against:

- `goldenHarness.ts` — captures SQL at the `repositories/clickhouse.ts` exec
  seam in test mode, then normalizes it (`clickhouse format` + positional param
  names) for snapshot comparison. No ClickHouse server needed.
- `environments.golden.test.ts` — baselines the current SQL shapes of
  `environments.getEnvironmentsForProject` (both write-mode branches × the
  timestamp bound). This is the tier-0 exit target for the spike: once
  `environments.ts` compiles from the AST, it must reproduce these snapshots.

Regenerate baselines with `-u` after an intentional SQL change:

```
pnpm --filter @langfuse/shared run test src/server/query-ast -- -u
```

## CI and the `clickhouse format` version

These tests need the `clickhouse` binary (the `format` subcommand, shipped in
`clickhouse-common-static`); without it they `describe.skip`. The `tests-shared`
CI job installs it pinned to **26.4.5.143** — the ClickHouse version recommended
for Langfuse v4, also pinned in `scripts/codex/cloud_services.sh`.

`clickhouse format` output is version-sensitive (e.g. how `UNION ALL` branches
are parenthesized changed between 25.x and 26.x), so the committed snapshots are
coupled to that exact version. When bumping the CI pin, regenerate the snapshots
against the new binary in the same PR, or the golden tests drift.

The CI step is intentionally **non-blocking**: a drift surfaces as a warning
annotation but never fails the pipeline (`|| echo "::warning::"`). Promote it to
a required check once it has proven stable.
