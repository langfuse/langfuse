# Dataset Run Items Error Handling Strategy

## Problem
Currently, experiment configuration validation errors are written at the dataset run level. However, this creates issues:
- Jobs can retry, making previously valid experiments appear invalid
- Error state doesn't accurately reflect the actual processing status
- Item-level failures get obscured by run-level errors

## Current Flow
```
1. Validate experiment configuration
2. If invalid → Write error to dataset_runs table
3. If valid → Fetch dataset items and process
4. Create dataset_run_items for each processed item
```

## Proposed Solutions

### Option 1: Pre-fetch Items for Validation
**Approach**: Fetch dataset items before validation to enable item-level error tracking.

**Pros**:
- Can mark specific items as failed during validation
- Preserves granular error information
- Retry logic works correctly

**Cons**:
- Additional database query overhead
- Memory usage for large datasets
- Potential performance impact

**Implementation**:
```typescript
// 1. Fetch items first
const datasetItems = await fetchDatasetItems(datasetId);

// 2. Validate configuration with items
const validationResult = validateExperimentConfig(prompt, datasetItems);

// 3. Create run with validation status
const datasetRun = await createDatasetRun({...});

// 4. Create run items with individual status
for (const item of datasetItems) {
  await createDatasetRunItem({
    itemId: item.id,
    runId: datasetRun.id,
    status: validationResult.itemStatus[item.id] // 'valid' | 'invalid'
    error: validationResult.itemErrors[item.id]
  });
}
```

### Option 2: Lazy Item Creation with Error Propagation
**Approach**: Create run items during processing, marking failed ones individually.

**Pros**:
- Maintains current performance characteristics
- Simple implementation
- Clear separation of concerns

**Cons**:
- Configuration errors still at run level initially
- Mixed error sources (config vs processing)

**Implementation**:
```typescript
// 1. Validate configuration (lightweight check)
const configValid = validateExperimentConfig(prompt, dataset);

if (!configValid) {
  // Create run with config error
  return createDatasetRun({ status: 'failed', error: configError });
}

// 2. Process items individually
const datasetRun = await createDatasetRun({ status: 'running' });

await processDatasetItems(datasetItems, async (item) => {
  try {
    const result = await processItem(item, prompt);
    await createDatasetRunItem({ ...result, status: 'completed' });
  } catch (error) {
    await createDatasetRunItem({ 
      itemId: item.id, 
      status: 'failed', 
      error: error.message 
    });
  }
});
```

### Option 3: Hybrid Approach (Recommended)
**Approach**: Lightweight validation + item-level processing with status tracking.

**Benefits**:
- Fast initial validation for obvious config errors
- Item-level granularity for processing errors
- Proper retry handling
- Clear error attribution

**Implementation**:
```typescript
// 1. Quick config validation (no item fetching)
const basicConfigValid = validateBasicConfig(prompt, dataset);
if (!basicConfigValid) {
  return { error: "Invalid configuration", level: "experiment" };
}

// 2. Create run as "pending"
const datasetRun = await createDatasetRun({ status: 'pending' });

// 3. Process items with individual error tracking
const processedItems = await processItemsBatch(datasetId, async (item) => {
  try {
    // Item-level validation + processing
    const validated = validateItemAgainstPrompt(item, prompt);
    if (!validated) {
      return { itemId: item.id, status: 'skipped', error: 'Item incompatible with prompt' };
    }
    
    const result = await executeExperiment(item, prompt);
    return { itemId: item.id, status: 'completed', result };
  } catch (error) {
    return { itemId: item.id, status: 'failed', error: error.message };
  }
});

// 4. Update run status based on results
await updateDatasetRunStatus(datasetRun.id, processedItems);
```

## Schema Considerations
Add status and error fields to `dataset_run_items`:
```sql
ALTER TABLE dataset_run_items ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE dataset_run_items ADD COLUMN error_message TEXT NULL;
```

### Option 4: Pre-create Failed Items (Recommended Approach)
**Approach**: Validate config, fetch all dataset items, create dataset_run_items immediately with error states for invalid items using placeholder trace_id.

**Implementation**:
```typescript
const VALIDATION_ERROR_TRACE_ID = "validation-error-placeholder";

// 1. Validate experiment configuration
const configValidation = validateExperimentConfig(prompt, dataset);

// 2. Fetch all dataset items
const datasetItems = await fetchDatasetItems(datasetId);

// 3. Create dataset run
const datasetRun = await createDatasetRun({ status: 'running' });

// 4. Create ALL dataset_run_items upfront
const runItems = await Promise.all(
  datasetItems.map(async (item) => {
    const itemValidation = validateItemAgainstPrompt(item, prompt);
    
    if (!itemValidation.isValid) {
      // Create failed item immediately with placeholder traceId
      return createDatasetRunItem({
        datasetRunId: datasetRun.id,
        datasetItemId: item.id,
        traceId: VALIDATION_ERROR_TRACE_ID, // fixed placeholder
        observationId: null,
        error: itemValidation.error
      });
    } else {
      // Create pending item, will be updated later with real traceId
      return createDatasetRunItem({
        datasetRunId: datasetRun.id,
        datasetItemId: item.id,
        traceId: VALIDATION_ERROR_TRACE_ID, // temporary, updated after processing
        observationId: null,
        error: null
      });
    }
  })
);

// 5. Process only valid items and update their run_items with real traceIds
const validRunItems = runItems.filter(item => item.error === null);
await processValidItems(validRunItems, prompt);
```

## Tradeoff Analysis

### Option 4 Pros:
- ✅ **Complete visibility**: All items visible immediately in UI
- ✅ **Consistent data model**: Every dataset item has a corresponding run item
- ✅ **Clear error attribution**: Each item shows its specific failure reason
- ✅ **Retry-friendly**: Failed items remain failed, successful retries don't affect them
- ✅ **Progress tracking**: Can show "X of Y items processed" immediately
- ✅ **Atomic operation**: Either all items are created or none (transaction safety)

### Option 4 Cons:
- ❌ **Database overhead**: Creates many records upfront (potentially thousands)
- ❌ **Memory usage**: Must load all dataset items into memory at once
- ❌ **Transaction size**: Large batch insert operation
- ❌ **Placeholder traceId handling**: Need to filter out placeholder traceIds in queries/UI
- ❌ **Premature optimization**: Creates records that might never be processed

### Option 4 vs Other Approaches:

**vs Option 1 (Pre-fetch)**: Similar but more aggressive - creates ALL records upfront
**vs Option 2 (Lazy)**: Opposite approach - everything created immediately vs on-demand
**vs Option 3 (Hybrid)**: More database-heavy but better visibility

## Schema Requirements for Option 4
```sql
-- No schema changes needed! 
-- Using existing error field and placeholder traceId

-- Optional: Index for efficient error queries if needed
CREATE INDEX idx_dataset_run_items_error ON dataset_run_items(dataset_run_id) 
WHERE error IS NOT NULL;
```

## UI Benefits of Option 4
- Shows complete experiment scope immediately
- Clear progress indicators (X failed, Y pending, Z completed)
- Users can see which specific items failed validation
- No "partial" experiment views

## Recommendation
**Option 4** makes the most sense for experiment workflows because:
1. **User Experience**: Complete visibility into experiment scope
2. **Data Consistency**: Every dataset item always has a run item
3. **Error Clarity**: Validation errors are clearly attributed to specific items
4. **Retry Logic**: Retry only affects pending/valid items, preserving error states

The database overhead is acceptable for most use cases, and the benefits of complete visibility and consistent error handling outweigh the costs.