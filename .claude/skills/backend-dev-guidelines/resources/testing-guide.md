# Testing Guide - Backend Testing Strategies

Complete guide to testing Langfuse backend services across web, worker, and shared packages.

## Table of Contents

- [Test Types Overview](#test-types-overview)
- [Integration Tests (Public API)](#integration-tests-public-api)
- [Service-Level Tests (Repository/Service)](#service-level-tests-repositoryservice)
- [tRPC Tests (Procedure Testing)](#trpc-tests-procedure-testing)
- [Worker Tests (Queue Processing)](#worker-tests-queue-processing)
- [Key Testing Principles](#key-testing-principles)
- [Running Tests](#running-tests)

---

## Test Types Overview

Langfuse uses multiple testing strategies for different layers:

| Test Type | Framework | Location | Purpose |
|-----------|-----------|----------|---------|
| Integration | Jest | `web/src/__tests__/async/` | Full API endpoint testing |
| tRPC | Jest | `web/src/__tests__/async/` | tRPC procedure testing with auth |
| Service | Jest | `web/src/__tests__/async/repositories/` | Repository/service function testing |
| Worker | Vitest | `worker/src/__tests__/` | Queue processors and streams |

---

## Integration Tests (Public API)

Test full REST API endpoints end-to-end using HTTP requests.

**File location:** `web/src/__tests__/async/datasets-api.servertest.ts`

```typescript
import { makeZodVerifiedAPICall } from "../helpers";
import { PostDatasetsV1Response } from "@/src/features/public-api/types/datasets";

describe("Dataset API", () => {
  it("should create dataset", async () => {
    const res = await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      { name: "test-dataset" },
      auth,
    );
    expect(res.status).toBe(200);
  });

  it("should validate input", async () => {
    const res = await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      { name: "" }, // Invalid empty name
      auth,
    );
    expect(res.status).toBe(400);
  });
});
```

**Key Points:**
- Uses `makeZodVerifiedAPICall` for type-safe API testing
- Tests HTTP status codes and response validation
- Tests both success and error cases

---

## Service-Level Tests (Repository/Service)

Test individual repository/service functions with isolated data.

**File location:** `web/src/__tests__/async/repositories/event-repository.servertest.ts`

```typescript
import {
  createEvent,
  createEventsCh,
  getObservationsWithModelDataFromEventsTable,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";

describe("Event Repository Tests", () => {
  it("should return observations with model data", async () => {
    const traceId = randomUUID();
    const generationId = randomUUID();
    const modelId = randomUUID();

    // Create test data
    await prisma.model.create({
      data: {
        id: modelId,
        projectId,
        modelName: `gpt-4-${modelId}`,
        matchPattern: `(?i)^(gpt-?4-${modelId})$`,
        startDate: new Date("2023-01-01"),
        unit: "TOKENS",
        Price: {
          create: [
            { usageType: "input", price: 0.03 },
            { usageType: "output", price: 0.06 },
          ],
        },
      },
    });

    const event = createEvent({
      id: generationId,
      span_id: generationId,
      project_id: projectId,
      trace_id: traceId,
      type: "GENERATION",
      name: `test-generation-${generationId}`,
      model_id: modelId,
    });

    await createEventsCh([event]);

    // Test the service function
    const result = await getObservationsWithModelDataFromEventsTable({
      projectId,
      filter: [{ type: "string", column: "id", operator: "=", value: generationId }],
      limit: 1000,
      offset: 0,
    });

    expect(result.length).toBeGreaterThan(0);
    const observation = result.find((o) => o.id === generationId);
    expect(observation?.internalModelId).toBe(modelId);
    expect(Number(observation?.inputPrice)).toBeCloseTo(0.03, 5);

    // Cleanup
    await prisma.model.delete({ where: { id: modelId } });
  });

  it("should handle filters correctly", async () => {
    const projectId = randomUUID();
    const traceId = randomUUID();

    const observations = [
      createEvent({
        id: randomUUID(),
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test1",
      }),
      createEvent({
        id: randomUUID(),
        project_id: projectId,
        trace_id: traceId,
        type: "SPAN",
        name: "test2",
      }),
    ];

    await createEventsCh(observations);

    const result = await getObservationsWithModelDataFromEventsTable({
      projectId,
      filter: [
        { type: "stringOptions", column: "type", operator: "any of", value: ["GENERATION"] }
      ],
      limit: 1000,
      offset: 0,
    });

    expect(result.every(o => o.type === "GENERATION")).toBe(true);
  });
});
```

**Key Points:**
- Tests service/repository functions directly
- Uses ClickHouse and Prisma test data
- Always cleanup test data after tests
- Use unique IDs to avoid test interference

---

## tRPC Tests (Procedure Testing)

Test tRPC procedures with caller pattern and auth context.

**File location:** `web/src/__tests__/async/automations-trpc.servertest.ts`

```typescript
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 } from "uuid";
import { JobConfigState } from "@langfuse/shared";

async function prepare() {
  const { project, org } = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      name: "Demo User",
      organizations: [{
        id: org.id,
        name: org.name,
        role: "OWNER",
        projects: [{
          id: project.id,
          role: "ADMIN",
          name: project.name,
        }],
      }],
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  return { project, org, session, ctx, caller };
}

describe("automations trpc", () => {
  it("should retrieve all automations for a project", async () => {
    const { project, caller } = await prepare();

    // Create test trigger
    const trigger = await prisma.trigger.create({
      data: {
        id: v4(),
        projectId: project.id,
        eventSource: "prompt",
        eventActions: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
      },
    });

    // Create test action
    const action = await prisma.action.create({
      data: {
        id: v4(),
        projectId: project.id,
        type: "WEBHOOK",
        config: {
          type: "WEBHOOK",
          url: "https://example.com/webhook",
          headers: { "Content-Type": "application/json" },
        },
      },
    });

    // Link trigger to action
    await prisma.automation.create({
      data: {
        projectId: project.id,
        triggerId: trigger.id,
        actionId: action.id,
        name: "Test Automation",
      },
    });

    // Call tRPC procedure
    const response = await caller.automations.getAutomations({
      projectId: project.id,
    });

    expect(response).toHaveLength(1);
    expect(response[0]).toMatchObject({
      name: "Test Automation",
      trigger: expect.objectContaining({
        id: trigger.id,
        eventSource: "prompt",
      }),
    });
  });

  it("should throw error when user lacks permissions", async () => {
    const { project, session } = await prepare();

    // Create limited session
    const limitedSession: Session = {
      ...session,
      user: {
        ...session.user!,
        organizations: [{
          ...session.user!.organizations[0],
          projects: [{
            ...session.user!.organizations[0].projects[0],
            role: "VIEWER", // VIEWER can't create automations
          }],
        }],
      },
    };

    const limitedCtx = createInnerTRPCContext({
      session: limitedSession,
      headers: {},
    });
    const limitedCaller = appRouter.createCaller({ ...limitedCtx, prisma });

    await expect(
      limitedCaller.automations.createAutomation({
        projectId: project.id,
        name: "Unauthorized",
        eventSource: "prompt",
        eventAction: ["created"],
        filter: [],
        status: JobConfigState.ACTIVE,
        actionType: "WEBHOOK",
        actionConfig: {
          type: "WEBHOOK",
          url: "https://example.com/webhook",
          requestHeaders: {},
          apiVersion: { prompt: "v1" },
        },
      }),
    ).rejects.toThrow("User does not have access");
  });
});
```

**Key Points:**
- Uses `prepare()` helper to set up test context
- Creates authenticated caller with `appRouter.createCaller`
- Tests both success and permission error cases
- Can test different user roles and permissions

---

## Worker Tests (Queue Processing)

Test queue processors and stream functions using vitest.

**File location:** `worker/src/__tests__/batchExport.test.ts`

```typescript
import { randomUUID } from "crypto";
import { expect, describe, it } from "vitest";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTraceScore,
  createScoresCh,
  createTrace,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { getObservationStream } from "../features/database-read-stream/observation-stream";

describe("batch export test suite", () => {
  it("should export observations", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    const trace = createTrace({
      project_id: projectId,
      id: traceId,
    });

    await createTracesCh([trace]);

    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: traceId,
        type: "SPAN",
      }),
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
      }),
    ];

    const score = createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: observations[0].id,
      name: "test",
      value: 123,
    });

    await createScoresCh([score]);
    await createObservationsCh(observations);

    // Test the stream function
    const stream = await getObservationStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [],
    });

    const rows: any[] = [];
    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: observations[0].id,
          type: observations[0].type,
          test: [score.value],
        }),
      ]),
    );
  });

  it("should export with filters", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const observations = [
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test1",
      }),
      createObservation({
        project_id: projectId,
        trace_id: randomUUID(),
        type: "SPAN",
        name: "test2",
      }),
    ];

    await createObservationsCh(observations);

    const stream = await getObservationStream({
      projectId: projectId,
      cutoffCreatedAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      filter: [
        {
          type: "stringOptions",
          operator: "any of",
          column: "name",
          value: ["test1"],
        },
      ],
    });

    const rows: any[] = [];
    for await (const chunk of stream) {
      rows.push(chunk);
    }

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("test1");
  });
});
```

**Key Points:**
- Uses vitest (not Jest) for worker tests
- Tests stream functions with async iteration
- Creates isolated test data per test
- Use unique project IDs to avoid interference

---

## Key Testing Principles

### General Principles

1. **Test Isolation**: Each test should be independent and runnable in any order
2. **Unique IDs**: Use `randomUUID()` or unique project IDs to avoid test interference
3. **Cleanup**: Always clean up test data in service tests (or use unique project IDs)
4. **No `pruneDatabase`**: Avoid `pruneDatabase` calls, especially in `__tests__/async/` directory

### By Test Type

| Test Type | Key Principles |
|-----------|----------------|
| **Integration** | Test HTTP endpoints, validate status codes and response shapes |
| **tRPC** | Use `createInnerTRPCContext` and `appRouter.createCaller`, test auth/permissions |
| **Service** | Test individual functions with isolated data, always cleanup |
| **Worker** | Use vitest, test streams with async iteration, test filtering logic |

### Test Data Management

```typescript
// ✅ GOOD: Use unique IDs
const projectId = randomUUID();
const traceId = randomUUID();

// ✅ GOOD: Cleanup in service tests
afterAll(async () => {
  await prisma.model.delete({ where: { id: modelId } });
});

// ✅ GOOD: Use unique projects (no cleanup needed)
const { projectId } = await createOrgProjectAndApiKey();

// ❌ BAD: Shared test data between tests
const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

// ❌ BAD: Using pruneDatabase
await pruneDatabase();
```

---

## Running Tests

### Web Tests (Jest)

```bash
# Run all tests
pnpm test

# Run sync tests
pnpm test-sync

# Run async tests
pnpm test -- --testPathPattern="async"

# Run specific test file
pnpm test -- --testPathPattern="datasets-api"

# Run specific test
pnpm test -- --testPathPattern="datasets-api" --testNamePattern="should create dataset"
```

### Worker Tests (Vitest)

```bash
# Run all worker tests
pnpm run test --filter=worker

# Run specific test file
pnpm run test --filter=worker -- batchExport

# Run specific test
pnpm run test --filter=worker -- batchExport -t "should export observations"
```

### Coverage

```bash
# Web coverage
pnpm test -- --coverage

# Worker coverage
pnpm run test --filter=worker -- --coverage
```

---

**Related Files:**
- [SKILL.md](../SKILL.md) - Main backend guidelines
- [architecture-overview.md](architecture-overview.md) - Architecture patterns
- [complete-examples.md](complete-examples.md) - Full code examples
