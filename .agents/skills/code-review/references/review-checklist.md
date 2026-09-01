# Langfuse Review Checklist

This is the canonical shared review checklist for Langfuse.

## Database Migrations

### ClickHouse

- ClickHouse migrations in the `packages/shared/clickhouse/migrations/clustered` directory should include `ON CLUSTER default` and should use `Replicated` merge tree table types.
  - E.g. `ReplacingMergeTree` is likely an error while `ReplicatedReplacingMergeTree` would be correct in most cases.
- ClickHouse migrations in the `packages/shared/clickhouse/migrations/unclustered` directory must not include `ON CLUSTER` statements and must not use `Replicated` merge tree table types.
- Migrations in `packages/shared/clickhouse/migrations/clustered` should match their counterparts in `packages/shared/clickhouse/migrations/unclustered` aside from the restrictions listed above.
- Every metadata `ALTER` (`ADD`/`DROP`/`MODIFY COLUMN`, `ADD`/`DROP INDEX`) in a `clustered` migration must end with `SETTINGS alter_sync = 2`, including files that contain only one `ALTER` — the race is across migration files, not within one. `alter_sync` defaults to `1`, so without it the statement returns once the initiating replica has bumped the table's metadata version, and the next migration file's first `ALTER` on that table can hit a replica still on the old version, aborting the run with `code 517 … Looks like this replica doesn't catchup with latest ALTER query updates`. `SETTINGS mutations_sync = 2` does not substitute for it: that setting governs when mutations finish, not metadata propagation. The `unclustered` counterpart runs against plain `MergeTree` and does not need (and should not duplicate) either setting.
- Migrations must not use `CREATE OR REPLACE VIEW` (nor `CREATE OR REPLACE TABLE` / `EXCHANGE TABLES`): the atomic replace requires `renameat2`, which fails on NFS-backed self-hosted deployments such as ClickHouse-on-EFS (GitHub issue #14906). Plain views are redefined with `DROP VIEW IF EXISTS <name>;` followed by `CREATE VIEW <name> AS ...` in the same migration file — the migration runner enables `x-multi-statement=true`, and every statement should stay idempotent (`IF EXISTS` / `IF NOT EXISTS`) so a dirty migration can be re-run.
- Materialized views must never be dropped and recreated while their source table receives inserts — rows written between `DROP` and `CREATE` are silently and permanently missing from the target table. Redefine the SELECT with `ALTER TABLE <mv> MODIFY QUERY ...` instead, altering the target table(s) first when columns change.
- For rationale and full patterns, see "Langfuse-Specific Rules" in the [`clickhouse-best-practices`](../../clickhouse-best-practices/SKILL.md) skill.
- When adding new indexes on ClickHouse, ensure that there is a corresponding `MATERIALIZE INDEX` statement in the same migration. The materialization can use `SETTINGS mutations_sync = 2` if they operate on smaller tables, but may timeout otherwise.
- All ClickHouse queries on project-scoped tables (traces, observations, scores, events, sessions, etc.) must include `WHERE project_id = {projectId: String}` filter to ensure proper tenant isolation and that queries only access data from the intended project.
- For operations on the `events` table, you must never use the `FINAL` keyword as it kills performance. `events` is built so that `FINAL` is never required.

### Postgres

- Most `schema.prisma` changes should produce a change in `packages/shared/prisma/migrations`.
- All Prisma queries on project-scoped tables must include `projectId` in the WHERE clause (e.g., `where: { id: traceId, projectId }`) to ensure proper tenant isolation and that queries only access data from the intended project.
- Raw SQL that references the `datasets` table, including joins and CTEs, must not use `SELECT *` or `table.*`; use an explicit safe column projection. Aggregate expressions such as `COUNT(*)` are fine. Access secret-bearing dataset fields only through the centralized remote experiment delivery helper.

### Environment Variables

- Environment variables should be imported from the `env.mjs/ts` file of the respective package and not from `process.env.*` to ensure validation and typing.

## Redis Invocations

- Highlight usage of `redis.call` invocations. Those may have suboptimal redis cluster routing and will raise errors. Instead, use the native call patterns.
  Example: `await redis?.call("SET", key, "1", "NX", "EX", TTLSeconds);` should use `await redis?.set(key, "1", "EX", TTLSeconds, "NX");` instead.

## New Concepts in Shared Code

- When a change adds vocabulary to shared backend code — a field on a shared schema or payload, an option on a shared signature, an enum member, an env toggle, a branch for one caller — or concludes that no change is needed, review it against [`new-concepts.md`](../../backend-dev-guidelines/references/new-concepts.md) in the [`backend-dev-guidelines`](../../backend-dev-guidelines/SKILL.md) skill.

## Langfuse Cloud

- When attempting to confirm if the current environment is Langfuse Cloud in the frontend, use the `useLangfuseCloudRegion` hook and never environment variables directly.

## Banner Height System

- Use `top-banner-offset` instead of `top-0` for any elements that are positioned `sticky`, `fixed`, or `absolute` with a global reference point (e.g., `top-0`). This ensures proper spacing when system banners (payment, maintenance, etc.) are displayed.
- The banner height is managed through CSS variables (`--banner-height` and `--banner-offset`) defined in `web/src/styles/globals.css`.
- Banner components (like PaymentBanner) dynamically update `--banner-height` using ResizeObserver to track their actual height, ensuring accurate positioning even when banners resize (e.g., on mobile wrapping).
- Available Tailwind utilities:
  - `top-banner-offset` / `pt-banner-offset` - For sticky/fixed/absolute positioning and padding
  - `h-screen-with-banner` / `min-h-screen-with-banner` - For full-height containers accounting for banners

## Security

- For changes that accept a user-supplied URL, host, `endpoint`, `baseURL`,
  or webhook target, or that issue a new outbound HTTP request, run the
  shared [`security-review`](../../security-review/SKILL.md) skill and treat
  its [`outbound-url-validation.md`](../../security-review/references/outbound-url-validation.md)
  defenses (save-time validation + use-time / connection-time validation +
  redirect-time validation) as required. Plain `fetch(<userUrl>)` or SDK
  init with `endpoint: <userUrl>` without one of the canonical validators
  (`validateLlmConnectionBaseURL`, `validateWebhookURL`,
  `validateBlobStorageEndpoint`, or a new wrapper around
  `validateOutboundUrlHost`) is a finding.
- For changes that add a new integration, secret-bearing field, redirect
  follower, RBAC scope, product analytics, browser monitoring, or session
  replay, run the rest of the
  [`security-review/references/checklist.md`](../../security-review/references/checklist.md).
- For changes that shape what a read route returns — a repository or domain
  converter, a `Safe*` type, a response projection — a catch-all branch that
  returns the stored value for unhandled types, or an `as Safe*` assertion
  standing in place of a sanitizer, is a finding: feature read scopes are held
  by VIEWER. See
  [`security-review/references/secret-read-paths.md`](../../security-review/references/secret-read-paths.md).

## JavaScript / TypeScript Style

- use concat instead of spread to avoid stack overflow with large arrays

## Seeder

- make sure that for new features with data model changes, the database seeder is adjusted.

## API Documentation

- Whenever a file in `web/src/features/public-api/types` changes, the `fern/apis` definition probably needs to be adjusted, too.
- `nullish` types should map to `optional<nullable<T>>` in fern.
- `nullable` types should map to `nullable<T>` in fern.
- `optional` types should map to `optional<T>` in fern.
