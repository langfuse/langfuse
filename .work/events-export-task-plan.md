# Implementation Plan: Events Export Feature

## Phase 1: Foundation and CSV Export

### [x] Step 1: Add Events to BatchTableNames Enum
- **Task**: Add `Events = "events"` to the `BatchTableNames` enum. This is a foundational change that enables all other features since the enum is used throughout the codebase for type safety and validation.
- **Files**:
  - `packages/shared/src/interfaces/tableNames.ts`: Add `Events = "events"` to the enum
- **Step Dependencies**: None (foundational change)
- **User Instructions**: None

### [x] Step 2: Create Events Stream Function for Batch Exports
- **Task**: Create `getEventsStream()` function in the worker package following the exact pattern of `getTraceStream()` and `getObservationStream()`. This function will query ClickHouse events table with filters, fetch comments in batches, and return a Node.js Readable stream for batch export processing.
- **Files**:
  - `worker/src/features/database-read-stream/event-stream.ts`: Create new file with `getEventsStream()` function
    - Import necessary dependencies (FilterCondition, TracingSearchType, etc.)
    - Implement streaming query using raw SQL (following existing patterns)
    - Add comment fetching in batches (use "OBSERVATION" type since events are observations)
    - Return Readable stream with event records
    - Include progress logging every 10,000 rows
  - `worker/src/features/database-read-stream/types.ts`: Add `BatchExportEventsRow` type
  - `worker/src/features/database-read-stream/getDatabaseReadStream.ts`:
    - Add `events: "startTime"` to time filter column mappings
    - Update `getChunkWithFlattenedScores` to accept `BatchExportEventsRow[]`
  - `packages/shared/src/server/tableMappings/index.ts`: Export `eventsTableUiColumnDefinitions`
- **Step Dependencies**: Step 1 (needs BatchTableNames.Events)
- **User Instructions**: None

### [x] Step 3: Update Batch Export Worker Handler
- **Task**: Add Events case to the batch export handler to route Events table exports to the new `getEventsStream()` function.
- **Files**:
  - `worker/src/features/batchExport/handleBatchExportJob.ts`:
    - Add import for `getEventsStream` from `../database-read-stream/event-stream`
    - Add case in stream selection logic: `parsedQuery.data.tableName === BatchExportTableName.Events`
    - Call `getEventsStream()` with appropriate parameters
- **Step Dependencies**: Step 1, Step 2
- **User Instructions**: None

### [x] Step 4: Update UI Export Button Warning Message
- **Task**: Add a warning message for Events table exports to inform users that comment filters are not included in event exports.
- **Files**:
  - `web/src/components/BatchExportTableButton.tsx`:
    - Add case `BatchTableNames.Events` in `getWarningMessage()` function
    - Return: "Note: Filters on Comments are not included in event exports. You may receive more data than expected."
- **Step Dependencies**: Step 1
- **User Instructions**: None

## Phase 2: Scheduled Integrations

### [ ] Step 5: Add AnalyticsEventEvent Type
- **Task**: Create `AnalyticsEventEvent` type in the analytics-integrations types file, following the pattern of existing `AnalyticsTraceEvent`, `AnalyticsGenerationEvent`, and `AnalyticsScoreEvent` types.
- **Files**:
  - `packages/shared/src/server/analytics-integrations/types.ts`: 
    - Add `AnalyticsEventEvent` type at end of file with properties:
      - `langfuse_id`, `timestamp`, `langfuse_event_name`, `langfuse_trace_name`, `langfuse_trace_id`
      - `langfuse_url`, `langfuse_user_url`, `langfuse_cost_usd`
      - `langfuse_input_units`, `langfuse_output_units`, `langfuse_total_units`
      - `langfuse_session_id`, `langfuse_project_id`, `langfuse_user_id`
      - `langfuse_latency`, `langfuse_time_to_first_token`
      - `langfuse_release`, `langfuse_version`, `langfuse_model`, `langfuse_level`, `langfuse_type`
      - `langfuse_tags`, `langfuse_environment`, `langfuse_event_version`
      - `posthog_session_id`, `mixpanel_session_id`
- **Step Dependencies**: None
- **User Instructions**: None

### [ ] Step 6: Add Events Export Functions to Repository
- **Task**: Add `getEventsForBlobStorageExport()` and `getEventsForAnalyticsIntegrations()` functions to the events repository file. These functions will be used by S3, PostHog, and Mixpanel integrations. Follow the pattern of `getScoresForBlobStorageExport()` and `getScoresForAnalyticsIntegrations()` in `scores.ts`.
- **Files**:
  - `packages/shared/src/server/repositories/events.ts`: 
    - Add `getEventsForBlobStorageExport()` function at the end of the file
      - Use raw SQL query (not EventsQueryBuilder) matching the pattern in traces.ts/scores.ts
      - Filter by time range (minTimestamp to maxTimestamp)
      - Use queryClickhouseStream directly
      - Return the stream directly (not wrapped in async generator)
    - Add `getEventsForAnalyticsIntegrations()` async generator function
      - Query ClickHouse for events with analytics-relevant fields
      - Transform raw records to `AnalyticsEventEvent` format in yield
      - Include URL construction using `env.NEXTAUTH_URL`
  - `packages/shared/src/server/repositories/index.ts`: 
    - Export the new functions (if not already exported via `export * from "./events"`)
- **Step Dependencies**: Step 1, Step 5 (needs AnalyticsEventEvent type)
- **User Instructions**: None

### [ ] Step 7: Verify Events Functions Export from Server Index
- **Task**: Verify the new events export functions are exported from the shared server index so they can be imported by worker handlers.
- **Files**:
  - `packages/shared/src/server/repositories/index.ts`:
    - **Already exists**: `export * from "./events"` (line 4) - no changes needed
  - `packages/shared/src/server/index.ts`:
    - **Already exists**: `export * from "./repositories"` (line 94) - no changes needed
    - **Already exists**: `export * from "./analytics-integrations/types"` (line 120) - exports AnalyticsEventEvent
- **Step Dependencies**: Step 5, Step 6
- **User Instructions**: None (verification only - exports already configured)

### [ ] Step 8: Update Blob Storage Integration Handler
- **Task**: Add Events table support to the blob storage integration handler so events can be exported to S3/S3-compatible storage on a schedule.
- **Files**:
  - `worker/src/features/blobstorage/handleBlobStorageIntegrationProjectJob.ts`: 
    - Add import: `getEventsForBlobStorageExport` from `@langfuse/shared/src/server`
    - Update `processBlobStorageExport` function signature: Add `"events"` to table type union
    - Add case in switch statement: `case "events"` that calls `getEventsForBlobStorageExport()`
- **Step Dependencies**: Step 6, Step 7
- **User Instructions**: None

### [ ] Step 9: Create PostHog Event Transformer
- **Task**: Create transformer function to convert `AnalyticsEventEvent` to PostHog event format, following the exact pattern of `transformTraceForPostHog`, `transformGenerationForPostHog`, and `transformScoreForPostHog`.
- **Files**:
  - `worker/src/features/posthog/transformers.ts`: 
    - Add `transformEventForPostHog()` function
    - Import `AnalyticsEventEvent` type from `@langfuse/shared/src/server`
    - Use existing `POSTHOG_UUID_NAMESPACE` constant
    - Map `AnalyticsEventEvent` fields to PostHog event structure:
      - event: "langfuse event"
      - distinctId: `event.langfuse_user_id` or UUID
      - timestamp: `event.timestamp`
      - uuid: generated using v5 UUID
      - properties: spread `otherProps`, set `$session_id` from `posthog_session_id`
      - Handle anonymous events with `$process_person_profile: false`
- **Step Dependencies**: Step 5 (needs AnalyticsEventEvent type)
- **User Instructions**: None

### [ ] Step 10: Update PostHog Integration Handler
- **Task**: Add events processing to PostHog integration handler so events are sent to PostHog alongside traces, generations, and scores.
- **Files**:
  - `worker/src/features/posthog/handlePostHogIntegrationProjectJob.ts`: 
    - Add import: `getEventsForAnalyticsIntegrations` from `@langfuse/shared/src/server`
    - Add import: `transformEventForPostHog` from `./transformers`
    - Add `processPostHogEvents()` function following the exact pattern of `processPostHogTraces()`
      - Stream events using `getEventsForAnalyticsIntegrations()`
      - Transform each event using `transformEventForPostHog()`
      - Send via PostHog SDK with batching (flush every 10,000 events)
      - Include error handling
    - Update main handler: Add `processPostHogEvents(executionConfig)` to Promise.all()
- **Step Dependencies**: Step 6, Step 7, Step 9
- **User Instructions**: None

### [ ] Step 11: Create Mixpanel Event Transformer
- **Task**: Create transformer function to convert `AnalyticsEventEvent` to Mixpanel event format, following the exact pattern of `transformTraceForMixpanel`, `transformGenerationForMixpanel`, and `transformScoreForMixpanel`.
- **Files**:
  - `worker/src/features/mixpanel/transformers.ts`: 
    - Add `transformEventForMixpanel()` function
    - Import `AnalyticsEventEvent` type from `@langfuse/shared/src/server`
    - Use existing `MIXPANEL_UUID_NAMESPACE` constant
    - Map `AnalyticsEventEvent` fields to Mixpanel event structure:
      - event: "[Langfuse] Event"
      - properties.distinct_id: `event.langfuse_user_id` or insertId
      - properties.time: timestamp in milliseconds
      - properties.$insert_id: generated using v5 UUID
      - properties.session_id: from `mixpanel_session_id` or `langfuse_session_id`
      - Spread remaining properties
- **Step Dependencies**: Step 5 (needs AnalyticsEventEvent type)
- **User Instructions**: None

### [ ] Step 12: Update Mixpanel Integration Handler
- **Task**: Add events processing to Mixpanel integration handler so events are sent to Mixpanel alongside traces, generations, and scores.
- **Files**:
  - `worker/src/features/mixpanel/handleMixpanelIntegrationProjectJob.ts`: 
    - Add import: `getEventsForAnalyticsIntegrations` from `@langfuse/shared/src/server`
    - Add import: `transformEventForMixpanel` from `./transformers`
    - Add `processMixpanelEvents()` function following the exact pattern of `processMixpanelTraces()`
      - Stream events using `getEventsForAnalyticsIntegrations()`
      - Transform each event using `transformEventForMixpanel()`
      - Send via MixpanelClient with batching (flush every 1,000 events)
      - Include error handling
    - Update main handler: Add `processMixpanelEvents(executionConfig)` to Promise.all()
- **Step Dependencies**: Step 6, Step 7, Step 11
- **User Instructions**: None

## Phase 3: Testing

**Note**: Worker uses **Vitest** (not Jest). Use Vitest imports: `import { describe, it, expect, vi } from 'vitest'`

### [ ] Step 13: Add Unit Tests for Events Stream
- **Task**: Create unit tests for the `getEventsStream()` function to verify it correctly streams events with various filters and handles edge cases.
- **Files**:
  - `worker/src/__tests__/event-stream.test.ts`: Create new test file using Vitest
    - Test streaming events with filters
    - Test empty results handling
    - Test comment fetching
    - Test progress logging
    - Mock ClickHouse queries appropriately
    - Ensure tests are independent (no shared state)
- **Step Dependencies**: Step 2
- **User Instructions**: Run tests with: `pnpm run test --filter=worker -- event-stream`

### [ ] Step 14: Add Integration Tests for Batch Export
- **Task**: Add test cases to verify Events table batch export works end-to-end in the batch export handler.
- **Files**:
  - `worker/src/__tests__/batchExport.test.ts`: 
    - Add test case for Events table export (using Vitest)
    - Verify stream is called with correct parameters
    - Verify file is uploaded to S3
    - Mock external dependencies (S3, ClickHouse)
- **Step Dependencies**: Step 3
- **User Instructions**: Run tests with: `pnpm run test --filter=worker -- batchExport`

### [ ] Step 15: Add Integration Tests for Blob Storage Integration
- **Task**: Add test cases to verify Events table export works in blob storage integration.
- **Files**:
  - `worker/src/__tests__/blobStorage.test.ts`: 
    - Add test case for events table export to blob storage (using Vitest)
    - Verify events are exported to S3
    - Test time range filtering
    - Mock external dependencies
- **Step Dependencies**: Step 8
- **User Instructions**: Run tests with: `pnpm run test --filter=worker -- blobStorage`

### [ ] Step 16: Add Integration Tests for PostHog Integration
- **Task**: Add test cases to verify Events are sent to PostHog correctly.
- **Files**:
  - `worker/src/__tests__/posthog.test.ts`: 
    - Add test case for events being sent to PostHog (using Vitest)
    - Verify transformer is called correctly
    - Verify PostHog SDK is called with correct event format
    - Mock PostHog SDK
- **Step Dependencies**: Step 10
- **User Instructions**: Run tests with: `pnpm run test --filter=worker -- posthog`

### [ ] Step 17: Add Integration Tests for Mixpanel Integration
- **Task**: Add test cases to verify Events are sent to Mixpanel correctly.
- **Files**:
  - `worker/src/__tests__/mixpanel.test.ts`: 
    - Add test case for events being sent to Mixpanel (using Vitest)
    - Verify transformer is called correctly
    - Verify MixpanelClient is called with correct event format
    - Mock MixpanelClient
- **Step Dependencies**: Step 12
- **User Instructions**: Run tests with: `pnpm run test --filter=worker -- mixpanel`

## Summary

### Implementation Approach
This plan implements the Events Export feature in three phases:

1. **Phase 1 (Steps 1-4)**: Foundation and CSV Export Button
   - Adds Events to the enum system
   - Creates the worker stream function for batch exports
   - Updates the batch export handler
   - Updates UI warning messages

2. **Phase 2 (Steps 5-12)**: Scheduled Integrations
   - **Step 5**: Creates `AnalyticsEventEvent` type for analytics integrations
   - **Steps 6-7**: Adds repository functions for blob storage and analytics integrations
   - **Step 8**: Updates S3/blob storage handler
   - **Steps 9-10**: Creates PostHog transformer and updates handler
   - **Steps 11-12**: Creates Mixpanel transformer and updates handler

3. **Phase 3 (Steps 13-17)**: Testing
   - Comprehensive unit and integration tests using **Vitest**
   - Tests for each integration point

### Key Considerations

1. **Backward Compatibility**: All changes are additive - no breaking changes to existing functionality
2. **Pattern Consistency**: Every implementation follows existing patterns from traces/observations/scores exports
3. **Type Safety**: Uses `AnalyticsEventEvent` type for analytics integrations, matching existing `AnalyticsTraceEvent`, `AnalyticsGenerationEvent`, `AnalyticsScoreEvent` patterns
4. **Streaming**: All exports use streaming to handle large datasets without memory issues
5. **Error Handling**: Follow existing error handling patterns in each handler
6. **Testing**: Worker tests use Vitest. All tests must be independent and not rely on shared state

### Dependencies Between Steps
- Step 1 (enum) is foundational and must come first
- Steps 2-4 (Phase 1) can be done in sequence
- Step 5 (AnalyticsEventEvent type) is required before Steps 6 and transformer steps (9, 11)
- Steps 6-12 (Phase 2) depend on Step 1 and Step 5
- Steps 13-17 (Phase 3) depend on their respective implementation steps

### File Modification Count
- Most steps modify 1-3 files
- No step modifies more than 5 files
- Well within the 20-file limit per step

### User Actions Required
- No manual database migrations needed
- No configuration changes required
- All code changes are self-contained
