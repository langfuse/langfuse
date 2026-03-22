# Backend Development Guidelines

## Purpose

Establish consistency and best practices across Langfuse's backend packages (web, worker, packages/shared) using Next.js 14, tRPC, BullMQ, and TypeScript patterns.

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
# Web Package (Next.js 14)

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

## Directory Structure

### Web Package (`/web/`)

```
web/src/
├── features/                # Feature-organized code
│   ├── [feature-name]/
│   │   ├── server/          # Backend logic
│   │   │   ├── *Router.ts   # tRPC router
│   │   │   └── service.ts   # Business logic
│   │   ├── components/      # React components
│   │   └── types/           # Feature types
├── server/
│   ├── api/
│   │   ├── routers/         # tRPC routers
│   │   ├── trpc.ts          # tRPC setup & middleware
│   │   └── root.ts          # Main router
│   ├── auth.ts              # NextAuth.js config
│   └── db.ts                # Database client
├── pages/
│   ├── api/
│   │   ├── public/          # Public REST APIs
│   │   └── trpc/            # tRPC endpoint
│   └── [routes].tsx         # Next.js pages
├── __tests__/               # Jest tests
│   └── async/               # Integration tests
├── instrumentation.ts       # OpenTelemetry (FIRST IMPORT)
└── env.mjs                  # Environment config
```

### Worker Package (`/worker/`)

```
worker/src/
├── queues/                  # BullMQ processors
│   ├── evalQueue.ts
│   ├── ingestionQueue.ts
│   └── workerManager.ts
├── features/                # Business logic
│   └── [feature]/
│       └── service.ts
├── instrumentation.ts       # OpenTelemetry (FIRST IMPORT)
├── app.ts                   # Express setup + queue registration
├── env.ts                   # Environment config
└── index.ts                 # Server start
```

### Shared Package (`/packages/shared/`)

```
shared/src/
├── server/                  # Server utilities
│   ├── auth/                # Authentication helpers
│   ├── clickhouse/          # ClickHouse client & schema
│   ├── instrumentation/     # OpenTelemetry helpers
│   ├── llm/                 # LLM integration utilities
│   ├── redis/               # Redis queues & cache
│   ├── repositories/        # Data repositories
│   ├── services/            # Shared services
│   ├── utils/               # Server utilities
│   ├── logger.ts
│   └── queues.ts
├── encryption/              # Encryption utilities
├── features/                # Feature-specific code
├── tableDefinitions/        # Table schemas
├── utils/                   # Shared utilities
├── constants.ts
├── db.ts                    # Prisma client
├── env.ts                   # Environment config
└── index.ts                 # Main exports
```

**Import Paths (package.json exports):**

The shared package exposes specific import paths for different use cases:

| Import Path                                | Maps To                           | Use For                                                         |
| ------------------------------------------ | --------------------------------- | --------------------------------------------------------------- |
| `@langfuse/shared`                         | `dist/src/index.js`               | General types, schemas, utilities, constants                    |
| `@langfuse/shared/src/db`                  | `dist/src/db.js`                  | Prisma client and database types                                |
| `@langfuse/shared/src/server`              | `dist/src/server/index.js`        | Server-side utilities (queues, auth, services, instrumentation) |
| `@langfuse/shared/src/server/auth/apiKeys` | `dist/src/server/auth/apiKeys.js` | API key management utilities                                    |
| `@langfuse/shared/encryption`              | `dist/src/encryption/index.js`    | Encryption and signature utilities                              |

**Usage Examples:**

```typescript
// General imports - types, schemas, constants, interfaces
import {
  CloudConfigSchema,
  StringNoHTML,
  AnnotationQueueObjectType,
  type APIScoreV2,
  type ColumnDefinition,
  Role,
} from "@langfuse/shared";

// Database - Prisma client and types
import { prisma, Prisma, JobExecutionStatus } from "@langfuse/shared/src/db";
import { type DB as Database } from "@langfuse/shared";

// Server utilities - queues, services, auth, instrumentation
import {
  logger,
  instrumentAsync,
  traceException,
  redis,
  getTracesTable,
  StorageService,
  sendMembershipInvitationEmail,
  invalidateApiKeysForProject,
  recordIncrement,
  recordHistogram,
} from "@langfuse/shared/src/server";

// API key management (specific path)
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

// Encryption utilities
import { encrypt, decrypt, sign, verify } from "@langfuse/shared/encryption";
```

**What Goes Where:**

The shared package provides types, utilities, and server code used by both web and worker packages. It has **5 export paths** that control frontend vs backend access:

| Import Path                                | Usage                 | What's Included                                                                    |
| ------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------- |
| `@langfuse/shared`                         | ✅ Frontend + Backend | Prisma types, Zod schemas, constants, table definitions, domain models, utilities  |
| `@langfuse/shared/src/db`                  | 🔒 Backend only       | Prisma client instance                                                             |
| `@langfuse/shared/src/server`              | 🔒 Backend only       | Services, repositories, queues, auth, ClickHouse, LLM integration, instrumentation |
| `@langfuse/shared/src/server/auth/apiKeys` | 🔒 Backend only       | API key management (separated to avoid circular deps)                              |
| `@langfuse/shared/encryption`              | 🔒 Backend only       | Database field encryption/decryption                                               |

**Naming Conventions:**

- tRPC Routers: `camelCaseRouter.ts` - `datasetRouter.ts`
- Services: `service.ts` in feature directory
- Queue Processors: `camelCaseQueue.ts` - `evalQueue.ts`
- Public APIs: `kebab-case.ts` - `dataset-items.ts`

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

Write tests for all new features and bug fixes. See [testing-guide.md](references/testing-guide.md) for detailed examples.

**Test Types:**

| Type        | Framework | Location                                | Purpose                      |
| ----------- | --------- | --------------------------------------- | ---------------------------- |
| Integration | Jest      | `web/src/__tests__/async/`              | Full API endpoint testing    |
| tRPC        | Jest      | `web/src/__tests__/async/`              | tRPC procedures with auth    |
| Service     | Jest      | `web/src/__tests__/async/repositories/` | Repository/service functions |
| Worker      | Vitest    | `worker/src/__tests__/`                 | Queue processors & streams   |

**Quick Examples:**

```typescript
// Integration Test (Public API)
const res = await makeZodVerifiedAPICall(
  PostDatasetsV1Response, "POST", "/api/public/datasets",
  { name: "test-dataset" }, auth
);
expect(res.status).toBe(200);

// tRPC Test
const { caller } = await prepare(); // Creates session + caller
const response = await caller.automations.getAutomations({ projectId });
expect(response).toHaveLength(1);

// Service Test
const result = await getObservationsWithModelDataFromEventsTable({
  projectId, filter: [...], limit: 1000, offset: 0
});
expect(result.length).toBeGreaterThan(0);

// Worker Test (vitest)
const stream = await getObservationStream({ projectId, filter: [] });
const rows = [];
for await (const chunk of stream) rows.push(chunk);
expect(rows).toHaveLength(2);
```

**Key Principles:**

- Use unique IDs (`randomUUID()`) to avoid test interference
- Clean up test data or use unique project IDs
- Tests must be independent and runnable in any order
- Prefer scoped cleanup or unique project IDs over global reset helpers

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

## Common Imports

```typescript
// tRPC (Web)
import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Database
import { prisma } from "@langfuse/shared/src/db";
import type { Prisma } from "@prisma/client";

// ClickHouse
import {
  queryClickhouse,
  queryClickhouseStream,
  upsertClickhouse,
} from "@langfuse/shared/src/server";

// Observability - OpenTelemetry + DataDog (NOT Sentry for backend)
import {
  logger,          // Winston logger with OTEL/DataDog trace context
  traceException,  // Record exceptions to OpenTelemetry spans
  instrumentAsync, // Create instrumented spans for operations
} from "@langfuse/shared/src/server";

// Config
import { env } from "@/src/env.mjs"; // web
// or
import { env } from "./env"; // worker

// Public API (Web)
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";

// Queue Processing (Worker)
import { Job } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
```

---

## Quick Reference

### HTTP Status Codes

| Code | Use Case     |
| ---- | ------------ |
| 200  | Success      |
| 201  | Created      |
| 400  | Bad Request  |
| 401  | Unauthorized |
| 403  | Forbidden    |
| 404  | Not Found    |
| 500  | Server Error |

### Example Features to Reference

Reference existing Langfuse features for implementation patterns:
- **Datasets** (`web/src/features/datasets/`) - Complete feature with tRPC router, public API, and service
- **Prompts** (`web/src/features/prompts/`) - Feature with versioning and templates
- **Evaluations** (`web/src/features/evals/`) - Complex feature with worker integration
- **Public API** (`web/src/features/public-api/`) - Middleware and route patterns

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

## Reference Files

### [architecture-overview.md](references/architecture-overview.md)

Three-layer architecture (tRPC/Public API → Services → Data Access), request lifecycle for tRPC/Public API/Worker, Next.js 14 directory structure, dual database system (PostgreSQL + ClickHouse), separation of concerns, repository pattern for complex queries

### [routing-and-controllers.md](references/routing-and-controllers.md)

Next.js file-based routing, tRPC router patterns, Public REST API routes, layered architecture (Entry Points → Services → Repositories → Database), service layer organization, anti-patterns to avoid

### [services-and-repositories.md](references/services-and-repositories.md)

Service layer overview, dependency injection patterns, singleton patterns, repository pattern for data access, service design principles, caching strategies, testing services

### [middleware-guide.md](references/middleware-guide.md)

tRPC middleware (withErrorHandling, withOtelInstrumentation, enforceUserIsAuthed), seven tRPC procedure types (publicProcedure, authenticatedProcedure, protectedProjectProcedure, etc.), Public API middleware (withMiddlewares, createAuthedProjectAPIRoute), authentication patterns (NextAuth for tRPC, Basic Auth for Public API)

### [database-patterns.md](references/database-patterns.md)

Dual database architecture (PostgreSQL via Prisma + ClickHouse via direct client), PostgreSQL CRUD operations, ClickHouse query patterns (queryClickhouse, queryClickhouseStream, upsertClickhouse), repository pattern for complex queries, tenant isolation with projectId filtering, when to use which database

### [configuration.md](references/configuration.md)

Environment variable validation with Zod, package-specific configs (web/env.mjs with t3-oss/env-nextjs, worker/env.ts, shared/env.ts), NEXT_PUBLIC_LANGFUSE_CLOUD_REGION usage, LANGFUSE_EE_LICENSE_KEY for enterprise features, best practices for env management

### [testing-guide.md](references/testing-guide.md)

Integration tests (Public API with makeZodVerifiedAPICall), tRPC tests (createInnerTRPCContext, appRouter.createCaller), service-level tests (repository/service functions), worker tests (vitest with streams), test isolation principles, running tests (Jest for web, vitest for worker)

**Skill Status**: COMPLETE ✅
**Line Count**: ~540 lines
**Progressive Disclosure**: 7 reference files ✅
