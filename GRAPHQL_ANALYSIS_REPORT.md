# GraphQL Analysis Report for Langfuse

**Date:** November 6, 2025
**Status:** ❌ GraphQL is NOT implemented in this repository

---

## Executive Summary

Despite having `graphql@^16.9.0` listed as a dependency, **Langfuse does not use GraphQL**. The repository instead uses:
1. **tRPC** for internal frontend-backend communication
2. **REST API** for public-facing endpoints

This report documents the actual API architecture and provides guidance on how to work with the existing systems.

---

## Table of Contents
1. [GraphQL Status](#graphql-status)
2. [Actual API Architecture](#actual-api-architecture)
3. [tRPC Internal API](#trpc-internal-api)
4. [REST Public API](#rest-public-api)
5. [How to Add New Endpoints](#how-to-add-new-endpoints)
6. [Examples and Patterns](#examples-and-patterns)

---

## GraphQL Status

### Search Results
Comprehensive search of the entire codebase revealed:

- ❌ No `.graphql` schema files
- ❌ No GraphQL server setup (Apollo, Express-GraphQL, etc.)
- ❌ No GraphQL resolvers
- ❌ No GraphQL imports in any source files
- ❌ No GraphQL queries or mutations
- ❌ No GraphQL configuration files
- ❌ No GraphQL-related documentation
- ❌ No GraphQL usage in git history

### Why is `graphql` in package.json?

The `graphql` dependency in `/web/package.json` line 117 is likely:
1. **Unused leftover** from early architecture planning
2. **Transitive dependency** pulled in by another package
3. **Safe to remove** after verification it's not a transitive dependency

**Recommendation:** Consider removing this dependency to reduce bundle size and avoid confusion.

---

## Actual API Architecture

Langfuse uses a **dual API strategy**:

```
┌─────────────────────────────────────────────────────────┐
│                    Langfuse API Layer                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────┐      ┌────────────────────┐    │
│  │   tRPC Internal    │      │   REST Public API   │    │
│  │   (Type-safe)      │      │   (OpenAPI/Fern)    │    │
│  ├────────────────────┤      ├────────────────────┤    │
│  │ Frontend ↔ Backend │      │ External Clients   │    │
│  │ Communication      │      │ SDK Integration    │    │
│  │                    │      │ Webhooks           │    │
│  │ 52+ Routers        │      │ 30+ Endpoints      │    │
│  └────────────────────┘      └────────────────────┘    │
│                                                           │
└─────────────────────────────────────────────────────────┘
                          ↓
              ┌──────────────────────┐
              │   Dual Database      │
              ├──────────────────────┤
              │ PostgreSQL (Prisma)  │
              │ ClickHouse (Analytics)│
              └──────────────────────┘
```

---

## tRPC Internal API

### Overview
**Technology:** tRPC v11.4.4
**Purpose:** End-to-end type-safe communication between Next.js frontend and backend
**Location:** `/web/src/server/api/`

### Key Files
```
/web/src/server/api/
├── root.ts                    # Main router aggregation
├── trpc.ts                    # tRPC setup, context, middleware
└── routers/                   # Individual feature routers
    ├── traces.ts
    ├── scores.ts
    ├── generations.ts
    ├── sessions.ts
    ├── users.ts
    └── ... (47 more routers)
```

### Architecture

**Entry Point:** `/web/src/server/api/root.ts`

All tRPC routers are aggregated in a single `appRouter`:

```typescript
// web/src/server/api/root.ts
export const appRouter = createTRPCRouter({
  annotationQueues: queueRouter,
  annotationQueueItems: queueItemRouter,
  annotationQueueAssignments: queueAssignmentRouter,
  batchExport: batchExportRouter,
  traces: traceRouter,
  sessions: sessionRouter,
  generations: generationsRouter,
  scores: scoresRouter,
  scoreConfigs: scoreConfigsRouter,
  dashboard: dashboardRouter,
  organizations: organizationsRouter,
  organizationApiKeys: organizationApiKeysRouter,
  projects: projectsRouter,
  users: userRouter,
  userAccount: userAccountRouter,
  projectApiKeys: projectApiKeysRouter,
  members: membersRouter,
  datasets: datasetRouter,
  cloudBilling: cloudBillingRouter,
  spendAlerts: spendAlertRouter,
  observations: observationsRouter,
  prompts: promptRouter,
  models: modelRouter,
  evals: evalRouter,
  defaultLlmModel: defaultEvalModelRouter,
  experiments: experimentsRouter,
  posthogIntegration: posthogIntegrationRouter,
  mixpanelIntegration: mixpanelIntegrationRouter,
  blobStorageIntegration: blobStorageIntegrationRouter,
  llmApiKey: llmApiKeyRouter,
  llmSchemas: llmSchemaRouter,
  llmTools: llmToolRouter,
  public: publicRouter,
  credentials: credentialsRouter,
  utilities: utilsRouter,
  uiCustomization: uiCustomizationRouter,
  comments: commentsRouter,
  commentReactions: commentReactionsRouter,
  media: mediaRouter,
  backgroundMigrations: backgroundMigrationsRouter,
  auditLogs: auditLogsRouter,
  table: tableRouter,
  cloudStatus: cloudStatusRouter,
  dashboardWidgets: dashboardWidgetRouter,
  TableViewPresets: TableViewPresetsRouter,
  automations: automationsRouter,
  slack: slackRouter,
  plainRouter: plainRouter,
  surveys: surveysRouter,
  naturalLanguageFilters: naturalLanguageFilterRouter,
  notificationPreferences: notificationPreferencesRouter,
});

export type AppRouter = typeof appRouter;
```

### tRPC Context Setup

**File:** `/web/src/server/api/trpc.ts`

The tRPC context provides:
- User session (NextAuth)
- Prisma client
- ClickHouse client (DB)
- Request headers
- OpenTelemetry instrumentation

```typescript
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const { req, res } = opts;
  const session = await getServerAuthSession({ req, res });
  const headers = req.headers;

  return createInnerTRPCContext({
    session,
    headers,
    prisma,
    DB // ClickHouse
  });
};
```

### tRPC Procedures

Langfuse uses several procedure types:

1. **publicProcedure** - No authentication required
2. **protectedProcedure** - Requires user authentication
3. **protectedProjectProcedure** - Requires project-level access
4. **protectedOrganizationProcedure** - Requires organization-level access

### Example: Scores Router

**File:** `/web/src/server/api/routers/scores.ts`

```typescript
export const scoresRouter = createTRPCRouter({
  // Query: Get all scores for a project
  all: protectedProjectProcedure
    .input(z.object({
      projectId: z.string(),
      filter: z.array(singleFilter),
      orderBy: orderBy,
      page: z.number(),
      limit: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      // Fetch from ClickHouse
      const clickhouseScoreData = await getScoresUiTable({
        projectId: input.projectId,
        filter: input.filter ?? [],
        orderBy: input.orderBy,
        limit: input.limit,
        offset: input.page * input.limit,
      });

      // Enrich with Prisma data
      const [jobExecutions, users] = await Promise.all([
        ctx.prisma.jobExecution.findMany({ /* ... */ }),
        ctx.prisma.user.findMany({ /* ... */ }),
      ]);

      return { scores: clickhouseScoreData };
    }),

  // Query: Get score by ID
  byId: protectedProjectProcedure
    .input(z.object({
      scoreId: z.string(),
      projectId: z.string(),
    }))
    .query(async ({ input }) => {
      const score = await getScoreById({
        projectId: input.projectId,
        scoreId: input.scoreId,
      });

      if (!score) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No score with id ${input.scoreId}`,
        });
      }

      return score;
    }),

  // More procedures...
});
```

---

## REST Public API

### Overview
**Purpose:** External programmatic access, SDK integration
**Location:** `/web/src/pages/api/public/`
**Documentation:** Fern + OpenAPI specs in `/fern/`

### Public API Structure

```
/web/src/pages/api/public/
├── annotation-queues/
├── comments/
├── dataset-items/
├── dataset-run-items.ts
├── datasets/
├── datasets.ts
├── events.ts
├── generations.ts
├── health.ts
├── ingestion.ts
├── integrations/
├── llm-connections/
├── media/
├── metrics/
├── models/
├── observations/
├── organizations/
├── otel/
├── projects/
├── prompts.ts
├── ready.ts
├── scim/
├── score-configs/
├── scores/               # ← Example endpoint
│   ├── index.ts         # GET /api/public/scores, POST /api/public/scores
│   └── [scoreId].ts     # GET /api/public/scores/{scoreId}
├── sessions/
├── slack/
├── spans.ts
├── traces/
└── v2/
```

### REST API Pattern

**File:** `/web/src/pages/api/public/scores/index.ts`

```typescript
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQueryV1,
  GetScoresResponseV1,
  PostScoresBodyV1,
  PostScoresResponseV1,
} from "@langfuse/shared";

export default withMiddlewares({
  // POST /api/public/scores - Create a score
  POST: createAuthedProjectAPIRoute({
    name: "Create Score",
    bodySchema: PostScoresBodyV1,      // Zod v4 validation
    responseSchema: PostScoresResponseV1,
    fn: async ({ body, auth, res }) => {
      const event = {
        id: v4(),
        type: eventTypes.SCORE_CREATE,
        timestamp: new Date().toISOString(),
        body,
      };

      const result = await processEventBatch([event], auth);

      if (result.errors.length > 0) {
        const error = result.errors[0];
        res.status(error.status).json({
          message: error.error ?? error.message
        });
        return { id: "" };
      }

      return { id: event.body.id };
    },
  }),

  // GET /api/public/scores - List scores
  GET: createAuthedProjectAPIRoute({
    name: "/api/public/scores",
    querySchema: GetScoresQueryV1,
    responseSchema: GetScoresResponseV1,
    fn: async ({ query, auth }) => {
      const scoresApiService = new ScoresApiService("v1");

      const [items, count] = await Promise.all([
        scoresApiService.generateScoresForPublicApi(scoreParams),
        scoresApiService.getScoresCountForPublicApi(scoreParams),
      ]);

      return {
        data: filterAndValidateV1GetScoreList(items),
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

### REST API Features

1. **Authentication:** API key-based (Project or Organization level)
2. **Validation:** Zod v4 schemas for all inputs/outputs
3. **Middleware:** `withMiddlewares` wrapper for CORS, rate limiting, etc.
4. **Error Handling:** Standardized error responses
5. **Documentation:** OpenAPI specs generated via Fern

---

## How to Add New Endpoints

### Adding a tRPC Endpoint

**Scenario:** You want to add a new endpoint to get user analytics

**Step 1:** Create or modify router file

```bash
# Create new router (if needed)
touch /web/src/server/api/routers/analytics.ts
```

**Step 2:** Define router with procedures

```typescript
// /web/src/server/api/routers/analytics.ts
import { z } from "zod/v4";
import { createTRPCRouter, protectedProjectProcedure } from "@/src/server/api/trpc";

export const analyticsRouter = createTRPCRouter({
  getUserStats: protectedProjectProcedure
    .input(z.object({
      projectId: z.string(),
      userId: z.string(),
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(async ({ input, ctx }) => {
      // Your implementation
      const stats = await ctx.DB.query(/* ClickHouse query */);
      return stats;
    }),

  createAnalyticsReport: protectedProjectProcedure
    .input(z.object({
      projectId: z.string(),
      reportType: z.enum(['daily', 'weekly', 'monthly']),
    }))
    .mutation(async ({ input, ctx }) => {
      // Your implementation
      const report = await generateReport(input);
      return report;
    }),
});
```

**Step 3:** Add to root router

```typescript
// /web/src/server/api/root.ts
import { analyticsRouter } from "./routers/analytics";

export const appRouter = createTRPCRouter({
  // ... existing routers
  analytics: analyticsRouter, // ← Add here
});
```

**Step 4:** Use in frontend

```typescript
// Frontend component
import { api } from "@/src/utils/api";

function AnalyticsPage() {
  const { data, isLoading } = api.analytics.getUserStats.useQuery({
    projectId: "proj_123",
    userId: "user_456",
    startDate: new Date("2025-01-01"),
    endDate: new Date("2025-12-31"),
  });

  return <div>{/* Render stats */}</div>;
}
```

### Adding a REST Public API Endpoint

**Scenario:** You want to add `GET /api/public/analytics/stats`

**Step 1:** Create API route file

```bash
mkdir -p /web/src/pages/api/public/analytics
touch /web/src/pages/api/public/analytics/stats.ts
```

**Step 2:** Define Zod schemas (in shared package)

```typescript
// /packages/shared/src/server/api/public/analytics.ts
import { z } from "zod/v4";

export const GetAnalyticsStatsQuery = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  metric: z.enum(['traces', 'scores', 'generations']),
});

export const GetAnalyticsStatsResponse = z.object({
  total: z.number(),
  breakdown: z.array(z.object({
    date: z.string(),
    count: z.number(),
  })),
});
```

**Step 3:** Implement endpoint

```typescript
// /web/src/pages/api/public/analytics/stats.ts
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { GetAnalyticsStatsQuery, GetAnalyticsStatsResponse } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Analytics Stats",
    querySchema: GetAnalyticsStatsQuery,
    responseSchema: GetAnalyticsStatsResponse,
    fn: async ({ query, auth }) => {
      const stats = await fetchAnalyticsStats({
        projectId: auth.scope.projectId,
        startDate: new Date(query.startDate),
        endDate: new Date(query.endDate),
        metric: query.metric,
      });

      return {
        total: stats.total,
        breakdown: stats.breakdown,
      };
    },
  }),
});
```

**Step 4:** Update Fern API specs

```bash
# Update Fern specs in /fern/
# Then regenerate OpenAPI spec
cd /fern
fern generate
```

**Step 5:** Add tests

```typescript
// /web/src/__tests__/analytics-api.servertest.ts
describe("Analytics API", () => {
  it("should return stats for valid date range", async () => {
    const response = await makeAPICall("GET", "/api/public/analytics/stats", {
      query: {
        startDate: "2025-01-01T00:00:00Z",
        endDate: "2025-12-31T23:59:59Z",
        metric: "traces",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("total");
    expect(response.body).toHaveProperty("breakdown");
  });
});
```

---

## Examples and Patterns

### Pattern 1: Multi-Database Query (PostgreSQL + ClickHouse)

Many endpoints query both databases:

```typescript
// Query ClickHouse for analytics data
const analyticsData = await getScoresUiTable({
  projectId: input.projectId,
  // ... ClickHouse query params
});

// Enrich with relational data from PostgreSQL
const [users, configs] = await Promise.all([
  ctx.prisma.user.findMany({
    where: { id: { in: userIds } },
  }),
  ctx.prisma.scoreConfig.findMany({
    where: { id: { in: configIds } },
  }),
]);

// Merge results
return analyticsData.map(item => ({
  ...item,
  userName: users.find(u => u.id === item.userId)?.name,
  configName: configs.find(c => c.id === item.configId)?.name,
}));
```

### Pattern 2: RBAC & Authorization

All endpoints enforce project/organization access:

```typescript
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export const myRouter = createTRPCRouter({
  myProcedure: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Authorization already checked by protectedProjectProcedure
      // Additional checks if needed:
      await throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scores:read",
      });

      // Proceed with query
    }),
});
```

### Pattern 3: Batch Processing via Events

Public API uses event-based ingestion:

```typescript
const events = items.map(item => ({
  id: v4(),
  type: eventTypes.SCORE_CREATE,
  timestamp: new Date().toISOString(),
  body: item,
}));

const result = await processEventBatch(events, auth);

// Handle errors
if (result.errors.length > 0) {
  return { errors: result.errors };
}
```

### Pattern 4: Pagination

Standard pagination pattern:

```typescript
const limit = query.limit ?? 50;
const page = query.page ?? 0;
const offset = page * limit;

const [items, totalCount] = await Promise.all([
  fetchItems({ limit, offset }),
  countItems(),
]);

return {
  data: items,
  meta: {
    page,
    limit,
    totalItems: totalCount,
    totalPages: Math.ceil(totalCount / limit),
  },
};
```

### Pattern 5: Background Jobs (BullMQ)

Long-running operations use queues:

```typescript
import { BatchExportQueue, QueueJobs } from "@langfuse/shared/src/server";

// Enqueue job
await BatchExportQueue.add(QueueJobs.BatchExport, {
  projectId: input.projectId,
  exportType: "scores",
  filters: input.filters,
});

return {
  jobId: job.id,
  status: "queued"
};
```

---

## Key Technologies

### Validation
- **Zod v4** (`zod/v4`) - Always import from `zod/v4`, not `zod`
- All inputs/outputs validated with Zod schemas
- Shared schemas in `/packages/shared/src/server/`

### Database
- **PostgreSQL** - Relational data (Prisma ORM)
- **ClickHouse** - High-volume analytics (Kysely + raw queries)
- **Redis** - Caching, queues (ioredis)

### Authentication
- **NextAuth.js** - User sessions (tRPC)
- **API Keys** - Project/Organization level (REST API)

### Testing
- **Jest** - Web package tests (`pnpm test`, `pnpm test-sync`)
- **Vitest** - Worker package tests
- **Playwright** - E2E tests

---

## Development Workflow

### Running Locally

```bash
# Start all services
pnpm run dev

# Or just web app (most common)
pnpm run dev:web  # http://localhost:3000

# Start infrastructure (if needed)
pnpm run infra:dev:up
```

### Testing

```bash
# Test tRPC endpoints
cd /web
pnpm test-sync --testPathPattern="routers/scores"

# Test public API
pnpm test -- --testPathPattern="public-api/scores"
```

### Database Migrations

```bash
cd /packages/shared
pnpm run db:migrate       # Run migrations
pnpm run db:generate      # Generate Prisma client
```

---

## Common Endpoints Reference

### tRPC Routers (Internal)
| Router | Purpose | File |
|--------|---------|------|
| `traces` | Trace CRUD operations | `/routers/traces.ts` |
| `scores` | Score management | `/routers/scores.ts` |
| `generations` | LLM generation tracking | `/routers/generations.ts` |
| `datasets` | Dataset management | `/features/datasets/server/dataset-router.ts` |
| `prompts` | Prompt management | `/features/prompts/server/routers/promptRouter.ts` |
| `evals` | Evaluations | `/features/evals/server/router.ts` |
| `dashboard` | Dashboard data | `/features/dashboard/server/dashboard-router.ts` |

### REST Endpoints (Public)
| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/public/traces` | GET, POST | Trace ingestion & retrieval |
| `/api/public/scores` | GET, POST | Score CRUD |
| `/api/public/generations` | GET | Generation data |
| `/api/public/datasets` | GET, POST, DELETE | Dataset management |
| `/api/public/prompts` | GET | Prompt retrieval |
| `/api/public/ingestion` | POST | Batch event ingestion |
| `/api/public/health` | GET | Health check |

---

## Conclusion

Langfuse **does not use GraphQL**. Instead, it leverages:

1. **tRPC** for type-safe, efficient frontend-backend communication
2. **REST API** for external integrations and SDK support

Both approaches provide:
- ✅ Strong type safety (TypeScript + Zod)
- ✅ Excellent developer experience
- ✅ Comprehensive validation
- ✅ Clear separation of concerns

If you're looking to add new endpoints, follow the patterns documented above for either tRPC (internal) or REST (public API).

---

## Next Steps

To work with the existing APIs:

1. **Read the architecture docs:**
   - `/web/src/features/rbac/README.md` - Authorization
   - `/web/src/features/entitlements/README.md` - Feature flags
   - `/web/src/features/public-api/` - Public API patterns

2. **Explore existing routers:**
   - `/web/src/server/api/routers/` - tRPC examples
   - `/web/src/pages/api/public/` - REST API examples

3. **Run the app locally:**
   ```bash
   pnpm run dev:web
   # Login: demo@langfuse.com / password
   ```

4. **Consider removing the unused `graphql` dependency:**
   ```bash
   # After verifying it's not a transitive dependency
   pnpm remove graphql --filter=web
   ```

---

**Report Generated:** November 6, 2025
**Repository:** langfuse/langfuse
**Branch:** claude/analyze-graphql-endpoints-011CUr3Pvdb68m5r3ED4iS3s
