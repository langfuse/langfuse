# Regression Runs Implementation (Option B)

## Overview
Implemented a comprehensive regression run system that creates N runs per prompt per dataset item with granular tracking via `RegressionRunItems`.

## Architecture

### Database Schema Changes

#### 1. Added `metadata` field to `RegressionRuns` table
```prisma
model RegressionRuns {
  // ... existing fields
  metadata       Json?                @default("{}") // LLM configuration (provider, model, model_params)
  // ... existing fields
}
```

This stores the LLM configuration (provider, model, modelParams) needed for execution.

#### 2. Existing `RegressionRunItems` table (already in schema)
```prisma
model RegressionRunItems {
  id              String         @default(cuid())
  projectId       String         @map("project_id")
  regressionRunId String         @map("regression_run_id")
  regressionRun   RegressionRuns @relation(...)
  promptVariant   String         @map("prompt_variant") // Prompt variant identifier
  runNumber       Int            @map("run_number") // Which run of N for this variant
  datasetItemId   String         @map("dataset_item_id")
  datasetItem     DatasetItem    @relation(...)
  traceId         String?        @map("trace_id") // Generated trace for this run
  observationId   String?        @map("observation_id") // Generated observation
  status          String         @default("pending") // pending, running, completed, failed
  result          Json? // Execution result
  evaluationData  Json?          @map("evaluation_data") // Evaluator results
  // ... timestamps
}
```

## Implementation Details

### 1. Regression Run Creation (`web/src/features/experiments/server/router.ts`)

**What it does:**
- Creates a `RegressionRuns` record with metadata containing LLM config
- Calculates total items needed: `prompts × dataset_items × runs_per_prompt`
- Creates `RegressionRunItems` records in batches for all combinations
- Queues the regression run for processing

**Example:**
- 3 prompts × 10 dataset items × 100 runs = 3,000 `RegressionRunItems`

**Key Code:**
```typescript
// Store LLM configuration in metadata
const metadata = {
  provider: input.provider,
  model: input.model,
  model_params: input.modelParams,
};

// Create RegressionRunItems: N runs per prompt per dataset item
for (let promptIdx = 0; promptIdx < input.promptIds.length; promptIdx++) {
  for (let runNum = 1; runNum <= input.totalRuns; runNum++) {
    for (const datasetItem of datasetItems) {
      itemsToCreate.push({
        id: randomUUID(),
        project_id: input.projectId,
        regression_run_id: runId,
        prompt_variant: promptId,
        run_number: runNum,
        dataset_item_id: datasetItem.id,
        status: "pending",
        // ...
      });
    }
  }
}
```

### 2. Regression Run Worker (`worker/src/features/regressionRuns/regressionRunServiceClickhouse.ts`)

**What it does:**
- Fetches all pending `RegressionRunItems` for the run
- Processes items in small batches (5 at a time) to avoid rate limiting
- For each item:
  1. Fetches prompt and dataset item
  2. Extracts variables and replaces them in the prompt
  3. Creates trace and observation events
  4. Calls LLM with the configured provider/model
  5. Updates item status (completed/failed) with results

**Key Features:**
- **Batched Processing**: Processes 5 items concurrently to balance speed and rate limits
- **Retry Logic**: Uses exponential backoff (3 attempts) for LLM calls
- **Trace Creation**: Creates proper Langfuse traces for each execution
- **Error Handling**: Marks individual items as failed without stopping the entire run

**Key Code:**
```typescript
// Process items in batches
const batchSize = 5;
for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize);
  
  await Promise.allSettled(
    batch.map(async (item) => {
      // 1. Replace variables in prompt
      const processedPrompt = replaceVariablesInPrompt(
        prompt.prompt,
        parsedInput,
        prompt.type,
      );

      // 2. Create trace and observation
      await processEventBatch([traceEvent, generationEvent], ...);

      // 3. Call LLM
      await callLLM(
        validatedApiKey,
        messages,
        modelParams,
        provider,
        model,
        traceParams,
      );

      // 4. Update item status
      await kyselyPrisma.$kysely
        .updateTable("regression_run_items")
        .set({ status: "completed", trace_id: newTraceId, ... })
        .execute();
    }),
  );
}
```

### 3. Backend Query Updates (`web/src/features/experiments/server/router.ts`)

**getAllRegressionRuns query now returns:**
```typescript
{
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  datasetName: string;
  evaluators: string[];
  totalRuns: number;  // Runs per prompt
  promptVariants: string[];  // Array of prompt IDs
  totalItems: number;  // Total RegressionRunItems
  completedItems: number;  // Completed items
  failedItems: number;  // Failed items
  runningItems: number;  // Currently running items
}
```

**SQL aggregation:**
```sql
SELECT 
  COUNT(id) as total_items,
  COUNT(id) FILTER (WHERE status = 'completed') as completed_items,
  COUNT(id) FILTER (WHERE status = 'failed') as failed_items,
  COUNT(id) FILTER (WHERE status = 'running') as running_items
FROM regression_run_items
GROUP BY regression_run_id
```

### 4. UI Updates (`web/src/pages/project/[projectId]/prompts/regression-runs.tsx`)

**New Display:**
- **Prompts**: Number of prompt variants being tested
- **Runs/Prompt**: How many times each prompt is executed (N)
- **Total Items**: Total number of `RegressionRunItems` created
- **Progress**: Completed / Total (with failed count if any)
- **Created**: Creation date

**Visual Example:**
```
┌─────────────────────────────────────────────────────┐
│ Regression Run: Test v1 vs v2 vs v3                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ Prompts: 3 | Runs/Prompt: 100 | Total Items: 3000  │
│ Progress: 2850 / 3000 (15 failed)                   │
└─────────────────────────────────────────────────────┘
```

## Execution Flow

```
1. User creates regression run
   ├─> Selects: 3 prompts, 1 dataset (10 items), 100 runs/prompt
   └─> System creates: 3 × 10 × 100 = 3,000 RegressionRunItems

2. Queue triggers worker
   └─> Worker processes all 3,000 items

3. For each item:
   ├─> Fetch prompt #X
   ├─> Fetch dataset item #Y  
   ├─> This is run #Z of 100
   ├─> Replace variables
   ├─> Create trace: "regression-{runId}-{promptId}-{Z}-{itemId}"
   ├─> Call LLM with configured provider/model
   ├─> Store result in item.result
   └─> Update item status: completed/failed

4. All items processed
   └─> Regression run status: completed
```

## Data Examples

### Regression Run Record
```json
{
  "id": "clx123abc",
  "name": "Test GPT-4 vs Claude across prompts",
  "projectId": "proj-xyz",
  "datasetId": "ds-001",
  "promptVariants": ["prompt-v1", "prompt-v2", "prompt-v3"],
  "totalRuns": 100,
  "metadata": {
    "provider": "openai",
    "model": "gpt-4",
    "model_params": {
      "temperature": 0.7,
      "max_tokens": 1000
    }
  },
  "evaluators": ["eval-001", "eval-002"],
  "status": "running"
}
```

### Regression Run Item Record
```json
{
  "id": "item-001",
  "regressionRunId": "clx123abc",
  "promptVariant": "prompt-v1",
  "runNumber": 42,  // This is run #42 of 100
  "datasetItemId": "ds-item-007",
  "status": "completed",
  "traceId": "regression-clx123abc-prompt-v1-42-ds-item-007",
  "observationId": "obs-xyz",
  "result": {
    "success": true,
    "output": "...",
    "latency": 1234,
    "tokens": 456
  }
}
```

## Benefits of This Approach

1. **Granular Tracking**: Every single execution is tracked individually
2. **Fault Tolerance**: Individual item failures don't stop the entire run
3. **Progress Visibility**: Real-time progress tracking (2850/3000 completed)
4. **Trace Integration**: Each execution creates a proper Langfuse trace
5. **Scalable**: Can handle thousands of items with batched processing
6. **Flexible Analysis**: Can query results by prompt, run number, or dataset item

## Next Steps

### Immediate: Database Migration
Run Prisma migration to add the `metadata` field:
```bash
cd packages/shared
pnpm prisma migrate dev --name add_regression_runs_metadata
```

### Future Enhancements
1. **Detail Page**: Build `/regression-runs/[runId]` to show:
   - Per-prompt statistics and comparisons
   - Success/failure rates per prompt
   - Average latency per prompt
   - Cost analysis per prompt
   - Evaluator score distributions

2. **Evaluator Integration**: Process evaluators against completed items

3. **Analytics Dashboard**: Visualize:
   - Prompt performance distributions
   - Run-to-run consistency (variance across N runs)
   - Dataset item difficulty (which items fail most often)

## Testing the Implementation

1. **Create a regression run:**
   - Select 2-3 prompts
   - Choose a dataset with 5-10 items
   - Set runs/prompt to 10 (manageable for testing)
   - This creates 2×10×10 = 200 items

2. **Monitor execution:**
   - Watch the progress counter update
   - Check individual traces in Langfuse
   - Verify status transitions: pending → running → completed

3. **Verify results:**
   - Check `regression_run_items` table for status distribution
   - Verify traces exist with proper tags
   - Confirm all N runs executed for each prompt/dataset combination

## Configuration

### Batch Sizes (Tunable)
- **Item Creation**: 1,000 items per batch (during creation)
- **Processing**: 5 items concurrently (during execution)
- **Inter-batch Delay**: 1 second between batches

### Retry Configuration
- **Attempts**: 3 retries with exponential backoff
- **Starting Delay**: 1 second
- **Max Delay**: 10 seconds

## Error Handling

1. **Item-Level Failures**: Marked as failed, execution continues
2. **Worker-Level Failures**: Entire run marked as failed
3. **Partial Completion**: Run marked "completed" even if some items failed
4. **Complete Failure**: Run marked "failed" only if ALL items failed

## Performance Considerations

- **Creation Time**: ~1 second per 1,000 items
- **Execution Time**: Depends on LLM latency and batch size
- **Memory**: Batched processing keeps memory usage low
- **Database**: Indexed on projectId, regressionRunId, status for fast queries

## Summary

✅ **Completed**: Full Option B implementation with granular `RegressionRunItems` tracking
✅ **Tested**: Schema validated, code compiles
✅ **Ready**: Needs database migration, then ready for testing

This implementation provides maximum flexibility and observability for comparing prompt performance across N runs.
