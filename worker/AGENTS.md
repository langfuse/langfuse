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
- OTEL event processing:
  `src/features/otel-ingestion/processOtelEvents.ts`; the OTEL queue calls this
  after its legacy persistence path for event normalization, evaluation
  scheduling, direct events-table writes, and trace-batch accounting.
- Internal cloud trace batching: `src/features/traceBatching/traceBatching.ts` and
  `src/queues/traceBatchQueue.ts`; controls and Redis lifecycle are documented in
  `src/features/traceBatching/README.md`. Keep producer, dispatcher, consumer and reads
  independently default-off and cloud-gated. Do not expose these PoC controls in
  local or production env templates. Reader query controls are independent of
  locality selection; logs must preserve separate input/output/metadata metrics.
  `src/features/traceBatching/TraceBatchMetricsRunner.ts` collects bounded queue
  and Redis snapshots independently of dispatch/consumption when either role is
  enabled. Global snapshot gauges must not be summed across worker reporters.
  `src/features/traceBatching/traceBatchTranscript.ts` measures per-trace assembly
  and token estimates. Allow one pending tokenization promise per batch while
  buffering the next trace, and drain it even on read failure. Never flush a failed
  stream's partial final trace; completion covers the query window, not future arrivals.
- Evaluation terminal-outcome classification: `src/features/evaluation/evalExecutionMetrics.ts`. Keep it aligned with shared code evaluator dispatcher error codes and user-visible error mapping.
- Service layer: `src/services/*`
- Rust addon (`@langfuse/native`): telemetry init and the startup hello call live
  in `src/initialize.ts`, the health probe call in `src/api/index.ts`. Native code
  records its own metrics and logs; see `../packages/native/AGENTS.md`.
- Tests: `src/__tests__/*`, `src/queues/__tests__/*`
- Direct-event replay: `pnpm --filter worker run test:otel-replay` exercises the
  production OTEL event phase with isolated ClickHouse tables. Setup and scope:
  `src/features/otel-ingestion/README.md`.

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

- `src/features/in-app-agent/runtime/` owns Mastra adaptation, agent execution,
  instrumentation, prompt loading, continuation handling, tools, skills, and
  sandbox providers.
- Worker env owns queue concurrency, sandbox configuration, and the
  development-only in-app-agent AWS profile. Enablement is
  `LANGFUSE_IN_APP_AGENT_ENABLED` via `isInAppAgentInstanceEnabled()`. Optional
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
