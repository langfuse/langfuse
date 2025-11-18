# MCP Feature Improvements - Implementation Plan

**Created:** 2025-11-18
**Branch:** michael/lf-1924
**Status:** In Progress

## Overview

Implementing code review findings for the MCP feature. Changes are made incrementally with testing breaks between steps.

---

## Step 1: Create PLAN.md Tracker ✅

**Status:** COMPLETED
**Files:** `PLAN.md`

Created this tracking document.

---

## Step 2: Align Pagination with Langfuse Standards ✅

**Status:** COMPLETED
**Priority:** HIGH
**Time Taken:** 1 hour

### Goal
Replace custom pagination with standard Langfuse pagination pattern used across all public APIs.

### Current State (Custom Implementation)
- Uses offset-based pagination (limit/offset)
- Custom parsing with hardcoded defaults
- No pagination metadata in response
- Defaults: limit=100, offset=0

### Target State (Standard Langfuse Pattern)
- Uses page-based pagination (page/limit)
- Import `publicApiPaginationZod` from `@langfuse/shared`
- Returns `{ data: [], meta: { page, limit, totalItems, totalPages } }`
- Defaults: page=1, limit=50, max=100

### Files to Change

#### 2.1 Update `listPromptsResource`
**File:** `web/src/features/mcp/server/resources/prompts.ts`

**Changes:**
- [ ] Import `publicApiPaginationZod` from `@langfuse/shared/src/utils/zod`
- [ ] Replace custom limit/offset parsing with schema-based parsing
- [ ] Change URI parameters from `?limit=X&offset=Y` to `?page=X&limit=Y`
- [ ] Add `totalItems` count query (parallel with findMany)
- [ ] Calculate `totalPages = Math.ceil(totalItems / limit)`
- [ ] Return `{ data: prompts, meta: { page, limit, totalItems, totalPages } }`
- [ ] Update JSDoc comments

#### 2.2 Update `listPrompts` tool
**File:** `web/src/features/mcp/server/tools/listPrompts.ts`

**Changes:**
- [ ] Update input schema to use page/limit instead of limit/offset
- [ ] Update tool description to reflect page-based pagination
- [ ] Parse response with new pagination metadata
- [ ] Update return type to include pagination info

#### 2.3 Update validation schemas
**File:** `web/src/features/mcp/internal/validation.ts`

**Changes:**
- [ ] Remove `ParamLimit` schema (line 75-77)
- [ ] Remove `ParamOffset` schema (line 79-85)
- [ ] Add comment pointing to `publicApiPaginationZod` in shared package

#### 2.4 Update tests
**File:** `web/src/__tests__/async/mcp-tools-read.servertest.ts`

**Changes:**
- [ ] Update test cases to use `page` instead of `offset`
- [ ] Add assertions for `meta` object
- [ ] Add test: pagination metadata structure
- [ ] Add test: page boundaries (first page, middle page, last page)
- [ ] Add test: empty results (page beyond available)
- [ ] Add test: limit validation (exceeds 100)
- [ ] Add test: page validation (page < 1)

### Testing Checklist
- [x] `pnpm --filter=web run test -- --testPathPattern="mcp-tools-read"` - **22/22 tests passed**
- [ ] Manual test: List prompts with page=1, limit=10
- [ ] Manual test: List prompts with page=2, limit=10
- [ ] Manual test: Verify totalItems count is correct
- [ ] Manual test: Verify totalPages calculation

### Changes Completed
1. ✅ Updated `listPromptsResource` to use `publicApiPaginationZod` from shared package
2. ✅ Changed from offset-based (limit/offset) to page-based (page/limit) pagination
3. ✅ Added parallel query pattern for prompts + count (performance optimization)
4. ✅ Return standard format: `{ data: [], meta: { page, limit, totalItems, totalPages } }`
5. ✅ Updated resource description in `mcpServer.ts`
6. ✅ Tests already use page-based pagination - all 22 tests passing

**STOP HERE FOR TESTING**

---

## Step 3: Add OpenTelemetry to Tool Handlers

**Status:** PENDING
**Priority:** HIGH
**Estimated Time:** 1.5 hours

### Goal
Add distributed tracing to all MCP tool handlers for observability.

### Pattern to Apply
```typescript
import { instrumentAsync } from "@langfuse/shared/src/server";

handler: async (input, context) => {
  return await instrumentAsync(
    { name: "mcp.toolName" },
    async (span) => {
      span.setAttributes({
        "mcp.tool": "toolName",
        "project.id": context.projectId,
        "org.id": context.orgId,
        // Tool-specific attributes
      });

      // Existing logic here

      return result;
    }
  );
}
```

### Files to Change

#### 3.1 Instrument `getPrompt`
**File:** `web/src/features/mcp/server/tools/getPrompt.ts`

**Changes:**
- [ ] Import `instrumentAsync` from `@langfuse/shared/src/server`
- [ ] Wrap handler logic with `instrumentAsync({ name: "mcp.getPrompt" })`
- [ ] Add span attributes: tool, projectId, orgId, prompt.name, prompt.label, prompt.version

#### 3.2 Instrument `listPrompts`
**File:** `web/src/features/mcp/server/tools/listPrompts.ts`

**Changes:**
- [ ] Import `instrumentAsync`
- [ ] Wrap handler with `instrumentAsync({ name: "mcp.listPrompts" })`
- [ ] Add span attributes: tool, projectId, orgId, filter.name, filter.label, filter.tag, pagination.page, pagination.limit

#### 3.3 Instrument `createTextPrompt`
**File:** `web/src/features/mcp/server/tools/createTextPrompt.ts`

**Changes:**
- [ ] Import `instrumentAsync`
- [ ] Wrap handler with `instrumentAsync({ name: "mcp.createTextPrompt" })`
- [ ] Add span attributes: tool, projectId, orgId, prompt.name, prompt.labels

#### 3.4 Instrument `createChatPrompt`
**File:** `web/src/features/mcp/server/tools/createChatPrompt.ts`

**Changes:**
- [ ] Import `instrumentAsync`
- [ ] Wrap handler with `instrumentAsync({ name: "mcp.createChatPrompt" })`
- [ ] Add span attributes: tool, projectId, orgId, prompt.name, prompt.labels

#### 3.5 Instrument `updatePromptLabels`
**File:** `web/src/features/mcp/server/tools/updatePromptLabels.ts`

**Changes:**
- [ ] Import `instrumentAsync`
- [ ] Wrap handler with `instrumentAsync({ name: "mcp.updatePromptLabels" })`
- [ ] Add span attributes: tool, projectId, orgId, prompt.name, labels.added, labels.removed

### Testing Checklist
- [ ] `pnpm --filter=web run test -- --testPathPattern="mcp-tools"`
- [ ] Check DataDog/OpenTelemetry for traces with name `mcp.*`
- [ ] Verify span attributes are present
- [ ] Manual test: Each tool creates proper traces

**STOP HERE FOR TESTING**

---

## Step 4: Add OpenTelemetry to Resource Handlers

**Status:** PENDING
**Priority:** HIGH
**Estimated Time:** 30 minutes

### Goal
Add distributed tracing to MCP resource handlers.

### Files to Change

#### 4.1 Instrument `listPromptsResource`
**File:** `web/src/features/mcp/server/resources/prompts.ts`

**Changes:**
- [ ] Import `instrumentAsync` (if not already imported)
- [ ] Wrap function body with `instrumentAsync({ name: "mcp.resource.listPrompts" })`
- [ ] Add span attributes: resource, projectId, orgId, filters, pagination

#### 4.2 Instrument `getPromptResource`
**File:** `web/src/features/mcp/server/resources/prompts.ts`

**Changes:**
- [ ] Wrap function body with `instrumentAsync({ name: "mcp.resource.getPrompt" })`
- [ ] Add span attributes: resource, projectId, orgId, prompt.name, prompt.label, prompt.version

### Testing Checklist
- [ ] Check DataDog/OpenTelemetry for traces with name `mcp.resource.*`
- [ ] Verify resource operations create spans
- [ ] Manual test: Access resources via MCP client

**STOP HERE FOR TESTING**

---

## Step 5: Add Consistent Logging

**Status:** PENDING
**Priority:** MEDIUM
**Estimated Time:** 1 hour

### Goal
Add structured logging to all MCP operations for debugging and audit trail.

### Pattern to Apply
```typescript
import { logger } from "@langfuse/shared/src/server";

// At start of operation
logger.info("MCP tool invoked", {
  tool: "toolName",
  projectId: context.projectId,
  orgId: context.orgId,
  // Sanitized input
});

// After operation
logger.info("MCP tool completed", {
  tool: "toolName",
  projectId: context.projectId,
  success: true,
});
```

### Files to Change

#### 5.1 Add logging to all tools
**Files:** All 5 tool files

**Changes:**
- [ ] `getPrompt.ts`: Log invocation + completion
- [ ] `listPrompts.ts`: Log invocation + completion with result count
- [ ] `createTextPrompt.ts`: Log invocation + completion with prompt ID
- [ ] `createChatPrompt.ts`: Log invocation + completion with prompt ID
- [ ] `updatePromptLabels.ts`: Log invocation + completion

#### 5.2 Verify resource logging
**File:** `web/src/features/mcp/server/resources/prompts.ts`

**Status:** Already has logging (line 70, 137)
- [x] `listPromptsResource` has logging
- [x] `getPromptResource` has logging

### Testing Checklist
- [ ] Check logs for "MCP tool invoked" messages
- [ ] Check logs for "MCP tool completed" messages
- [ ] Verify no PII in logs
- [ ] Manual test: Trigger each tool and verify logs

**STOP HERE FOR TESTING**

---

## Step 6: Add URI Validation

**Status:** PENDING
**Priority:** MEDIUM
**Estimated Time:** 15 minutes

### Goal
Validate decoded URI parameters against schema constraints.

### Files to Change

#### 6.1 Add validation in `mcpServer.ts`
**File:** `web/src/features/mcp/server/mcpServer.ts`

**Changes:**
- [ ] Import `ParamPromptName` from validation.ts
- [ ] After decoding prompt name (line 111), validate: `const validatedName = ParamPromptName.parse(promptName.trim())`
- [ ] Use `validatedName` in subsequent calls
- [ ] Add try/catch for validation errors

### Testing Checklist
- [ ] Test: Valid prompt name passes
- [ ] Test: Prompt name > 255 chars throws UserInputError
- [ ] Test: Empty prompt name throws UserInputError
- [ ] Manual test: Access resource with long name

**STOP HERE FOR TESTING**

---

## Step 7: Add Documentation

**Status:** PENDING
**Priority:** LOW
**Estimated Time:** 30 minutes

### Goal
Document architectural decisions and patterns.

### Files to Change

#### 7.1 Document error handling pattern
**File:** `web/src/features/mcp/server/resources/prompts.ts`

**Changes:**
- [ ] Add JSDoc comment at top explaining error handling differences
- [ ] Explain why resources manually catch/re-throw vs tools using wrapErrorHandling

#### 7.2 Document RBAC policy
**File:** `web/src/features/mcp/types.ts`

**Changes:**
- [ ] Add comment explaining API key implicit permissions
- [ ] Note future considerations if user-based auth is added

#### 7.3 Document rate limiting decision
**File:** `web/src/pages/api/public/mcp/index.ts`

**Changes:**
- [ ] Add comment explaining endpoint-level rate limiting
- [ ] Note future consideration for per-operation limits

### Testing Checklist
- [ ] Review documentation for clarity
- [ ] Ensure comments follow JSDoc standards
- [ ] No testing needed (documentation only)

**DONE - READY FOR MERGE**

---

## Progress Tracker

- [x] Step 1: Create PLAN.md tracker
- [x] Step 2: Align pagination with Langfuse standards
- [ ] Step 3: Add OpenTelemetry to tool handlers
- [ ] Step 4: Add OpenTelemetry to resource handlers
- [ ] Step 5: Add consistent logging
- [ ] Step 6: Add URI validation
- [ ] Step 7: Add documentation

**Current Step:** 3
**Completed:** 2/7 (29%)

---

## Notes

- Skipping TypeScript `any` fixes per user request (test compatibility)
- Rate limiting remains endpoint-level (documented decision)
- RBAC remains implicit via API key scope (documented policy)
- All changes maintain backward compatibility with existing MCP clients

---

## Testing Strategy

After each step:
1. Run unit tests: `pnpm --filter=web run test -- --testPathPattern="mcp"`
2. Manual testing via MCP client (Claude Code or Cursor)
3. Verify no regressions in existing functionality
4. Check logs/traces in DataDog (for observability steps)

---

## References

- Code Review: (link to review document)
- Pagination Research: `@langfuse/shared/src/utils/zod.ts` (publicApiPaginationZod)
- Backend Dev Guidelines: `.claude/skills/backend-dev-guidelines/`
- Existing API Examples: `web/src/pages/api/public/datasets.ts`
