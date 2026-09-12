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
- Trace-read micro-batching: `src/features/traces/traceBatching.ts` tracks
  successful direct-v4 writer submissions and dispatches ready traces across projects
  to `trace-batch`; `src/queues/traceBatchQueue.ts` reads their event payloads.
  The cross-project experiment collects the entire due cohort at a fixed cutoff,
  sorts the due ID list by project ID in worker memory, and packs batches
  capped by `LANGFUSE_TRACE_BATCH_MAX_SIZE` (default 60). Upgrade every consumer
  before enabling cross-project dispatch; consumers also accept legacy jobs.
  `LANGFUSE_TRACE_BATCH_STRATEGY=locality` optionally groups each bounded
  hydration window plus one partial tail in `events_full` sort-key order:
  project, observed start-time minute range, then `xxHash32(trace_id)`;
  `project` remains the default and immediate rollback path. The locality
  selector is deterministic and flushes every candidate in the same run.
  One Redis range read collects all due IDs; state hydration and expiry cleanup
  are bounded. The complete run has no trace-count/time cutoff. Worker memory
  and the ID response size scale with the due backlog; no scratch disk is used.
  Intake, dispatcher, and consumer have independent disabled-by-default flags.
  `LANGFUSE_TRACE_BATCH_SAMPLING_RATE` is a 0–1 admission rate (default 1),
  using evaluator sampling by trace ID before Redis; queued work is not resampled.
  Stop intake first and keep dispatcher/consumer running to drain pending work.
  Pending entries are pruned atomically from due/state during ingestion and
  dispatch after `LANGFUSE_TRACE_BATCH_PENDING_TTL_MS` past readiness (default
  two hours). This is opportunistic retention, not native Redis key expiry.
- Feature processors: `src/features/*`
- Evaluation terminal-outcome classification: `src/features/evaluation/evalExecutionMetrics.ts`. Keep it aligned with shared code evaluator dispatcher error codes and user-visible error mapping.
- Service layer: `src/services/*`
- Tests: `src/__tests__/*`, `src/queues/__tests__/*`

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
