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
