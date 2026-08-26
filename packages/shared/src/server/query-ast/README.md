# query-ast (server)

Server-only half of the query-builder AST module. Compiler,
validation passes, physical registry, execution context, exec integration, and
golden-check test utils live here, behind the `@langfuse/shared/src/server`
export boundary. The client-safe half (node types, predicate AST, builder
sugar, semantic field metadata, `FilterState` embedding) will land under
`packages/shared/src/query-ast/`.

## What's here today

- `goldenHarness.ts` — captures SQL at the `repositories/clickhouse.ts` exec
  seam in test mode, then normalizes it (`clickhouse format` + positional param
  names) for snapshot comparison. No ClickHouse server needed.
- `environments.golden.test.ts` — baselines `environments.getEnvironmentsForProject`
  (both write-mode branches × the timestamp bound).
- `kysely/` — compile-only ClickHouse dialect on Kysely 0.28. Real
  `OperationNode`s for ARRAY JOIN and LIMIT BY, a mandatory tenancy injection
  pass keyed on `ExecutionContext`, and `compileClickhouseQuery` as the choke
  point.

Regenerate baselines with `-u` after an intentional SQL change:

```
pnpm --filter @langfuse/shared run test src/server/query-ast -- -u
```

## Kysely extension record (no fork)

| Clause | How it lands | Fork? |
| --- | --- | --- |
| ARRAY JOIN | Plugin attaches `ArrayJoinNode` as an extra field on `SelectQueryNode`. `ClickHouseOperationNodeTransformer` preserves it. `ClickHouseQueryCompiler.visitSelectQuery` emits it after JOINs / before WHERE. | no |
| LIMIT BY | Plugin attaches `LimitByNode` the same way. Compiler emits it after ORDER BY / before LIMIT. | no |

Honest node-vs-raw-SQL note: ARRAY JOIN / LIMIT BY are real node objects (`kind: ArrayJoinNode` / `LimitByNode`) whose children are traced Kysely FunctionNode/ColumnNode/ValueNode/IdentifierNode values — not `RawNode` string splices. Kysely's `OperationNodeKind` union is closed, so a first-class visitor-map kind would need a fork; instead they ride as extra fields on `SelectQueryNode`. Any plugin that uses the default `OperationNodeTransformer` would drop them — ours overrides `transformSelectQuery` so they survive. Upstream was not patched.

## Tenancy choke point

`compileClickhouseQuery(query, ctx)` is the only supported compile path:

1. Missing `ExecutionContext` throws (`QueryCompileError`).
2. `TenancyInjectionPlugin` walks every FROM/JOIN, injects `project_id = {projectId}` on tenanted physical tables that lack it, stamps the tree.
3. `ClickHouseQueryCompiler` refuses to emit SQL without that stamp, so `qb.compile()` without the plugin also fails.
4. Raw-SQL table sources (`selectFrom(sql\`...\`)`) throw `UnscopedRelationError` — the escape hatch cannot introduce an unscoped relation.
