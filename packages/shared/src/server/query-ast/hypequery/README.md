# query-ast (server) — hypequery arm

This folder is the **hypequery** library-evaluation arm. ClickHouse queries
are built as walkable hypequery nodes, then compiled through a mandatory
tenancy choke point. The WP0 golden harness stays one level up in
`../goldenHarness.ts`.

The client-safe half (node types, predicate AST, builder sugar, semantic
field metadata, `FilterState` embedding) will land under
`packages/shared/src/query-ast/`.

## What's here

- `db.ts` / `schema.ts` — compile-only `@hypequery/clickhouse` builder over
  traced physical tables. `.execute()` is disabled; SQL leaves through
  `compile()`.
- `compile.ts` — **the tenancy choke point**. Requires `ExecutionContext.projectId`.
  Injects `project_id` onto every tenant table scan. An unscoped compile
  throws `UnscopedQueryError`.
- `plan.ts` — `union-all` and `view-query` are our nodes. hypequery stores
  `unionQueries` as `string[]` and `withCTE` as a stringified `toSQL()`
  fragment; this arm does not use either.
- `catalog.ts` + `catalog.parity.test.ts` — frozen catalog sample;
  `compile(AST) ≡ referenceSQL` after `clickhouse format`.
- `nodes.test.ts` — ARRAY JOIN and LIMIT BY are kind-tagged walkable nodes.
- `metadata.ts` — Condition 7b: `indexOf` + array subscript as real nodes.
- `views.ts` — Condition 8: named view as a black-box relation.
- `validate.ts` — Condition 7: runtime pass for aggregations hypequery types
  do not reject.

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

The same wrap is how Conditions 7b and 8 land: hypequery has no subscript /
`indexOf` node, and `withCTE` stringifies via `toSQL()` (unscoped). Neither
is a plugin or a fork.

## Type-system friction

- `createQueryBuilder<Schema>` does not take the schema at runtime; column
  tracing is TypeScript-only (`state.base` is `{}`).
- `DateTime64(n)` infers as `string`, so time bounds need `dateParam(Date)`
  to type-check while still storing a JS `Date` on the node.
- `.select()` narrows `WhereColumn` to the output row, so filters must be
  applied before select.
- `SelectQueryNode` is not exported from the package root, so this arm
  describes a structural subset and erases builder generics at `compile()`.
- `sum()` is typed over any `SelectableColumn`, including String. Condition 7
  catches that in `validate.ts` at compile time.
- Filter `eq` is `T | string`, so comparing a numeric column to a string is
  not a TS error. Comparing a DateTime64 (typed string) to a number is.
