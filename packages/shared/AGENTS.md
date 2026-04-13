# Codex Guidelines for `@langfuse/shared`

This file covers package-local guidance for this package.
Use root [AGENTS.md](../../AGENTS.md) for monorepo-level rules.

## Purpose

- Shared domain, database, queue, and server utilities used by `web` and
  `worker`.
- Primary owner of Postgres schema, ClickHouse schema, and queue payload
  contracts.

## Maintenance Contract

- `AGENTS.md` is a living document.
- Update this file in the same PR for material shared-package changes:
  - new/renamed schema or migration workflows
  - new/renamed queue contracts
  - changed exported surfaces or validation commands
- Because this package is consumed by both `web` and `worker`, cross-package
  changes usually require updates in root `AGENTS.md` too.

## High-Signal Entry Points

- Main exports: `src/index.ts`
- DB clients and types: `src/db.ts`
- Server exports: `src/server/index.ts`
- Server cache utilities: `src/server/cache/*`
- Domain model types: `src/domain/*`
- Repository layer: `src/server/repositories/*`
- Queue payload schemas: `src/server/queues.ts`
- Queue helpers: `src/server/redis/*`
- Postgres schema: `prisma/schema.prisma`
- Prisma migrations: `prisma/migrations/*`
- ClickHouse migrations: `clickhouse/migrations/{clustered,unclustered}/*`
- Seeder and support scripts: `scripts/seeder/*`, `clickhouse/scripts/*`

## Export Entry Points

- `@langfuse/shared` via `src/index.ts`: default shared surface for
  cross-runtime types, zod schemas, table definitions, domain models, prompt
  helpers, eval/model-pricing helpers, and other frontend-safe utilities.
- `@langfuse/shared/src/server` via `src/server/index.ts`: server-only barrel
  for shared backend services, repositories, queue helpers/contracts, Redis and
  ClickHouse helpers, auth helpers, logger/instrumentation, ingestion helpers,
  LLM execution helpers, and server test utilities.
- `@langfuse/shared/src/db` via `src/db.ts`: Prisma client singleton plus
  Prisma namespace/types for direct database access. Never route this into
  frontend-safe code.
- `@langfuse/shared/src/env` via `src/env.ts`: validated shared environment
  schema/accessors used by backend runtimes and scripts.
- `@langfuse/shared/encryption` via `src/encryption/index.ts`: encryption and
  signature helpers for secrets and signed payloads.
- Narrower exported subpaths also exist for targeted imports:
  `@langfuse/shared/src/server/auth/apiKeys`,
  `@langfuse/shared/src/server/ee/ingestionMasking`, and
  `@langfuse/shared/src/utils/chatml`.

When changing export surfaces, keep `package.json#exports`, the relevant barrel
file (`src/index.ts`, `src/server/index.ts`, etc.), and this guide aligned in
the same PR.

## Architecture Handbook

- For the cross-package system view, read the architecture handbook:
  [langfuse.com/handbook/product-engineering/architecture](https://langfuse.com/handbook/product-engineering/architecture).
- Source markdown lives in
  `../langfuse-docs/content/handbook/product-engineering/architecture.mdx`
  (GitHub mirror:
  [architecture.mdx](https://github.com/langfuse/langfuse-docs/blob/4188c1ba453240c90a763a8067ef442d68839323/content/handbook/product-engineering/architecture.mdx#L4)).
- Consult it when changing shared contracts that affect the web container,
  worker container, ingestion flow, or storage-layer boundaries.

## Quick Commands

- Dev watch build: `pnpm --filter @langfuse/shared run dev`
- Lint: `pnpm --filter @langfuse/shared run lint`
- Lint fix: `pnpm --filter @langfuse/shared run lint:fix`
- Typecheck: `pnpm --filter @langfuse/shared run typecheck`
- Build: `pnpm --filter @langfuse/shared run build`
- Prisma generate: `pnpm --filter @langfuse/shared run db:generate`
- Prisma migrate (dev): `pnpm --filter @langfuse/shared run db:migrate`
- ClickHouse reset: `pnpm --filter @langfuse/shared run ch:reset`

## Playbooks

### Postgres schema change

1. Update `prisma/schema.prisma`.
2. Add migration in `prisma/migrations/*`.
3. Regenerate client/types via `db:generate`.
4. Update affected repository/query code under `src/server/repositories/*`.
5. Add/adjust `web` and/or `worker` tests for changed behavior.

### ClickHouse schema change

1. Add migration under `clickhouse/migrations/*`.
2. Update ClickHouse query/mapping logic in `src/server/clickhouse/*` and
   related repositories.
3. Validate ingestion/read path impact in both `web` and `worker`.
4. If the change affects columns, types, or nullability of tables read by blob
   storage export queries (`getTracesForBlobStorageExport`,
   `getObservationsForBlobStorageExport`, `getScoresForBlobStorageExport`,
   `getEventsForBlobStorageExport`, or the EventsQueryBuilder `export` field
   set), fetch the latest published docs and check for discrepancies:
   - https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage
   - https://langfuse.com/docs/api-and-data-platform/features/blob-storage-export-fields
   Surface any mismatches in field names, types, nullability, or filter
   descriptions so they can be addressed in the docs repo.

### Queue payload contract change

1. Update zod schemas/types in `src/server/queues.ts`.
2. Update queue helpers in `src/server/redis/*` if queue names/payload
   handling changed.
3. Update producer and consumer code in `web`/`worker`.
4. Add or update regression tests in affected packages.

- If a queue becomes sharded, add its shard-count env in `src/env.ts` and keep
  the shard-aware queue callers in `web` and `worker` aligned with the shared
  helper API.

### Export surface change

1. Decide whether the symbol belongs in the client-safe root barrel, the
   server-only barrel, or a narrower subpath export.
2. Update the owning file (`src/index.ts`, `src/server/index.ts`, `src/db.ts`,
   `src/env.ts`, or another explicit subpath).
3. Update `package.json#exports` if the public import path changed or a new
   subpath is required.
4. Update import sites in `web`, `worker`, and `ee` to use the intended
   entrypoint.
5. Update this file and any consuming package `AGENTS.md` guidance when the
   recommended import path changes.

## Package-Specific Rules

- Keep backward compatibility in queue payloads when possible during rolling
  deployments.
- Do not hand-edit generated artifacts under `prisma/generated/*` or `dist/*`.
- Avoid exposing server-only modules through `src/index.ts` if they must remain
  frontend-safe.
- Changes to domain constants consumed by blob storage exports (e.g.
  `LISTABLE_SCORE_TYPES` in `src/domain/scores.ts`, score data type enums)
  should be reviewed against the blob storage export field reference docs for
  consistency — fetch the latest page and surface any discrepancies:
  https://langfuse.com/docs/api-and-data-platform/features/blob-storage-export-fields
