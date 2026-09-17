# query-ast (server)

Server-only half of the query-builder AST module: the Kysely-based ClickHouse
compiler, validation passes, physical registry, execution context, and exec
integration, behind the `@langfuse/shared/src/server` export boundary. The
client-safe half (node types, predicate AST, builder sugar, semantic field
metadata, `FilterState` embedding) will land under
`packages/shared/src/query-ast/`.

This folder is a compile-only ClickHouse dialect on Kysely 0.28: real
`OperationNode`s for ARRAY JOIN, LIMIT BY, and metadata `indexOf` subscripts; a
mandatory tenancy injection pass keyed on `ExecutionContext`; per-table dedup
lowering from the registry; schema-typed selection; virtual views as WITH CTEs;
catalog parity.

Two audiences: **[Using it](#using-it)** if you are calling the compiler from a
repository, **[Developing the dialect](#developing-the-dialect)** if you are
changing how it emits SQL.

## Layout

- `compile.ts` — the one supported entry point,
  `compileClickhouseQuery(query, ctx)`, and the `ExecutionContext` re-export.
- `tenancy.ts` — the `ExecutionContext` type and the tenancy injection pass.
- `schema.ts` — the physical table registry: one `defineTable` declaration per
  relation drives the Kysely row types (`ClickHouseDatabase`), the runtime
  column-type map (`COLUMN_DATA_TYPES`), the tenanted-table set
  (`TENANTED_TABLES`), and the per-table dedup specs (`DEDUP_SPECS`) — instead
  of hand-maintained tables that drift.
- `compiler.ts` / `transformer.ts` / `dialect.ts` / `nodes.ts` — the dialect.
- `extensions.ts` — the `$call` helpers: `arrayJoin`, `mapKeys`, `mapValues`,
  `limitBy`, `metadataValue`.
- `catalog.ts` / `views.ts` / `dedup.ts` — catalog, virtual views as CTEs, and
  per-table dedup lowering.
- `catalog.golden.test.ts` — catalog SQL baselines.

The golden-SQL harness lives in `../repositories/goldenHarness.ts` (it captures
SQL at the `repositories/clickhouse.ts` exec seam in test mode, then normalizes
it via `clickhouse format` + positional param names for snapshot comparison — no
ClickHouse server needed). Each migrated call site keeps its SQL baseline next to
that call site, e.g. `../repositories/environments.golden.test.ts` and
`../queries/clickhouse-sql/event-filter-options.golden.test.ts`.

Regenerate baselines with `-u` after an intentional SQL change:

```
pnpm --filter @langfuse/shared run test src/server/query-ast -- -u
```

## CI and the `clickhouse format` version

The `*.golden.test.ts` suites need the `clickhouse` binary (the `format`
subcommand, shipped in `clickhouse-common-static`); without it they
`describe.skip`. The `tests-shared` CI job installs it pinned to **26.4.5.143** —
the ClickHouse version recommended for Langfuse v4, also pinned in
`scripts/codex/cloud_services.sh`.

`clickhouse format` output is version-sensitive (e.g. how `UNION ALL` branches
are parenthesized changed between 25.x and 26.x), so the committed snapshots are
coupled to that exact version. When bumping the CI pin, regenerate the snapshots
against the new binary in the same PR, or the golden tests drift.

The CI step is intentionally **non-blocking**: a drift surfaces as a warning
annotation but never fails the pipeline (`|| echo "::warning::"`). It selects
suites by the `.golden.test` name, so a suite must carry the `.golden.test.ts`
suffix to run there. Promote it to a required check once it has proven stable.

## Using it

- **Compile only through `compileClickhouseQuery(query, ctx)`.** It is the one
  supported path from a builder to `{ sql, params }`; the repository layer hands
  that to `queryClickhouse`. `ctx` (an `ExecutionContext` carrying `projectId`)
  is required — omitting it is a compile-time type error and an empty one throws.
- **Never filter `project_id` yourself.** The compile step injects
  `project_id = {projectId}` into every tenanted relation, so call sites pass
  only `{ projectId }` (see `../repositories/environments.ts`).
- **Dedup is declared per table and must be an existing production idiom.**
  `events_core` is `none` (immutable at read time — no LIMIT BY, no FINAL).
  `limitBy` is the legacy `ORDER BY <version> DESC LIMIT 1 BY <key>` already
  used on traces / observations / scores. `$call(limitBy(...))` remains for
  explicit non-version LIMIT BY.
- **Value binds take their ClickHouse type from the compared column** in the
  table registry (`total_cost > 1` emits `{p:Float64}`, not inferred
  `{p:Int64}`). Same-value binds still intern to one placeholder.
- **ClickHouse-only clauses use `$call(helper())`** — not fluent builder
  methods, so they compose inside CTEs, subqueries, and views. See the recipes
  below.

### Recipes

**Write an ARRAY JOIN** (`arrayJoin` + `mapKeys`/`mapValues` from `./extensions`):

```ts
db.selectFrom("observations")
  .select("environment")
  .$call(
    arrayJoin({
      cost_key: mapKeys("cost_details"),
      cost: mapValues("cost_details"),
    }),
  );
// … array join mapKeys(cost_details) as cost_key, mapValues(cost_details) as cost
```

**Write a LIMIT BY** (`limitBy`):

```ts
db.selectFrom("events_core")
  .select(["span_id", "project_id"])
  .orderBy("event_ts", "desc")
  .$call(limitBy({ count: 1, columns: ["span_id", "project_id"] }));
// … order by event_ts desc limit 1 by span_id, project_id
```

**Select a metadata value** (`metadataValue` — lowers `metadata[key]` to a bound `indexOf` subscript):

```ts
db.selectFrom("events_core as e")
  .select((eb) => [metadataValue("e", "my_key").as("my_val")])
  .where((eb) => eb(metadataValue("e", "my_key"), ">", 2));
// select metadata_values[indexof(e.metadata_names, {p:String})] as my_val …
```

## Developing the dialect

Several patterns here are deliberately unusual. This is the guide for anyone
**changing** how the builder emits SQL.

### How ClickHouse clauses land (no fork)

Kysely's `OperationNodeKind` union is closed, so a first-class node kind would
need a fork. Instead each ClickHouse-only construct rides as an extra field or a
special-cased node, and the compiler/transformer are overridden to emit and
preserve it:

| Clause             | How it lands                                                                                                                                                                                               | Fork? |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| ARRAY JOIN         | Plugin attaches `ArrayJoinNode` as an extra field on `SelectQueryNode`. `ClickHouseOperationNodeTransformer` preserves it. `ClickHouseQueryCompiler.visitSelectQuery` emits it after JOINs / before WHERE. | no    |
| LIMIT BY           | Plugin attaches `LimitByNode` the same way. Compiler emits it after ORDER BY / before LIMIT.                                                                                                               | no    |
| metadata `indexOf` | Helper builds an `ArrayIndexNode` whose index child is a `FunctionNode` (`indexOf`) over a bound `ValueNode` key. Transformer + compiler special-case the node. No plugin.                                 | no    |
| Virtual view       | Plugin rewrites `selectFrom(viewName)` into a WITH CTE. Outer types only expose the view's selected columns.                                                                                               | no    |

These are real node objects whose children are traced Kysely
`FunctionNode`/`ColumnNode`/`ValueNode`/`IdentifierNode` values — not `RawNode`
string splices. Any plugin using the default `OperationNodeTransformer` would
drop them, so ours overrides `transformSelectQuery` to keep them. Upstream is
not patched.

### Kysely never runs — it only compiles

`getClickhouseKysely()` returns a `Kysely` instance wired to a `DummyDriver`
with SQLite adapter/introspector stand-ins (`dialect.ts`). Nothing ever
connects or executes. The only supported output path is
`compileClickhouseQuery(query, ctx)` → `{ sql, params }`, which the repository
layer hands to `queryClickhouse`. Do **not** call `.execute()` / `.compile()`
directly: the compiler refuses any tree that did not go through the tenancy pass.

### Tenancy injection — how the choke point works

`compileClickhouseQuery(query, ctx)` is the only supported compile path, and it
is where tenancy is enforced:

1. A missing/empty `ExecutionContext` throws (`QueryCompileError`) — `ctx` is a
   required parameter, so omitting it is also a compile-time type error.
2. `TenancyInjectionPlugin` walks every FROM/JOIN and injects
   `project_id = {projectId}` on each tenanted physical table, unless the tree
   already carries a predicate that _proves_ that scope: the equality's value
   must equal the context project, and — when more than one tenanted relation is
   in scope — the column must be table-qualified. A qualified predicate covers a
   relation only when the qualifier matches its alias (if aliased) or its table
   name (if not) — so `scores AS traces` joined to `traces AS t` still scopes
   both. It then identity-stamps the tree (`WeakSet`); a copied
   `langfuseTenancy` property is not a valid stamp.
3. `DedupLoweringPlugin` applies the table's declared read idiom
   (`none` / `limitBy` / `final`). `events_core` is `none` — immutable at
   read time, so the pass does not inject LIMIT BY or FINAL. `limitBy` is
   the existing legacy `ORDER BY <version> DESC LIMIT 1 BY <key>`.
   `final` is fail-closed until an emitter exists. The pass restamps the
   rewritten root.
4. `ClickHouseQueryCompiler` refuses to emit SQL unless that identity stamp is
   present, so `qb.compile()` without the plugin also fails. Value binds take
   their ClickHouse type from the compared column's registry entry when one is
   in scope (`total_cost > 1` → `{p:Float64}`).
5. Raw-SQL table sources (`selectFrom(sql\`...\`)`) and raw fragments embedding a
   `SELECT`/`FROM`/`JOIN` in SELECT/WHERE throw `UnscopedRelationError`. Kysely's
   own keyword fragments (`asc`/`desc`) are not relations.

So query bodies here never filter `project_id` by hand — it is redundant, and
forgetting it is impossible.

### Why `$call(helper())`, not a fluent `.arrayJoin(...)` method

A real method would have to exist on _every_ builder instance, including the
native Kysely builders that `.with((qb) => …)`, subquery, and `defineView`
callbacks hand you. Getting that requires either forking Kysely's whole builder
graph or globally mutating its prototype via an internal `kysely/dist/...`
import (blocked here by Kysely's `exports` map under NodeNext). A curried helper
is a plain function of a builder, so it works in any of those positions — which
is exactly why ARRAY JOIN / LIMIT BY compose inside CTEs, subqueries, and views.
`composition.test.ts` locks that property in.

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

### Escape hatches and their cost

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

### The one Kysely-internals coupling (upgrade hazard)

`compiler.ts` wraps Kysely's **private** `visitNode` / `nodeStack` to dispatch
`ArrayIndexNode` (for `metadata[key]`), because it is not one of Kysely's closed
`OperationNode` kinds. Kysely is pinned to **0.28.17** for this reason. Re-verify
this hack on any Kysely bump; it is the single place that reaches past Kysely's
documented surface. Everything else (plugins, dialect, transformer overrides)
uses public or documented-protected API.

### Types are asserted at compile time

`types.assert.ts` holds `tsc`-only assertions (schema typing, view opacity,
arrayJoin widening, limitBy preservation). It is never run; `schema.test.ts`
anchors it so it stays in the build graph. `@ts-expect-error` lines there must
stay live.

### Verifying changes

```
CLICKHOUSE_BIN=clickhouse pnpm --filter @langfuse/shared run test src/server/query-ast
```

The `*.golden.test.ts` suites assert `compile(AST) ≡ referenceSQL` after
`clickhouse format`, so they need a local `clickhouse` binary and otherwise
`describe.skip`. `composition.test.ts` asserts on raw compiler output and runs
everywhere. After an intentional SQL change, regenerate golden baselines with
`-u` (see [Layout](#layout) above).
