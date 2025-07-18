# Dataset Run Ingestion Architecture: Problem Analysis & Solutions

## Problem Statement

We need to design a robust system for dataset run item ingestion that handles:

1. **Backwards Compatibility**: Current API implicitly creates dataset runs within dataset run item creation
2. **Concurrency Safety**: Multiple simultaneous requests creating the same dataset run
3. **ClickHouse Ingestion**: Write-only operations without reading from ClickHouse or PostgreSQL
4. **API Design Flexibility**: Support for various ingestion patterns (full metadata vs. ID references)
5. **Legacy Support**: Maintain existing behavior while enabling new patterns
6. **Future API Routes**: Plan for explicit dataset run creation APIs
7. **UI Experiments**: Handle trace creation, error handling, and batch writes
8. **Immutability**: Cannot update dataset run items after creation

## Current State Analysis

### Current API Flow

```
POST /api/public/dataset-run-items
├── Extract datasetId, runName from body
├── Implicitly create/fetch dataset run (not concurrency safe, currently causing problems)
├── Create dataset run item in postgres
```

### Current Problems

- **Race Conditions**: Multiple requests can try to create the same dataset run simultaneously
- **Tight Coupling**: Dataset run creation tightly coupled with item creation
- **Limited Flexibility**: Only supports implicit run creation

### What we need now

- We need to support dual writes into clickhouse and postgres.
- The clickhouse schema has data from the dataset run and dataset item denormalized and saved on the dataset run item table.
- Dataset runs and dataset items remain in postgres.
- We need to support both our experiment service (we create dataset run, trace, and dataset run items) and the public api (we create dataset runs and dataset run items).
- We need to future proof the ingestion schema. Users should ideally insert batches of dataset run items. We should use our ingestion pipeline to handle this. It already supports events and is very stable.
- What would likely be the best for people to batch insert for experiments IN THE FUTURE (we need to stay backwards compatible)

Ideal ingestion type: (projectid is inferred from the auth token, no need to consider this)

{
id,
traceId,
observationId, // optional
input,
output, // TODO: output would be EPIC, let's see if we can make this work, for now we can consider it optional
expectedOutput,
error,
createdAt, // maybe optional?
runId, (would be much easier than dataset run name)
}

where in our experiment this would be:

{
id: uuid,
createdAt: new Date(),
runId: datasetRun.id,
traceId: traceId,
observationId: null,
error: null,
input: datasetItem.input,
output: trace.output,
expectedOutput: datasetItem.expectedOutput,
error: error.message, // generated if trace creation fails or some experiment part fails  
}

Please also note that we have a uniqunes constriant on dataset runs, [datasetId, projectId, name]. This is currently sometimes throwing a prisma error.

Please come up with a solution that:

- is backwards compatible for current post endpoint (uses ingestion pipeline)
- is backwards compatible for experiment service (uses ingestion pipeline)
- is future proof for new ingestion patterns eg allow users to create dataset run prior to creating items (using ingestion pipeline)

## Proposed Solution: Unified Ingestion Pipeline Approach

### Core Strategy

Use the existing ingestion pipeline to handle all dataset run item creation scenarios through a unified event-based system. This approach treats dataset run item creation as an ingestion event, enabling batch processing, proper error handling, and backwards compatibility.

### Solution Architecture

#### 1. Simplified Ingestion Event Schema

```typescript
interface DatasetRunItemIngestionEvent {
  // Core identifiers
  id: string; // Dataset run item ID
  traceId: string;
  observationId?: string; // Optional
  error?: string; // Error message if creation failed

  // Data payload
  input: JsonValue;
  expectedOutput?: JsonValue;

  // Metadata
  createdAt: Date;

  // Dataset identification
  datasetId: string;

  // Run identification (simple - run must exist)
  runId: string; // Required: Dataset run ID (always explicit)

  // Dataset item reference
  datasetItemId: string; // Required: Dataset item ID
}
```

#### 2. Optimized Ingestion Pipeline Flow (No PostgreSQL Reads)

**Solution A: Include Dataset Run Data in Ingestion Event**

```typescript
interface DatasetRunItemIngestionEvent {
  // Core identifiers
  id: string;
  traceId: string;
  observationId?: string;

  // Data payload
  input: JsonValue;
  output?: JsonValue;
  expectedOutput?: JsonValue;
  error?: string;
  createdAt: Date;

  // Run identification + denormalized data
  runId: string;
  datasetItemId: string;

  // Denormalized dataset run data (for ClickHouse)
  datasetRunData: {
    name: string;
    description: string | null;
    metadata: JsonValue;
    createdAt: Date;
    datasetId: string;
    projectId: string;
  };
}

// Ingestion processor (no PostgreSQL reads!)
const processDatasetRunItemIngestion = async (
  event: DatasetRunItemIngestionEvent,
) => {
  // Step 1: Create enriched dataset run item for ClickHouse
  const enrichedItem = {
    ...event,
    // Denormalized dataset run fields
    dataset_run_name: event.datasetRunData.name,
    dataset_run_description: event.datasetRunData.description,
    dataset_run_metadata: event.datasetRunData.metadata,
    dataset_run_created_at: event.datasetRunData.createdAt,
    dataset_id: event.datasetRunData.datasetId,
    project_id: event.datasetRunData.projectId,
  };

  // Step 2: Dual write (PostgreSQL + ClickHouse)
  await Promise.all([
    writeToPostgreSQL(enrichedItem),
    writeToClickHouse(enrichedItem),
  ]);
};
```

**Solution B: Redis Cache for Dataset Run Data**

```typescript
// Alternative: Use Redis cache to avoid PostgreSQL reads
const processDatasetRunItemIngestion = async (
  event: DatasetRunItemIngestionEvent,
) => {
  // Step 1: Get dataset run data from cache
  const datasetRunData = await getDatasetRunFromCache(event.runId);

  // Step 2: Create enriched dataset run item
  const enrichedItem = {
    ...event,
    // Denormalized dataset run fields
    dataset_run_name: datasetRunData.name,
    dataset_run_description: datasetRunData.description,
    dataset_run_metadata: datasetRunData.metadata,
    dataset_run_created_at: datasetRunData.createdAt,
    dataset_id: datasetRunData.datasetId,
    project_id: datasetRunData.projectId,
  };

  // Step 3: Dual write
  await Promise.all([
    writeToPostgreSQL(enrichedItem),
    writeToClickHouse(enrichedItem),
  ]);
};

const getDatasetRunFromCache = async (runId: string) => {
  const cacheKey = `dataset-run:${runId}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss - fetch from PostgreSQL and cache
  const datasetRun = await prisma.datasetRuns.findUniqueOrThrow({
    where: { id: runId },
  });

  await redis.setex(cacheKey, 3600, JSON.stringify(datasetRun)); // 1 hour cache
  return datasetRun;
};
```

**Solution C: Batch Cache Pre-warming**

```typescript
// For batch operations, pre-warm cache
const addBatchToIngestionQueue = async (
  events: DatasetRunItemIngestionEvent[],
) => {
  // Step 1: Pre-warm cache for unique run IDs
  const uniqueRunIds = [...new Set(events.map((e) => e.runId))];
  await preWarmDatasetRunCache(uniqueRunIds);

  // Step 2: Send to ingestion queue
  await ingestionQueue.addBatch(events);
};

const preWarmDatasetRunCache = async (runIds: string[]) => {
  const uncachedRunIds = [];

  // Check which runs are not cached
  for (const runId of runIds) {
    const cached = await redis.get(`dataset-run:${runId}`);
    if (!cached) {
      uncachedRunIds.push(runId);
    }
  }

  if (uncachedRunIds.length > 0) {
    // Batch fetch uncached runs
    const datasetRuns = await prisma.datasetRuns.findMany({
      where: { id: { in: uncachedRunIds } },
    });

    // Cache them all
    await Promise.all(
      datasetRuns.map((run) =>
        redis.setex(`dataset-run:${run.id}`, 3600, JSON.stringify(run)),
      ),
    );
  }
};
```

#### 3. Concurrency-Safe Dataset Run Creation (Pre-Ingestion)

```typescript
// This happens BEFORE sending to ingestion pipeline
const createOrGetDatasetRun = async (params: {
  datasetId: string;
  name: string;
  description?: string;
  metadata?: JsonValue;
  projectId: string;
}) => {
  // Simple pseudocode for concurrency-safe creation
  // (implementation depends on available locking mechanism)

  try {
    // Attempt optimistic creation
    const datasetRun = await prisma.datasetRuns.create({
      data: {
        id: generateId(),
        datasetId: params.datasetId,
        projectId: params.projectId,
        name: params.name,
        description: params.description || null,
        metadata: params.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return datasetRun;
  } catch (uniqueConstraintError) {
    // If run already exists, fetch it
    return await prisma.datasetRuns.findUniqueOrThrow({
      where: {
        datasetId_projectId_name: {
          datasetId: params.datasetId,
          projectId: params.projectId,
          name: params.name,
        },
      },
    });
  }
};
```

### Implementation for Each Use Case

#### A. Current Public API (Backwards Compatible)

```typescript
// POST /api/public/dataset-run-items
export const createDatasetRunItem = async (body: CurrentAPIBody) => {
  // Step 1: Ensure dataset run exists (concurrency-safe)
  const datasetRun = await createOrGetDatasetRun({
    datasetId: body.datasetId,
    name: body.runName,
    description: body.runDescription,
    metadata: body.runMetadata,
    projectId: body.projectId,
  });

  // Step 2: Create ingestion event with denormalized dataset run data
  const ingestionEvent: DatasetRunItemIngestionEvent = {
    id: generateId(),
    traceId: body.traceId,
    observationId: body.observationId,
    input: body.input || (await fetchDatasetItemInput(body.datasetItemId)),
    expectedOutput:
      body.expectedOutput ||
      (await fetchDatasetItemExpectedOutput(body.datasetItemId)),
    createdAt: new Date(),
    runId: datasetRun.id,
    datasetItemId: body.datasetItemId,

    // Include dataset run data to avoid PostgreSQL reads during ingestion
    datasetRunData: {
      name: datasetRun.name,
      description: datasetRun.description,
      metadata: datasetRun.metadata,
      createdAt: datasetRun.createdAt,
      datasetId: datasetRun.datasetId,
      projectId: datasetRun.projectId,
    },
  };

  // Step 3: Send to ingestion pipeline (no PostgreSQL reads needed!)
  await addToIngestionQueue(ingestionEvent);

  return { success: true, id: ingestionEvent.id };
};
```

#### B. Experiment Service (UI Experiments)

```typescript
// Experiment service batch processing
export const runExperiment = async (
  datasetRun: DatasetRun, // Already exists
  datasetItems: DatasetItem[],
) => {
  const ingestionEvents: DatasetRunItemIngestionEvent[] = [];

  // Process items with error handling
  const results = await Promise.allSettled(
    datasetItems.map(async (item) => {
      try {
        // Create trace
        const trace = await createTrace(item);

        return {
          id: generateId(),
          traceId: trace.id,
          observationId: trace.rootObservationId,
          input: item.input,
          output: trace.output,
          expectedOutput: item.expectedOutput,
          error: null,
          createdAt: new Date(),
          runId: datasetRun.id, // Already explicit run ID
          datasetItemId: item.id,
        };
      } catch (error) {
        return {
          id: generateId(),
          traceId: generateId(), // Still need a trace ID for schema
          observationId: null,
          input: item.input,
          output: null,
          expectedOutput: item.expectedOutput,
          error: error.message,
          createdAt: new Date(),
          runId: datasetRun.id,
          datasetItemId: item.id,
        };
      }
    }),
  );

  // Convert all results to ingestion events
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      ingestionEvents.push(result.value);
    }
  });

  // Batch send to ingestion pipeline
  await addBatchToIngestionQueue(ingestionEvents);

  return {
    total: datasetItems.length,
    successful: results.filter(
      (r) => r.status === "fulfilled" && !r.value.error,
    ).length,
    failed: results.filter((r) => r.status === "rejected" || r.value?.error)
      .length,
  };
};
```

#### C. Future Batch API (Future-Proof)

```typescript
// POST /api/public/dataset-run-items/batch
export const createDatasetRunItemsBatch = async (body: {
  runId: string;
  items: BatchDatasetRunItem[];
}) => {
  const ingestionEvents: DatasetRunItemIngestionEvent[] = body.items.map(
    (item) => ({
      id: item.id || generateId(),
      traceId: item.traceId,
      observationId: item.observationId,
      input: item.input,
      output: item.output,
      expectedOutput: item.expectedOutput,
      error: item.error,
      createdAt: item.createdAt || new Date(),
      runId: body.runId, // Explicit run ID
    }),
  );

  // Send to ingestion pipeline
  await addBatchToIngestionQueue(ingestionEvents);

  return { success: true, count: ingestionEvents.length };
};
```

### Key Benefits

#### ✅ **Backwards Compatibility**

- Current API continues to work unchanged
- Experiment service maintains existing behavior
- No breaking changes required

#### ✅ **Concurrency Safety**

- Uses existing ingestion pipeline's Redis locking
- Upsert operations with proper conflict handling
- Caching layer reduces database load

#### ✅ **Dual Write Support**

- Single ingestion event writes to both PostgreSQL and ClickHouse
- Denormalized data automatically included in ClickHouse
- Consistent data across both systems

#### ✅ **Future-Proof Design**

- Support for explicit run IDs (preferred pattern)
- Batch processing capabilities
- Extensible event schema

#### ✅ **Error Handling**

- Proper error recording in dataset run items
- Failed trace creation doesn't break entire experiment
- Retry capabilities through ingestion pipeline

### Tradeoffs Analysis

#### **Pros:**

1. **Unified Architecture**: Single ingestion pipeline handles all scenarios
2. **Proven Reliability**: Leverages existing, stable ingestion infrastructure
3. **Scalability**: Built-in batching and queue management
4. **Flexibility**: Supports both implicit and explicit run creation
5. **Error Resilience**: Graceful handling of failures with proper error recording
6. **Performance**: Caching and batch processing reduce database load

#### **Cons:**

1. **Asynchronous Processing**: Some operations become eventually consistent
2. **Complexity**: Requires understanding of ingestion pipeline internals
3. **Migration Effort**: Need to adapt existing code to use ingestion events
4. **Monitoring**: Requires additional monitoring for queue health
5. **Debugging**: Async nature makes debugging more complex

### Migration Strategy

#### **Phase 1: Foundation (Week 1-2)**

- Implement ingestion event schema
- Add dataset run upsert logic with Redis locking
- Create ingestion processor for dataset run items

#### **Phase 2: Integration (Week 3-4)**

- Migrate current API to use ingestion pipeline
- Update experiment service to use batch ingestion
- Add monitoring and error handling

#### **Phase 3: Optimization (Week 5-6)**

- Add caching layer for dataset run lookups
- Implement batch API endpoints
- Performance tuning and optimization

### Implementation Priority

1. **Critical**: Concurrency-safe dataset run creation
2. **High**: Ingestion pipeline integration
3. **High**: Experiment service batch processing
4. **Medium**: Future batch API endpoints
5. **Low**: Advanced caching and optimization

This solution provides a robust, scalable approach that solves all the current problems while maintaining backwards compatibility and enabling future enhancements. The use of the existing ingestion pipeline ensures reliability and reduces the risk of introducing new bugs.

Would you like me to proceed with implementing specific parts of this solution?
