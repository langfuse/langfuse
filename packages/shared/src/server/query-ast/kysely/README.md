# kysely/ — compile-only ClickHouse dialect: patterns & gotchas

This folder adapts Kysely to emit ClickHouse SQL. Several patterns here are
deliberately unusual — this guide is for anyone editing the folder. For the
custom-node mechanics (ARRAY JOIN / LIMIT BY / metadata nodes) and the tenancy
choke point, see [`../README.md`](../README.md); this file covers the rest.

## Kysely never runs — it only compiles

`getClickhouseKysely()` returns a `Kysely` instance wired to a `DummyDriver`
with SQLite adapter/introspector stand-ins (`dialect.ts`). Nothing ever
connects or executes. The only supported output path is
`compileClickhouseQuery(query, ctx)` → `{ sql, params }`, which the repository
layer hands to `queryClickhouse`. Do **not** call `.execute()` / `.compile()`
directly: the compiler refuses any tree that did not go through the tenancy
pass (see `../README.md`).

## Never write `project_id` — it is injected

Query bodies here do not filter `project_id`. `compileClickhouseQuery` requires
an `ExecutionContext` and injects `project_id = {projectId}` into every tenanted
relation as the leading predicate. Writing it by hand is redundant and
discouraged; forgetting it is impossible (compile throws). This is why call
sites like `repositories/environments.ts` pass only `{ projectId }` and never a
`.where("project_id", …)`.

## ClickHouse-only clauses use `$call(helper())`, not builder methods

ARRAY JOIN and LIMIT BY are applied through curried helpers, invoked with
Kysely's public `$call`:

```ts
db.selectFrom("observations")
  .select("environment")
  .$call(arrayJoin({ cost_key: mapKeys("cost_details"), cost: mapValues("cost_details") }))

db.selectFrom("events_core")
  .select(["span_id", "project_id"])
  .orderBy("event_ts", "desc")
  .$call(limitBy({ count: 1, columns: ["span_id", "project_id"] }))
```

**Why `$call(...)` and not a fluent `.arrayJoin(...)` method:** a real method
would have to exist on _every_ builder instance, including the native Kysely
builders that `.with((qb) => …)`, subquery, and `defineView` callbacks hand you.
Getting that requires either forking Kysely's whole builder graph or globally
mutating its prototype via an internal `kysely/dist/...` import (blocked here by
Kysely's `exports` map under NodeNext). A curried helper is a plain function of
a builder, so it works in any of those positions — which is exactly why ARRAY
JOIN / LIMIT BY compose inside CTEs, subqueries, and views. `composition.test.ts`
locks that property in.

**`arrayJoin` widens the row type.** Each `{ alias: arrayExpr }` entry is added
to the builder's output row, so an outer query over a CTE body can reference the
produced column and a typo on the alias is a compile error. The element _value_
type is `unknown`: Kysely's `Expression<T>` hides its type argument from
inference. Precise value types would need a branded array-expression wrapper on
`mapKeys` / `mapValues` / etc. — not done yet. `types.assert.ts` pins the
widening behavior.

**`arrayJoin` (clause) ≠ `arrayJoin()` (function).** ClickHouse has both. The
helper here builds the ARRAY JOIN _clause_. The row-expanding SELECT _function_
is just `eb.fn("arrayJoin", [...])`.

## Escape hatches and their cost

- `sql.ref("alias")` — the only way to reference a SELECT alias that is not a
  schema column (ClickHouse allows `GROUP BY`/expression reuse of aliases;
  Kysely's types do not model it). It is fully untyped — a typo reaches
  ClickHouse unchecked. Use sparingly.
- `eb.fn("ch_function", [...])` — arbitrary ClickHouse functions. The name is an
  unchecked string and the return type defaults to `unknown`; no arity or
  return checking.
- New columns — add them to the table registry in `schema.ts` (one `defineTable`
  entry per relation) as queries need them. That single declaration drives the
  row types, the runtime column-type map, and the tenanted-table set.

## The one Kysely-internals coupling (upgrade hazard)

`compiler.ts` wraps Kysely's **private** `visitNode` / `nodeStack` to dispatch
`ArrayIndexNode` (for `metadata[key]`), because it is not one of Kysely's closed
`OperationNode` kinds. Kysely is pinned to **0.28.17** for this reason. Re-verify
this hack on any Kysely bump; it is the single place that reaches past Kysely's
documented surface. Everything else (plugins, dialect, transformer overrides)
uses public or documented-protected API.

## Types are asserted at compile time

`types.assert.ts` holds `tsc`-only assertions (schema typing, view opacity,
arrayJoin widening, limitBy preservation). It is never run; `schema.test.ts`
anchors it so it stays in the build graph. `@ts-expect-error` lines there must
stay live.

## Verifying changes

```
CLICKHOUSE_BIN=clickhouse pnpm --filter @langfuse/shared run test src/server/query-ast
```

`catalog.test.ts` and the golden tests assert `compile(AST) ≡ referenceSQL`
after `clickhouse format`, so they need a local `clickhouse` binary and
otherwise `describe.skip` (they do not yet run in shared CI — a binary in that
job is a tracked follow-up). `composition.test.ts` asserts on raw compiler
output and runs everywhere. After an intentional SQL change, regenerate golden
baselines with `-u` (see `../README.md`).
