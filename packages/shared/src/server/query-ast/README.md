# query-ast (server)

Server-only half of the query-builder AST module. This branch is the
**hypequery arm** of the library-evaluation probe: ClickHouse queries are
built as walkable hypequery nodes, then compiled through a mandatory
tenancy choke point.

The client-safe half (node types, predicate AST, builder sugar, semantic
field metadata, `FilterState` embedding) will land under
`packages/shared/src/query-ast/`.

## What's here

- `goldenHarness.ts` — captures SQL at the `repositories/clickhouse.ts` exec
  seam in test mode, then normalizes it (`clickhouse format` + positional param
  names) for snapshot comparison. No ClickHouse server needed.
- `environments.golden.test.ts` — baselines `environments.getEnvironmentsForProject`
  (both write-mode branches × the timestamp bound). Once that repository
  compiles from the AST, it must reproduce these snapshots.
- `db.ts` / `schema.ts` — compile-only `@hypequery/clickhouse` builder over
  traced physical tables. `.execute()` is disabled; SQL leaves through
  `compile()`.
- `compile.ts` — **the tenancy choke point**. Requires `ExecutionContext.projectId`.
  Injects `project_id` onto every tenant table scan. An unscoped compile
  throws `UnscopedQueryError`.
- `plan.ts` — `union-all` is our node. hypequery stores `unionQueries` as
  `string[]`, which this arm does not use.
- `catalog.ts` + `catalog.parity.test.ts` — frozen catalog sample;
  `compile(AST) ≡ referenceSQL` after `clickhouse format`.
- `nodes.test.ts` — ARRAY JOIN and LIMIT BY are kind-tagged walkable nodes.

Regenerate environment baselines with `-u` after an intentional SQL change:

```
pnpm --filter @langfuse/shared run test src/server/query-ast -- -u
```

## Cost of no transformer

hypequery clones a `queryTransforms` array on the builder and applies it in
`toQueryNode()`, but the array is **private** and there is no public
`transform()` / plugin API. Mandatory tenancy therefore lives in our
`compile()` wrapper, not in the library.

`builder.toSQL()` still bypasses injection. Making that unbypassable would
require forking hypequery, patching `QueryBuilder`, or wrapping every
builder so `toSQL`/`execute` are removed. This arm wraps the compiler.

## Type-system friction

- `createQueryBuilder<Schema>` does not take the schema at runtime; column
  tracing is TypeScript-only.
- `DateTime64(n)` infers as `string`, so time bounds need `dateParam(Date)`
  to type-check while still storing a JS `Date` on the node.
- `.select()` narrows `WhereColumn` to the output row, so filters must be
  applied before select.
- `SelectQueryNode` is not exported from the package root, so this arm
  describes a structural subset and erases builder generics at `compile()`.
