# ClickHouse Best Practices

Start with `SKILL.md` for the ClickHouse review workflow, rule-selection
process, and response format. This file exists as a concise compatibility
entrypoint for agents that open `AGENTS.md` directly.

Detailed rules live in `rules/`. Read only the rule files that match the schema,
query, or ingestion issue under review, and cite the specific rule names in
responses.

## Langfuse-Specific Rules

- Use `packages/shared/src/server/queries/clickhouse-sql/event-query-builder.ts`
  for queries against the `events` table. Do not hand-roll `events` SQL unless
  you first confirm the query builder cannot express the query.
- Never use `FINAL` on the `events` table; it is designed so `FINAL` is not
  required and the keyword hurts performance.

## Rule Index

### Schema Design

- `rules/schema-pk-plan-before-creation.md`
- `rules/schema-pk-cardinality-order.md`
- `rules/schema-pk-prioritize-filters.md`
- `rules/schema-pk-filter-on-orderby.md`
- `rules/schema-types-native-types.md`
- `rules/schema-types-minimize-bitwidth.md`
- `rules/schema-types-lowcardinality.md`
- `rules/schema-types-enum.md`
- `rules/schema-types-avoid-nullable.md`
- `rules/schema-partition-start-without.md`
- `rules/schema-partition-low-cardinality.md`
- `rules/schema-partition-query-tradeoffs.md`
- `rules/schema-partition-lifecycle.md`
- `rules/schema-json-when-to-use.md`

### Query Optimization

- `rules/query-join-choose-algorithm.md`
- `rules/query-join-consider-alternatives.md`
- `rules/query-join-filter-before.md`
- `rules/query-join-null-handling.md`
- `rules/query-join-use-any.md`
- `rules/query-index-skipping-indices.md`
- `rules/query-mv-incremental.md`
- `rules/query-mv-refreshable.md`

### Insert Strategy

- `rules/insert-batch-size.md`
- `rules/insert-async-small-batches.md`
- `rules/insert-format-native.md`
- `rules/insert-mutation-avoid-delete.md`
- `rules/insert-mutation-avoid-update.md`
- `rules/insert-optimize-avoid-final.md`
