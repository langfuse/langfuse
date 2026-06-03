---
name: backend-dev-guidelines
description: Shared backend guide for Langfuse's Next.js, tRPC, BullMQ, and TypeScript monorepo. Use when creating or reviewing tRPC routers, public REST endpoints, BullMQ queue processors, backend services, middleware, Prisma or ClickHouse data access, OpenTelemetry instrumentation, Zod validation, env configuration, or backend tests across web, worker, or packages/shared.
---

# Backend Development Guidelines

Use this skill for backend and API work across `web/`, `worker/`, and
`packages/shared/`.

## When to Apply

- Creating or modifying tRPC routers and procedures
- Creating or modifying public API endpoints
- Creating or modifying queue processors, producers, or queue-backed workflows
- Building or refactoring backend services and repositories
- Working on backend auth, middleware, validation, or observability
- Updating Prisma or ClickHouse access patterns
- Adding or fixing backend tests

## How to Read This Skill

- Use this `SKILL.md` when the task spans multiple backend areas or you need the
  end-to-end reference map.
- Read only the specific reference file that matches the work when the scope is
  narrower.

## Quick Start Checklists

### UI: New tRPC Feature

- Define the router in `features/[feature]/server/*Router.ts`.
- Use the appropriate protected or public procedure.
- Authenticate with JWT-aware middleware.
- Check project/resource access and entitlements.
- Validate input with Zod v4.
- Put business logic in a service file.
- Use `traceException` for error handling where relevant.
- Add unit or integration tests in `__tests__/`.
- Access config via `env.mjs`.

### SDKs: New Public API Endpoint

- Create the route in `pages/api/public/`.
- Wrap it with `withMiddlewares` and `createAuthedProjectAPIRoute`.
- Define types in `features/public-api/types/`.
- Authenticate with basic auth.
- Validate query, body, and response with Zod schemas.
- Include API versioning in paths and schemas.
- Update Fern API definitions to match TypeScript types.
- Add end-to-end tests in `__tests__/async/`.

### Worker: New Queue Processor

- Create the processor in `worker/src/queues/`.
- Define queue types in `packages/shared/src/server/queues`.
- Place business logic in `features/` or `worker/src/features/`.
- Distinguish failed jobs from jobs that should succeed with a recorded error.
- Register the queue in `WorkerManager` in `app.ts`.
- Add worker vitest coverage.

## Core Principles

- tRPC procedures, public API routes, and queue processors delegate business
  logic to services.
- Access configuration through `env.mjs`; do not read `process.env` directly
  outside env setup.
- Validate all external input with Zod v4.
- Use Prisma directly for simple CRUD and repositories for complex query access.
- Use OpenTelemetry and DataDog for backend observability.
- Always filter project-scoped database reads by `projectId`.
- Keep Fern API definitions in sync with public TypeScript API contracts.
- Keep backend tests independent and parallel-safe.

## Live Examples

- tRPC router with project auth and Zod input:
  `web/src/features/events/server/eventsRouter.ts`.
- Public API route with middleware and typed request/response schemas:
  `web/src/pages/api/public/datasets/index.ts`.
- Worker queue processor with typed jobs, logging, and retry behavior:
  `worker/src/queues/evalQueue.ts`.
- Tenant filters for Prisma and ClickHouse:
  `references/database-patterns.md`.

## Naming Conventions

- tRPC routers: `camelCaseRouter.ts`, for example `datasetRouter.ts`.
- Services: `service.ts` in the feature server directory.
- Queue processors: `camelCaseQueue.ts`, for example `evalQueue.ts`.
- Public API routes: kebab-case filenames, for example `dataset-items.ts`.

## Anti-Patterns to Avoid

- Business logic in routes or procedures.
- Direct `process.env` usage instead of `env.mjs` / `env.ts`.
- Missing error handling.
- Missing input validation.
- Missing `projectId` filters on tenant-scoped queries.
- `console.log` instead of `logger` / `traceException`.

## Reference Map

| Topic                               | Read this when                                                           | File                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Architecture and package boundaries | You need the web/worker/shared split, request flow, or queue lifecycle   | [references/architecture-overview.md](references/architecture-overview.md)         |
| Routing and controllers             | You are writing tRPC procedures, public API routes, or queue entrypoints | [references/routing-and-controllers.md](references/routing-and-controllers.md)     |
| Middleware and auth                 | You are changing request auth, permissions, or middleware composition    | [references/middleware-guide.md](references/middleware-guide.md)                   |
| Services and repositories           | You are placing business logic, repository code, or DI patterns          | [references/services-and-repositories.md](references/services-and-repositories.md) |
| Database access                     | You are touching Prisma, ClickHouse, tenant filters, or query patterns   | [references/database-patterns.md](references/database-patterns.md)                 |
| Configuration                       | You are adding env vars, startup config, or runtime toggles              | [references/configuration.md](references/configuration.md)                         |
| Testing                             | You are adding or updating backend tests                                 | [references/testing-guide.md](references/testing-guide.md)                         |

## Full Guide

This `SKILL.md` is the backend entrypoint. Open the focused references above for
directory conventions, imports, architecture, and cross-cutting practices.
