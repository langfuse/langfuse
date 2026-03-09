---
name: backend-dev-guidelines
description: Shared backend guide for Langfuse's Next.js 14, tRPC, BullMQ, and TypeScript monorepo. Use when creating or reviewing tRPC routers, public REST endpoints, BullMQ queue processors, backend services, middleware, Prisma or ClickHouse data access, OpenTelemetry instrumentation, Zod validation, env configuration, or backend tests across web, worker, or packages/shared.
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

- Start with [AGENTS.md](AGENTS.md) when the task spans multiple backend areas
  or you need the end-to-end checklists.
- Read only the specific resource file that matches the work when the scope is
  narrower.

## Resource Map

| Topic | Read this when | File |
| --- | --- | --- |
| Architecture and package boundaries | You need the web/worker/shared split, request flow, or queue lifecycle | [resources/architecture-overview.md](resources/architecture-overview.md) |
| Routing and controllers | You are writing tRPC procedures, public API routes, or queue entrypoints | [resources/routing-and-controllers.md](resources/routing-and-controllers.md) |
| Middleware and auth | You are changing request auth, permissions, or middleware composition | [resources/middleware-guide.md](resources/middleware-guide.md) |
| Services and repositories | You are placing business logic, repository code, or DI patterns | [resources/services-and-repositories.md](resources/services-and-repositories.md) |
| Database access | You are touching Prisma, ClickHouse, tenant filters, or query patterns | [resources/database-patterns.md](resources/database-patterns.md) |
| Configuration | You are adding env vars, startup config, or runtime toggles | [resources/configuration.md](resources/configuration.md) |
| Testing | You are adding or updating backend tests | [resources/testing-guide.md](resources/testing-guide.md) |

## Full Compiled Guide

Read [AGENTS.md](AGENTS.md) for the complete backend guide with checklists,
directory conventions, imports, architecture, and cross-cutting practices.
