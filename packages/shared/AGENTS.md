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
- CloudWatch metrics: `recordGauge` batches values; windowed measurements can
  call `flushMetricsToCloudWatch` from the server barrel after recording to
  submit them before the next gauge replaces the cached value.
- Server cache utilities: `src/server/cache/*`
- Transcript assembly: pass the enriched result of `orderObservations` into
  `assembleTranscript`. `currentTurn.nestingLevel` uses the first contributing
  generation after history is split off; it is not the depth of the first
  generation in the full thread.
- Domain model types: `src/domain/*`
- Repository layer: `src/server/repositories/*`
- Billing ledger: the append-only `billable_events` table (created by
  `clickhouse/scripts/dev-tables.sh`, applied by hand on Cloud, not
  migration-managed) read via `src/server/repositories/billable-events.ts`.
  Keep it out of every delete, retention and cleaner path.
- Queue payload schemas: `src/server/queues.ts`
- Queue helpers: `src/server/redis/*`
  `getShardIndex` from `src/server/redis/sharding.ts` is exported by the server
  barrel; hash the unit identity when a project can dominate traffic.
- Internal trace-batch queue: `src/server/redis/traceBatch.ts` (cloud-gated);
  payloads in `src/server/queues.ts` accept persisted single-project jobs.
  Full-event streaming reads live in `src/server/repositories/trace-batch.ts`;
  the worker owns experiment enablement and lifecycle. Reader options control
  per-query threads/block size and experiment attribution; retain exact tenant
  pairs and per-trace time windows when changing parameter chunking.
  Rows must stay contiguous by project and trace ID so consumers can finish a
  trace at the next pair or successful EOF; time buckets must not precede trace ID.
- Code evaluator dispatcher/error contract: `src/server/evals/codeEvalDispatcherTypes.ts`. Keep provider mappings, user-visible messages, and worker terminal-outcome classification aligned when adding an error code.
- Dashboard/monitor query feature (data model + server-only builder/executor): `src/features/query/*`
- Query-builder AST (server half, WIP): `src/server/query-ast/*` — the Kysely
  ClickHouse dialect (ARRAY JOIN / LIMIT BY / FINAL / metadata subscript nodes,
  single-project tenancy injection, per-table soft-delete filtering and
  dedup lowering, virtual views, catalog parity). Compile only through
  `compileClickhouseQuery` in `src/server/query-ast/compile.ts`. SQL
  correctness is proven by a golden-SQL harness
  (`src/server/repositories/goldenHarness.ts`, capturing at the
  `src/server/repositories/clickhouse.ts` exec seam and normalizing via
  `clickhouse format`); each migrated call site keeps its `*.golden.test.ts`
  baseline next to the call site (e.g.
  `src/server/repositories/environments.golden.test.ts`,
  `src/server/repositories/events.golden.test.ts`,
  `src/server/repositories/scores.golden.test.ts`,
  `src/server/queries/clickhouse-sql/event-filter-options.golden.test.ts`).
- Postgres schema: `prisma/schema.prisma`
- Prisma migrations: `prisma/migrations/*`
- Canonical ClickHouse migration templates (rendered for clustered and
  unclustered installs): `clickhouse/migrations/canonical/*`
- ClickHouse SQL identifier and string quoting:
  `src/server/clickhouse/clickhouseIdentifiers.ts`
- Ingestion masking: `src/server/ee/ingestionMasking` keeps HTTP retries and failure
  policy independent of in-memory representation. The callback always exchanges JSON;
  the optional transport supplies reusable JSON text or UTF-8 bytes and validates
  responses inside retries. Default callers retain JSON serialization.
- Seeder and support scripts: `scripts/seeder/*`, `clickhouse/scripts/*`

## Export Entry Points

- `@langfuse/shared/topics`: client-safe Topics contracts.
- `@langfuse/shared/topics/server`: Topics persistence, queue handoff and execution
  progress. See `../../worker/src/features/topics/README.md` for storage and retry
  invariants before changing this module.
  - `postgres.ts`: facets reuse evaluator/version storage with type `FACET`;
    built-in presets are immutable. Saved rules reuse evaluation rules and
    evaluator assignments; ordering and limits belong to manual requests.
    Clustering runs reference immutable ClickHouse definitions; reused
    definitions retain their original creation run.
  - `clickhouse.ts`: current summaries/assignments and immutable definitions.
    Source identity prefers `traceId`; `sessionId` may carry parent context.
    Facet versions use `(projectId, facetId, version)`. Data reads require a time
    range; `hasStoredTopicSummaries(projectId)` checks project onboarding
    readiness across all stored trace summaries without loading their contents.
    A positive result is cached per project in Redis for 30 minutes, skipping
    subsequent ClickHouse probes; cache failures fall back to ClickHouse.
    Negative results are cached for 30 seconds, bounding the onboarding delay
    after the first summaries arrive while avoiding repeated empty-project scans.
    Replacement includes the source minute, with run/origin suffixes for assignments. Definition bounds
    retain original creation dates on reuse.
    `getLatestFacetSummaries` returns display fields; processing reads use
    `listTopicSummaries` or `getTopicClusteringSummaries` for complete summaries.
  - `execution-store.ts`: one BatchAction per request, compact counters and run references.
    Writes accept progress only; immutable settings stay in the stored request.
    Trace inputs and paid outputs belong outside the execution store.
  - `trace-selection.ts`: shared bounded observation selection for web previews,
    ID-only processing requests and worker backfills; retain identical sampling.
  - `embedding-queue.ts`: Redis staging with a fixed expiry; retain accepted
    payloads through assignment and save terminal job state before cleanup.
    Summary references carry facet/version/source fields within project and
    execution scope; exact storage reads also require facet/version scope.
  - `text.ts` and `embeddings.ts`: model transport through the project's LLM
    connections (`generateLLMText` / `embedLLMText`), with cached Bedrock text
    calls using InvokeModel. Setup probes use the same Topics transport. Topics
    opts into the native OpenAI Chat provider per call for official hosts; keep
    saved evaluator routing independent. Text accepts optional generation tracing;
    worker model calls own tracing allowlisting, organization consent, usage,
    cost and vector validation.
  - `model-config.ts`: per-project `topic_configs` (three connection +
    model slots and the automatic-processing state). Saving keeps the stored
    state and pause (a first save starts off) and tests every slot with a real
    call while processing is on, otherwise only the changed slots; Anthropic
    works for summaries and clustering but fails the embedding test. The
    embedding model and dimensions are locked once embeddings exist. `setup.ts`
    tests the models, then commits the single Topics rule, models, and
    per-project trace idle time together. Refresh the Redis readiness setting
    only after that transaction commits. `setTopicsAutomaticProcessing` is the
    only path that turns processing on (after testing all stored models when it
    was off or paused), clears a pause, or changes the rule's sampling rate.
  - `processing-gate.ts`: `isTopicsProcessingActive`, the ingestion gate for
    trace batching (allowlisted, enabled with all three models, and an active
    rule with an unblocked facet), cached in Redis both ways. Any write to a
    project's Topics config, Topics rule or facet evaluators calls
    `invalidateTopicsProcessingActive` after it commits;
    `invalidateProjectEvalConfigCaches` already does.
  - `loadTopicTranscript`: in-memory source assembly for worker inference.
    Returns the shared `Transcript | null`, capped at 10,000 serialized characters.
    Historical reuse must match `TOPICS_TRANSCRIPT_VERSION`; accepted Redis results
    retain their original version. Token counting belongs to worker model calls.
  - `LANGFUSE_TOPICS_ENABLED` defaults to false and gates deployment availability,
    including cleanup. Processing also requires
    `LANGFUSE_TOPICS_ENABLED_PROJECT_IDS` (empty by default); reads/configuration
    remain feature-flag/RBAC controlled.

- `src/server/transcript`: order minimal `TranscriptObservation` inputs with
  `orderObservations`, then pass the enriched result and optional
  `{ maxCharacters?, onTimings? }` to `assembleTranscript`.
  The optional cap bounds `JSON.stringify(result).length`; see its README.

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
  AI SDK-native LLM execution helpers (`generateLLMText`, `streamLLMText`, and
  `embedLLMText`), `isInternalEvalEnvironment` for shared eval/Topics exclusions,
  Bedrock default-credential provider auth
  (`createDefaultBedrockProviderAuth`), and server test utilities. Langfuse AI
  callers select their local profile through `getLangfuseAIAwsProfile`;
  generic Bedrock auth only uses an explicitly supplied profile or the normal
  AWS credential chain.
  Persisted `LLMConnection` projections must retain the credential row's
  `projectId`: Cloud Bedrock runtime auth checks it against
  `LANGFUSE_BEDROCK_LLM_CONNECTION_RUNTIME_CREDENTIALS_ALLOWED_PROJECT_IDS`. Raw credential
  tests omit this identity; only operator-provisioned stored secrets qualify.
- `@langfuse/shared/src/server/clickhouse` via `src/server/clickhouse/index.ts`:
  ClickHouse clients and helpers without loading the full server barrel. Use this
  entry point for test cleanup so built and source-aliased clients retain the same
  module identity.
- `@langfuse/shared/src/db` via `src/db.ts`: Prisma client singleton plus
  Prisma namespace/types for direct database access. Never route this into
  frontend-safe code.
- `@langfuse/shared/src/env` via `src/env.ts`: validated shared environment
  schema/accessors used by backend runtimes and scripts.
- `@langfuse/shared/encryption` via `src/encryption/index.ts`: encryption and
  signature helpers for secrets and signed payloads.
- `@langfuse/shared/query` via `src/features/query/index.ts`: dashboard query feature.
- `@langfuse/shared/rbac` via `src/features/rbac/index.ts`: client-safe tagged IDs,
  role assignments, role catalog, and permission vocabulary.
- `@langfuse/shared/rbac/server` via `src/features/rbac/server.ts`: server-only
  role-assignment reads and writes, mapping database foreign keys to tagged IDs.
- `@langfuse/shared/instrumentation/bootstrap` via
  `src/server/instrumentation/bootstrap/index.ts`: instrumentation initializers loaded before sdk.start(); must not import the server barrel or any instrumented library.
- `@langfuse/shared/in-app-agent` via `src/in-app-agent/index.ts`:
  client-safe durable in-app-agent contracts: AG-UI messages/events/context,
  run requests/status/errors, approval events, constants, message helpers,
  interrupt parsing, and the questionnaire tool contract (`questionnaire.ts`:
  args, positional answers carried on `approvalDecision` requests, result, and
  the shared resolver web and worker both validate with). Never re-export
  server code here.
- In-app-agent server contracts use explicit subpaths only:
  `persistence`, `runLifecycle`, `tunables`, `eventCompaction`, `mcpPolicy`,
  `toolResults`, `toolErrors`, `systemPrompt`, and `modelProvider`. These are
  storage/lifecycle, durable cross-process policy, or instance-model contracts;
  the Mastra runtime and sandbox belong to the worker.
- Narrower exported subpaths also exist for targeted imports:
  `@langfuse/shared/src/server/auth/apiKeys`,
  `@langfuse/shared/src/server/clickhouse/clickhouseIdentifiers`,
  `@langfuse/shared/src/server/ee/ingestionMasking`,
  `@langfuse/shared/src/server/ee/fips` (startup FIPS-mode enforcement; it
  loads only env and the license check, so it can run before anything
  connects),
  `@langfuse/shared/src/server/llm/llmText`, and
  `@langfuse/shared/src/utils/chatml`. The
  `@langfuse/shared/src/utils/normalized-io` parser is client-safe and is the
  only parser behind the web Formatted trace/observation view; the legacy
  ChatML helpers remain for the session feed and the playground (for now). Its result
  type is not frozen yet, so a new consumer should expect to move with it.

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
- Tests: `pnpm --filter @langfuse/shared run test`; Topics queue integration
  coverage requires Redis configured through the shared environment.
- Typecheck: `pnpm --filter @langfuse/shared run typecheck`
- Build: `pnpm --filter @langfuse/shared run build`
- Prisma generate: `pnpm --filter @langfuse/shared run db:generate`
- Prisma migrate (dev): `pnpm --filter @langfuse/shared run db:migrate`
- ClickHouse reset: `pnpm --filter @langfuse/shared run ch:reset` drops all
  tables and views in the configured database, then migrates and seeds it.
  Requires `CLICKHOUSE_CLUSTER_ENABLED=false`; use `ch:down` for clustered
  rollbacks.
- Materialize direct-migration trees: `pnpm ch:migrations:materialize`
- Clean direct-migration trees: `pnpm ch:migrations:clean`

## Playbooks

### Postgres schema change

1. Update `prisma/schema.prisma`.
2. Add migration in `prisma/migrations/*`.
3. Regenerate client/types via `db:generate`.
4. Update affected repository/query code under `src/server/repositories/*`.
5. Add/adjust `web` and/or `worker` tests for changed behavior.

### ClickHouse schema change

1. Add one canonical migration pair under `clickhouse/migrations/canonical/*`.
   - Use `{CLICKHOUSE_CLUSTER_CLAUSE}` for every cluster-aware DDL clause.
   - Use `{CLICKHOUSE_REPLICATION_PREFIX}` only on table engines that should
     be replicated in clustered mode and plain in unclustered mode.
   - Put clustered-only synchronization fragments inside
     `{CLICKHOUSE_CLUSTERED_ONLY:...}`. Use
     `{CLICKHOUSE_UNCLUSTERED_ONLY:...}` only when preserving a deliberate
     mode-specific difference.
   - Run `src/server/clickhouse/prepareMigrations.test.ts`; it validates both
     rendered modes and protects the historical migration output.
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
