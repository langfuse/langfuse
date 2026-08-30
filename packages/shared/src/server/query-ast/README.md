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
  `OperationNode`s for ARRAY JOIN, LIMIT BY, and metadata `indexOf`
  subscripts; a mandatory tenancy injection pass keyed on `ExecutionContext`;
  schema-typed selection (TS + runtime validation); virtual views as WITH
  CTEs; catalog parity. Library-specific code lives only in this folder.
- `kysely/schema.ts` — the physical table registry: one `defineTable`
  declaration per relation drives all three downstream views — the Kysely row
  types (`ClickHouseDatabase`), the runtime column-type map the type-check pass
  consults (`COLUMN_DATA_TYPES`), and the set the tenancy pass scopes
  (`TENANTED_TABLES`) — instead of three hand-maintained tables that drift.

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

## Using it

- **Compile only through `compileClickhouseQuery(query, ctx)`.** It is the one
  supported path from a builder to `{ sql, params }`; the repository layer hands
  that to `queryClickhouse`. `ctx` (an `ExecutionContext` carrying `projectId`)
  is required — omitting it is a compile-time type error and an empty one throws.
- **Never filter `project_id` yourself.** The compile step injects
  `project_id = {projectId}` into every tenanted relation, so call sites pass
  only `{ projectId }` (see `repositories/environments.ts`).
- **ClickHouse-only clauses use `$call(helper())`** — not fluent builder
  methods, so they compose inside CTEs, subqueries, and views. See the recipes
  below.

### Recipes

**Write an ARRAY JOIN** (`arrayJoin` + `mapKeys`/`mapValues` from `./kysely/extensions`):

```ts
db.selectFrom("observations")
  .select("environment")
  .$call(arrayJoin({ cost_key: mapKeys("cost_details"), cost: mapValues("cost_details") }));
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

For how ARRAY JOIN / LIMIT BY / metadata nodes are implemented without forking
Kysely, how tenancy injection works internally, the escape hatches, and the
Kysely-internals upgrade hazard, see the developer guide in
[`kysely/README.md`](kysely/README.md).
