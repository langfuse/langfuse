# User Blocking Enhancement Plan: Adding userId to All Event Types

## Problem Statement

**Critical Security Gap Discovered**: The current user blocking implementation only filters `TRACE_CREATE` events from blocked users, but allows all other event types (generations, spans, scores, dataset items, etc.) to pass through unfiltered.

**Current Vulnerable Logic** (`processEventBatch.ts:189-211`):
```typescript
// Only collects userIds from TRACE_CREATE events
const traces = batch.filter(event => event.type === eventTypes.TRACE_CREATE);
const userIds = [...new Set(traces.map(event => event.body.userId).filter(...))];

// Only filters TRACE_CREATE events - ALL OTHER EVENTS PASS THROUGH
const filteredBatch = batch.filter(event => {
  if (event.type === eventTypes.TRACE_CREATE && event.body.userId) {
    return !blocked.has(event.body.userId);
  }
  return true; // ❌ SECURITY GAP: Other events pass through
});
```

**Impact**: Blocked users can still send generations, spans, scores, dataset run items, and SDK logs.

## Solution: Option C - Client SDK Enhancement

**Approach**: Add optional `userId` fields to all event types and rely on client SDKs to automatically inherit and populate userId from trace context.

### Benefits
- ✅ **Simple** server-side logic (no complex trace lookups)
- ✅ **Performant** (single bulk user check, no database queries per event)
- ✅ **Backward Compatible** (all new fields optional)
- ✅ **Future-Proof** (handles all current and future event types)
- ✅ **Clear Responsibility** (client SDKs handle userId propagation)

## Complete Implementation Plan

### Phase 1: Schema Modifications

**Event Types Requiring userId Fields (19 total)**:

**✅ Already Has userId (1 type):**
- `TRACE_CREATE` → `TraceBody` ✅ (line 404: `userId: z.string().nullish()`)

**❌ Missing userId (18 types):**

**Observation Events (13 types - all use `OptionalObservationBody`):**
- `EVENT_CREATE`, `SPAN_CREATE`, `SPAN_UPDATE`
- `GENERATION_CREATE`, `GENERATION_UPDATE`
- `AGENT_CREATE`, `TOOL_CREATE`, `CHAIN_CREATE`
- `RETRIEVER_CREATE`, `EVALUATOR_CREATE`, `EMBEDDING_CREATE`, `GUARDRAIL_CREATE`
- `OBSERVATION_CREATE`, `OBSERVATION_UPDATE` (legacy)

**Other Events (5 types):**
- `SCORE_CREATE` → `BaseScoreBody`
- `DATASET_RUN_ITEM_CREATE` → `DatasetRunItemBody`
- `SDK_LOG` → `SdkLogEvent`

### Required Schema Changes

**1. OptionalObservationBody** (📍 **CRITICAL** - affects 13 event types):
```typescript
const OptionalObservationBody = z.object({
  traceId: idSchema.nullish(),
  userId: z.string().nullish(), // 🆕 ADD THIS
  environment: environmentSchema,
  name: z.string().nullish(),
  startTime: stringDateTime,
  metadata: jsonSchema.nullish(),
  input: z.any().nullish(),
  output: z.any().nullish(),
  level: ObservationLevel.nullish(),
  statusMessage: z.string().nullish(),
  parentObservationId: z.string().nullish(),
  version: z.string().nullish(),
});
```

**2. BaseScoreBody** (affects SCORE_CREATE):
```typescript
const BaseScoreBody = z.object({
  id: idSchema.nullish(),
  name: NonEmptyString,
  traceId: z.string().nullish(),
  sessionId: z.string().nullish(),
  userId: z.string().nullish(), // 🆕 ADD THIS
  datasetRunId: z.string().nullish(),
  environment: environmentSchema,
  observationId: z.string().nullish(),
  comment: z.string().nullish(),
  metadata: jsonSchema.nullish(),
  source: z.enum(["API", "EVAL", "ANNOTATION"]).default("API" as ScoreSourceType),
  executionTraceId: z.string().nullish(),
  queueId: z.string().nullish(),
});
```

**3. DatasetRunItemBody** (affects DATASET_RUN_ITEM_CREATE):
```typescript
const DatasetRunItemBody = z.object({
  id: idSchema.nullish(),
  traceId: z.string(),
  observationId: z.string().nullish(),
  userId: z.string().nullish(), // 🆕 ADD THIS
  error: z.string().nullish(),
  createdAt: stringDateTime.nullish(),
  datasetId: z.string(),
  runId: z.string(),
  datasetItemId: z.string(),
});
```

**4. SdkLogEvent** (affects SDK_LOG):
```typescript
export const SdkLogEvent = z.object({
  log: jsonSchema,
  id: z.string().nullish(),
  userId: z.string().nullish(), // 🆕 ADD THIS
});
```

**5. LegacyObservationBody** (affects legacy OBSERVATION_CREATE/UPDATE):
```typescript
export const LegacyObservationBody = z.object({
  id: idSchema.nullish(),
  traceId: idSchema.nullish(),
  userId: z.string().nullish(), // 🆕 ADD THIS
  type: z.enum(["GENERATION", "SPAN", "EVENT"]),
  name: z.string().nullish(),
  startTime: stringDateTime,
  endTime: stringDateTime,
  completionStartTime: stringDateTime,
  model: z.string().nullish(),
  // ... rest unchanged
});
```

### Phase 2: Enhanced User Blocking Logic

**File**: `packages/shared/src/server/ingestion/processEventBatch.ts`

**Replace Current Logic** (lines 189-211):
```typescript
// 🆕 NEW: Collect userIds from ALL event types (not just traces)
const userIds = [
  ...new Set(
    batch
      .map(event => event.body.userId)
      .filter((userId): userId is string => Boolean(userId?.trim()))
  )
];

let blocked = new Set<string>();
if (userIds.length > 0) {
  blocked = await getBlockedUserIds({
    projectId: authCheck.scope.projectId!,
    userIds,
  });
}

// 🆕 NEW: Filter ALL event types based on userId
const filteredBatch = batch.filter(event => {
  // If event has userId, check if user is blocked
  if (event.body.userId) {
    return !blocked.has(event.body.userId);
  }
  // Events without userId pass through (client responsibility)
  return true;
});
```

### Phase 3: Database Schema Updates

**ClickHouse Tables** (Add `user_id Nullable(String)` columns):
- `observations` table
- `scores` table
- `dataset_run_items_rmt` table
- `events` table (for SDK logs)

**PostgreSQL/Prisma Models** (Add `userId String?` fields):
- `LegacyPrismaObservation`
- `LegacyPrismaScore`
- `DatasetRunItems`

### Phase 4: Client SDK Enhancement Requirements

**Core Requirement**: SDKs automatically inherit `userId` from trace context and include it in ALL event payloads.

#### SDK Context Management

**1. Trace Context Enhancement**:
```typescript
// When creating a trace, store userId in context
const trace = langfuse.trace({
  name: "user-session",
  userId: "user-123", // ✅ Already supported
});
// Context stores: { traceId, userId, sessionId, ... }
```

**2. Automatic userId Inheritance**:
```typescript
// Child events auto-inherit userId from trace context
const generation = trace.generation({
  name: "llm-call",
  // userId: "user-123" // 🆕 SDK auto-adds from trace context
});

const span = trace.span({
  name: "database-query",
  // userId: "user-123" // 🆕 SDK auto-adds from trace context
});

const score = trace.score({
  name: "quality",
  value: 0.8,
  // userId: "user-123" // 🆕 SDK auto-adds from trace context
});
```

#### Implementation Per SDK

**Python SDK**:
```python
# Context manager approach
with langfuse.trace(user_id="user-123") as trace:
    # All events auto-inherit user_id from trace context
    generation = trace.generation(name="llm-call")  # gets user_id="user-123"
    span = trace.span(name="process")               # gets user_id="user-123"
    trace.score(name="quality", value=0.8)         # gets user_id="user-123"
```

**JavaScript/TypeScript SDK**:
```typescript
// Context propagation approach
const trace = langfuse.trace({ name: "session", userId: "user-123" });

// All child events automatically get userId from trace context
const generation = trace.generation({ name: "llm-call" }); // inherits userId
const span = trace.span({ name: "process" }); // inherits userId
trace.score({ name: "quality", value: 0.8 }); // inherits userId
```

#### Edge Cases to Handle

**1. Explicit Override**:
```typescript
// Allow explicit userId override for multi-user traces
trace.generation({
  name: "admin-action",
  userId: "admin-456" // Explicit override wins over inherited "user-123"
});
```

**2. Missing Trace Context**:
```typescript
// Standalone events without trace context
langfuse.generation({
  name: "standalone-llm",
  userId: "user-789" // Must be explicit
});
```

**3. Cross-User Traces**:
```typescript
// Support traces that span multiple users
const trace = langfuse.trace({ name: "admin-impersonation", userId: "admin-123" });
trace.generation({ name: "user-action", userId: "user-456" }); // Different user
```

## Implementation Timeline

### Phase 1: Schema Changes (Week 1)
- [ ] Update all 5 base schemas to include optional `userId` fields
- [ ] Test schema validation with existing payloads (backward compatibility)
- [ ] Deploy schema changes to staging

### Phase 2: Server Logic (Week 1)
- [ ] Update `processEventBatch` user blocking logic
- [ ] Update tests to cover all event types
- [ ] Verify performance with bulk user checking

### Phase 3: Database Migrations (Week 2)
- [ ] Create ClickHouse migration scripts
- [ ] Create Prisma migration files
- [ ] Deploy database changes

### Phase 4: SDK Updates (Week 3-4)
- [ ] Python SDK: Implement context inheritance
- [ ] JavaScript SDK: Implement context inheritance
- [ ] Test edge cases (override, missing context, cross-user)

### Phase 5: Testing & Rollout (Week 4)
- [ ] End-to-end testing with updated SDKs
- [ ] Performance testing with userId fields
- [ ] Gradual rollout with monitoring

## Success Metrics

- **Security**: All event types from blocked users are properly filtered
- **Performance**: No degradation in ingestion pipeline performance
- **Compatibility**: Existing integrations continue working without modification
- **Coverage**: All 19 event types include userId when using updated SDKs

## Risk Mitigation

1. **Backward Compatibility**: All userId fields are optional (`.nullish()`)
2. **Performance**: Single bulk user check scales O(unique users), not O(events)
3. **Fail-Safe**: Events without userId pass through (gradual migration)
4. **Monitoring**: Track userId coverage metrics post-deployment

---

**Files Modified**:
- `packages/shared/src/server/ingestion/types.ts` (schema changes)
- `packages/shared/src/server/ingestion/processEventBatch.ts` (blocking logic)
- Database migration files (ClickHouse + Prisma)
- Python SDK (context inheritance)
- JavaScript SDK (context inheritance)