# Routing Patterns - Next.js & tRPC

Complete guide to routing and separation of concerns in Langfuse's Next.js + tRPC architecture.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [tRPC Routers](#trpc-routers)
- [Public REST API Routes](#public-rest-api-routes)
- [Service Layer](#service-layer)
- [Repository Layer](#repository-layer)
- [Separation of Concerns](#separation-of-concerns)
- [Anti-Patterns](#anti-patterns)

---

## Architecture Overview

Langfuse uses a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                        ENTRY POINTS                          │
│  ┌──────────────────────┐    ┌─────────────────────────┐   │
│  │   tRPC Procedures    │    │  Public REST API Routes │   │
│  │  (Internal UI API)   │    │   (SDK/External API)    │   │
│  └──────────────────────┘    └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER                          │
│         Business logic, orchestration, validation            │
│   web/src/features/*/server/ or packages/shared/services/   │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     REPOSITORY LAYER                         │
│         Complex queries, data transformation                 │
│         packages/shared/src/server/repositories/             │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER                          │
│       PostgreSQL (Prisma) + ClickHouse (Direct Client)      │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

**Entry Points (Routes/Procedures):**
- ✅ Define routing and procedure signatures
- ✅ Handle authentication/authorization (via middleware)
- ✅ Validate input (Zod schemas)
- ✅ Delegate to services
- ✅ Return responses

**Entry Points should NEVER:**
- ❌ Contain business logic
- ❌ Access database directly
- ❌ Perform complex data transformations
- ❌ Make direct repository calls (use services)

**Services:**
- ✅ Contain business logic
- ✅ Orchestrate multiple operations
- ✅ Call repositories or Prisma/ClickHouse
- ✅ Handle complex workflows
- ❌ Should NOT know about HTTP, tRPC, or request/response objects

**Repositories:**
- ✅ Complex database queries
- ✅ Data transformation (DB → domain models)
- ✅ ClickHouse query builders
- ✅ Reusable query logic
- ❌ Should NOT contain business logic

---

## tRPC Routers

**Location:** `web/src/server/api/routers/`

tRPC routers define type-safe procedures for the internal UI. Each router groups related operations.

### Router Structure

**File:** `web/src/server/api/routers/scores.ts`

```typescript
import { z } from "zod/v4";
import { createTRPCRouter, protectedProjectProcedure } from "@/src/server/api/trpc";
import { paginationZod, singleFilter, orderBy } from "@langfuse/shared";
import {
  getScoresUiTable,
  getScoresUiCount,
  upsertScore,
} from "@langfuse/shared/src/server";

const ScoreAllOptions = z.object({
  projectId: z.string(),
  filter: z.array(singleFilter),
  orderBy: orderBy,
  ...paginationZod,
});

export const scoresRouter = createTRPCRouter({
  /**
   * Get all scores for a project
   */
  all: protectedProjectProcedure
    .input(ScoreAllOptions)
    .query(async ({ input, ctx }) => {
      // Delegate to repository for data fetching
      const clickhouseScoreData = await getScoresUiTable({
        projectId: input.projectId,
        filter: input.filter ?? [],
        orderBy: input.orderBy,
        limit: input.limit,
        offset: input.page * input.limit,
      });

      // Delegate to Prisma for related data
      const [jobExecutions, users] = await Promise.all([
        ctx.prisma.jobExecution.findMany({
          where: {
            jobOutputScoreId: {
              in: clickhouseScoreData.map((score) => score.id),
            },
          },
        }),
        ctx.prisma.user.findMany({
          where: {
            id: {
              in: clickhouseScoreData
                .map((s) => s.authorUserId)
                .filter((id): id is string => id !== null),
            },
          },
        }),
      ]);

      // Transform and combine data
      return clickhouseScoreData.map((score) => ({
        ...score,
        jobConfigurationId:
          jobExecutions.find((j) => j.jobOutputScoreId === score.id)
            ?.jobConfigurationId ?? null,
        authorUserImage:
          users.find((u) => u.id === score.authorUserId)?.image ?? null,
        authorUserName:
          users.find((u) => u.id === score.authorUserId)?.name ?? null,
      }));
    }),

  /**
   * Create or update score
   */
  createAnnotationScore: protectedProjectProcedure
    .input(CreateAnnotationScoreData)
    .mutation(async ({ input, ctx }) => {
      // Validation
      validateConfigAgainstBody(input);

      // Delegate to repository
      await upsertScore({
        id: input.id ?? randomUUID(),
        traceId: input.traceId,
        projectId: input.projectId,
        name: input.name,
        value: input.value,
        source: ScoreSource.ANNOTATION,
        authorUserId: ctx.session.user.id,
        comment: input.comment,
      });

      // Audit log
      await auditLog({
        session: ctx.session,
        resourceType: "score",
        resourceId: input.id,
        action: "create",
      });

      return { success: true };
    }),
});
```

**Key Points:**
- Use appropriate procedure type (`protectedProjectProcedure`, `authenticatedProcedure`, etc.)
- Define input schema with Zod (`.input()`)
- Use `.query()` for reads, `.mutation()` for writes
- Delegate to services/repositories for data access
- Keep procedures thin - no business logic
- Type-safe throughout (TypeScript infers types from Zod schemas)

### Registering Routers

**File:** `web/src/server/api/root.ts`

```typescript
import { createTRPCRouter } from "@/src/server/api/trpc";
import { scoresRouter } from "./routers/scores";
import { tracesRouter } from "./routers/traces";
import { dashboardRouter } from "@/src/features/dashboard/server/dashboard-router";

export const appRouter = createTRPCRouter({
  scores: scoresRouter,
  traces: tracesRouter,
  dashboard: dashboardRouter,
  // ... other routers
});

export type AppRouter = typeof appRouter;
```

**Calling from frontend:**

```typescript
// Type-safe client call
const { data, isLoading } = api.scores.all.useQuery({
  projectId: "proj_123",
  page: 0,
  limit: 50,
  filter: [],
  orderBy: null,
});
```

---

## Public REST API Routes

**Location:** `web/src/pages/api/public/`

Public API routes use **Next.js file-based routing** and provide REST endpoints for SDKs and external integrations.

### File-based Routing

Next.js uses file system for routing:

```
web/src/pages/api/public/
├── scores/
│   ├── index.ts          → GET/POST /api/public/scores
│   └── [scoreId].ts      → GET/PATCH/DELETE /api/public/scores/:scoreId
├── traces/
│   ├── index.ts          → GET /api/public/traces
│   └── [traceId].ts      → GET /api/public/traces/:traceId
└── datasets/
    └── [name]/
        ├── index.ts      → GET/POST /api/public/datasets/:name
        └── items/
            └── index.ts  → GET /api/public/datasets/:name/items
```

**Dynamic routes:**
- `[param].ts` → Single dynamic segment (e.g., `/api/public/scores/[scoreId].ts`)
- `[...param].ts` → Catch-all route (e.g., `/api/public/[...path].ts`)

### REST API Pattern

**File:** `web/src/pages/api/public/scores/index.ts`

```typescript
import { v4 } from "uuid";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQueryV1,
  GetScoresResponseV1,
  PostScoresBodyV1,
  PostScoresResponseV1,
} from "@langfuse/shared";
import { eventTypes, processEventBatch } from "@langfuse/shared/src/server";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";

export default withMiddlewares({
  // POST /api/public/scores
  POST: createAuthedProjectAPIRoute({
    name: "Create Score",
    bodySchema: PostScoresBodyV1,
    responseSchema: PostScoresResponseV1,
    fn: async ({ body, auth, res }) => {
      const event = {
        id: v4(),
        type: eventTypes.SCORE_CREATE,
        timestamp: new Date().toISOString(),
        body,
      };

      if (!event.body.id) {
        event.body.id = v4();
      }

      const result = await processEventBatch([event], auth);

      if (result.errors.length > 0) {
        const error = result.errors[0];
        res.status(error.status).json({
          message: error.error ?? error.message,
        });
        return { id: "" };
      }

      return { id: event.body.id };
    },
  }),

  // GET /api/public/scores
  GET: createAuthedProjectAPIRoute({
    name: "Get Scores",
    querySchema: GetScoresQueryV1,
    responseSchema: GetScoresResponseV1,
    fn: async ({ query, auth }) => {
      const scoresApiService = new ScoresApiService("v1");

      const [items, count] = await Promise.all([
        scoresApiService.generateScoresForPublicApi({
          projectId: auth.scope.projectId,
          page: query.page,
          limit: query.limit,
          userId: query.userId,
          name: query.name,
        }),
        scoresApiService.getScoresCountForPublicApi({
          projectId: auth.scope.projectId,
          userId: query.userId,
          name: query.name,
        }),
      ]);

      return {
        data: items,
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: count,
          totalPages: Math.ceil(count / query.limit),
        },
      };
    },
  }),
});
```

**Key Points:**
- Use `withMiddlewares` for all public API routes (provides CORS, error handling, OpenTelemetry)
- Use `createAuthedProjectAPIRoute` for authenticated endpoints (handles auth, rate limiting, validation)
- Define separate handlers for each HTTP method
- Input/output validated with Zod schemas
- Delegate to services for business logic

### Simple Public Routes

For routes that don't need authentication:

```typescript
// web/src/pages/api/public/health.ts
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";

export default withMiddlewares({
  GET: async (req, res) => {
    res.status(200).json({ status: "ok" });
  },
});
```

---

## Service Layer

**Location:** `web/src/features/*/server/` or `packages/shared/src/server/services/`

Services contain business logic and orchestrate operations. They're called by tRPC procedures and API routes.

### Service Pattern

**File:** `web/src/features/public-api/server/scores-api-service.ts`

```typescript
import {
  _handleGenerateScoresForPublicApi,
  _handleGetScoresCountForPublicApi,
  type ScoreQueryType,
} from "@/src/features/public-api/server/scores";
import { _handleGetScoreById } from "@langfuse/shared/src/server";

export class ScoresApiService {
  constructor(private readonly apiVersion: "v1" | "v2") {}

  /**
   * Get a specific score by ID
   */
  async getScoreById({
    projectId,
    scoreId,
    source,
  }: {
    projectId: string;
    scoreId: string;
    source?: ScoreSourceType;
  }) {
    return _handleGetScoreById({
      projectId,
      scoreId,
      source,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
      preferredClickhouseService: "ReadOnly",
    });
  }

  /**
   * Get list of scores with version-aware filtering
   */
  async generateScoresForPublicApi(props: ScoreQueryType) {
    return _handleGenerateScoresForPublicApi({
      props,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
    });
  }

  /**
   * Get count of scores with version-aware filtering
   */
  async getScoresCountForPublicApi(props: ScoreQueryType) {
    return _handleGetScoresCountForPublicApi({
      props,
      scoreScope: this.apiVersion === "v1" ? "traces_only" : "all",
    });
  }
}
```

**Key Points:**
- Services contain business logic, not routing logic
- Services should NOT import tRPC or Next.js types
- Services can call repositories, Prisma, ClickHouse directly
- Services orchestrate multiple operations
- Services are reusable across tRPC and public API

### Where to Put Services

**Feature-specific services:**
```
web/src/features/
├── datasets/
│   └── server/
│       └── dataset-service.ts
├── evals/
│   └── server/
│       └── eval-service.ts
└── public-api/
    └── server/
        └── scores-api-service.ts
```

**Shared services:**
```
packages/shared/src/server/services/
├── SlackService.ts
├── DashboardService/
├── StorageService.ts
└── DefaultEvaluationModelService/
```

---

## Repository Layer

**Location:** `packages/shared/src/server/repositories/`

Repositories handle complex database queries, data transformation, and provide reusable query logic.

### Repository Structure

```
packages/shared/src/server/repositories/
├── traces.ts              # Trace queries (ClickHouse)
├── observations.ts        # Observation queries (ClickHouse)
├── scores.ts              # Score queries (ClickHouse)
├── clickhouse.ts          # Core ClickHouse helpers
└── definitions.ts         # Type definitions
```

### Repository Pattern

**File:** `packages/shared/src/server/repositories/traces.ts`

```typescript
import { queryClickhouse, upsertClickhouse } from "./clickhouse";
import { TraceRecordReadType } from "./definitions";
import { convertClickhouseToDomain } from "./traces_converters";

/**
 * Get traces by IDs
 */
export const getTracesByIds = async (
  projectId: string,
  traceIds: string[]
): Promise<TraceRecordReadType[]> => {
  const rows = await queryClickhouse<TraceRecordReadType>({
    query: `
      SELECT *
      FROM traces
      WHERE project_id = {projectId: String}
      AND id IN ({traceIds: Array(String)})
      ORDER BY event_ts DESC
      LIMIT 1 BY id, project_id
    `,
    params: { projectId, traceIds },
    tags: { feature: "tracing", type: "trace" },
  });

  return rows.map(convertClickhouseToDomain);
};

/**
 * Upsert trace to ClickHouse
 */
export const upsertTrace = async (
  trace: TraceRecordInsertType
): Promise<void> => {
  await upsertClickhouse({
    table: "traces",
    records: [trace],
    eventBodyMapper: (body) => ({
      id: body.id,
      name: body.name,
      user_id: body.user_id,
      // ... map fields
    }),
    tags: { feature: "ingestion", type: "trace" },
  });
};
```

**Key Points:**
- Use `queryClickhouse` for SELECT queries
- Use `upsertClickhouse` for INSERT/UPDATE
- Use `commandClickhouse` for DDL (ALTER TABLE, etc.)
- Include data converters (`convertClickhouseToDomain`)
- Add OpenTelemetry tags for observability
- Repositories should NOT contain business logic

### When to Use Repositories

✅ **Use repositories for:**
- Complex ClickHouse queries with CTEs, joins, aggregations
- Queries used in multiple places (DRY principle)
- Data transformation from DB types to domain models
- Streaming large result sets

❌ **Use direct Prisma/ClickHouse for:**
- Simple CRUD operations
- One-off queries
- Prototyping (can refactor to repository later)

---

## Separation of Concerns

### ✅ Good Example: Proper Layering

**tRPC Procedure (Entry Point):**

```typescript
// web/src/server/api/routers/scores.ts
export const scoresRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ScoreFilterOptions)
    .query(async ({ input }) => {
      // ✅ Thin procedure - delegates to repository
      return await getScoresUiTable({
        projectId: input.projectId,
        filter: input.filter,
        orderBy: input.orderBy,
      });
    }),

  create: protectedProjectProcedure
    .input(CreateScoreInput)
    .mutation(async ({ input, ctx }) => {
      // ✅ Delegates to service for orchestration
      return await createScoreWithValidation({
        scoreData: input,
        userId: ctx.session.user.id,
        projectId: ctx.session.projectId,
      });
    }),
});
```

**Service (Business Logic):**

```typescript
// web/src/features/scores/server/score-service.ts
export async function createScoreWithValidation({
  scoreData,
  userId,
  projectId,
}: {
  scoreData: CreateScoreInput;
  userId: string;
  projectId: string;
}) {
  // ✅ Business logic: validation
  const config = await prisma.scoreConfig.findUnique({
    where: { id: scoreData.configId },
  });

  if (!config) {
    throw new LangfuseNotFoundError("Score config not found");
  }

  validateConfigAgainstBody(config, scoreData);

  // ✅ Business logic: orchestration
  const scoreId = randomUUID();

  await Promise.all([
    // Create score in ClickHouse
    upsertScore({
      id: scoreId,
      projectId,
      traceId: scoreData.traceId,
      name: scoreData.name,
      value: scoreData.value,
      authorUserId: userId,
    }),
    // Audit log in PostgreSQL
    auditLog({
      userId,
      resourceType: "score",
      resourceId: scoreId,
      action: "create",
    }),
  ]);

  return { id: scoreId };
}
```

**Repository (Data Access):**

```typescript
// packages/shared/src/server/repositories/scores.ts
export const upsertScore = async (
  score: ScoreInsertType
): Promise<void> => {
  // ✅ Pure data access - no business logic
  await upsertClickhouse({
    table: "scores",
    records: [score],
    eventBodyMapper: (body) => ({
      id: body.id,
      trace_id: body.traceId,
      name: body.name,
      value: body.value,
      author_user_id: body.authorUserId,
    }),
    tags: { feature: "scoring" },
  });
};
```

### Why This Works

1. **tRPC Procedure**: Thin, delegates to service
2. **Service**: Contains all business logic (validation, orchestration)
3. **Repository**: Pure data access, reusable
4. **Service is protocol-agnostic**: Can be called from tRPC, public API, or worker
5. **Clear separation**: Easy to test, maintain, extend

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Business Logic in Routes

**Bad:**

```typescript
// ❌ BAD: Business logic in tRPC procedure
export const scoresRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateScoreInput)
    .mutation(async ({ input, ctx }) => {
      // ❌ Validation logic in route
      const config = await ctx.prisma.scoreConfig.findUnique({
        where: { id: input.configId },
      });

      if (!config) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (config.dataType === "NUMERIC" && typeof input.value !== "number") {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      // ❌ Direct database access
      await ctx.prisma.score.create({
        data: {
          id: randomUUID(),
          projectId: ctx.session.projectId,
          traceId: input.traceId,
          name: input.name,
          value: input.value,
        },
      });

      // ❌ More business logic
      await auditLog({ ... });

      return { success: true };
    }),
});
```

**Why it's bad:**
- Business logic tied to tRPC (can't reuse in public API)
- Hard to test (need to mock tRPC context)
- No separation of concerns
- Difficult to maintain

**Good:**

```typescript
// ✅ GOOD: Thin procedure, delegates to service
export const scoresRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateScoreInput)
    .mutation(async ({ input, ctx }) => {
      return await createScoreWithValidation({
        scoreData: input,
        userId: ctx.session.user.id,
        projectId: ctx.session.projectId,
      });
    }),
});
```

### ❌ Anti-Pattern 2: Database Calls in Routes

**Bad:**

```typescript
// ❌ BAD: Direct database access in route
export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Scores",
    fn: async ({ auth }) => {
      // ❌ Direct ClickHouse query in route
      const scores = await queryClickhouse({
        query: "SELECT * FROM scores WHERE project_id = {projectId: String}",
        params: { projectId: auth.scope.projectId },
      });

      return { data: scores };
    },
  }),
});
```

**Good:**

```typescript
// ✅ GOOD: Delegates to service or repository
export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Scores",
    fn: async ({ auth, query }) => {
      const scoresService = new ScoresApiService("v1");

      return await scoresService.generateScoresForPublicApi({
        projectId: auth.scope.projectId,
        page: query.page,
        limit: query.limit,
      });
    },
  }),
});
```

### ❌ Anti-Pattern 3: Business Logic in Repositories

**Bad:**

```typescript
// ❌ BAD: Business logic in repository
export const upsertScore = async (
  score: ScoreInsertType
): Promise<void> => {
  // ❌ Validation in repository
  if (!score.name) {
    throw new Error("Score name is required");
  }

  // ❌ Authorization check in repository
  const project = await prisma.project.findUnique({
    where: { id: score.projectId },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // ❌ Side effects in repository
  await auditLog({ ... });

  await upsertClickhouse({ ... });
};
```

**Good:**

```typescript
// ✅ GOOD: Pure data access, no business logic
export const upsertScore = async (
  score: ScoreInsertType
): Promise<void> => {
  await upsertClickhouse({
    table: "scores",
    records: [score],
    eventBodyMapper: (body) => ({
      id: body.id,
      trace_id: body.traceId,
      name: body.name,
      value: body.value,
    }),
    tags: { feature: "scoring" },
  });
};
```

---

**Related Files:**

- [SKILL.md](../SKILL.md) - Main backend development guidelines
- [architecture-overview.md](architecture-overview.md) - System architecture
- [middleware-guide.md](middleware-guide.md) - Middleware patterns
- [database-patterns.md](database-patterns.md) - Database access patterns
