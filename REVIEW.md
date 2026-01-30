# Code Review Instructions

## Database Migrations

### ClickHouse

- ClickHouse migrations in the `packages/shared/clickhouse/migrations/clustered` directory should include `ON CLUSTER default` and should use `Replicated` merge tree table types.
  - E.g. `ReplacingMergeTree` is likely an error while `ReplicatedReplacingMergeTree` would be correct in most cases.
- ClickHouse migrations in the `packages/shared/clickhouse/migrations/unclustered` directory must not include `ON CLUSTER` statements and must not use `Replicated` merge tree table types.
- Migrations in `packages/shared/clickhouse/migrations/clustered` should match their counterparts in `packages/shared/clickhouse/migrations/unclustered` aside from the restrictions listed above.
- When adding new indexes on ClickHouse, ensure that there is a corresponding `MATERIALIZE INDEX` statement in the same migration. The materialization can use `SETTINGS mutations_sync = 2` if they operate on smaller tables, but may timeout otherwise.
- All ClickHouse queries on project-scoped tables (traces, observations, scores, events, sessions, etc.) must include `WHERE project_id = {projectId: String}` filter to ensure proper tenant isolation and that queries only access data from the intended project.
- For operations on the `events` table, you must never use the `FINAL` keyword as it kills performance. `events` is built so that `FINAL` is never required.

### Postgres

- Most `schema.prisma` changes should produce a change in `packages/shared/prisma/migrations`.
- All Prisma queries on project-scoped tables must include `projectId` in the WHERE clause (e.g., `where: { id: traceId, projectId }`) to ensure proper tenant isolation and that queries only access data from the intended project.

### Environment Variables

- Environment variables should be imported from the `env.mjs/ts` file of the respective package and not from `process.env.*` to ensure validation and typing.

## Redis Invocations

- Highlight usage of `redis.call` invocations. Those may have suboptimal redis cluster routing and will raise errors. Instead, use the native call patterns.
  Example: `await redis?.call("SET", key, "1", "NX", "EX", TTLSeconds);` should use `await redis?.set(key, "1", "EX", TTLSeconds, "NX");` instead.

## Langfuse Cloud

- When attempting to confirm if the current environment is Langfuse Cloud in the frontend, use the `useLangfuseCloudRegion` hook and never environment variables directly.

## Banner Height System

- Use `top-banner-offset` instead of `top-0` for any elements that are positioned `sticky`, `fixed`, or `absolute` with a global reference point (e.g., `top-0`). This ensures proper spacing when system banners (payment, maintenance, etc.) are displayed.
- The banner height is managed through CSS variables (`--banner-height` and `--banner-offset`) defined in `web/src/styles/globals.css`.
- Banner components (like PaymentBanner) dynamically update `--banner-height` using ResizeObserver to track their actual height, ensuring accurate positioning even when banners resize (e.g., on mobile wrapping).
- Available Tailwind utilities:
  - `top-banner-offset` / `pt-banner-offset` - For sticky/fixed/absolute positioning and padding
  - `h-screen-with-banner` / `min-h-screen-with-banner` - For full-height containers accounting for banners

## JavaScript / TypeScript Style

- use concat instead of spread to avoid stack overflow with large arrays

## Seeder

- make sure that for new features with data model changes, the database seeder is adjusted.

## API Documentation

- Whenever a file in `web/src/features/public-api/types` changes, the `fern/apis` definition probably needs to be adjusted, too.
- `nullish` types should map to `optional<nullable<T>>` in fern.
- `nullable` types should map to `nullable<T>` in fern.
- `optional` types should map to `optional<T>` in fern.
