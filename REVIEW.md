# Code Review Instructions

## Database Migrations

### ClickHouse

- ClickHouse migrations in the `packages/shared/clickhouse/migrations/clustered` directory should include `ON CLUSTER default` and should use `Replicated` merge tree table types.
  - E.g. `ReplacingMergeTree` is likely an error while `ReplicatedReplacingMergeTree` would be correct in most cases.
- ClickHouse migrations in the `packages/shared/clickhouse/migrations/unclustered` directory must not include `ON CLUSTER` statements and must not use `Replicated` merge tree table types.
- Migrations in `packages/shared/clickhouse/migrations/clustered` should match their counterparts in `packages/shared/clickhouse/migrations/unclustered` aside from the restrictions listed above.
- When adding new indexes on ClickHouse, ensure that there is a corresponding `MATERIALIZE INDEX` statement in the same migration. The materialization can use `SETTINGS mutations_sync = 2` if they operate on smaller tables, but may timeout otherwise.

### Postgres

- Most `schema.prisma` changes should produce a change in `packages/shared/prisma/migrations`.
