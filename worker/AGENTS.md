# Codex Guidelines for `worker`

This file covers package-local guidance for this package.
Use root [AGENTS.md](../AGENTS.md) for monorepo-level rules.

## Purpose

- Background job processor built on Express + BullMQ.
- Owns queue consumers, async processors, and operational scripts.

## Maintenance Contract

- `AGENTS.md` is a living document.
- Update this file in the same PR for material worker-local changes:
  - new/renamed queue processors
  - new worker bootstrapping points
  - changed worker verification commands
- If queue contracts or shared workflows change, update root `AGENTS.md` and
  likely `../packages/shared/AGENTS.md` too.

## High-Signal Entry Points

- Bootstrap: `src/index.ts`, `src/app.ts`
- Worker registration/lifecycle: `src/queues/workerManager.ts`
- Queue processors: `src/queues/*`
- Feature processors: `src/features/*`
- Service layer: `src/services/*`
- Background migrations: `src/backgroundMigrations/*`
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

## Quick Commands

- Dev: `pnpm --filter worker run dev`
- Lint: `pnpm --filter worker run lint`
- Lint fix: `pnpm --filter worker run lint:fix`
- Typecheck: `pnpm --filter worker run typecheck`
- Tests: `pnpm --filter worker run test <file-or-pattern>`
- Coverage: `pnpm --filter worker run coverage [file-or-pattern]`
- Build: `pnpm --filter worker run build`

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

## Operational Scripts

- Refill ingestion events: `pnpm --filter worker run refill-ingestion-events`
- Refill billing event: `pnpm --filter worker run refill-billing-event`
- Refill queue event: `pnpm --filter worker run refill-queue-event`

## Package-Specific Rules

- Keep tests independent; no ordering assumptions.
- Avoid editing `dist/*` directly.
- Coordinate shared changes with `../packages/shared`.
