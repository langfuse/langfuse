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

## Quick Commands
- Dev: `pnpm --filter worker run dev`
- Lint: `pnpm --filter worker run lint`
- Lint fix: `pnpm --filter worker run lint:fix`
- Typecheck: `pnpm --filter worker run typecheck`
- Tests: `pnpm --filter worker run test -- <file-or-pattern>`
- Coverage: `pnpm --filter worker run coverage`
- Build: `pnpm --filter worker run build`

## Queue Playbook (Add/Change Queue Processor)
1. Update queue schemas/contracts in `../packages/shared/src/server/queues.ts`
   if payload or queue type changes.
2. Update queue accessors/helpers in
   `../packages/shared/src/server/redis/*` when needed.
3. Implement/update processor in `src/queues/*`.
4. Register/gate worker in `src/app.ts` (env flags, concurrency, limiter).
5. Add/adjust tests in `src/__tests__/*` or `src/queues/__tests__/*`.

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
