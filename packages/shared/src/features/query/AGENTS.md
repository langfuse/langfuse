# Agent Guidelines for the dashboard query feature

The view registry, query DSL and builder behind dashboards, the Metrics API, the MCP metrics tools and monitors (`@langfuse/shared/query`).

**New views compile through the query AST.** Build a new view's SQL with the Kysely builder and `compileClickhouseQuery`, like the v2 observations view. Do not add a view to the SQL-text path (`buildSqlText`), and do not copy the `sql` strings or `@@AGGn@@` templates of the other views in `dataModel.ts`: those are the legacy builder's input and are being moved off.

## Layout

- `types.ts`: the query DSL (`query`, `QueryType`), the view declaration schema (`viewDeclaration`) and the view enums (`views`, `viewsV2`).
- `dataModel.ts`: client-safe view declarations: names, descriptions, types, units, and the `sql` strings the SQL-text builder reads. The web client imports it, so it holds no server code.
- `validateQuery.ts`: pre-flight checks shared by every caller.
- `server/queryBuilder.ts`: `QueryBuilder.build()` sends each declaration in `AST_VIEWS` to the `AstView` that serves it, and every other view to `buildSqlText`, the SQL-text path. It only dispatches. The server barrel exports only `QueryBuilder` from the query modules.
- `server/astViewQuery.ts`: `AstView`, what one AST view declares (filter lowering, relations, plan and level, source, dimension and measure selections, bucket values, the inner select's keys), and `defineAstView`, which runs the steps every AST view shares in one order. `astViewQuery.test.ts` freezes the list of declarations still on `buildSqlText`.
- `server/sqlTextQuery.ts`: `buildSqlText`, the SQL-text path for every other view and version: joins, `FilterList` filters, the inner, outer and single-level selects, WITH FILL, ORDER BY and LIMIT, assembled from the `sql` strings of `dataModel.ts`. It is the only query module that imports the SQL-text filter builder (`FilterList`, `clickhouse-filter`).
- `server/viewQuerySteps.ts`: the steps every view path shares (dimension, metric, bucket and order-by mapping, filter and relation validation) and the AST-only ones (outer select and clauses, aggregates, compile). It imports nothing from the SQL-text builder (`FilterList`, `clickhouse-filter`); it does read the filter-type table `filterTypeCompatibility`, which lives in `queries/clickhouse-sql/` and imports only types.
- `server/eventsObservationsQuery.ts`: `eventsObservationsAstView`, the v2 observations view's query on the AST.
- `server/eventsTracesQuery.ts`: `eventsTracesAstView`, the v2 traces view's query on the AST: one row per trace in the inner select, and the root-event condition.
- `server/scoresQuery.ts`: `scoresAstView`, the v2 score views' query on the AST.
- `server/eventsObservationsRegistry.ts`: the AST view to copy. Each dimension and measure of `eventsObservationsView` as a typed expression over `e`, keyed by the declaration's names, plus how a filter compares each dimension and the `scores` join.
- `server/eventsTracesRegistry.ts`: the same for `eventsTracesView`, plus each dimension's per-trace value (the declaration's `aggregationFunction`), the `name` filter's pruning columns and the measures' aggregation overrides.
- `server/queryExecutor.ts`: runs a built query. It picks the `EventsReadOnly` pool when the compiled SQL names `events_core` or `events_full`, and sets tags and ClickHouse settings.

## Adding a view

1. **Table.** Add the table to the registry in `../../server/query-ast/schema.ts` (`defineTable`), with column types taken from the latest ClickHouse migration: `Nullable(…)` kept, `LowCardinality(T)` registered as `T`. A type `ChColumnType` lacks gets a member there, a branch in `TsTypeOfColumn`, and entries in `RUNTIME_TYPE` and `BIND_TYPE`. Declare its `dedup`: `none` for immutable or append-only tables, `limitBy` for a ReplacingMergeTree read the way production already reads it. Tenancy defaults on; the compiler adds `project_id` for you.
2. **Declaration.** Add the view to `dataModel.ts` and the enums in `types.ts`. `viewDeclaration` still requires `sql` on every dimension and measure. An AST view never executes it: set `alias` on every entry (the AST path names outputs `alias ?? sql`) and set `sql` to the SQL the registry entry renders.
3. **Registry.** Add a server-only `server/<view>Registry.ts` with one typed expression per dimension and measure, keyed by the declaration's names and reading the base relation under one alias. Model it on `eventsObservationsRegistry.ts`: `templateMeasure` with `aggregationSlot` replaces `@@AGGn@@` (the slots are type-checked against `aggs`), and the dimension helpers there carry the filter lowering.
4. **Build.** Declare the view with `defineAstView` in `server/<view>Query.ts`, listing its declarations in `serves`, and add it to `AST_VIEWS` in `server/queryBuilder.ts`; move its entry in `astViewQuery.test.ts` off the SQL-text list. The driver runs the shared steps (mapping, bucketing, required dimensions, filter validation, relation check, order-by, outer clauses, compile); the spec supplies only what differs. `lowerFilter` gets the column `resolveFilterColumn` resolved (time dimension, `metadata` or a dimension) and lowers it through the view's registry: the events views through the registry's `filter` entries (`EventsFieldLowering`), the score views through a `FieldLowering` that `lowerFieldCondition` applies. Time-dimension filters reach `lowerFilter` too; the driver adds no time predicate, `source` applies `window`. `dimension` aliases its output `dimensionAlias(d)`; at level `two`, `measure` returns one value per entity row (`atLevel` for a row column, a per-entity aggregate as it is). `serves` matches by object identity, so list the `dataModel.ts` declarations themselves. `relations` defaults to the output's relations; `plan` returns the level (`levelIfAllowed` when `canUseSingleLevelQuery` is the only rule) and whatever the source needs. The entry hooks get the select's builder, typed over the base relation; an entry that reads a joined relation builds a builder with that relation by name, as `countScores` does. The `ast*` helpers of one view are typed for it; move one to `viewQuerySteps.ts` and generalize it rather than copy it.
5. **Wiring outside the SQL.** Check every reader of the view name: the Prisma enums for persisted widgets and monitors (`DashboardWidgetViews`, `MonitorView`), `web/src/features/dashboard/lib/dashboardUiTableToViewMapping.ts`, the Metrics API types and Fern definitions, and the MCP metrics schema tool.
6. **Tests.** A `server/queryBuilder.<view>.golden.test.ts` suite pins the SQL, one case per query shape (see the header of `queryBuilder.v2-observations.golden.test.ts` for what counts as a shape). Add one execution test against ClickHouse only for behavior the SQL snapshot can't show. Follow the root `AGENTS.md` test policy.

## Rules for AST views

The compiler's rules live in `../../server/query-ast/README.md` ("Using it") and its standing decisions in `../../server/query-ast/DECISIONS.md`. The ones dashboard code runs into:

- Compile only through `compileClickhouseQuery(query, projectId)`. Never filter `project_id` by hand, and never call `.compile()` or `.execute()`.
- No raw SQL: `` sql`…` ``, `sql.raw` and `sql.lit` fail to compile. A missing ClickHouse construct becomes a helper in `../../server/query-ast/extensions.ts`, or an `ALLOWED_FUNCTIONS` entry in `functions.ts` for `eb.fn`. Never paste SQL text from `dataModel.ts` or the SQL-text builder into an AST query, and import nothing from the SQL-text builder into AST modules.
- Read events through the logical relations: `events_truncated` for dashboard dimensions (the truncated copy `events_core` holds), `events` for full values. Routing picks `events_core` or `events_full`; naming either physical table is a compile error.
- Qualify every column in a select that reads more than one relation (a view with a join). ClickHouse binds a bare column to the left-most relation that has it, so the compiler rejects bare columns there.
- Bind caller values. Use `literal(...)` only for code constants, never for user input. Bind dates as JS `Date` values.
- Leave dedup to the registry; don't add FINAL or LIMIT BY in a view. The observations view opts the `scores` join into FINAL with `$call(useFinal(["scores"]))`.
- A helper that takes a column takes an `Expression<T>` (`eb.ref("e.col")`), never a column-name string. Group and order by a SELECT alias with `aliasRef(...)`.
- Don't cast or `@ts-expect-error` a query past the types. Add the missing column to the registry or the missing helper instead.
- Registry types are logical, not wire types: rows arrive as JSON (dates as strings). Parse results with a read schema, not the builder's `InferResult`.
