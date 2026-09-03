# Agent Guidelines for `@langfuse/shared`

## Purpose

- Shared domain, database, queue, and server utilities used by `web` and
  `worker`.
- Primary owner of Postgres schema, ClickHouse schema, and queue payload
  contracts.

## Maintenance Contract

- Update this file in the same PR when entry points, commands, or contracts
  change. Because both `web` and `worker` consume this package, exported-surface
  changes usually need their `AGENTS.md` too.

## High-Signal Entry Points

- Main exports: `src/index.ts`
- DB clients and types: `src/db.ts`
- Server exports: `src/server/index.ts`
- Server cache utilities: `src/server/cache/*`
- Domain model types: `src/domain/*`
- Repository layer: `src/server/repositories/*`
- Queue payload schemas: `src/server/queues.ts`
- Queue helpers: `src/server/redis/*`
- Code evaluator dispatcher/error contract: `src/server/evals/codeEvalDispatcherTypes.ts`. Keep provider mappings, user-visible messages, and worker terminal-outcome classification aligned when adding an error code.
- Dashboard/monitor query feature (data model + server-only builder/executor): `src/features/query/*`
- Query-builder AST (server half, WIP): `src/server/query-ast/*` — golden-SQL
  recording/diff harness that captures the current SQL at the
  `src/server/repositories/clickhouse.ts` exec seam and normalizes it via
  `clickhouse format` for snapshot comparison. Every migrated call site is
  proven against its baseline here. The Kysely ClickHouse dialect (ARRAY JOIN /
  LIMIT BY / metadata indexOf nodes, `ExecutionContext` tenancy injection,
  typed selection, virtual views, catalog parity) lives under
  `src/server/query-ast/kysely/`.
- Postgres schema: `prisma/schema.prisma`
- Prisma migrations: `prisma/migrations/*`
- ClickHouse migrations: `clickhouse/migrations/{clustered,unclustered}/*`
- Seeder and support scripts: `scripts/seeder/*`, `clickhouse/scripts/*`

## Export Entry Points

- `@langfuse/shared` via `src/index.ts`: default shared surface for
  cross-runtime types, zod schemas, table definitions, domain models, prompt
  helpers, eval/model-pricing helpers, product path builders, and other
  frontend-safe utilities.
  Includes the unicode-decoding JSON serialization helpers (`stringify`,
  `stringifyForCsv` in `src/utils/stringify.ts`) used by both the server
  trace-download route and client-side download/copy paths; the server barrel
  re-exports them for compatibility.
- `@langfuse/shared/src/server` via `src/server/index.ts`: server-only barrel
  for shared backend services, repositories, queue helpers/contracts, Redis and
  ClickHouse helpers, auth helpers, logger/instrumentation, ingestion helpers,
  AI SDK-native LLM execution helpers (`generateLLMText` and
  `streamLLMText`), Bedrock default-credential provider auth
  (`createDefaultBedrockProviderAuth`), and server test utilities.
- `@langfuse/shared/src/db` via `src/db.ts`: Prisma client singleton plus
  Prisma namespace/types for direct database access. Never route this into
  frontend-safe code.
- `@langfuse/shared/src/env` via `src/env.ts`: validated shared environment
  schema/accessors used by backend runtimes and scripts.
- `@langfuse/shared/encryption` via `src/encryption/index.ts`: encryption and
  signature helpers for secrets and signed payloads.
- `@langfuse/shared/query` via `src/features/query/index.ts`: dashboard query feature.
- `@langfuse/shared/instrumentation/bootstrap` via
  `src/server/instrumentation/bootstrap/index.ts`: instrumentation initializers loaded before sdk.start(); must not import the server barrel or any instrumented library.
- `@langfuse/shared/in-app-agent` via `src/in-app-agent/index.ts`:
  client-safe durable in-app-agent contracts: AG-UI messages/events/context,
  run requests/status/errors, approval events, constants, message helpers,
  and interrupt parsing. Never re-export server code here.
- In-app-agent server contracts use explicit subpaths only:
  `persistence`, `runLifecycle`, `tunables`, `eventCompaction`, `mcpPolicy`,
  `toolResults`, `toolErrors`, `systemPrompt`, and `modelProvider`. These are
  storage/lifecycle, durable cross-process policy, or instance-model contracts;
  the Mastra runtime and sandbox belong to the worker.
- Narrower exported subpaths also exist for targeted imports:
  `@langfuse/shared/src/server/auth/apiKeys`,
  `@langfuse/shared/src/server/ee/ingestionMasking`,
  `@langfuse/shared/src/server/llm/llmText`, and
  `@langfuse/shared/src/utils/chatml`. The experimental
  `@langfuse/shared/src/utils/normalized-io` parser is client-safe but **do not
  use it yet**; its public contract is still being validated.

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
   - Redefining views or materialized views follows strict patterns (no
     `CREATE OR REPLACE VIEW`; MV SELECT changes via
     `ALTER TABLE … MODIFY QUERY`) — apply the "Langfuse-Specific Rules" in
     `.agents/skills/clickhouse-best-practices/SKILL.md` for any new ClickHouse migration.
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
- Register recurring cron jobs through
  `src/server/redis/scheduleRecurringJob.ts` (BullMQ job schedulers), never
  via the deprecated `Queue.add(name, data, { repeat })` API. When changing a
  cron pattern, append the old pattern to `previousPatterns` so the legacy
  md5-keyed schedule is cleaned up on boot.
- Do not hand-edit generated artifacts under `prisma/generated/*` or `dist/*`.
- Avoid exposing server-only modules through `src/index.ts` if they must remain
  frontend-safe.
- Adding vocabulary here — a field on a shared schema, an option on a shared
  signature, an enum member, a branch for one caller — is owned by `web`,
  `worker`, and `ee` at once. Apply
  `.agents/skills/backend-dev-guidelines/references/new-concepts.md` first.
- Changes to domain constants consumed by blob storage exports (e.g.
  `LISTABLE_SCORE_TYPES` in `src/domain/scores.ts`, score data type enums)
  should be reviewed against the blob storage export field reference docs for
  consistency — fetch the latest page and surface any discrepancies:
  https://langfuse.com/docs/api-and-data-platform/features/blob-storage-export-fields
