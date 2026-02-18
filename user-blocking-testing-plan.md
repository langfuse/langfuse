# User Blocking Feature - Testing Plan

## Overview

This document outlines the comprehensive testing strategy for the user blocking feature, following the existing codebase testing patterns observed in `api-auth.servertest.ts` and other test files.

## Testing Framework & Patterns

### Framework
- **Test Runner**: Jest with Node environment
- **File Extension**: `.servertest.ts`
- **Location**: `web/src/__tests__/` for web package tests
- **Environment**: `/** @jest-environment node */` at file top

### Patterns Observed
- Standard `describe/it` block structure
- `beforeEach/afterEach` for test isolation and cleanup
- Helper functions defined at bottom of test files
- Real database operations using actual Prisma client
- Redis integration testing when applicable
- Comprehensive edge case coverage
- Complex integration scenarios

## Test File Structure

### 1. Service Layer Tests
**File**: `web/src/__tests__/userBlocking.servertest.ts`
```typescript
/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  blockUser,
  unblockUser,
  isUserBlocked,
  getBlockedUserIds,
  getBlockedUsers
} from "@langfuse/shared/src/server/ingestion/userBlocking";

describe("User Blocking Service", () => {
  beforeEach(async () => {
    await prisma.userBlockList.deleteMany();
  });

  afterEach(async () => {
    await prisma.userBlockList.deleteMany();
  });

  describe("blockUser", () => {
    it("should block a user successfully")
    it("should handle blocking already blocked user (upsert behavior)")
    it("should invalidate cache after blocking")
    it("should require valid projectId and userId")
  });

  describe("unblockUser", () => {
    it("should unblock a user successfully")
    it("should handle unblocking non-blocked user gracefully (P2025 error)")
    it("should invalidate cache after unblocking")
  });

  describe("isUserBlocked", () => {
    it("should return true for blocked users")
    it("should return false for non-blocked users")
    it("should return false for null/empty userId")
    it("should fail open on database errors")
  });

  describe("getBlockedUserIds (bulk operation)", () => {
    it("should return Set of blocked userIds from array")
    it("should handle empty userIds array")
    it("should handle mix of blocked/non-blocked users")
    it("should use single database query for performance")
    it("should fail open on database errors")
  });

  describe("getBlockedUsers (pagination)", () => {
    it("should return paginated blocked users")
    it("should handle empty results")
    it("should enforce pagination limits (max 1000)")
    it("should sort by createdAt DESC")
  });

  // Helper functions
  const createTestProject = async () => { /* implementation */ };
  const createBlockedUser = async (projectId: string, userId: string) => { /* implementation */ };
});
```

### 2. Cache Integration Tests
**File**: `web/src/__tests__/userBlockingCache.servertest.ts`
```typescript
/** @jest-environment node */

import { Redis } from "ioredis";
import { prisma } from "@langfuse/shared/src/db";

describe("User Blocking Cache Integration", () => {
  const redis = new Redis("redis://:myredissecret@127.0.0.1:6379", {
    maxRetriesPerRequest: null,
  });

  beforeEach(async () => {
    await prisma.userBlockList.deleteMany();
    const keys = await redis.keys("user_block:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
  });

  afterEach(async () => {
    await prisma.userBlockList.deleteMany();
    const keys = await redis.keys("user_block:*");
    if (keys.length > 0) {
      await redis.del(keys);
    }
  });

  afterAll(async () => {
    redis.disconnect();
  });

  describe("cache behavior", () => {
    it("should cache blocking status with TTL")
    it("should serve from cache on subsequent calls")
    it("should invalidate cache on block/unblock")
    it("should fallback to database on cache miss")
    it("should handle Redis unavailability gracefully")
  });
});
```

### 3. tRPC API Tests
**File**: `web/src/__tests__/userBlockingAPI.servertest.ts`
```typescript
/** @jest-environment node */

import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";
import { prisma } from "@langfuse/shared/src/db";

describe("User Blocking tRPC API", () => {
  beforeEach(async () => {
    await prisma.userBlockList.deleteMany();
  });

  afterEach(async () => {
    await prisma.userBlockList.deleteMany();
  });

  describe("blockUser", () => {
    it("should block user with OWNER role")
    it("should block user with ADMIN role")
    it("should reject MEMBER role with 403")
    it("should reject VIEWER role with 403")
    it("should create audit log entry")
    it("should validate projectId access")
    it("should return success response")
  });

  describe("unblockUser", () => {
    it("should unblock user with proper permissions")
    it("should create audit log entry")
    it("should handle unblocking non-blocked user")
    it("should reject insufficient permissions")
  });

  describe("getBlockedUsers", () => {
    it("should return blocked users with proper permissions")
    it("should handle pagination parameters")
    it("should reject insufficient permissions")
    it("should return empty list for no blocked users")
  });

  // Helper functions
  const createCaller = async (role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER") => {
    const ctx = createInnerTRPCContext({
      session: createSessionWithRole(role),
    });
    return appRouter.createCaller(ctx);
  };

  const createSessionWithRole = (role: string) => { /* implementation */ };
});
```

### 4. Ingestion Pipeline Integration Tests
**File**: `web/src/__tests__/userBlockingIngestion.servertest.ts`
```typescript
/** @jest-environment node */

import { processEventBatch } from "@langfuse/shared/src/server/ingestion/processEventBatch";
import { prisma } from "@langfuse/shared/src/db";
import { eventTypes } from "@langfuse/shared/src/server/ingestion/types";

describe("Ingestion Pipeline User Blocking", () => {
  beforeEach(async () => {
    await prisma.userBlockList.deleteMany();
  });

  afterEach(async () => {
    await prisma.userBlockList.deleteMany();
  });

  describe("trace filtering", () => {
    it("should filter out traces from blocked users")
    it("should allow traces from non-blocked users")
    it("should handle batch with mixed blocked/non-blocked users")
    it("should use bulk checking for performance")
    it("should handle traces without userId")
    it("should not affect non-trace events")
    it("should handle empty batch gracefully")
    it("should fail open on blocking service errors")
  });

  describe("performance", () => {
    it("should use single DB query for bulk user checking")
    it("should handle large batches efficiently")
    it("should use Set for O(1) lookups")
  });

  // Helper functions
  const createTraceEvent = (userId: string) => ({
    id: "test-event-id",
    timestamp: new Date().toISOString(),
    type: eventTypes.TRACE_CREATE,
    body: {
      id: "test-trace-id",
      userId,
      name: "test trace",
    },
  });

  const createAuthCheck = () => ({
    validKey: true,
    scope: {
      projectId: "test-project-id",
      accessLevel: "project" as const,
    },
  });
});
```

### 5. RBAC Permission Tests
**File**: `web/src/__tests__/userBlockingRBAC.servertest.ts`
```typescript
/** @jest-environment node */

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { projectRoleAccessRights } from "@/src/features/rbac/constants/projectAccessRights";

describe("User Blocking RBAC Permissions", () => {
  describe("permission scope validation", () => {
    it("should grant users:block to OWNER role", () => {
      expect(projectRoleAccessRights.OWNER).toContain("users:block");
    });

    it("should grant users:block to ADMIN role", () => {
      expect(projectRoleAccessRights.ADMIN).toContain("users:block");
    });

    it("should deny users:block to MEMBER role", () => {
      expect(projectRoleAccessRights.MEMBER).not.toContain("users:block");
    });

    it("should deny users:block to VIEWER role", () => {
      expect(projectRoleAccessRights.VIEWER).not.toContain("users:block");
    });
  });

  describe("access control enforcement", () => {
    it("should enforce project scope isolation")
    it("should validate session and project access")
  });
});
```

### 6. Database Schema Tests
**File**: `web/src/__tests__/userBlockListSchema.servertest.ts`
```typescript
/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";

describe("UserBlockList Database Schema", () => {
  beforeEach(async () => {
    await prisma.userBlockList.deleteMany();
  });

  afterEach(async () => {
    await prisma.userBlockList.deleteMany();
  });

  describe("constraints", () => {
    it("should enforce unique constraint (projectId, userId)")
    it("should reject null projectId")
    it("should reject null userId")
    it("should set default createdAt timestamp")
  });

  describe("foreign key relationships", () => {
    it("should validate foreign key to projects table")
    it("should cascade delete when project is deleted")
  });
});
```

## Test Execution Strategy

### Phase 1: Core Service Layer (Priority 1)
1. `userBlocking.servertest.ts` - Core blocking functions
2. `userBlockListSchema.servertest.ts` - Database schema validation

### Phase 2: API Integration (Priority 2)
1. `userBlockingAPI.servertest.ts` - tRPC endpoint testing
2. `userBlockingRBAC.servertest.ts` - Permission enforcement

### Phase 3: Pipeline Integration (Priority 3)
1. `userBlockingIngestion.servertest.ts` - Ingestion pipeline
2. `userBlockingCache.servertest.ts` - Cache behavior

### Phase 4: Edge Cases & Performance (Priority 4)
1. Error handling scenarios
2. Performance benchmarks
3. Concurrent operation testing

## Test Utilities & Helpers

### Common Helper Functions
```typescript
// Create in each test file as needed
const createTestProject = async (id?: string) => {
  return await prisma.project.create({
    data: {
      id: id || "test-project-id",
      name: "Test Project",
      orgId: "test-org-id",
    },
  });
};

const createTestUser = async (projectId: string, userId: string) => {
  return await prisma.userBlockList.create({
    data: { projectId, userId },
  });
};

const createTraceEvent = (userId: string) => ({
  id: "test-event-id",
  timestamp: new Date().toISOString(),
  type: eventTypes.TRACE_CREATE,
  body: { id: "test-trace-id", userId, name: "test" },
});

const flushRedisCache = async (redis: Redis, pattern: string) => {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(keys);
  }
};
```

## Test Data Management

### Cleanup Strategy
- Use `beforeEach/afterEach` for test isolation
- Clean up both database and Redis in each test
- Use unique identifiers to avoid conflicts
- Follow existing pattern of `deleteMany()` operations

### Test Project IDs
- Use consistent test project IDs like `"test-project-id"`
- Create projects as needed in tests
- Clean up projects in `afterEach` blocks

## Execution Commands

```bash
# Run all user blocking tests
pnpm test --testPathPatterns="userBlocking"

# Run specific test file
pnpm test --testPathPatterns="userBlockingAPI.servertest"

# Run with specific test name pattern
pnpm test --testPathPatterns="userBlocking" --testNamePattern="should block user"
```

## Coverage Requirements

### Minimum Coverage Targets
- **Service Layer**: 95% line coverage
- **API Endpoints**: 100% endpoint coverage
- **Error Scenarios**: All error paths tested
- **RBAC**: All role combinations tested
- **Integration**: End-to-end workflows covered

### Key Areas to Cover
1. **Happy Paths**: Normal blocking/unblocking workflows
2. **Error Handling**: Database failures, cache failures, invalid inputs
3. **Edge Cases**: Empty inputs, malformed data, concurrent operations
4. **Performance**: Bulk operations, cache efficiency
5. **Security**: RBAC enforcement, project isolation

This testing plan follows the exact patterns observed in the existing codebase and ensures comprehensive coverage of the user blocking feature.