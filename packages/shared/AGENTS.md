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
- Blob storage clients: `StorageServiceFactory.getInstance` in
  `src/server/services/StorageService.ts` takes one `credentials` value:
  access keys, an S3 role provider, or `undefined` for the deployment's default
  credentials. Build keys with `storageKeys`; GCS uses `googleCloudCredentials`.
- Media download URLs: sign Langfuse-managed media only through
  `getMediaDownloadUrl` in `src/server/media/getMediaDownloadUrl.ts`, never
  `getSignedUrl` directly. It serves the recorded Content-Type and forces a
  download for anything outside its safe-inline allowlist, so stored HTML or
  SVG never renders on the bucket's origin. `getSignedUrl`'s
  `responseContentType` overrides the stored type per URL; OCI cannot override
  headers and falls back to `download=1`.
- Eval-rule caches: `src/server/evalJobConfigCache.ts` keeps observation/experiment
  absence (`eventBased`) separate from transcript absence (`traceTranscriptBased`).
  Invalidate through `invalidateProjectEvalConfigCaches` after rule or assignment changes.
- Trace evals gates: `src/server/evals/traceEvalsConfig.ts` holds the project allowlist (`LANGFUSE_TRACE_EVALS_ENABLED_PROJECT_IDS`) and `src/server/evals/traceEvalsProcessingGate.ts` the cached "has an active judge rule" lookup. Both are parallel copies of the Topics gates and share no state with them; `invalidateProjectEvalConfigCaches` clears the lookup.
- Transcript assembly: pass the enriched result of `orderObservations` into
  `assembleTranscript`. `currentTurn.nestingLevel` uses the first contributing
  generation after history is split off; it is not the depth of the first
  generation in the full thread.
- Model definition visibility: `src/server/ingestion/modelVisibility.ts`.
  Every project-scoped read of `models` filters with `visibleModelsWhere`
  (Prisma) or `visibleModelsSql` (raw SQL): the project's rows, its
  organization's rows, and Langfuse rows. Never filter on null owner columns.
  Resolution ranks project over organization over Langfuse
  (`modelScopeRankSql`) before pattern or start date. After changing an
  organization's definitions, call `clearModelCacheForOrganization`
  (`src/server/ingestion/modelMatch.ts`).
- Plans and entitlements: the plan → entitlement table and `hasEntitlementBasedOnPlan` live in `src/features/entitlements/` (client-safe barrel); `getOrganizationPlanServerSide` / `getSelfHostedInstancePlanServerSide` in `src/server/entitlements/getPlan.ts` (server barrel), so web and worker resolve an organization's plan the same way. The resolver reads shared's `env`, so tests override it there (`@langfuse/shared/src/env`), not via `process.env` or a `@/src/env.mjs` mock.
- Domain model types: `src/domain/*`
- Repository layer: `src/server/repositories/*`
- Audit snapshots and replay: `src/server/repositories/auditLogs.ts`; `getAuditLogResourceRefs` derives bulk trace refs from the persisted snapshot for live staging and backfill.
- Billing ledger: the append-only `billable_events` table (ClickHouse migration `0057_create_billable_events`, with its materialized views; the Topics facet summary view is `0061`) read via `src/server/repositories/billable-events.ts`. Keep it out of every delete, retention and cleaner path.
- Queue payload schemas: `src/server/queues.ts`. `EvalJobExecutionEventSchema`
  is a union on `type`. Observation jobs carry `observationS3Path`.
  Trace-transcript jobs carry `traceId`, `revision`, and `transcriptS3Path`
  (the object key returned when the envelope was stored).
- Queue helpers: `src/server/redis/*`
  `getShardIndex` from `src/server/redis/sharding.ts` is exported by the server
  barrel; hash the unit identity when a project can dominate traffic.
- Full-event streaming reads for events dispatch live in `src/server/repositories/events-dispatch.ts`; the worker owns enablement and lifecycle. Reader options control per-query threads/block size; retain exact tenant pairs and per-trace time windows when changing parameter chunking. Rows must stay contiguous by project and trace ID so consumers can finish a trace at the next pair or successful EOF; time buckets must not precede trace ID.
- Code evaluator dispatcher/error contract: `src/server/evals/codeEvalDispatcherTypes.ts`. Keep provider mappings, user-visible messages, and worker terminal-outcome classification aligned when adding an error code.
- Dashboard/monitor query feature (data model + server-only builder/executor): `src/features/query/*`. New views compile through the query AST; read [`src/features/query/AGENTS.md`](src/features/query/AGENTS.md) before adding or changing a view.
- Query-builder AST (server half): `src/server/query-ast/*` — the Kysely ClickHouse dialect (ARRAY JOIN / LIMIT BY / FINAL / metadata subscript nodes, single-project tenancy injection, per-table dedup lowering, virtual views, catalog parity). Compile only through `compileClickhouseQuery` in `src/server/query-ast/compile.ts`. SQL correctness is proven by a golden-SQL harness (`src/server/repositories/goldenHarness.ts`, capturing at the `src/server/repositories/clickhouse.ts` exec seam and normalizing via `clickhouse format`); each migrated call site keeps its `*.golden.test.ts` baseline next to the call site (e.g. `src/server/repositories/environments.golden.test.ts`, `src/server/repositories/events.golden.test.ts`, `src/server/repositories/scores.golden.test.ts`, `src/server/queries/clickhouse-sql/event-filter-options.golden.test.ts`).
- Events predicate lowering (server half of the predicate source): `src/server/repositories/events-predicate.ts` lowers a `Predicate` and its free-text `search` to Kysely conditions over `events as e` (`lowerEventsPredicate`, `lowerEventsSearch`), or to `{ sql, params, requiresEventsFull }` for the raw-SQL builders (`compileEventsPredicate`, `compileEventsSearch`). The events row-selection planner (`src/server/queries/clickhouse-sql/events-observation-row-selection.ts`) compiles its non-score filters and search through them; score filters stay `FilterList` text. The observations public API row filter (`compilePublicApiObservationsFilter` in `src/server/queries/clickhouse-sql/events-public-api-observation-filter.ts`, used by v1/v2 list, v2 scan, v1 count and the MCP observation tools) folds its simple query params and advanced `filter` JSON into one predicate over native event columns and rejects the rest with `InvalidRequestError` (400): `positionInTrace`, columns without an events lowering (scores, comments, topics), unknown columns, and unindexed input/output filters (v1 list and v1 count pass `allowUnindexedIoFilters: true` and accept them; v2 and MCP reject them). Both consumers share the compile tail `compileEventsRowConditions`, which returns `{ events, search, requiresEventsFull, startTime }` with `startTime: StartTimeBounds` (epoch-ms `from`/`to`); a caller applies `search` separately (the public API filter has none and drops it). Per-field expressions live in `events-predicate-fields.ts`, and `eventsTableUiColumnDefinitions` renders its column SQL from them (`eventsFieldSql`); the routing verdict (`requiresEventsFull`) comes from the routing pass via `compileClickhouseCondition`; `events-predicate.golden.test.ts` checks the condition wiring (type, operator, binds, routing, errors) against `FilterList` per field × type × operator and the search against `eventSearchCondition`. Both filter sides share the column SQL; the row-selection goldens (`events.golden.test.ts`) pin it with a planner filter per column kind (bare, quoted, expression, usage/cost-map expression, array, empty-equals-null, ingestion columns), so a field of a new kind needs a case there.
- Query-builder predicate (client-safe half): `src/query-ast/*`, exported from the main barrel — the `Predicate` tree (`and | or | not | condition`) with its zod schema, `PredicateWithSearch` (the tree plus at most one free-text search), the `FilterState` + `searchQuery`/`searchType` codec (`fromFilterState` / `toFilterState`), `analyzePredicate` contradiction diagnostics, and the semantic source registry (`eventsPredicateSource`, kept in parity with `eventsTableCols` and the events search columns by `sources.test.ts`). No server imports here.
- Postgres schema: `prisma/schema.prisma`
- Prisma migrations: `prisma/migrations/*`
- Canonical ClickHouse migration templates (rendered for clustered and unclustered installs): `clickhouse/migrations/canonical/*`. `events_full.event_bytes` defaults to `byteSize` of customer payload, identifiers and descriptions (migration 0056), excluding internal bookkeeping and copied experiment metadata. Keep this estimate stable across small schema additions; include new large customer payload fields via a new migration. Core and billing projections preserve the untruncated payload estimate. Inserts may omit it; reads require it.
- ClickHouse SQL identifier and string quoting:
  `src/server/clickhouse/clickhouseIdentifiers.ts`
- Ingestion masking: `src/server/ee/ingestionMasking` keeps HTTP retries and failure
  policy independent of in-memory representation. The callback always exchanges JSON;
  the optional transport supplies reusable JSON text or UTF-8 bytes and validates
  responses inside retries. Default callers retain JSON serialization.
- Seeder and support scripts: `scripts/seeder/*`, `clickhouse/scripts/*`

## Export Entry Points

- `@langfuse/shared/topics`: client-safe Topics contracts and configuration schemas in `src/topics`.
- `@langfuse/shared/topics/server`: persistence, model setup, queues and execution progress in `src/server/topics`. Before changing processing, storage or costs, read the [Topics worker guide](../../worker/src/features/topics/README.md).
  - Save models, the first Topics rule and trace idle time through `setup.ts`; refresh readiness and processing caches only after the transaction commits. A project has up to five rules (`slices.ts`); analyses are one-off clustering runs over a tracing filter and never change a rule's map.
  - Model saves preserve automatic-processing state. Use `setTopicsAutomaticProcessing` to toggle it or change rule sampling.
  - Keep the embedding model and dimensions fixed once embeddings exist.
  - Invalidate `processing-gate.ts` after committed config, rule or facet changes; `invalidateProjectEvalConfigCaches` includes this invalidation.

- `src/server/transcript`: order minimal `TranscriptObservation` inputs with
  `orderObservations`, then pass the enriched result and optional
  `{ maxCharacters?, onTimings? }` to `assembleTranscript`.
  The optional cap bounds `JSON.stringify(result).length`; see its README.
  `assembleTranscriptContext` takes the same arguments and adds
  `executionIssues` (ERROR, and WARNING with a status message) next to a
  non-null transcript; `Transcript` itself stays conversational.
  `schema.ts` owns the current transcript shape; `types.ts` infers its output
  types. Message/part types come from `src/utils/normalized-io/schema.ts`.
  `topics-model-input.ts` owns what the Topics summarizer receives
  (`renderStoredTopicText`, `prepareAssembledTopicTranscript`,
  `TOPICS_TEXT_VERSION`); the worker and the internal trace "Show topics
  transcript" dialog share it.

- `src/server/eventsDispatch`: versioned trace transcript storage through the server barrel.
  `createTraceTranscriptStorage()` returns the `TraceTranscriptStorage` interface
  with `put` and `get`, and one lazily initialized provider client across
  factory calls. `put` returns the object key when the envelope is stored.
  `get` reads that key. Topics and trace-transcript eval jobs carry it as `transcriptS3Path`; readers never rebuild it.
  Consumers
  receive the storage object. The writer takes `TraceTranscriptData` with transcript,
  `executionIssues` (empty without a transcript) and required `traceContext`; session ID and trace name are nullable. The reader
  requires and returns both. Context timestamps
  stay ISO strings. The writer skips envelopes over 1,000,000 UTF-16
  units; the reader validates the stored version and restores message dates, and
  throws `UnsupportedTraceTranscriptVersionError` for a newer version, which
  callers treat as retryable. Same-revision PUTs may overwrite.
  Objects live under `TRACE_TRANSCRIPT_PREFIX` for `TRACE_TRANSCRIPT_RETENTION_MS` (three days). The worker events-dispatch transcript cleaner deletes expired objects; trace and project deletion do not.
  `src/server/eventsDispatch/versions/v1.ts` freezes the complete envelope, including
  transcript and trace context, without importing live schemas; `serialization.ts` owns the typed
  transcript adapters and `storage-schema.ts` only probes the version. Compatible
  optional additions may extend V1; anything else starts a new version module
  with its own adapters. Schema versions and readiness revisions are independent;
  see the events-dispatch storage README.

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
  (`createDefaultBedrockProviderAuth`), Vertex AI access tokens from the deployment's credentials or a service account key (`vertexAuth.ts`), and server test utilities. Langfuse AI
  callers select their local profile through `getLangfuseAIAwsProfile`;
  generic Bedrock auth only uses an explicitly supplied profile or the normal
  AWS credential chain.
  Persisted `LLMConnection` projections must retain the credential row's
  `projectId`: Cloud Bedrock runtime auth checks it against
  `LANGFUSE_BEDROCK_LLM_CONNECTION_RUNTIME_CREDENTIALS_ALLOWED_PROJECT_IDS`. Raw credential
  tests omit this identity; only operator-provisioned stored secrets qualify.
  Bedrock IAM role connections (`{ roleArn }` secret, kept out of `BedrockCredentialSchema`) assume the role with the encrypted external ID stored on their row (`LLMConnection.externalId`); see `@langfuse/shared/src/server/ee/bedrockRoleAuth/bedrockRoleCredentials`.
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
5. Whether to add a test follows root [`AGENTS.md`](../../AGENTS.md). Place a warranted `web` and/or `worker` test for changed behavior.

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
4. Whether to add a test follows root [`AGENTS.md`](../../AGENTS.md). Place a warranted regression test in the affected package.

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
- `next-auth` is a devDependency: import it with `import type` only. `pnpm deploy --prod` leaves it out of the worker image, so a value import would crash the worker at startup; `oxlint.config.mts` rejects one via `no-restricted-imports`.
- `src/server/ee/*` is under the Enterprise License (root `LICENSE`), not MIT.
  Put EE logic there when both `web` and `worker` must import it; keep OSS
  code paths out of it.
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
