---
name: backend-dev-guidelines
description: Use when creating or modifying tRPC routers, public API endpoints, worker queue processors, backend services, Prisma or ClickHouse data access, auth, validation, observability, or backend tests in Langfuse.
---

# Backend Development Guidelines

## When to Use This Skill

Use this skill before editing backend code in:
- `web/src/server/**`
- `web/src/pages/api/public/**`
- `web/src/features/**/server/**`
- `worker/src/**`
- `packages/shared/src/server/**`

## Start Here

1. Read the nearest package-local `AGENTS.md`.
2. Pick the verification row from the root `AGENTS.md` before you start.
3. Keep routes, procedures, and queue processors thin. Put business logic in a
   service.

## Core Rules

- Use `zod/v4` for input validation.
- Use `env.mjs` or `env.ts`, never raw `process.env` outside env files.
- Filter project-scoped data by `projectId` or `project_id` for tenant
  isolation.
- Use Prisma from `@langfuse/shared/src/db` for simple CRUD.
- Use shared repositories and server utilities for complex ClickHouse or
  reporting queries.
- Use `logger`, `traceException`, and `instrumentAsync` for backend
  observability.
- Keep Fern definitions in sync when public API types change.

## Package Routing

### Web tRPC

- Define feature logic in `web/src/features/<feature>/server/`.
- Keep procedures focused on auth, validation, and service delegation.
- Prefer composed procedure types such as `protectedProjectProcedure`.

### Public API

- Route files live in `web/src/pages/api/public/**`.
- Use the existing wrappers such as `withMiddlewares` and
  `createAuthedProjectAPIRoute`.
- Update matching Zod types in `web/src/features/public-api/types/**`.
- Update Fern definitions in `fern/apis/**`.

### Worker

- Queue processors live in `worker/src/queues/**`.
- Queue names and payload contracts belong in
  `packages/shared/src/server/queues.ts`.
- Processors should orchestrate and delegate, not hold large business flows.

### Shared

- `packages/shared` may be imported by `web`, `worker`, and `ee`.
- Do not add imports from `packages/shared` back into app packages.

## Testing Expectations

- Web backend tests use Jest, usually in `web/src/__tests__/async/**`.
- Worker tests use Vitest in `worker/src/__tests__/**`.
- Keep tests independent and parallel-safe.
- In `web/src/__tests__/server`, do not use `pruneDatabase`.
- For bug fixes, write the failing test first.

## Finish Checklist

- The code follows the package boundary rules from `AGENTS.md`.
- Input is validated with Zod.
- Tenant isolation is preserved.
- Public API and Fern stay in sync if needed.
- Verification matches the root matrix.
