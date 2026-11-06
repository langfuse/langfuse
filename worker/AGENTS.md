# Agent Guidelines for `worker`

## Purpose

- Background job processor built on Express + BullMQ.
- Owns queue consumers, async processors, and operational scripts.

## Maintenance Contract

- Update this file in the same PR when entry points, commands, or contracts
  change. Queue-contract changes usually need `../packages/shared/AGENTS.md`
  too.

## High-Signal Entry Points

- Worker registration/lifecycle: `src/queues/workerManager.ts`
- Queue processors: `src/queues/*`
- Feature processors: `src/features/*`
- Topics: `src/features/topics/processTopicsExecution.ts` and `src/features/topics/topicsAutomation.ts`. Before changing extraction, model configuration, fitting, persistence, costs or retries, read `src/features/topics/README.md` for lifecycle and recovery contracts.
- OTEL event processing:
  `src/features/otel-ingestion/processOtelEvents.ts`; the OTEL queue calls this
  after its legacy persistence path for event normalization, evaluation
  scheduling, direct events-table writes, and trace-batch accounting.
- Automatic evaluation scheduling: OTel ingestion, including prompt-experiment telemetry, uses
  `src/features/evaluation/fetchEvalRules.ts` and `scheduleEvals.ts` for both
  observation and transcript rules. Create scheduler dependencies once per batch.
  Match transcript rules while scheduling observation evals, including when
  observation scheduling fails, and buffer a span only after its events write
  returns the serialized byte length. Flush that buffer after the batch. Pass
  the original event start time; normalized evaluation observations do not
  contain it. Manual observation batches keep their existing
  scheduler and execution-mode semantics.
  Prompt experiments select observation rules only on their root span. Transcript
  recording preserves Topics' exclusion of internal environments, including prompt
  experiments. The direct internal writer retains its root-only ready callback.
- Trace batching: `src/features/traceBatching/traceBatching.ts`, `src/features/traceBatching/traceRuleRecording.ts` and `src/queues/traceBatchQueue.ts`. Read `src/features/traceBatching/README.md` before changing mode selection, readiness/Redis state, streaming, transcript capture or metrics. Preserve ingestion error boundaries and revision-guarded enqueue acknowledgement; a failed stream must not assemble its partial final trace. Trace-batch stores each sampled trace's inputs with `createTraceBatchInputStorage().put` and enqueues one `topics-trace-queue` job carrying `{ projectId, traceId, revision, ruleIds }`, deduplicated per revision; it makes no model calls. `src/features/topics/processTopicsTrace.ts` summarizes, embeds and assigns. Storage is required: oversized inputs or failed uploads count the trace as failed instead of enqueueing.
- Events dispatch: `src/features/eventsDispatch/`, consumed only on worker-cpu, replaces the trace-batch consumer when `LANGFUSE_EVENTS_DISPATCH_ENABLED`. It routes each trace's recorded rule IDs to consumers by evaluator type (`consumers.ts`), reads ClickHouse only for routed traces, stores the transcript once and enqueues one job per consumer; consumers resolve their rule definitions themselves. Per-trace failures return to the `{trace-dispatch:N}` maps via `RESTORE_RECORDING_SCRIPT` (backoff 5/15/45 min, then dropped); a failed read retries the whole job once. New names use events-dispatch; the Redis maps keep trace-dispatch.
- Audit log relay: `src/features/audit-log-relay/index.ts` moves Postgres
  `audit_log_staging` rows into ClickHouse `audit_logs`, deleting them only
  after ClickHouse acknowledged the insert. It starts only in cloud
  deployments (`NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` set). One worker task keeps
  the Redis lease and relays; the others check for a free lease every half
  lease TTL, so run count does not grow with the number of tasks. Rows whose
  payload fails the staging schema stay with `failed_at` set and are retried
  after 10 minutes.
- Evaluation terminal-outcome classification: `src/features/evaluation/evalExecutionMetrics.ts`. Keep it aligned with shared code evaluator dispatcher error codes and user-visible error mapping.
- Service layer: `src/services/*`
- `ClickhouseWriter.getInstance()` queues JSON rows; `getNativeInstance()` queues opaque `PreparedEvent` handles for `events_full`. Use `shutdownAll()` to drain both singletons. `IngestionService.writeEventRecord()` returns the accepted post-overflow row, including `event_bytes` in legacy sizing mode. Trace-batch intake reuses that estimate or measures JSON size only when enabled, to preserve its read-capacity guard. When v4 event writes are enabled, startup detects the `events_full` `byteSize` DEFAULT with `DESCRIBE TABLE` before queue consumers load. TypeScript writers use the DEFAULT only when confirmed; otherwise they preserve legacy estimates. Detection failures warn and continue. The mode stays fixed until restart. Native always omits `event_bytes` and requires the migration.
- Rust addon (`@langfuse/native`): telemetry init and the startup hello call live in `src/initialize.ts`, the health probe call in `src/api/index.ts`. Native code records its own metrics and logs; see `../packages/native/AGENTS.md`.
- Tests: `src/__tests__/*`, `src/queues/__tests__/*`
- Direct-event replay: `pnpm --filter worker run test:otel-replay` compares the
  original and early-media TypeScript paths from identical raw S3 JSON through
  the production OTEL queue and JSON writer into isolated ClickHouse tables,
  including retained legacy writes in dual-write mode. Setup and scope:
  `src/features/otel-ingestion/README.md`.
- Native codec checks: `pnpm --filter worker run test:native-codec` selects
  `nativeCodec` suites. Build the addon first; the command requires ClickHouse
  whenever the live parity suite is present.

## Shared Package Imports

- Prefer `@langfuse/shared/src/server` in worker runtime code for queue
  helpers/contracts, repositories, logger/instrumentation, Redis/ClickHouse
  helpers, auth helpers, and other shared backend services.
- Use `@langfuse/shared` for cross-runtime types, schemas, domain contracts,
  model-pricing helpers, and other frontend-safe utilities.
- Use `@langfuse/shared/src/db` only when worker code or tests need direct
  Prisma access.
- Use narrower subpaths such as `@langfuse/shared/src/env` or
  `@langfuse/shared/encryption` when you specifically need those focused
  helpers instead of the broader barrels.
- See `../packages/shared/AGENTS.md` for the full shared export map and what
  each entrypoint contains.
- For the higher-level platform topology across web, worker, Postgres,
  ClickHouse, Redis, and S3, also read the architecture handbook:
  [langfuse.com/handbook/product-engineering/architecture](https://langfuse.com/handbook/product-engineering/architecture)
  with source markdown in
  `../langfuse-docs/content/handbook/product-engineering/architecture.mdx`
  (GitHub mirror:
  [architecture.mdx](https://github.com/langfuse/langfuse-docs/blob/4188c1ba453240c90a763a8067ef442d68839323/content/handbook/product-engineering/architecture.mdx#L4)).

## Queue Playbook (Add/Change Queue Processor)

1. Update queue schemas/contracts in `../packages/shared/src/server/queues.ts`
   if payload or queue type changes.
2. Update queue accessors/helpers in
   `../packages/shared/src/server/redis/*` when needed.
3. Implement/update processor in `src/queues/*`.
4. Register/gate worker in `src/app.ts` (env flags, concurrency, limiter).
5. Add/adjust tests in `src/__tests__/*` or `src/queues/__tests__/*`.

- If a queue is sharded, also update shard-aware resolution in
  `src/queues/workerManager.ts`,
  `../web/src/pages/api/admin/bullmq/index.ts`, and
  `../web/src/__tests__/test-utils.ts`.

## Processor Conventions

- Keep queue handlers idempotent where possible.
- Preserve metrics/tracing patterns in `workerManager` and queue processors.
- Prefer explicit env-flag gating in `src/app.ts` for new consumers.
- Keep queue payload parsing/schema validation centralized in shared contracts.

## In-App Agent Runtime

- `src/features/in-app-agent-retention-cleaner/` expires conversations under
  current licensed project retention policies. Its exclusive periodic runner
  starts independently of batch-retention and assistant enablement, processes
  bounded batches, revokes MCP keys before cascading deletion, and leaves
  unfinished runs to the integrity runner.
- `src/features/in-app-agent/runtime/` owns Mastra adaptation, agent execution,
  instrumentation, prompt loading, continuation handling, tools, skills, and
  sandbox providers.
- `src/features/in-app-agent/runtime/skill-source.ts` exposes the repository Halo `langfuse` skill (`LANGFUSE_HALO_SKILLS`) and tagged hosted production skills through Mastra's read-only `SkillSource` interface. Hosted manifests take precedence by name; missing, unselected, or failed hosted lookups fall back to repository skills. Without a tag, only repository skills are exposed. A failed hosted catalogue request retains the repository catalogue. Caller cancellation propagates. Selected manifests and file contents are cached for each run; failed content requests can be retried. The next run discovers hosted updates. The agent's skills-only `Workspace` owns discovery, catalogue injection, search, and skill tools. The tracing processor records that same discovered catalogue.
- Worker env owns queue concurrency and sandbox configuration. Shared env owns
  the local AI profile (`LANGFUSE_AI_FEATURES_AWS_PROFILE`, with the legacy
  `LANGFUSE_IN_APP_AGENT_AWS_PROFILE` fallback); `AWS_PROFILE` takes precedence.
  Enablement is `LANGFUSE_IN_APP_AGENT_ENABLED` via
  `isInAppAgentInstanceEnabled()`. Optional
  `QUEUE_CONSUMER_IN_APP_AGENT_RUN_QUEUE_IS_ENABLED=false` and
  `LANGFUSE_IN_APP_AGENT_INTEGRITY_RUNNER_ENABLED=false` opt a split-role
  worker out of the queue consumer (and nested DLQ retry) or integrity runner.
  Shared lifecycle policy values are fixed constants, so web and worker cannot
  diverge.
- Persisted/queued contracts, lifecycle, storage, MCP policy, tool-result
  handling, and the seeded system prompt remain explicit shared subpaths.

## Package-Specific Rules

- Keep tests independent; no ordering assumptions.
- Avoid editing `dist/*` directly.
- Coordinate shared changes with `../packages/shared`.
- Changes to `src/features/blobstorage/` (export pipeline, enrichment logic,
  field additions, latency unit handling) should be reviewed against the
  published blob storage docs for consistency — fetch the latest pages and
  surface any discrepancies:
  - https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage
  - https://langfuse.com/docs/api-and-data-platform/features/blob-storage-export-fields
- be very mindful of adding additional `JSON.parse` calls in the ingestion processing pipeline. Those can cause performance issues, because JSONs might be very large. Ideally, parse each JSON subset only once.
