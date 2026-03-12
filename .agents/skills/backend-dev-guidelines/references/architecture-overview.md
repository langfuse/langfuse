# Architecture Overview - Langfuse Backend

Complete guide to the layered architecture pattern used in Langfuse's Next.js 14/tRPC/Express monorepo.

## Table of Contents

- [Layered Architecture Pattern](#layered-architecture-pattern)
- [Request Lifecycle](#request-lifecycle)
- [Directory Structure](#directory-structure)
- [Module Organization](#module-organization)
- [Separation of Concerns](#separation-of-concerns)
- [Database Architecture](#database-architecture)

---

## Layered Architecture Pattern

Langfuse uses a **three-layer architecture** with two primary entry points (tRPC and Public API) plus async processing via Worker.

### The Three Layers

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

### Layer Breakdown

**Layer 1: API Entry Points**

Two types of entry points:

- **tRPC Procedures** - Type-safe RPC for UI
  - Located in `features/[feature]/server/*Router.ts`
  - Uses middleware for auth/validation
  - Types shared between client/server

- **Public REST APIs** - REST endpoints for SDKs
  - Located in `pages/api/public/`
  - Uses `withMiddlewares` + `createAuthedProjectAPIRoute`
  - Versioned with Zod schemas

**Layer 2: Services**

- Business logic and orchestration
- Shared between tRPC, Public API, and Worker
- Located in `features/[feature]/server/service.ts`
- No HTTP/Request/Response knowledge
- Use repositories for complex queries or Prisma directly for simple CRUD

**Layer 3: Data Access**

- **Repositories** for complex data access patterns (traces, observations, scores, events)
- **Direct Prisma** for simple CRUD operations in services
- PostgreSQL for transactional data
- ClickHouse for analytics/traces (accessed via repositories)
- Redis for caching/queues

**Async Processing Layer: Worker**

- BullMQ queue processors
- Same service layer as Web
- Handles long-running operations

### Why This Architecture?

**Testability:**

- tRPC procedures easily testable with type-safe callers
- Services tested independently with mocked DB
- Queue processors tested with vitest
- Clear test boundaries

**Maintainability:**

- Business logic isolated in services
- tRPC provides type safety end-to-end
- Changes to API don't affect service layer
- Easy to locate and fix bugs

**Reusability:**

- Services used by tRPC, Public API, Worker, and scripts
- Business logic not tied to HTTP or tRPC
- Consistent patterns across packages

**Scalability:**

- Worker handles async operations separately
- Easy to add new tRPC procedures
- Clear patterns to follow
- Shared code in packages/shared

---

## Request Lifecycle

### tRPC Request Flow (UI)

```typescript
1. HTTP POST /api/trpc/datasets.create
   ↓
2. Next.js API route catches request (pages/api/trpc/[trpc].ts)
   ↓
3. tRPC router resolves procedure:
   - Match route to procedure in datasetRouter.ts
   ↓
4. tRPC middleware chain executes:
   - protectedProjectProcedure (authentication)
   - hasEntitlement checks
   - Input validation with Zod v4
   ↓
5. Procedure handler calls service:
   export const datasetRouter = createTRPCRouter({
     create: protectedProjectProcedure
       .input(createDatasetSchema)
       .mutation(async ({ input, ctx }) => {
         return await createDataset(input, ctx.session);
       }),
   })
   ↓
6. Service executes business logic:
   - Validate business rules
   - Use repositories for complex queries or Prisma directly
   - ClickHouse queries via repositories if needed
   ↓
7. Database operations:
   - prisma.dataset.create({ data })
   - clickhouse queries via getTracesTable()
   ↓
8. Response flows back:
   Database → Service → Procedure → tRPC → Client
```

### Public API Request Flow (SDKs)

```typescript
1. HTTP POST /api/public/datasets
   ↓
2. Next.js API route handler (pages/api/public/datasets.ts)
   ↓
3. withMiddlewares wrapper executes:
   - Basic auth verification
   - Rate limiting
   - CORS handling
   ↓
4. createAuthedProjectAPIRoute handler:
   - Parse and validate request with Zod v4
   - Extract auth context (project, user)
   ↓
5. Handler calls service function:
   const dataset = await createDataset({
     name: req.body.name,
     projectId: req.auth.projectId,
   });
   ↓
6. Service executes (same as tRPC path)
   ↓
7. Response formatted and returned:
   res.status(201).json(dataset);
```

### Worker/Queue Processing Flow

```typescript
1. Job added to Redis BullMQ queue:
   await evalQueue.add("eval-job", {
     evalId, projectId
   });
   ↓
2. Worker picks up job from Redis
   ↓
3. Queue processor handles job:
   // worker/src/queues/evalQueue.ts
   async process(job: Job<EvalJobType>) {
     await processEvaluation(job.data);
   }
   ↓
4. Processor calls service:
   - Same service layer as Web
   - Business logic execution
   ↓
5. Service performs operations:
   - Prisma transactions
   - ClickHouse queries
   - External API calls (LLMs)
   ↓
6. Job completes or fails:
   - Success: job.updateProgress(100)
   - Failure: throw error for retry
```

---

## Directory Structure

### Web Package (`/web/src/`)

```
web/src/
├── features/                    # Feature-organized code
│   ├── datasets/
│   │   ├── server/             # Backend logic
│   │   │   ├── datasetRouter.ts    # tRPC router
│   │   │   └── datasetService.ts   # Business logic
│   │   ├── components/         # React components
│   │   └── types/              # Feature types
│   │
│   ├── public-api/
│   │   ├── server/
│   │   │   ├── withMiddlewares.ts
│   │   │   └── createAuthedProjectAPIRoute.ts
│   │   └── types/              # API schemas
│   │
│   └── [feature-name]/
│       ├── server/
│       │   ├── *Router.ts      # tRPC router
│       │   └── service.ts      # Business logic
│       ├── components/
│       └── types/
│
├── server/
│   ├── api/
│   │   ├── routers/            # tRPC routers
│   │   ├── trpc.ts             # tRPC setup & middleware
│   │   └── root.ts             # Main router combining all
│   ├── auth.ts                 # NextAuth.js config
│   └── db.ts                   # Database utilities
│
├── pages/
│   ├── api/
│   │   ├── public/             # Public REST APIs
│   │   │   ├── datasets.ts
│   │   │   └── traces.ts
│   │   └── trpc/
│   │       └── [trpc].ts       # tRPC endpoint
│   └── [routes].tsx            # Next.js pages
│
├── __tests__/                  # Jest tests
│   ├── async/                  # Integration tests
│   └── sync/                   # Unit tests
│
├── instrumentation.ts          # OpenTelemetry (FIRST IMPORT)
└── env.mjs                     # Environment config
```

### Worker Package (`/worker/src/`)

```
worker/src/
├── queues/                     # BullMQ processors
│   ├── evalQueue.ts           # Evaluation jobs
│   ├── ingestionQueue.ts      # Data ingestion
│   ├── batchExportQueue.ts    # Batch exports
│   └── workerManager.ts       # Queue registration
│
├── features/                   # Business logic
│   └── [feature]/
│       └── service.ts
│
├── __tests__/                  # Vitest tests
│
├── instrumentation.ts          # OpenTelemetry (FIRST IMPORT)
├── app.ts                      # Express setup + queue registration
├── env.ts                      # Environment config
└── index.ts                    # Server start
```

### Shared Package (`/packages/shared/`)

The shared package provides types, utilities, and server code used by both web and worker packages. It has **5 export paths** that control frontend vs backend access:

| Import Path                                | Usage                 | What's Included                                                                    |
| ------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------- |
| `@langfuse/shared`                         | ✅ Frontend + Backend | Prisma types, Zod schemas, constants, table definitions, domain models, utilities  |
| `@langfuse/shared/src/db`                  | 🔒 Backend only       | Prisma client instance                                                             |
| `@langfuse/shared/src/server`              | 🔒 Backend only       | Services, repositories, queues, auth, ClickHouse, LLM integration, instrumentation |
| `@langfuse/shared/src/server/auth/apiKeys` | 🔒 Backend only       | API key management (separated to avoid circular deps)                              |
| `@langfuse/shared/encryption`              | 🔒 Backend only       | Database field encryption/decryption                                               |

**Key Structure:**

```
packages/shared/src/
├── server/                  # 🔒 All server-only code
│   ├── auth/                # Authentication & authorization
│   ├── clickhouse/          # ClickHouse client & queries
│   ├── redis/               # Redis client & 30+ queue types
│   ├── repositories/        # Data access (traces, observations, scores, events)
│   ├── services/            # Business services (Storage, Email, Slack, etc.)
│   ├── llm/                 # LLM integration
│   ├── instrumentation/     # OpenTelemetry
│   └── queues.ts, logger.ts, filterToPrisma.ts, etc.
│
├── features/                # ✅ Feature types (evals, scores, prompts, datasets)
├── domain/                  # ✅ Domain models (automations, webhooks, etc.)
├── tableDefinitions/        # ✅ Table schemas
├── interfaces/              # ✅ Shared interfaces (filters, orderBy)
├── utils/                   # ✅ Utilities (JSON, Zod, string checks)
├── encryption/              # 🔒 Encryption utilities
└── db.ts, constants.ts, types.ts, etc.
```

**Common Import Patterns:**

```typescript
// ✅ Main export - Safe for frontend + backend
import {
  Prisma,
  Role,
  type Dataset,
  CloudConfigSchema,
} from "@langfuse/shared";

// 🔒 Database - Backend only
import { prisma } from "@langfuse/shared/src/db";

// 🔒 Server utilities - Backend only
import {
  logger,
  instrumentAsync,
  traceException,
  redis,
  clickhouseClient,
  StorageService,
  fetchLLMCompletion,
  filterToPrisma,
} from "@langfuse/shared/src/server";

// 🔒 API keys - Backend only
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

// 🔒 Encryption - Backend only
import { encrypt, decrypt } from "@langfuse/shared/encryption";
```

---

## Module Organization

### Feature-Based Organization (Recommended)

For most features, organize by domain within `features/`:

```
src/features/datasets/
├── server/                 # Backend code
│   ├── datasetRouter.ts   # tRPC procedures
│   └── service.ts         # Business logic
├── components/            # React components
│   ├── DatasetTable.tsx
│   └── DatasetForm.tsx
├── types/                 # Feature types
│   └── index.ts
└── utils/                 # Feature utilities
```

**When to use:**

- Any feature with UI + API
- Clear domain boundary
- Multiple related procedures

### Subdomain Organization

For complex features with multiple subdomains:

```
src/features/evaluations/
├── server/
│   ├── evalRouter.ts          # Main router
│   ├── evalService.ts         # Core service
│   ├── templates/             # Template subdomain
│   │   ├── templateRouter.ts
│   │   └── templateService.ts
│   └── configs/               # Config subdomain
│       ├── configRouter.ts
│       └── configService.ts
├── components/
│   ├── templates/
│   └── configs/
└── types/
```

**When to use:**

- Feature has 10+ files
- Clear subdomains exist
- Logical grouping improves clarity

### Flat Organization (Rare)

For small, standalone features:

```
src/server/api/routers/
├── healthRouter.ts            # Simple health check
└── versionRouter.ts           # Version info
```

**When to use:**

- Simple features (1-2 procedures)
- No UI components
- Standalone utilities

---

## Separation of Concerns

### What Goes Where

**tRPC Procedures (Entry Layer):**

- ✅ Procedure definitions (query/mutation)
- ✅ Middleware application (auth, validation)
- ✅ Input schemas (Zod v4)
- ✅ Service delegation
- ✅ Error transformation (TRPCError)
- ❌ Business logic (belongs in services)
- ❌ Database operations (belongs in services)
- ❌ Complex validation (belongs in services)

**Public API Routes (Entry Layer):**

- ✅ Route registration
- ✅ Middleware wrapper application
- ✅ Input validation (Zod v4)
- ✅ Service delegation
- ✅ Response formatting
- ✅ HTTP status codes
- ❌ Business logic (belongs in services)
- ❌ Database operations (belongs in services)

**Services Layer:**

- ✅ Business logic
- ✅ Business rules enforcement
- ✅ Transaction orchestration
- ✅ Repository calls for complex queries
- ✅ Direct Prisma operations for simple CRUD
- ✅ ClickHouse queries (via repositories)
- ✅ Redis cache access
- ✅ External API calls (LLMs, etc.)
- ❌ HTTP concerns (Request/Response)
- ❌ tRPC-specific types (TRPCError in entry layer)
- ❌ NextAuth session handling (passed as parameter)

**Queue Processors (Worker):**

- ✅ Job registration and configuration
- ✅ Job data extraction
- ✅ Service delegation
- ✅ Progress updates
- ✅ Error handling (retry logic)
- ❌ Business logic (belongs in services)
- ❌ Database operations (belongs in services)

### Example: Dataset Creation

**tRPC Procedure (Entry Point):**

```typescript
// web/src/features/datasets/server/datasetRouter.ts
import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { createDataset } from "./service";

export const datasetRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await createDataset({
          ...input,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create dataset",
          cause: error,
        });
      }
    }),
});
```

**Service (Business Logic):**

```typescript
// web/src/features/datasets/server/service.ts
import { prisma } from "@langfuse/shared/src/db";
import { instrumentAsync, traceException } from "@langfuse/shared/src/server";

export async function createDataset(data: {
  name: string;
  description?: string;
  projectId: string;
  userId: string;
}) {
  return await instrumentAsync({ name: "dataset.create" }, async (span) => {
    // Business rule: Check for duplicate names in project
    const existing = await prisma.dataset.findFirst({
      where: {
        name: data.name,
        projectId: data.projectId,
      },
    });

    if (existing) {
      throw new Error(`Dataset with name "${data.name}" already exists`);
    }

    // Create dataset
    const dataset = await prisma.dataset.create({
      data: {
        name: data.name,
        description: data.description,
        projectId: data.projectId,
        createdById: data.userId,
      },
    });

    span.setAttributes({
      datasetId: dataset.id,
      projectId: dataset.projectId,
    });

    return dataset;
  });
}
```

**Public API (Alternative Entry Point):**

```typescript
// web/src/pages/api/public/datasets.ts
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { createDataset } from "@/src/features/datasets/server/service";
import { z } from "zod/v4";

const createDatasetSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset",
    bodySchema: createDatasetSchema,
    fn: async ({ body, auth, res }) => {
      const dataset = await createDataset({
        name: body.name,
        description: body.description,
        projectId: auth.scope.projectId,
        userId: auth.scope.userId,
      });

      return res.status(201).json(dataset);
    },
  }),
});
```

**Queue Processor (Async Processing):**

```typescript
// worker/src/queues/datasetExportQueue.ts
import { Job } from "bullmq";
import { exportDataset } from "../features/datasets/exportService";

export async function processDatasetExport(
  job: Job<{ datasetId: string; projectId: string; format: string }>,
) {
  const { datasetId, projectId, format } = job.data;

  await job.updateProgress(10);

  // Delegate to service
  const exportUrl = await exportDataset({
    datasetId,
    projectId,
    format,
    onProgress: (percent) => job.updateProgress(percent),
  });

  await job.updateProgress(100);

  return { exportUrl };
}
```

**Notice:** Each layer has clear, distinct responsibilities!

- **Entry layers** (tRPC/Public API/Queue) handle protocol concerns
- **Service layer** contains all business logic
- **Data layer** accessed via repositories (complex queries) or Prisma directly (simple CRUD)

---

## Database Architecture

### Dual Database System

Langfuse uses two databases with different purposes:

```
┌─────────────────────────────────────────────────────────────┐
│                       Application                           │
│                                                             │
│  ┌──────────────┐              ┌──────────────┐           │
│  │  PostgreSQL  │              │  ClickHouse  │           │
│  │              │              │              │           │
│  │ Transactional│              │  Analytics   │           │
│  │    Data      │              │    Data      │           │
│  └──────────────┘              └──────────────┘           │
│         ↑                              ↑                   │
│         │                              │                   │
│    Prisma ORM                    Direct SQL               │
│  (schema migrations)              (via client)            │
└─────────────────────────────────────────────────────────────┘
```

**PostgreSQL (Primary Database):**

- Accessed via Prisma ORM
- Transactional data (users, projects, datasets, etc.)
- ACID guarantees
- Schema managed via `prisma migrate`
- Located in `packages/shared/prisma/`

**ClickHouse (Analytics Database):**

- Accessed via direct SQL queries
- High-volume trace/observation data
- Columnar storage for analytics
- Optimized for aggregations
- Schema in `packages/shared/src/server/clickhouse/`
- Schema managed via `golang-migrate`

**Redis (Cache & Queues):**

- BullMQ job queues
- Caching layer
- Session storage
- Rate limiting

### Data Access Pattern

**Services access databases directly:**

```typescript
// PostgreSQL via Prisma
import { prisma } from "@langfuse/shared/src/db";

const dataset = await prisma.dataset.create({ data });

// ClickHouse via helper functions
import { getTracesTable } from "@langfuse/shared/src/server";

const traces = await getTracesTable({
  projectId,
  filter: [...],
  limit: 1000,
});

// Redis via queue/cache utilities
import { redis } from "@langfuse/shared/src/server";

await redis.set(`cache:${key}`, value, "EX", 3600);
```

**Repository Pattern:**

Langfuse uses repositories in `packages/shared/src/server/repositories/` for complex data access patterns. Repositories provide:

- Abstraction over complex queries (traces, observations, scores, events)
- Data converters for transforming database models to application models
- ClickHouse query builders and stream processing
- Reusable query logic across services

Services can use repositories for complex operations OR Prisma directly for simple CRUD operations.

---

## Best Practices

### 1. Keep Procedures Thin

tRPC procedures should only handle protocol concerns:

```typescript
// ❌ BAD: Business logic in procedure
export const datasetRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(createSchema)
    .mutation(async ({ input, ctx }) => {
      // 200 lines of business logic here
      const existing = await prisma.dataset.findFirst(...);
      if (existing) throw new Error(...);
      const dataset = await prisma.dataset.create(...);
      await sendNotification(...);
      return dataset;
    }),
});

// ✅ GOOD: Delegate to service
export const datasetRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(createSchema)
    .mutation(async ({ input, ctx }) => {
      return await createDataset(input, ctx.session);
    }),
});
```

### 2. Services Should Be Protocol-Agnostic

Services should work regardless of entry point:

```typescript
// ✅ GOOD: No HTTP/tRPC knowledge
export async function createDataset(data: CreateDatasetInput) {
  // Pure business logic
  return await prisma.dataset.create({ data });
}

// ❌ BAD: tRPC-specific
export async function createDataset(ctx: TRPCContext) {
  // Coupled to tRPC
}
```

### 3. Observability with OpenTelemetry + DataDog

**Langfuse uses OpenTelemetry for backend observability, with traces and logs sent to DataDog.**

Use structured logging and instrumentation:

```typescript
import {
  logger,
  traceException,
  instrumentAsync,
} from "@langfuse/shared/src/server";

export async function processEvaluation(evalId: string) {
  return await instrumentAsync(
    { name: "evaluation.process", attributes: { evalId } },
    async (span) => {
      // Structured logging (includes trace_id, span_id, dd.trace_id)
      logger.info("Starting evaluation", { evalId });

      try {
        // Operation here
        const result = await runEvaluation(evalId);

        span.setAttributes({
          score: result.score,
          status: "success",
        });

        return result;
      } catch (error) {
        // Record exception to OpenTelemetry span (sent to DataDog)
        traceException(error, span);
        logger.error("Evaluation failed", { evalId, error: error.message });
        throw error;
      }
    },
  );
}
```

**Note**: Frontend uses Sentry for error tracking, but backend (tRPC, API routes, services, worker) uses OpenTelemetry + DataDog.

### 4. Use Proper Error Handling

Transform errors at entry points:

```typescript
// tRPC procedure
try {
  return await service();
} catch (error) {
  traceException(error); // Record to OpenTelemetry span (sent to DataDog)
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "User-friendly message",
    cause: error,
  });
}

// Public API
try {
  return await service();
} catch (error) {
  traceException(error); // Record to OpenTelemetry span (sent to DataDog)
  return res.status(500).json({
    error: "User-friendly message",
  });
}
```

### 5. Validate at Entry Points

Use Zod v4 for all input validation:

```typescript
import { z } from "zod/v4";

// tRPC
.input(z.object({
  name: z.string().min(1).max(255),
  projectId: z.string(),
}))

// Public API
const bodySchema = z.object({
  name: z.string().min(1).max(255),
});
const validated = bodySchema.parse(req.body);
```

---

**Related Files:**

- [../AGENTS.md](../AGENTS.md) - Main guide
- [routing-and-controllers.md](routing-and-controllers.md) - tRPC and Public API details
- [services-and-repositories.md](services-and-repositories.md) - Service patterns
- [testing-guide.md](testing-guide.md) - Testing strategies
