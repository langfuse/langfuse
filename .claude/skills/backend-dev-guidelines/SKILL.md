---
name: backend-dev-guidelines
description: Comprehensive backend development guide for Langfuse's Next.js 14/tRPC/Express/TypeScript monorepo. Use when creating tRPC routers, public API endpoints, BullMQ queue processors, services, or working with tRPC procedures, Next.js API routes, Prisma database access, ClickHouse analytics queries, Redis queues, OpenTelemetry instrumentation, Zod v4 validation, env.mjs configuration, or async patterns. Covers layered architecture (tRPC procedures → services, queue processors → services), traceException error handling, observability patterns, and testing strategies.
---

# Backend Development Guidelines

## Purpose

Establish consistency and best practices across Langfuse's backend packages (web, worker, packages/shared) using Next.js 14, tRPC, BullMQ, and TypeScript patterns.

## When to Use This Skill

Automatically activates when working on:

- Creating or modifying tRPC routers and procedures
- Creating or modifying public API endpoints (REST)
- Creating or modifying BullMQ queue consumers and producers
- Building services with business logic
- Authenticating API requests
- Accessing resources based on entitlements
- Implementing middleware (tRPC, NextAuth, public API)
- Database operations with Prisma (PostgreSQL) or ClickHouse
- Error tracking with traceException and OpenTelemetry instrumentation
- Input validation with Zod v4
- Environment configuration from env variables
- Backend testing and refactoring

---

## Quick Start

### UI: New tRPC Feature Checklist (Web)

- [ ] **Router**: Define in `features/[feature]/server/*Router.ts`
- [ ] **Procedures**: Use appropriate procedure type (protected, public)
- [ ] **Authentication**: Use JWT authorization via middlewares.
- [ ] **Entitlement check**: Access ressources based on ressource and role
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

See [architecture-overview.md](architecture-overview.md) for complete details.

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

### 4. Direct Prisma Usage from @langfuse/shared from within services

```typescript
// Services use Prisma directly
import { prisma } from "@langfuse/shared/src/db";

const dataset = await prisma.dataset.findUnique({
  where: { id: datasetId },
});
```

### 6. Instrument Critical Operations (all API routes are auto-instrumented by a wrapper span)

```typescript
import { instrumentAsync } from "@langfuse/shared/src/server";

const result = await instrumentAsync(
  { name: "dataset.create" },
  async (span) => {
    // Operation here
    return dataset;
  },
);
```

### 7. Comprehensive Testing Required

Write tests for all new features and bug fixes. See [testing-guide.md](resources/testing-guide.md) for detailed examples.

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
- Never use `pruneDatabase` in tests

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
import { getTracesTable } from "@langfuse/shared/src/server";

// Error tracking & instrumentation
import {
  traceException,
  instrumentAsync,
  logger,
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

### Service Templates

**Blog API** (✅ Mature) - Use as template for REST APIs
**Auth Service** (✅ Mature) - Use as template for authentication patterns

---

## Anti-Patterns to Avoid

❌ Business logic in routes
❌ Direct process.env usage
❌ Missing error handling
❌ No input validation
❌ Direct Prisma everywhere
❌ console.log instead of Sentry

---

## Navigation Guide

| Need to...                | Read this                                                    |
| ------------------------- | ------------------------------------------------------------ |
| Understand architecture   | [architecture-overview.md](architecture-overview.md)         |
| Create routes/controllers | [routing-and-controllers.md](routing-and-controllers.md)     |
| Organize business logic   | [services-and-repositories.md](services-and-repositories.md) |
| Create middleware         | [middleware-guide.md](middleware-guide.md)                   |
| Database access           | [database-patterns.md](database-patterns.md)                 |
| Manage config             | [configuration.md](configuration.md)                         |
| Write tests               | [testing-guide.md](testing-guide.md)                         |
| See examples              | [complete-examples.md](complete-examples.md)                 |

---

## Resource Files

### [architecture-overview.md](architecture-overview.md)

Layered architecture, request lifecycle, separation of concerns

### [routing-and-controllers.md](routing-and-controllers.md)

Route definitions, BaseController, error handling, examples

### [services-and-repositories.md](services-and-repositories.md)

Service patterns, DI, repository pattern, caching

### [middleware-guide.md](middleware-guide.md)

Auth, audit, error boundaries, AsyncLocalStorage

### [database-patterns.md](database-patterns.md)

PrismaService, repositories, transactions, optimization

### [configuration.md](configuration.md)

UnifiedConfig, environment configs, secrets

### [testing-guide.md](testing-guide.md)

Unit/integration tests, mocking, coverage

---

## Related Skills

- **database-verification** - Verify column names and schema consistency
- **error-tracking** - Sentry integration patterns
- **skill-developer** - Meta-skill for creating and managing skills

---

**Skill Status**: COMPLETE ✅
**Line Count**: < 500 ✅
**Progressive Disclosure**: 11 resource files ✅
