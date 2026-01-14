# Implementation Plan: Single-Observation Evals

## Overview

Add support for LLM-as-a-judge evaluations that target individual observations coming through the OTEL pipeline. The evaluation decision is made during ingestion, and the observation data is uploaded to S3 for later execution.

## Key Design Decisions

| Aspect | Decision |
|--------|----------|
| Target | OTEL observations only (explicitly reject non-OTEL) |
| Filter evaluation | In-memory during ingestion, no database lookup |
| Queue | New `LLM-as-a-Judge-Execution` queue |
| Exactly-once | Use existing `JobExecution` table |
| S3 storage | Path: `prefixes/observations/${projectId}/observation/${observationId}.json` |
| Variable source | Fetch from S3 during execution |
| Score attachment | Both `traceId` and `observationId` |
| Deduplication | `(configId, observationId)` - ignore race conditions for now |
| Sampling | Per observation |
| Time scope | NEW only |
| Delay | None (hidden in UI) |
| `target_object` | `"observation"` for observation-based evals |
| `filter_target` | `"observation"` (new column) |

## Code Style Guidelines

1. **Config objects**: All functions use a single config object as the first parameter
2. **Prisma**: Use Prisma for all database operations (not Kysely)
3. **Testability**: Pure functions for business logic, dependency injection for infrastructure
4. **Reuse**: Explicitly reuse existing implementations (no duplication)

---

## Phase 1: Database Schema Changes

### 1.1 Add `filter_target` Column

**File**: `packages/shared/prisma/schema.prisma`

```prisma
model JobConfiguration {
  // ... existing fields ...
  filterTarget    String         @map("filter_target")  // 'trace', 'dataset', 'observation'
  // ... rest of fields ...
}
```

### 1.2 Create Migration

**File**: `packages/shared/prisma/migrations/YYYYMMDDHHMMSS_add_filter_target_to_job_configurations/migration.sql`

```sql
-- Add filter_target column
ALTER TABLE job_configurations ADD COLUMN filter_target TEXT;

-- Migrate existing records: dataset configs get 'dataset', all others get 'trace'
UPDATE job_configurations
SET filter_target = CASE
  WHEN target_object = 'dataset' THEN 'dataset'
  ELSE 'trace'
END;

-- Make column non-nullable after migration
ALTER TABLE job_configurations ALTER COLUMN filter_target SET NOT NULL;

-- Add index for efficient filtering
CREATE INDEX idx_job_configurations_filter_target
ON job_configurations(project_id, filter_target, status);
```

### 1.3 Update Types

**File**: `packages/shared/src/features/evals/types.ts`

```typescript
export const FilterTargetZod = z.enum(["trace", "dataset", "observation"]);
export type FilterTarget = z.infer<typeof FilterTargetZod>;
```

---

## Phase 2: OTEL Pipeline Changes

### 2.1 Extract User ID / Session ID in OtelIngestionProcessor

**File**: `packages/shared/src/server/otel/OtelIngestionProcessor.ts`

The `extractUserId()` and `extractSessionId()` functions already exist (lines 1641-1680). Need to ensure these are:
1. Called during observation processing
2. Included in the observation record passed to IngestionService

**Changes needed**:
- Verify `user_id` and `session_id` are extracted from span attributes
- Ensure they're included in the `IngestionEventType` for observations
- Pass them through to the final observation record

### 2.2 Add `isOtel` Flag to Observation Processing

**Approach**: Events coming from `OtelIngestionQueue` should be marked as OTEL.

**File**: `worker/src/queues/otelIngestionQueue.ts`

When calling `ingestionService.mergeAndWrite()` for observations, pass an `isOtel: true` flag.

**File**: `worker/src/services/IngestionService/index.ts`

Update `processObservationEventList()` signature to accept `isOtel` parameter:

```typescript
private async processObservationEventList(params: {
  projectId: string;
  entityId: string;
  observationEventList: ObservationEvent[];
  isOtel: boolean;  // NEW
}): Promise<void>
```

---

## Phase 3: Queue Infrastructure

### 3.1 Define New Queue Types

**File**: `packages/shared/src/server/queues.ts`

```typescript
// Add to QueueName enum
LLMAsJudgeExecution = "llm-as-judge-execution-queue",

// Add to QueueJobs enum
LLMAsJudgeExecutionJob = "llm-as-judge-execution-job",

// Define event schema
export const LLMAsJudgeExecutionEventSchema = z.object({
  projectId: z.string(),
  jobExecutionId: z.string(),
  observationS3Path: z.string(),
});

export type LLMAsJudgeExecutionEventType = z.infer<typeof LLMAsJudgeExecutionEventSchema>;

// Add to TQueueJobTypes
[QueueName.LLMAsJudgeExecution]: {
  timestamp: Date;
  id: string;
  payload: LLMAsJudgeExecutionEventType;
  name: QueueJobs.LLMAsJudgeExecutionJob;
  retryBaggage?: RetryBaggage;
};
```

### 3.2 Create Queue Class

**File**: `packages/shared/src/server/redis/llmAsJudgeExecutionQueue.ts`

Follow existing pattern from `evalExecutionQueue.ts`.

---

## Phase 4: Domain Types

### 4.1 Processed Observation Type

**File**: `packages/shared/src/features/evals/types.ts`

```typescript
export const ProcessedObservationSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  projectId: z.string(),
  type: z.string(),
  name: z.string().nullish(),
  environment: z.string().nullish(),
  model: z.string().nullish(),
  level: z.string().nullish(),
  version: z.string().nullish(),
  promptName: z.string().nullish(),
  metadata: z.record(z.unknown()).nullish(),
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  statusMessage: z.string().nullish(),
  usage: z.object({
    promptTokens: z.number().nullish(),
    completionTokens: z.number().nullish(),
    totalTokens: z.number().nullish(),
  }).nullish(),
  toolDefinitions: z.unknown().nullish(),
  toolCalls: z.unknown().nullish(),
  // Trace-level attributes from OTEL span attributes
  userId: z.string().nullish(),
  sessionId: z.string().nullish(),
});

export type ProcessedObservation = z.infer<typeof ProcessedObservationSchema>;
```

### 4.2 Simplified Observation Variable Mapping

**File**: `packages/shared/src/features/evals/types.ts`

```typescript
// Simplified variable mapping for observation-based evals
// No need for objectName since we always target the single observation
export const observationVariableMapping = z.object({
  templateVariable: z.string(),
  selectedColumnId: z.string(),
  jsonSelector: z.string().nullish(),
});

export const observationVariableMappingList = z.array(observationVariableMapping);

export type ObservationVariableMapping = z.infer<typeof observationVariableMapping>;
```

### 4.3 Available Observation Variables

**File**: `packages/shared/src/features/evals/types.ts`

```typescript
export const availableObservationEvalVariables = [
  {
    id: "observation",
    display: "Observation",
    availableColumns: [
      { name: "Input", id: "input" },
      { name: "Output", id: "output" },
      { name: "Metadata", id: "metadata" },
      { name: "Model", id: "model" },
      { name: "Level", id: "level" },
      { name: "Status Message", id: "statusMessage" },
      { name: "Prompt Tokens", id: "promptTokens" },
      { name: "Completion Tokens", id: "completionTokens" },
      { name: "Total Tokens", id: "totalTokens" },
      { name: "Tool Definitions", id: "toolDefinitions" },
      { name: "Tool Calls", id: "toolCalls" },
    ],
  },
];
```

### 4.4 Observation Filter Columns

**File**: `packages/shared/src/features/evals/observationEvalFilterCols.ts`

```typescript
import { type ColumnDefinition } from "../../tableDefinitions";

export const observationEvalFilterCols: ColumnDefinition[] = [
  { name: "Type", id: "type", type: "stringOptions", internal: "type" },
  { name: "Name", id: "name", type: "string", internal: "name", nullable: true },
  { name: "Environment", id: "environment", type: "stringOptions", internal: "environment", nullable: true },
  { name: "Model", id: "model", type: "stringOptions", internal: "model", nullable: true },
  { name: "Level", id: "level", type: "stringOptions", internal: "level" },
  { name: "Version", id: "version", type: "string", internal: "version", nullable: true },
  { name: "Prompt Name", id: "promptName", type: "stringOptions", internal: "promptName", nullable: true },
  { name: "Metadata", id: "metadata", type: "stringObject", internal: "metadata" },
  // Trace-level attributes from OTEL span attributes
  { name: "User ID", id: "userId", type: "string", internal: "userId", nullable: true },
  { name: "Session ID", id: "sessionId", type: "string", internal: "sessionId", nullable: true },
];
```

---

## Phase 5: Filter Evaluation (Extend Existing)

### 5.1 Add Observation Column Mapper

**File**: `worker/src/features/evaluation/observationFilterUtils.ts`

```typescript
import { type ProcessedObservation } from "@langfuse/shared";

interface MapObservationColumnParams {
  observation: ProcessedObservation;
  columnId: string;
}

/**
 * Maps filter column IDs to observation field values.
 * Used by InMemoryFilterService.evaluateFilter().
 */
export function mapObservationFilterColumn(params: MapObservationColumnParams): unknown {
  const { observation, columnId } = params;

  const mapping: Record<string, unknown> = {
    type: observation.type,
    name: observation.name,
    environment: observation.environment,
    model: observation.model,
    level: observation.level,
    version: observation.version,
    promptName: observation.promptName,
    metadata: observation.metadata,
    userId: observation.userId,
    sessionId: observation.sessionId,
  };

  return mapping[columnId];
}
```

### 5.2 Extend InMemoryFilterService

**File**: `worker/src/features/evaluation/inMemoryFilterService.ts`

Ensure the existing `evaluateFilter` function can work with a generic column mapper. The function signature should support:

```typescript
evaluateFilter<T>(params: {
  entity: T;
  filter: FilterCondition[];
  columnMapper: (params: { entity: T; columnId: string }) => unknown;
}): boolean
```

If not already generic, refactor to support both trace and observation column mappers.

---

## Phase 6: Variable Extraction (Reuse Existing Patterns)

### 6.1 Observation Variable Extractor

**File**: `worker/src/features/evaluation/observationEval/extractObservationVariables.ts`

```typescript
import { type ProcessedObservation, type ObservationVariableMapping } from "@langfuse/shared";
import { applyJsonSelector } from "../evalService"; // REUSE existing

interface ExtractVariablesParams {
  observation: ProcessedObservation;
  variableMapping: ObservationVariableMapping[];
}

export function extractObservationVariables(params: ExtractVariablesParams): Record<string, unknown> {
  const { observation, variableMapping } = params;
  const variables: Record<string, unknown> = {};

  for (const mapping of variableMapping) {
    const rawValue = getObservationVariableValue({
      observation,
      columnId: mapping.selectedColumnId,
    });

    variables[mapping.templateVariable] = mapping.jsonSelector
      ? applyJsonSelector({ value: rawValue, selector: mapping.jsonSelector }) // REUSE
      : rawValue;
  }

  return variables;
}

interface GetValueParams {
  observation: ProcessedObservation;
  columnId: string;
}

export function getObservationVariableValue(params: GetValueParams): unknown {
  const { observation, columnId } = params;

  const mapping: Record<string, unknown> = {
    input: observation.input,
    output: observation.output,
    metadata: observation.metadata,
    model: observation.model,
    level: observation.level,
    statusMessage: observation.statusMessage,
    promptTokens: observation.usage?.promptTokens,
    completionTokens: observation.usage?.completionTokens,
    totalTokens: observation.usage?.totalTokens,
    toolDefinitions: observation.toolDefinitions,
    toolCalls: observation.toolCalls,
  };

  return mapping[columnId];
}
```

---

## Phase 7: Sampling (Pure Function)

### 7.1 Sampling Decision

**File**: `worker/src/features/evaluation/observationEval/shouldSampleObservation.ts`

```typescript
interface ShouldSampleParams {
  samplingRate: number;
  randomValue?: number; // Injectable for testing
}

export function shouldSampleObservation(params: ShouldSampleParams): boolean {
  const { samplingRate, randomValue = Math.random() } = params;

  if (samplingRate >= 1) return true;
  if (samplingRate <= 0) return false;

  return randomValue < samplingRate;
}
```

---

## Phase 8: Orchestration - Scheduler

### 8.1 Dependencies Interface

**File**: `worker/src/features/evaluation/observationEval/types.ts`

```typescript
import { PrismaClient } from "@langfuse/shared/src/db";

export interface SchedulerDependencies {
  prisma: PrismaClient;
  uploadToS3: (params: { path: string; data: unknown }) => Promise<void>;
  enqueueJob: (params: {
    jobExecutionId: string;
    projectId: string;
    s3Path: string;
  }) => Promise<void>;
}
```

### 8.2 Scheduler Implementation

**File**: `worker/src/features/evaluation/observationEval/scheduleObservationEvals.ts`

```typescript
import { type ProcessedObservation } from "@langfuse/shared";
import { type SchedulerDependencies } from "./types";
import { InMemoryFilterService } from "../inMemoryFilterService";
import { mapObservationFilterColumn } from "../observationFilterUtils";
import { shouldSampleObservation } from "./shouldSampleObservation";
import { logger } from "@langfuse/shared/src/server";

interface ScheduleParams {
  observation: ProcessedObservation;
  isOtel: boolean;
  deps: SchedulerDependencies;
}

export async function scheduleObservationEvals(params: ScheduleParams): Promise<void> {
  const { observation, isOtel, deps } = params;

  // Only process OTEL observations
  if (!isOtel) {
    logger.debug("Skipping non-OTEL observation for eval scheduling", {
      observationId: observation.id,
    });
    return;
  }

  // Fetch active observation-targeted configs
  const configs = await deps.prisma.jobConfiguration.findMany({
    where: {
      projectId: observation.projectId,
      filterTarget: "observation",
      status: "ACTIVE",
      timeScope: { has: "NEW" },
    },
  });

  if (configs.length === 0) {
    return;
  }

  // Upload observation to S3 once for all configs
  const s3Path = `prefixes/observations/${observation.projectId}/observation/${observation.id}.json`;
  await deps.uploadToS3({ path: s3Path, data: observation });

  // Process each config
  for (const config of configs) {
    await processConfigForObservation({
      observation,
      config,
      s3Path,
      deps,
    });
  }
}

interface ProcessConfigParams {
  observation: ProcessedObservation;
  config: JobConfiguration;
  s3Path: string;
  deps: SchedulerDependencies;
}

async function processConfigForObservation(params: ProcessConfigParams): Promise<void> {
  const { observation, config, s3Path, deps } = params;

  // Evaluate filter using existing InMemoryFilterService
  const filterMatches = InMemoryFilterService.evaluateFilter({
    entity: observation,
    filter: config.filter as FilterCondition[],
    columnMapper: ({ entity, columnId }) =>
      mapObservationFilterColumn({ observation: entity, columnId }),
  });

  if (!filterMatches) {
    return;
  }

  // Apply sampling
  if (!shouldSampleObservation({ samplingRate: config.sampling.toNumber() })) {
    return;
  }

  // Check for existing job (deduplication)
  const existingJob = await deps.prisma.jobExecution.findFirst({
    where: {
      projectId: observation.projectId,
      jobConfigurationId: config.id,
      jobInputObservationId: observation.id,
    },
    select: { id: true },
  });

  if (existingJob) {
    logger.debug("Observation eval job already exists", {
      observationId: observation.id,
      configId: config.id,
    });
    return;
  }

  // Create job execution record
  const jobExecution = await deps.prisma.jobExecution.create({
    data: {
      projectId: observation.projectId,
      jobConfigurationId: config.id,
      jobInputTraceId: observation.traceId,
      jobInputObservationId: observation.id,
      status: "PENDING",
    },
  });

  // Queue for execution
  await deps.enqueueJob({
    jobExecutionId: jobExecution.id,
    projectId: observation.projectId,
    s3Path,
  });

  logger.info("Scheduled observation eval", {
    observationId: observation.id,
    configId: config.id,
    jobExecutionId: jobExecution.id,
  });
}
```

---

## Phase 9: Orchestration - Executor

### 9.1 Dependencies Interface

**File**: `worker/src/features/evaluation/observationEval/types.ts`

```typescript
export interface ExecutorDependencies {
  prisma: PrismaClient;
  downloadFromS3: (params: { path: string }) => Promise<ProcessedObservation>;
  // Reuse existing fetchLLMCompletion
  callLLM: typeof fetchLLMCompletion;
  // Reuse existing score creation flow
  createScore: (params: CreateScoreParams) => Promise<void>;
}
```

### 9.2 Executor Implementation

**File**: `worker/src/features/evaluation/observationEval/executeObservationEval.ts`

```typescript
import { type ProcessedObservation, observationVariableMappingList } from "@langfuse/shared";
import { type ExecutorDependencies } from "./types";
import { extractObservationVariables } from "./extractObservationVariables";
import { compilePrompt } from "../evalService"; // REUSE existing
import { logger } from "@langfuse/shared/src/server";
import { LangfuseInternalTraceEnvironment } from "@langfuse/shared";
import { z } from "zod/v4";

interface ExecuteParams {
  projectId: string;
  jobExecutionId: string;
  observationS3Path: string;
  deps: ExecutorDependencies;
}

export async function executeObservationEval(params: ExecuteParams): Promise<void> {
  const { projectId, jobExecutionId, observationS3Path, deps } = params;

  // Fetch job execution and config
  const job = await deps.prisma.jobExecution.findUnique({
    where: { id: jobExecutionId },
    include: {
      jobConfiguration: {
        include: { evalTemplate: true },
      },
    },
  });

  if (!job) {
    throw new Error(`Job execution ${jobExecutionId} not found`);
  }

  if (job.status === "CANCELLED") {
    logger.info("Job execution cancelled, skipping", { jobExecutionId });
    return;
  }

  const config = job.jobConfiguration;
  const template = config.evalTemplate;

  if (!template) {
    await markJobAsError({
      deps,
      jobExecutionId,
      error: `Eval template not found for config ${config.id}`,
    });
    throw new Error(`Eval template not found for config ${config.id}`);
  }

  // Fetch observation from S3
  let observation: ProcessedObservation;
  try {
    observation = await deps.downloadFromS3({ path: observationS3Path });
  } catch (error) {
    // S3 download failed - will be retried by BullMQ
    throw error;
  }

  // Extract variables using simplified observation mapping
  const parsedMapping = observationVariableMappingList.parse(config.variableMapping);
  const variables = extractObservationVariables({
    observation,
    variableMapping: parsedMapping,
  });

  // Compile prompt - REUSE existing
  const compiledPrompt = compilePrompt({
    template: template.prompt,
    variables,
  });

  // Execute LLM evaluation - REUSE fetchLLMCompletion
  const scoreId = crypto.randomUUID();
  const executionTraceId = `eval-obs-${jobExecutionId}`;

  const evalOutputSchema = z.object({
    score: z.number(),
    reasoning: z.string(),
  });

  let llmResponse;
  try {
    llmResponse = await deps.callLLM({
      streaming: false,
      messages: [{ role: "user", content: compiledPrompt }],
      modelParams: {
        provider: template.provider,
        model: template.model,
        adapter: template.adapter ?? undefined,
      },
      structuredOutputSchema: evalOutputSchema,
      maxRetries: 1,
      traceSinkParams: {
        targetProjectId: projectId,
        traceId: executionTraceId,
        traceName: `Execute evaluator: ${template.name}`,
        environment: LangfuseInternalTraceEnvironment.LLMJudge,
        metadata: {
          jobExecutionId,
          configId: config.id,
          observationId: job.jobInputObservationId,
          scoreId,
        },
      },
    });
  } catch (error) {
    // LLM call failed - check if retryable
    // Rethrow for BullMQ retry or mark as error if permanent
    throw error;
  }

  const parsedOutput = evalOutputSchema.safeParse(llmResponse);
  if (!parsedOutput.success) {
    await markJobAsError({
      deps,
      jobExecutionId,
      error: `Invalid LLM output: ${parsedOutput.error.message}`,
    });
    throw new Error(`Invalid LLM output: ${parsedOutput.error.message}`);
  }

  // Create score - REUSE existing score creation flow
  await deps.createScore({
    id: scoreId,
    projectId,
    traceId: job.jobInputTraceId!,
    observationId: job.jobInputObservationId!,
    name: config.scoreName,
    value: parsedOutput.data.score,
    comment: parsedOutput.data.reasoning,
    source: "EVAL",
    executionTraceId,
  });

  // Mark job as completed
  await deps.prisma.jobExecution.update({
    where: { id: jobExecutionId },
    data: {
      status: "COMPLETED",
      endTime: new Date(),
      jobOutputScoreId: scoreId,
      executionTraceId,
    },
  });

  logger.info("Observation eval completed", {
    jobExecutionId,
    observationId: job.jobInputObservationId,
    scoreId,
  });
}

interface MarkErrorParams {
  deps: ExecutorDependencies;
  jobExecutionId: string;
  error: string;
}

async function markJobAsError(params: MarkErrorParams): Promise<void> {
  const { deps, jobExecutionId, error } = params;

  await deps.prisma.jobExecution.update({
    where: { id: jobExecutionId },
    data: {
      status: "ERROR",
      endTime: new Date(),
      error,
    },
  });
}
```

---

## Phase 10: Production Dependencies Factories

### 10.1 Scheduler Dependencies

**File**: `worker/src/features/evaluation/observationEval/createSchedulerDeps.ts`

```typescript
import { prisma } from "@langfuse/shared/src/db";
import { StorageServiceFactory, LLMAsJudgeExecutionQueue, QueueJobs } from "@langfuse/shared/src/server";
import { type SchedulerDependencies } from "./types";
import { randomUUID } from "crypto";

export function createSchedulerDeps(): SchedulerDependencies {
  const s3Client = StorageServiceFactory.getInstance({
    accessKeyId: process.env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
    secretAccessKey: process.env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
    bucketName: process.env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    endpoint: process.env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
    region: process.env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
    forcePathStyle: process.env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
  });

  return {
    prisma,

    uploadToS3: async ({ path, data }) => {
      await s3Client.uploadJson(path, data);
    },

    enqueueJob: async ({ jobExecutionId, projectId, s3Path }) => {
      await LLMAsJudgeExecutionQueue.getInstance()?.add(
        QueueJobs.LLMAsJudgeExecutionJob,
        {
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.LLMAsJudgeExecutionJob,
          payload: { projectId, jobExecutionId, observationS3Path: s3Path },
        }
      );
    },
  };
}
```

### 10.2 Executor Dependencies

**File**: `worker/src/features/evaluation/observationEval/createExecutorDeps.ts`

```typescript
import { prisma } from "@langfuse/shared/src/db";
import { StorageServiceFactory, fetchLLMCompletion } from "@langfuse/shared/src/server";
import { createScoreFromEval } from "../evalService"; // REUSE existing
import { type ExecutorDependencies } from "./types";

export function createExecutorDeps(): ExecutorDependencies {
  const s3Client = StorageServiceFactory.getInstance({
    accessKeyId: process.env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
    secretAccessKey: process.env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
    bucketName: process.env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    endpoint: process.env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
    region: process.env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
    forcePathStyle: process.env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
  });

  return {
    prisma,

    downloadFromS3: async ({ path }) => {
      const data = await s3Client.download(path);
      return JSON.parse(data.toString());
    },

    callLLM: fetchLLMCompletion,

    createScore: createScoreFromEval, // REUSE existing
  };
}
```

---

## Phase 11: Integration Points

### 11.1 IngestionService Integration

**File**: `worker/src/services/IngestionService/index.ts`

In `processObservationEventList()`, after writing to ClickHouse:

```typescript
// After: this.clickHouseWriter.addToQueue(TableName.Observations, finalObservationRecord);

// Check if project has any job configs (reuse existing cache)
const hasNoJobConfigs = await hasNoJobConfigsCache(projectId);
if (!hasNoJobConfigs && isOtel) {
  const schedulerDeps = createSchedulerDeps();
  await scheduleObservationEvals({
    observation: mapToProcessedObservation(finalObservationRecord),
    isOtel: true,
    deps: schedulerDeps,
  });
}
```

Helper function to map the record:

```typescript
function mapToProcessedObservation(record: ObservationRecord): ProcessedObservation {
  return {
    id: record.id,
    traceId: record.trace_id,
    projectId: record.project_id,
    type: record.type,
    name: record.name,
    environment: record.environment,
    model: record.model,
    level: record.level,
    version: record.version,
    promptName: record.prompt_name,
    metadata: record.metadata,
    input: record.input,
    output: record.output,
    statusMessage: record.status_message,
    usage: {
      promptTokens: record.prompt_tokens,
      completionTokens: record.completion_tokens,
      totalTokens: record.total_tokens,
    },
    toolDefinitions: record.tool_definitions,
    toolCalls: record.tool_calls,
    userId: record.user_id,
    sessionId: record.session_id,
  };
}
```

### 11.2 OTEL Ingestion Queue Integration

**File**: `worker/src/queues/otelIngestionQueue.ts`

When calling `ingestionService.mergeAndWrite()`, pass `isOtel: true`.

### 11.3 Queue Processor

**File**: `worker/src/queues/llmAsJudgeQueue.ts`

```typescript
import { Job } from "bullmq";
import { QueueName, type TQueueJobTypes } from "@langfuse/shared/src/server";
import { executeObservationEval } from "../features/evaluation/observationEval/executeObservationEval";
import { createExecutorDeps } from "../features/evaluation/observationEval/createExecutorDeps";
import { traceException, logger } from "@langfuse/shared/src/server";

export const llmAsJudgeExecutionQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.LLMAsJudgeExecution]>
): Promise<void> => {
  const { payload } = job.data;

  try {
    await executeObservationEval({
      projectId: payload.projectId,
      jobExecutionId: payload.jobExecutionId,
      observationS3Path: payload.observationS3Path,
      deps: createExecutorDeps(),
    });
  } catch (error) {
    logger.error("Error executing observation eval", {
      error,
      jobId: job.id,
      jobExecutionId: payload.jobExecutionId,
    });
    traceException(error);
    throw error; // Rethrow for BullMQ retry
  }
};
```

### 11.4 Worker Registration

**File**: `worker/src/queues/index.ts`

Register the new queue processor.

---

## Phase 12: Testing Strategy (TDD)

### 12.1 Pure Function Tests

| File | Tests |
|------|-------|
| `shouldSampleObservation.test.ts` | Sampling edge cases, injectable random |
| `extractObservationVariables.test.ts` | Variable extraction, JSON selectors |
| `mapObservationFilterColumn.test.ts` | Column mapping for all supported fields |

### 12.2 Integration Tests with Mocked Dependencies

| File | Tests |
|------|-------|
| `scheduleObservationEvals.test.ts` | Scheduling flow with mocked deps |
| `executeObservationEval.test.ts` | Execution flow with mocked deps |

### 12.3 Test Structure

```typescript
// Example: scheduleObservationEvals.test.ts
describe("scheduleObservationEvals", () => {
  const createMockDeps = (): SchedulerDependencies => ({
    prisma: {
      jobConfiguration: { findMany: jest.fn() },
      jobExecution: { findFirst: jest.fn(), create: jest.fn() },
    } as any,
    uploadToS3: jest.fn(),
    enqueueJob: jest.fn(),
  });

  it("should skip non-OTEL observations", async () => { ... });
  it("should skip when no configs exist", async () => { ... });
  it("should upload to S3 and enqueue when filter matches", async () => { ... });
  it("should skip when filter does not match", async () => { ... });
  it("should skip when job already exists", async () => { ... });
  it("should respect sampling rate", async () => { ... });
});
```

---

## Phase 13: Frontend Changes

### 13.1 Update Form Schema

**File**: `web/src/features/evals/utils/evaluator-form-utils.ts`

- Add `"observation"` to target enum
- Add helpers: `isObservationTarget()`

### 13.2 Update Inner Evaluator Form

**File**: `web/src/features/evals/components/inner-evaluator-form.tsx`

- Add third tab: "Observations (OTEL)"
- Conditionally render observation filter builder
- Hide delay field for observation target
- Hide "EXISTING" time scope checkbox for observation target
- Show simplified variable mapping (no object name selection)
- Show observation preview table

### 13.3 Observation Preview Component

**File**: `web/src/features/evals/components/observation-eval-preview.tsx`

Preview matched observations based on filters.

### 13.4 tRPC Router Updates

**File**: `web/src/features/evals/server/router.ts`

- Handle `target_object: "observation"` and `filter_target: "observation"` in createJob
- Add observation filter options endpoint

---

## Implementation Order

| Order | Phase | Description | TDD |
|-------|-------|-------------|-----|
| 1 | Phase 1 | Database migration | - |
| 2 | Phase 4 | Domain types & schemas | - |
| 3 | Phase 7 | Sampling (pure function) | ✅ |
| 4 | Phase 5 | Filter evaluation (extend existing) | ✅ |
| 5 | Phase 6 | Variable extraction | ✅ |
| 6 | Phase 3 | Queue infrastructure | - |
| 7 | Phase 8 | Scheduler orchestration | ✅ |
| 8 | Phase 9 | Executor orchestration | ✅ |
| 9 | Phase 10 | Production dependencies | - |
| 10 | Phase 2 | OTEL pipeline changes | - |
| 11 | Phase 11 | Integration points | - |
| 12 | Phase 13 | Frontend changes | - |

---

## Files Summary

### New Files
```
packages/shared/prisma/migrations/.../migration.sql
packages/shared/src/server/redis/llmAsJudgeExecutionQueue.ts
packages/shared/src/features/evals/observationEvalFilterCols.ts

worker/src/features/evaluation/observationFilterUtils.ts
worker/src/features/evaluation/observationEval/types.ts
worker/src/features/evaluation/observationEval/shouldSampleObservation.ts
worker/src/features/evaluation/observationEval/extractObservationVariables.ts
worker/src/features/evaluation/observationEval/scheduleObservationEvals.ts
worker/src/features/evaluation/observationEval/executeObservationEval.ts
worker/src/features/evaluation/observationEval/createSchedulerDeps.ts
worker/src/features/evaluation/observationEval/createExecutorDeps.ts
worker/src/queues/llmAsJudgeQueue.ts

worker/src/__tests__/observationEval/shouldSampleObservation.test.ts
worker/src/__tests__/observationEval/extractObservationVariables.test.ts
worker/src/__tests__/observationEval/mapObservationFilterColumn.test.ts
worker/src/__tests__/observationEval/scheduleObservationEvals.test.ts
worker/src/__tests__/observationEval/executeObservationEval.test.ts

web/src/features/evals/components/observation-eval-preview.tsx
```

### Modified Files
```
packages/shared/prisma/schema.prisma
packages/shared/src/server/queues.ts
packages/shared/src/features/evals/types.ts
packages/shared/src/server/otel/OtelIngestionProcessor.ts

worker/src/services/IngestionService/index.ts
worker/src/queues/otelIngestionQueue.ts
worker/src/queues/index.ts
worker/src/features/evaluation/inMemoryFilterService.ts

web/src/features/evals/components/inner-evaluator-form.tsx
web/src/features/evals/utils/evaluator-form-utils.ts
web/src/features/evals/server/router.ts
```

---

## Key Reuse Points

| Component | Existing Code | Location |
|-----------|---------------|----------|
| Filter evaluation | `InMemoryFilterService.evaluateFilter` | `worker/src/features/evaluation/inMemoryFilterService.ts` |
| JSON path extraction | `applyJsonSelector` | `worker/src/features/evaluation/evalService.ts` |
| Prompt compilation | `compilePrompt` | `worker/src/features/evaluation/evalService.ts` |
| LLM calls | `fetchLLMCompletion` | `packages/shared/src/server/` |
| Score creation | Score creation flow | `worker/src/features/evaluation/evalService.ts` |
| Job configs cache | `hasNoJobConfigsCache` | Existing cache utility |
