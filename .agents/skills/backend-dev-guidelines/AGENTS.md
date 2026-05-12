# Backend Development Guidelines

## Purpose

Establish consistency and best practices across Langfuse's backend packages
(`web`, `worker`, `packages/shared`) using Next.js, tRPC, BullMQ, and TypeScript
patterns. Check package manifests such as `web/package.json` for current
framework versions before version-sensitive work.
Keep this file as an entrypoint; open reference files only when the task needs
their details.

## When to Use This Skill

Use this guide when working on:

- Creating or modifying tRPC routers and procedures
- Creating or modifying public API endpoints (REST)
- Creating or modifying BullMQ queue consumers and producers
- Building services with business logic
- Authenticating API requests
- Accessing resources based on entitlements
- Implementing middleware (tRPC, NextAuth, public API)
- Database operations with Prisma (PostgreSQL) or ClickHouse
- Observability with OpenTelemetry, DataDog, logger, and traceException
- Input validation with Zod v4
- Environment configuration from env variables
- Backend testing and refactoring

---

## Quick Start

### UI: New tRPC Feature Checklist (Web)

- [ ] **Router**: Define in `features/[feature]/server/*Router.ts`
- [ ] **Procedures**: Use appropriate procedure type (protected, public)
- [ ] **Authentication**: Use JWT authorization via middlewares.
- [ ] **Entitlement check**: Access resources based on resource and role
- [ ] **Validation**: Zod v4 schema for input
- [ ] **Service**: Business logic in service file
- [ ] **Error handling**: Use traceException wrapper
- [ ] **Tests**: Unit + integration tests in `__tests__/`
- [ ] **Config**: Access via env.mjs

### SDKs: New Public API Endpoint Checklist (Web)

- [ ] **Route file**: Create in `pages/api/public/`
- [ ] **Wrapper**: Use `withMiddlewares` + `createAuthedProjectAPIRoute`
- [ ] **Types**: Define in `features/public-api/types/`
- [ ] **Authentication**: Authorization via basic auth
- [ ] **Validation**: Zod schemas for query/body/response
- [ ] **Versioning**: Versioning in API path and Zod schemas for query/body/response
- [ ] **Fern API Docs**: Update `fern/apis/server/definition/` to match TypeScript types
- [ ] **Tests**: Add end-to-end test in `__tests__/async/`

### New Queue Processor Checklist (Worker)

- [ ] **Processor**: Create in `worker/src/queues/`
- [ ] **Queue types**: Create queue types in `packages/shared/src/server/queues`
- [ ] **Service**: Business logic in `features/` or `worker/src/features/`
- [ ] **Error handling**: Distinguish between errors which should fail queue processing and errors which should result in a succeeded event.
- [ ] **Queue registration**: Add to WorkerManager in app.ts
- [ ] **Tests**: Add vitest tests in worker

---

## Architecture Overview

### Layered Architecture

```
# Web Package (Next.js)

┌─ tRPC API ──────────────────┐   ┌── Public REST API ──────────┐
│                             │   │                             │
│  HTTP Request               │   │  HTTP Request               │
│      ↓                      │   │      ↓                      │
│  tRPC Procedure             │   │  withMiddlewares +          │
│  (protectedProjectProcedure)│   │  createAuthedProjectAPIRoute│
│      ↓                      │   │      ↓                      │
│  Service (business logic)   │   │  Service (business logic)   │
│      ↓                      │   │      ↓                      │
│  Prisma / ClickHouse        │   │  Prisma / ClickHouse        │
│                             │   │                             │
└─────────────────────────────┘   └─────────────────────────────┘
                 ↓
            [optional]: Publish to Redis BullMQ queue
                 ↓
┌─ Worker Package (Express) ──────────────────────────────────┐
│                                                             │
│  BullMQ Queue Job                                           │
│      ↓                                                      │
│  Queue Processor (handles job)                              │
│      ↓                                                      │
│  Service (business logic)                                   │
│      ↓                                                      │
│  Prisma / ClickHouse                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Principles:**

- **Web**: tRPC procedures for UI OR public API routes for SDKs → Services → Database
- **Worker**: Queue processors → Services → Database
- **packages/shared**: Shared code for Web and Worker

See [references/architecture-overview.md](references/architecture-overview.md)
for complete details.

---

## Core Principles

### 1. tRPC Procedures Delegate to Services

```typescript
// ❌ NEVER: Business logic in procedures
export const traceRouter = createTRPCRouter({
  byId: protectedProjectProcedure
    .input(z.object({ traceId: z.string() }))
    .query(async ({ input, ctx }) => {
      // 200 lines of logic here
    }),
});

// ✅ ALWAYS: Delegate to service
export const traceRouter = createTRPCRouter({
  byId: protectedProjectProcedure
    .input(z.object({ traceId: z.string() }))
    .query(async ({ input, ctx }) => {
      return await getTraceById(input.traceId);
    }),
});
```

### 2. Access Config via env.mjs, NEVER process.env

```typescript
// ❌ NEVER (except in env.mjs itself)
const dbUrl = process.env.DATABASE_URL;

// ✅ ALWAYS
import { env } from "@/src/env.mjs";
const dbUrl = env.DATABASE_URL;
```

### 3. Validate ALL Input with Zod v4

```typescript
import { z } from "zod/v4";

const schema = z.object({
  email: z.string().email(),
  projectId: z.string(),
});
const validated = schema.parse(input);
```

### 4. Services Use Prisma Directly for Simple CRUD or Repositories for Complex Queries

```typescript
// Services use Prisma directly for simple CRUD
import { prisma } from "@langfuse/shared/src/db";

const dataset = await prisma.dataset.findUnique({
  where: { id: datasetId, projectId }, // Always filter by projectId for tenant isolation
});

// Or use repositories for complex queries (traces, observations, scores)
import { getTracesTable } from "@langfuse/shared/src/server";

const traces = await getTracesTable({
  projectId,
  filter: [...],
  limit: 1000,
});
```

### 6. Observability: OpenTelemetry + DataDog (Not Sentry for Backend)

**Langfuse uses OpenTelemetry for backend observability, with traces and logs sent to DataDog.**

```typescript
// Import observability utilities
import {
  logger,          // Winston logger with OpenTelemetry/DataDog context
  traceException,  // Record exceptions to OpenTelemetry spans
  instrumentAsync, // Create instrumented spans
} from "@langfuse/shared/src/server";

// Structured logging (includes trace_id, span_id, dd.trace_id)
logger.info("Processing dataset", { datasetId, projectId });
logger.error("Failed to create dataset", { error: err.message });

// Record exceptions to OpenTelemetry (sent to DataDog)
try {
  await operation();
} catch (error) {
  traceException(error); // Records to current span
  throw error;
}

// Instrument critical operations (all API routes auto-instrumented)
const result = await instrumentAsync(
  { name: "dataset.create" },
  async (span) => {
    span.setAttributes({ datasetId, projectId });
    // Operation here
    return dataset;
  },
);
```

**Note**: Frontend uses Sentry, but backend (tRPC, API routes, services, worker) uses OpenTelemetry + DataDog.

### 7. Comprehensive Testing Required

Add targeted tests for new backend behavior and bug fixes. Keep tests
independent and parallel-safe. See
[testing-guide.md](references/testing-guide.md) for tRPC, public API, service,
repository, and worker examples.

### 8. Always Filter by projectId for Tenant Isolation

```typescript
// ✅ CORRECT: Filter by projectId for tenant isolation
const trace = await prisma.trace.findUnique({
  where: { id: traceId, projectId }, // Required for multi-tenant data isolation
});

// ✅ CORRECT: ClickHouse queries also require projectId
const traces = await queryClickhouse({
  query: `
    SELECT * FROM traces
    WHERE project_id = {projectId: String}
    AND timestamp >= {startTime: DateTime64(3)}
  `,
  params: { projectId, startTime },
});
```

### 9. Keep Fern API Definitions in Sync with TypeScript Types

When modifying public API types in `web/src/features/public-api/types/`, the corresponding Fern API definitions in `fern/apis/server/definition/` must be updated to match.

**Zod to Fern Type Mapping:**

| Zod Type | Fern Type | Example |
| -------- | --------- | ------- |
| `.nullish()` | `optional<nullable<T>>` | `z.string().nullish()` → `optional<nullable<string>>` |
| `.nullable()` | `nullable<T>` | `z.string().nullable()` → `nullable<string>` |
| `.optional()` | `optional<T>` | `z.string().optional()` → `optional<string>` |
| Always present | `T` | `z.string()` → `string` |

**Source References:**

Add a comment at the top of each Fern type referencing the TypeScript source file:

```yaml
# Source: web/src/features/public-api/types/traces.ts - APITrace
Trace:
  properties:
    id: string
    name:
      type: nullable<string>
```

---

## Live Examples

Reference existing Langfuse features for implementation patterns:
- tRPC router with project auth and Zod input:
  `web/src/features/events/server/eventsRouter.ts`
- Public API route with middleware and typed request/response schemas:
  `web/src/pages/api/public/datasets/index.ts`
- Worker queue processor with typed jobs, logging, and retry behavior:
  `worker/src/queues/evalQueue.ts`
- Tenant filters for Prisma and ClickHouse:
  `references/database-patterns.md`

---

## Naming Conventions

- tRPC routers: `camelCaseRouter.ts`, e.g. `datasetRouter.ts`
- Services: `service.ts` in the feature server directory
- Queue processors: `camelCaseQueue.ts`, e.g. `evalQueue.ts`
- Public API routes: kebab-case filenames, e.g. `dataset-items.ts`

---

## Anti-Patterns to Avoid

❌ Business logic in routes/procedures
❌ Direct process.env usage (always use env.mjs/env.ts)
❌ Missing error handling
❌ No input validation (always use Zod v4)
❌ Missing projectId filter on tenant-scoped queries
❌ console.log instead of logger/traceException (OpenTelemetry)

---

## Navigation Guide

Keep detailed backend guidance in these focused reference files and open only
the one that matches the task.

| Need to...                | Read this                                                    |
| ------------------------- | ------------------------------------------------------------ |
| Understand architecture   | [architecture-overview.md](references/architecture-overview.md)         |
| Create routes/controllers | [routing-and-controllers.md](references/routing-and-controllers.md)     |
| Organize business logic   | [services-and-repositories.md](references/services-and-repositories.md) |
| Create middleware         | [middleware-guide.md](references/middleware-guide.md)                   |
| Database access           | [database-patterns.md](references/database-patterns.md)                 |
| Manage config             | [configuration.md](references/configuration.md)                         |
| Write tests               | [testing-guide.md](references/testing-guide.md)                         |

---
