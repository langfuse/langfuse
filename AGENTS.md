# Codex Guidelines for Langfuse

Langfuse is an open source LLM engineering platform for developing, monitoring,
evaluating, and debugging AI applications.

This file is optimized for fast code changes in this monorepo:
- where code lives
- which files to edit for common tasks
- the quickest commands to validate changes

## Maintenance Contract
- `AGENTS.md` is a living document.
- Any agent must update this file in the same change/PR whenever anything
  material changes in repository structure, architecture, entry points, build or
  test commands, migration workflows, or generated-code workflows.
- Material changes include:
  - New/renamed packages or top-level folders
  - New/renamed entry points (API router roots, worker bootstrapping, env files)
  - Added/removed mandatory verification commands
  - New queue families, migration paths, or code-generation flows
- If a change is not material, leave this file unchanged.

## Package-Level AGENTS Files
- Core runtime packages should maintain package-local `AGENTS.md` files (at
  minimum: `web`, `worker`, `packages/shared`, `ee`).
- Small config-only packages may omit package-level `AGENTS.md` when the file
  would be mostly boilerplate.
- Scope split:
  - Root `AGENTS.md`: monorepo-level architecture and cross-package workflows.
  - Package `AGENTS.md`: implementation details local to that package.
- When a material change is package-local, update that package `AGENTS.md`.
- When a material change affects multiple packages or monorepo workflow, update
  both the package file(s) and root `AGENTS.md` in the same PR.

## DRY Rule (Strict)
- Root `AGENTS.md` must contain only monorepo-level guidance.
- Package-local commands, runbooks, and implementation details belong in each
  package `AGENTS.md`.
- If guidance is duplicated across files, keep the canonical version in the
  most specific package file and replace duplicates with references.

## AGENTS Update Decision Tree
1. Did you change monorepo-wide structure, workflows, or cross-package
   contracts?
   - Yes: update root `AGENTS.md` and every impacted package `AGENTS.md`.
   - No: continue.
2. Did you change only one package's internal structure/commands/workflows?
   - Yes: update that package `AGENTS.md` only.
   - No: continue.
3. Did you add/remove mandatory verification commands?
   - Yes: update root `AGENTS.md` and impacted package `AGENTS.md`.
4. If none of the above apply, no AGENTS update is required.

## Stack and Tooling
- Node.js: 24 (`.nvmrc`)
- Package manager: pnpm 9 (`pnpm-workspace.yaml`)
- Monorepo build: Turborepo (`turbo.json`)
- Frontend: Next.js 15 (Pages Router-centric), TypeScript 5, Tailwind
- Async processing: Express + BullMQ workers
- Data stores: PostgreSQL (Prisma), ClickHouse, Redis

## Repository Structure

```text
langfuse/
├─ web/                     # Next.js app (UI + tRPC + public REST endpoints)
├─ worker/                  # Queue workers and background processors
├─ packages/
│  ├─ shared/               # Shared domain logic, DB access, queues, schemas
│  ├─ config-eslint/
│  └─ config-typescript/
├─ ee/                      # Enterprise package consumed by web
├─ generated/               # Generated API clients (do not hand-edit)
├─ fern/                    # API definitions/generators
└─ scripts/                 # Repo scripts
```

## Dependency Boundaries
- Allowed package dependency direction:
  - `web` -> `@langfuse/shared`, `@langfuse/ee`
  - `worker` -> `@langfuse/shared`
  - `@langfuse/ee` -> `@langfuse/shared`
  - `@langfuse/shared` -> no imports from `web`, `worker`, or `ee`
- `@langfuse/shared` is the foundational layer for shared domain, DB, and queue
  contracts.
- Queue payload schemas and queue-name contracts must be defined in
  `packages/shared/src/server/queues.ts` first, then consumed by producers and
  consumers.
- Avoid cross-package cycles. If a change would introduce a cycle, move shared
  types/logic into `packages/shared`.
- App-local EE adapters live under `web/src/ee/*` and `worker/src/ee/*`; these
  must not be imported by `packages/shared`.

## Package Guides
- Web implementation details: `web/AGENTS.md`
- Worker implementation details: `worker/AGENTS.md`
- Shared domain/schema/queue details: `packages/shared/AGENTS.md`
- EE package details: `ee/AGENTS.md`

## Core Domain Hotspots
- Traces / observations / scores:
  - Domain types: `packages/shared/src/domain/{traces,observations,scores}.ts`
  - Repository reads/writes:
    `packages/shared/src/server/repositories/{traces,observations,scores}.ts`
  - Web API routers:
    `web/src/server/api/routers/{traces,observations,scores,sessions}.ts`
  - Worker delete/ingest processors:
    `worker/src/queues/{ingestionQueue,otelIngestionQueue,traceDelete}.ts`
    and `worker/src/features/traces/*`

- Datasets / evals:
  - Web routers/services:
    `web/src/features/datasets/server/*`, `web/src/features/evals/server/*`
  - Worker execution logic:
    `worker/src/queues/evalQueue.ts`, `worker/src/features/evaluation/*`
  - Shared domain types:
    `packages/shared/src/domain/{dataset-items,dataset-run-items}.ts`

- Prompts / automations / webhooks:
  - Prompt backend:
    `web/src/features/prompts/server/*`,
    `packages/shared/src/domain/prompts.ts`
  - Queue payload contracts:
    `packages/shared/src/server/queues.ts`
  - Worker side processors:
    `worker/src/queues/{webhooks,entityChangeQueue}.ts`

- Public API surface:
  - Routes: `web/src/pages/api/public/*`
  - Contract schemas: `web/src/features/public-api/types/*`
  - Spec source: `fern/apis/**`

- Configuration:
  - Web runtime env parsing: `web/src/env.mjs`
  - Worker runtime env parsing: `worker/src/env.ts`
  - Root env examples: `.env*.example`

## Cross-Package Routing
- UI, tRPC, and public REST API work: start in `web/AGENTS.md`
- Queue consumers/processors: start in `worker/AGENTS.md`
- Shared contracts, schema, and repository-layer changes: start in
  `packages/shared/AGENTS.md`
- EE package changes: start in `ee/AGENTS.md`
- For cross-cutting changes, follow each impacted package guide and then apply
  the root verification matrix.

## Rapid Discovery Commands
- Find relevant feature files:
  - `rg --files web/src/features worker/src/features packages/shared/src/features | rg "<keyword>"`
- Find existing API handlers for a domain:
  - `rg "<domain>" web/src/server/api web/src/pages/api/public web/src/features -g '*.ts' -g '*.tsx'`
- Find queue definitions and processors:
  - `rg "QueueName|queue|Processor" packages/shared/src/server worker/src/queues worker/src/features`
- Find env flags and config gates:
  - `rg "LANGFUSE_|NEXT_PUBLIC_" web/src worker/src packages/shared/src -g '*.ts' -g '*.tsx' -g '*.mjs'`
- Find tests for touched code:
  - `rg --files web/src/__tests__ worker/src | rg "<keyword>|test|servertest|clienttest"`

## Monorepo Utility Commands
- Install deps: `pnpm install`
- Dev all packages: `pnpm run dev`
- Dev web only: `pnpm run dev:web`
- Dev worker only: `pnpm run dev:worker`
- Full reset/bootstrap: `pnpm run dx` (destructive; resets DB/infrastructure)
- Lint all: `pnpm run lint`
- Typecheck all: `pnpm run typecheck`
- Build all: `pnpm run build`

## Minimum Verification Matrix
| Change scope | Minimum verification |
| --- | --- |
| `web/**` only | `pnpm --filter web run lint` + targeted web tests (`pnpm --filter web run test -- --testPathPatterns="<area>"` or `pnpm --filter web run test-client -- --testPathPatterns="<area>"`) |
| `worker/**` only | `pnpm --filter worker run lint` + targeted worker tests (`pnpm --filter worker run test -- <area>`) |
| `packages/shared/**` (non-schema) | `pnpm --filter @langfuse/shared run lint` + one targeted web check + one targeted worker check |
| `packages/shared/prisma/**` or `packages/shared/clickhouse/**` | `pnpm --filter @langfuse/shared run lint` + `pnpm run db:generate` + targeted web/worker regression tests |
| `web/src/pages/api/public/**` or `web/src/features/public-api/types/**` or `fern/apis/**` | `pnpm --filter web run lint` + targeted server API tests + Fern update/regeneration when contract changes (never hand-edit `generated/**`) |
| Cross-package refactor (`web` + `worker` + `shared`) | `pnpm run lint` + `pnpm run typecheck` + targeted tests per impacted package |

## Testing Rules
- Codex cannot run the full Docker-backed test stack in this environment.
- Keep each `it`/`test` independent and parallel-safe.
- Tests must never depend on prior/subsequent tests.
- In `web/src/__tests__/server`, avoid `pruneDatabase` calls.

## Edit Safety
- Do not hand-edit generated/build output:
  - `web/.next/*`
  - `web/.next-check/*`
  - `*/dist/*`
  - `generated/*`
  - `packages/shared/prisma/generated/*`
- Keep changes scoped; avoid unrelated refactors.
- Do not run destructive reset commands (`pnpm run dx`, `pnpm run nuke`) unless
  explicitly requested.

## Cursor Rules
- Additional folder-specific rules live in `.cursor/rules/`.

## Commits
- Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
  when crafting commit messages.
