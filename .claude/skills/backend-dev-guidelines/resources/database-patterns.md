# Database Patterns - PostgreSQL & ClickHouse

Complete guide to database access patterns in Langfuse using PostgreSQL (Prisma ORM) and ClickHouse (direct client).

## Table of Contents

- [Database Architecture Overview](#database-architecture-overview)
- [PostgreSQL with Prisma](#postgresql-with-prisma)
- [ClickHouse with Direct Client](#clickhouse-with-direct-client)
- [Repository Pattern](#repository-pattern)
- [When to Use Which Database](#when-to-use-which-database)
- [Error Handling](#error-handling)

---

## Database Architecture Overview

Langfuse uses a **dual database architecture**:

| Database       | Technology        | Purpose                                                       | Access Pattern                         |
| -------------- | ----------------- | ------------------------------------------------------------- | -------------------------------------- |
| **PostgreSQL** | Prisma ORM        | Transactional data, relational data, CRUD operations          | Type-safe ORM with migrations          |
| **ClickHouse** | Direct SQL client | Analytics data, high-volume traces/observations, aggregations | Raw SQL queries with streaming support |
| **Redis**      | ioredis           | Queues (BullMQ), caching, rate limiting                       | Direct client access                   |

**Key Principle**: Use PostgreSQL for transactional data and relationships. Use ClickHouse for high-volume analytics and time-series data.

**⚠️ Important**: All queries must filter by `project_id` (or `projectId`) to ensure proper data isolation between tenants. This is essential for the multi-tenant architecture.

---

## PostgreSQL with Prisma

### Import Pattern

```typescript
import { prisma } from "@langfuse/shared/src/db";

// Direct access to Prisma client
const user = await prisma.user.findUnique({ where: { id } });
```

**Important**: Always import from `@langfuse/shared/src/db`, not `@prisma/client` directly.

### Common CRUD Operations

**⚠️ ALWAYS include `projectId` in WHERE clauses** for project-scoped data:

```typescript
// Create
const project = await prisma.project.create({
  data: {
    name: "My Project",
    orgId: organizationId,
  },
});

// ✅ GOOD: Read with projectId filter
const trace = await prisma.trace.findUnique({
  where: { id: traceId, projectId },  // ← Always include projectId for tenant isolation
  include: {
    scores: true,
    project: { select: { id: true, name: true } },
  },
});

// ❌ BAD: Missing projectId filter
// const trace = await prisma.trace.findUnique({
//   where: { id: traceId },  // ← Missing projectId!
// });

// Update
await prisma.user.update({
  where: { id: userId },
  data: { lastLogin: new Date() },
});

// ✅ GOOD: Delete with projectId
await prisma.apiKey.delete({
  where: { id: apiKeyId, projectId },  // ← Always include projectId
});

// ✅ GOOD: Count with projectId
const traceCount = await prisma.trace.count({
  where: { projectId, userId },  // ← Always include projectId
});
```

### Transactions

Use Prisma interactive transactions for operations that must be atomic:

```typescript
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: userData });

  const project = await tx.project.create({
    data: {
      name: "Default Project",
      orgId: user.id,
    },
  });

  await tx.projectMembership.create({
    data: {
      userId: user.id,
      projectId: project.id,
      role: "OWNER",
    },
  });

  return { user, project };
});
```

**Transaction options:**

```typescript
await prisma.$transaction(
  async (tx) => {
    // Transaction logic
  },
  {
    maxWait: 5000, // Max time to wait for transaction to start (ms)
    timeout: 10000, // Max time transaction can run (ms)
  },
);
```

### Query Optimization

**Use `select` to limit fields:**

```typescript
// ❌ Fetches all fields (including large JSON columns)
const traces = await prisma.trace.findMany({ where: { projectId } });

// ✅ Only fetch needed fields
const traces = await prisma.trace.findMany({
  where: { projectId },
  select: {
    id: true,
    name: true,
    timestamp: true,
    userId: true,
  },
});
```

**Prevent N+1 queries with `include`:**

```typescript
// ❌ N+1 Query Problem
const projects = await prisma.project.findMany();
for (const project of projects) {
  // N additional queries
  const memberCount = await prisma.projectMembership.count({
    where: { projectId: project.id },
  });
}

// ✅ Use include or aggregation
const projects = await prisma.project.findMany({
  include: {
    members: { select: { userId: true, role: true } },
  },
});
```

**Pagination:**

```typescript
const PAGE_SIZE = 50;

const traces = await prisma.trace.findMany({
  where: { projectId },
  orderBy: { timestamp: "desc" },
  take: PAGE_SIZE,
  skip: page * PAGE_SIZE,
});
```

## ClickHouse with Direct Client

### Import Pattern

```typescript
import { queryClickhouse } from "@langfuse/shared/src/server/repositories/clickhouse";
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse/client";
```

### ClickHouse Client Singleton

ClickHouse uses a singleton client manager that reuses connections:

```typescript
import { clickhouseClient } from "@langfuse/shared/src/server/clickhouse/client";

// Get client (automatically reuses existing connection)
const client = clickhouseClient();

// For read-only queries (uses read replica if configured)
const client = clickhouseClient(undefined, "ReadOnly");
```

### Query Patterns

ClickHouse queries use **raw SQL** with parameterized queries. Parameters use `{paramName: Type}` syntax:

**⚠️ Important**: All ClickHouse queries must include `project_id` filter to ensure proper tenant isolation.

**Simple query:**

```typescript
import { queryClickhouse } from "@langfuse/shared/src/server/repositories/clickhouse";

// ✅ GOOD: Always filter by project_id
const rows = await queryClickhouse<{ id: string; name: string }>({
  query: `
    SELECT id, name, timestamp
    FROM traces
    WHERE project_id = {projectId: String}  -- ← REQUIRED: Always filter by project_id
    AND timestamp >= {startTime: DateTime64(3)}
    ORDER BY timestamp DESC
    LIMIT {limit: UInt32}
  `,
  params: {
    projectId,  // ← Required for tenant isolation
    startTime: convertDateToClickhouseDateTime(startDate),
    limit: 100,
  },
  tags: { feature: "tracing", type: "trace" },
});

// ❌ BAD: Missing project_id filter
// const rows = await queryClickhouse({
//   query: `SELECT * FROM traces WHERE timestamp >= {startTime: DateTime64(3)}`,
//   params: { startTime },
// });
```

**Streaming query (for large result sets):**

```typescript
import { queryClickhouseStream } from "@langfuse/shared/src/server/repositories/clickhouse";

// Stream results to avoid loading all rows in memory
for await (const row of queryClickhouseStream<ObservationRecordReadType>({
  query: `
    SELECT *
    FROM observations
    WHERE project_id = {projectId: String}
    AND start_time >= {startTime: DateTime64(3)}
  `,
  params: { projectId, startTime },
})) {
  // Process row by row
  await processObservation(row);
}
```

**Upsert (insert) operation:**

```typescript
import { upsertClickhouse } from "@langfuse/shared/src/server/repositories/clickhouse";

await upsertClickhouse({
  table: "traces",
  records: [
    {
      id: traceId,
      project_id: projectId,
      timestamp: new Date(),
      name: "API Call",
      user_id: userId,
      // ... other fields
    },
  ],
  eventBodyMapper: (record) => ({
    // Transform record for event log
    id: record.id,
    name: record.name,
    // ... other fields
  }),
  tags: { feature: "ingestion", type: "trace" },
});
```

**DDL/Administrative commands:**

```typescript
import { commandClickhouse } from "@langfuse/shared/src/server/repositories/clickhouse";

// Create table, alter schema, etc.
await commandClickhouse({
  query: `
    ALTER TABLE traces
    ADD COLUMN IF NOT EXISTS new_field String
  `,
  tags: { feature: "migration" },
});
```

### ClickHouse Type Mapping

| JavaScript Type | ClickHouse Param Type                                     |
| --------------- | --------------------------------------------------------- |
| `string`        | `String`                                                  |
| `number`        | `UInt32`, `Int64`, `Float64`                              |
| `Date`          | `DateTime64(3)` (use `convertDateToClickhouseDateTime()`) |
| `boolean`       | `UInt8` (0 or 1)                                          |
| `string[]`      | `Array(String)`                                           |

**Date handling:**

```typescript
import { convertDateToClickhouseDateTime } from "@langfuse/shared/src/server/clickhouse/client";

const params = {
  startTime: convertDateToClickhouseDateTime(new Date()),
};
```

### ClickHouse Query Best Practices

**1. Always filter by `project_id` for tenant isolation:**

```typescript
// ✅ CORRECT: project_id filter is required
const query = `
  SELECT *
  FROM traces
  WHERE project_id = {projectId: String}  -- ← Required for tenant isolation
  AND timestamp >= {startTime: DateTime64(3)}
`;

// ❌ WRONG: Missing project_id filter
// const query = `
//   SELECT * FROM traces WHERE timestamp >= {startTime: DateTime64(3)}
// `;
```

**Why this is important:**
- Langfuse is multi-tenant - each project's data must be isolated
- The `project_id` filter ensures queries only access data from the intended tenant
- All queries on project-scoped tables (traces, observations, scores, sessions, etc.) must filter by `project_id`

**2. Use LIMIT BY for deduplication:**

```typescript
// Get latest version of each trace
const query = `
  SELECT *
  FROM traces
  WHERE project_id = {projectId: String}  -- ← Always include project_id
  ORDER BY event_ts DESC
  LIMIT 1 BY id, project_id
`;
```

**3. Use time-based filtering for performance:**

```typescript
// Combine project_id filter with timestamp for optimal performance
const query = `
  SELECT *
  FROM observations
  WHERE project_id = {projectId: String}  -- ← Required for tenant isolation
  AND start_time >= {startTime: DateTime64(3)}  -- ← Improves performance
  AND start_time < {endTime: DateTime64(3)}
`;
```

**4. Use CTEs for complex queries (still require `project_id`):**

```typescript
const query = `
  WITH observations_agg AS (
    SELECT
      trace_id,
      count() as observation_count,
      sum(total_cost) as total_cost
    FROM observations
    WHERE project_id = {projectId: String}  -- ← Filter in CTE
    GROUP BY trace_id
  )
  SELECT
    t.id,
    t.name,
    o.observation_count,
    o.total_cost
  FROM traces t
  LEFT JOIN observations_agg o ON t.id = o.trace_id
  WHERE t.project_id = {projectId: String}  -- ← Filter in main query
`;
```

**Note**: When using CTEs or subqueries, ensure `project_id` filter is applied at each level.

**Error handling with retries:**

ClickHouse queries automatically retry on network errors (socket hang up). Custom error handling for resource limits:

```typescript
import {
  queryClickhouse,
  ClickHouseResourceError,
} from "@langfuse/shared/src/server/repositories/clickhouse";

try {
  const rows = await queryClickhouse({ query, params });
} catch (error) {
  if (error instanceof ClickHouseResourceError) {
    // Memory limit, timeout, or overcommit error
    throw new Error(ClickHouseResourceError.ERROR_ADVICE_MESSAGE);
  }
  throw error;
}
```

---

## Repository Pattern

Langfuse uses repositories in `packages/shared/src/server/repositories/` for complex data access patterns.

### When to Use Repositories

✅ **Use repositories when:**

- Complex ClickHouse queries with CTEs, aggregations, or joins
- Query used in multiple places (DRY principle)
- Need data transformation/converters (DB → domain models)
- Building reusable query logic with filters

❌ **Use direct Prisma/ClickHouse for:**

- Simple CRUD operations
- One-off queries
- Prototyping (refactor to repository later)

### Repository Examples

**Trace repository (ClickHouse):**

```typescript
// packages/shared/src/server/repositories/traces.ts
export const getTracesByIds = async (
  projectId: string,
  traceIds: string[],
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
```

**Score repository (PostgreSQL + ClickHouse):**

```typescript
// Repositories can query both databases
export const getScoresByTraceId = async (
  projectId: string,
  traceId: string,
) => {
  // Use ClickHouse for analytics
  const clickhouseScores = await queryClickhouse<ScoreRecordReadType>({
    query: `
      SELECT *
      FROM scores
      WHERE project_id = {projectId: String}
      AND trace_id = {traceId: String}
    `,
    params: { projectId, traceId },
  });

  // Use Prisma for config data
  const scoreConfigs = await prisma.scoreConfig.findMany({
    where: { projectId },
  });

  return enrichScoresWithConfigs(clickhouseScores, scoreConfigs);
};
```

---

## When to Use Which Database

| Use Case                               | Database   | Reasoning                                  |
| -------------------------------------- | ---------- | ------------------------------------------ |
| User accounts, projects, API keys      | PostgreSQL | Transactional data with strong consistency |
| Prompt management, dataset definitions | PostgreSQL | Configuration data with relations          |
| Project settings, RBAC permissions     | PostgreSQL | Small, frequently updated data             |
| Traces, observations, events           | ClickHouse | High-volume time-series data               |
| Score aggregations, analytics queries  | ClickHouse | Fast aggregations over millions of rows    |
| Usage metrics, cost calculations       | ClickHouse | Analytical queries with GROUP BY           |
| Exports, large dataset queries         | ClickHouse | Streaming support for large result sets    |

**Decision flow:**

1. Is it high-volume time-series data? → **ClickHouse**
2. Does it need aggregation over millions of rows? → **ClickHouse**
3. Is it transactional data with relationships? → **PostgreSQL**
4. Is it configuration or user data? → **PostgreSQL**
5. Is it frequently updated? → **PostgreSQL**
6. Is it append-only analytics data? → **ClickHouse**

### Project-Scoped vs Global Tables

**Project-scoped tables (MUST filter by `project_id`):**
- `traces` - All trace queries require `project_id`
- `observations` - All observation queries require `project_id`
- `scores` - All score queries require `project_id`
- `events` - All event queries require `project_id`
- `dataset_run_items_rmt` - All dataset run queries require `project_id`

**Global tables (no `project_id` filter needed):**
- `users` - User management (use `id` for filtering)
- `organizations` - Organization data (use `id` for filtering)
- System configuration tables

**Example of correct filtering:**

```typescript
// ✅ CORRECT: Project-scoped query
const traces = await queryClickhouse({
  query: `
    SELECT * FROM traces
    WHERE project_id = {projectId: String}
    AND timestamp >= {startTime: DateTime64(3)}
  `,
  params: { projectId, startTime },
});

// ✅ CORRECT: Global table query (no project_id needed)
const user = await prisma.user.findUnique({
  where: { id: userId },
});

// ❌ WRONG: Project-scoped query without project_id filter
// const traces = await queryClickhouse({
//   query: `SELECT * FROM traces WHERE timestamp >= {startTime: DateTime64(3)}`,
// });
```

---

## Error Handling

### PostgreSQL (Prisma) Errors

```typescript
import { Prisma } from "@prisma/client";
import { prisma } from "@langfuse/shared/src/db";

try {
  await prisma.user.create({ data: userData });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation
    if (error.code === "P2002") {
      const target = error.meta?.target as string[];
      throw new ConflictError(`${target?.join(", ")} already exists`);
    }

    // Foreign key constraint
    if (error.code === "P2003") {
      throw new ValidationError("Invalid reference");
    }

    // Record not found
    if (error.code === "P2025") {
      throw new NotFoundError("Record not found");
    }

    // Record required to connect not found
    if (error.code === "P2018") {
      throw new ValidationError("Related record not found");
    }
  }

  // Unknown error
  logger.error("Prisma error", { error });
  throw error;
}
```

**Common Prisma error codes:**

| Code     | Meaning                      | Typical Cause                         |
| -------- | ---------------------------- | ------------------------------------- |
| `P2002`  | Unique constraint violation  | Duplicate email, API key, etc.        |
| `P2003`  | Foreign key constraint       | Referenced record doesn't exist       |
| `P2025`  | Record not found             | Update/delete of non-existent record  |
| `P2018`  | Required relation not found  | Connect to non-existent related record |

### ClickHouse Errors

```typescript
import {
  queryClickhouse,
  ClickHouseResourceError,
} from "@langfuse/shared/src/server/repositories/clickhouse";

try {
  const rows = await queryClickhouse({ query, params });
} catch (error) {
  // ClickHouse resource errors (memory limit, timeout, overcommit)
  if (error instanceof ClickHouseResourceError) {
    logger.warn("ClickHouse resource error", {
      errorType: error.errorType, // "MEMORY_LIMIT" | "OVERCOMMIT" | "TIMEOUT"
      message: error.message,
    });

    // User-friendly error message
    throw new BadRequestError(ClickHouseResourceError.ERROR_ADVICE_MESSAGE);
  }

  // Network/connection errors are automatically retried
  logger.error("ClickHouse error", { error });
  throw error;
}
```

**ClickHouse error types:**

| Error Type      | Discriminator           | Meaning                      | Solution                                           |
| --------------- | ----------------------- | ---------------------------- | -------------------------------------------------- |
| `MEMORY_LIMIT`  | "memory limit exceeded" | Query used too much memory   | Use more specific filters or shorter time range    |
| `OVERCOMMIT`    | "OvercommitTracker"     | Memory overcommit limit hit  | Reduce query complexity or result set size         |
| `TIMEOUT`       | "Timeout", "timed out"  | Query took too long          | Add filters, reduce time range, or optimize query  |

**ClickHouse retries:**

ClickHouse queries automatically retry network errors (socket hang up) with exponential backoff. Configure retry behavior:

```typescript
// In packages/shared/src/env.ts
LANGFUSE_CLICKHOUSE_QUERY_MAX_ATTEMPTS: z.coerce.number().positive().default(3)
```

---

**Related Files:**

- [SKILL.md](../SKILL.md) - Main backend development guidelines
- [architecture-overview.md](architecture-overview.md) - System architecture
- [configuration.md](configuration.md) - Environment variable configuration
