# Implementation Plan: Events Export Feature

## Phase 1: CSV Export (PR #1 - COMPLETED)

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

### [x] Step 5: Add Tests for CSV Export
- **Task**: Add tests for the events stream function and batch export handler.
- **Files**:
  - `worker/src/__tests__/batchExport.test.ts`: Add events export tests
- **Step Dependencies**: Steps 1-4
- **User Instructions**: Run tests with: `pnpm run test --filter=worker -- batchExport.test.ts -t "should export events"`

---

## Phase 2A: S3/Blob Storage Export (PR #2)

This PR adds events export support for S3/Blob Storage scheduled integrations.

### [x] Step 6: Add Events Export Function for Blob Storage
- **Task**: Add `getEventsForBlobStorageExport()` function to the events repository file. Follow the pattern of `getScoresForBlobStorageExport()` in `scores.ts`.
- **Files**:
  - `packages/shared/src/server/repositories/events.ts`: 
    - Add `getEventsForBlobStorageExport()` function at the end of the file
      - Use raw SQL query (not EventsQueryBuilder) matching the pattern in traces.ts/scores.ts
      - Filter by time range (minTimestamp to maxTimestamp)
      - Use queryClickhouseStream directly
      - Return the stream directly (not wrapped in async generator)
  - `packages/shared/src/server/repositories/index.ts`: 
    - Export the new function (if not already exported via `export * from "./events"`)
- **Step Dependencies**: None
- **User Instructions**: None

### [x] Step 7: Update Blob Storage Integration Handler
- **Task**: Add Events table support to the blob storage integration handler so events can be exported to S3/S3-compatible storage on a schedule.
- **Files**:
  - `worker/src/features/blobstorage/handleBlobStorageIntegrationProjectJob.ts`: 
    - Add import: `getEventsForBlobStorageExport` from `@langfuse/shared/src/server`
    - Update `processBlobStorageExport` function signature: Add `"events"` to table type union
    - Add case in switch statement: `case "events"` that calls `getEventsForBlobStorageExport()`
- **Step Dependencies**: Step 6
- **User Instructions**: None

### [ ] Step 8: Add Tests for Blob Storage Integration
- **Task**: Add test cases to verify Events table export works in blob storage integration.
- **Files**:
  - `worker/src/__tests__/blobStorage.test.ts`: 
    - Add test case for events table export to blob storage (using Vitest)
    - Verify events are exported to S3
    - Test time range filtering
    - Mock external dependencies
- **Step Dependencies**: Step 7
- **User Instructions**: Run tests with: `pnpm run test --filter=worker -- blobStorage`

---

## Phase 2B: PostHog Integration (PR #3)

This PR adds events export support for PostHog scheduled integrations. Includes shared analytics foundation code that will also be used by Mixpanel.

### [x] Step 9: Add AnalyticsEventEvent Type
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

### [x] Step 10: Add Events Export Function for Analytics Integrations
- **Task**: Add `getEventsForAnalyticsIntegrations()` function to the events repository file. Follow the pattern of `getScoresForAnalyticsIntegrations()` in `scores.ts`.
- **Files**:
  - `packages/shared/src/server/repositories/events.ts`: 
    - Add `getEventsForAnalyticsIntegrations()` async generator function
      - Query ClickHouse for events with analytics-relevant fields
      - Transform raw records to `AnalyticsEventEvent` format in yield
      - Include URL construction using `env.NEXTAUTH_URL`
  - `packages/shared/src/server/repositories/index.ts`: 
    - Export the new function (if not already exported via `export * from "./events"`)
- **Step Dependencies**: Step 9 (needs AnalyticsEventEvent type)
- **User Instructions**: None

### [x] Step 11: Create PostHog Event Transformer
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
- **Step Dependencies**: Step 9 (needs AnalyticsEventEvent type)
- **User Instructions**: None

### [x] Step 12: Update PostHog Integration Handler
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
- **Step Dependencies**: Steps 10, 11
- **User Instructions**: None

### [x] Step 13: Add Tests for PostHog Integration
- **Task**: Add test cases to verify Events are sent to PostHog correctly.
- **Files**:
  - `worker/src/__tests__/posthogTransformers.test.ts`: 
    - Add test cases for `transformEventForPostHog` transformer
    - Verify transformer handles events with user_id
    - Verify transformer handles anonymous events
    - Verify UUID generation is consistent
- **Step Dependencies**: Step 12
- **User Instructions**: Run tests with: `pnpm run test --filter=worker -- posthogTransformers`

---

## Phase 2C: Mixpanel Integration (PR #4)

This PR adds events export support for Mixpanel scheduled integrations. Depends on Phase 2B (PostHog) being merged first for shared analytics foundation code.

### [x] Step 14: Create Mixpanel Event Transformer
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
- **Step Dependencies**: Phase 2B merged (needs AnalyticsEventEvent type and getEventsForAnalyticsIntegrations)
- **User Instructions**: None

### [x] Step 15: Update Mixpanel Integration Handler
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
- **Step Dependencies**: Step 14
- **User Instructions**: None

### [x] Step 16: Add Tests for Mixpanel Integration
- **Task**: Add test cases to verify Events are sent to Mixpanel correctly.
- **Files**:
  - `worker/src/__tests__/mixpanelTransformers.test.ts`: 
    - Add test cases for `transformEventForMixpanel` transformer
    - Verify transformer handles events with user_id
    - Verify transformer handles anonymous events
    - Verify insert ID generation is consistent
    - Verify session_id handling (mixpanel_session_id vs langfuse_session_id)
- **Step Dependencies**: Step 15
- **User Instructions**: Run tests with: `pnpm run test --filter=worker -- mixpanelTransformers`

---

## Summary

### PR Structure

| PR | Phase | Scope | Steps | Dependencies |
|----|-------|-------|-------|--------------|
| **PR #1** | Phase 1 | CSV Export | Steps 1-5 | None (COMPLETED) |
| **PR #2** | Phase 2A | S3/Blob Storage | Steps 6-8 | PR #1 merged |
| **PR #3** | Phase 2B | PostHog + Analytics Foundation | Steps 9-13 | PR #1 merged |
| **PR #4** | Phase 2C | Mixpanel | Steps 14-16 | PR #3 merged |

**Note**: PR #2 and PR #3 can be developed in parallel after PR #1 is merged, as they don't depend on each other.

### Key Considerations

1. **Backward Compatibility**: All changes are additive - no breaking changes to existing functionality
2. **Pattern Consistency**: Every implementation follows existing patterns from traces/observations/scores exports
3. **Type Safety**: Uses `AnalyticsEventEvent` type for analytics integrations, matching existing `AnalyticsTraceEvent`, `AnalyticsGenerationEvent`, `AnalyticsScoreEvent` patterns
4. **Streaming**: All exports use streaming to handle large datasets without memory issues
5. **Error Handling**: Follow existing error handling patterns in each handler
6. **Testing**: Worker tests use Vitest. All tests must be independent and not rely on shared state

### Dependencies Between PRs

```
PR #1 (CSV Export) ✓
    ↓
    ├── PR #2 (S3/Blob Storage)
    │
    └── PR #3 (PostHog + Analytics Foundation)
            ↓
            └── PR #4 (Mixpanel)
```

### File Modification Count Per PR

- **PR #1**: 6 files (completed)
- **PR #2**: 3 files (repository, handler, tests)
- **PR #3**: 5 files (types, repository, transformer, handler, tests)
- **PR #4**: 3 files (transformer, handler, tests)

### User Actions Required

- No manual database migrations needed
- No configuration changes required
- All code changes are self-contained
