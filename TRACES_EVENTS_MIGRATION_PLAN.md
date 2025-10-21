# Plan: Convert `/api/public/traces` to use Events Table

## Context
Following commit `3dc228ca3` pattern. Converting traces public API to aggregate from events table. Key insight: **Merge traces_agg and observation_stats into single aggregation** since both query events table grouped by trace_id.

## Changes Required

### 1. **Add Unified Events Aggregation to events.ts Repository**
   Location: `packages/shared/src/server/repositories/events.ts`

   Add after observations infrastructure:

   **Single unified CTE** combining trace + observation metrics:
   ```sql
   WITH events_agg AS (
     SELECT
       trace_id AS id,
       project_id,
       -- Trace-level fields (argMax pattern from eventsTracesAggregation)
       argMax(name, event_ts) AS name,
       min(start_time) as timestamp,
       argMax(environment, event_ts) AS environment,
       argMax(version, event_ts) AS version,
       argMax(session_id, event_ts) AS session_id,
       argMax(user_id, event_ts) AS user_id,
       argMax(input, event_ts) AS input,
       argMax(output, event_ts) AS output,
       argMax(metadata, event_ts) AS metadata,
       -- Observation metrics (when includeMetrics/includeObservations)
       sum(total_cost) as total_cost,
       date_diff('millisecond', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latency_milliseconds,
       groupUniqArray(span_id) as observation_ids,
       -- Timestamps
       min(created_at) AS created_at,
       max(updated_at) AS updated_at,
       -- Legacy fields
       array() AS tags,
       false AS bookmarked,
       false AS public,
       '' AS release
     FROM events
     WHERE project_id = {projectId: String}
       AND [filters applied here]
     GROUP BY trace_id, project_id
     ORDER BY timestamp DESC
   ),
   score_stats AS (
     -- Only if includeScores
     SELECT trace_id, project_id, groupUniqArray(id) as score_ids
     FROM scores
     WHERE project_id = {projectId: String} ...
     GROUP BY project_id, trace_id
   )
   SELECT ... FROM events_agg e
   LEFT JOIN score_stats s ON e.id = s.trace_id
   ```

   **Main query functions**:
   - `getTracesFromEventsTableForPublicApi()` - List with filtering, pagination, field selection
   - `getTracesCountFromEventsTableForPublicApi()` - Count distinct trace_ids
   - Internal: `getTracesFromEventsTableInternal<T>()` - Shared logic

   **Column mapping**:
   ```typescript
   const PUBLIC_API_TRACES_COLUMN_MAPPING: ApiColumnMapping[]
   ```

### 2. **Update Web API Layer**
   Location: `web/src/features/public-api/server/traces.ts`

   Dispatch based on `LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS` and `useEventsTable`,
   same as in `web/src/pages/api/public/observations/index.ts`
   - **`generateTracesForPublicApi()`**: Call `getTracesFromEventsTableForPublicApi()`
   - **`getTracesCountForPublicApi()`**: Call `getTracesCountFromEventsTableForPublicApi()`
   - Keep existing `filterParams` array (already correct)

### 3. **Export New Functions**
   Location: `packages/shared/src/server/index.ts`

   ```typescript
   export {
     getTracesFromEventsTableForPublicApi,
     getTracesCountFromEventsTableForPublicApi
   } from "./repositories/events"
   ```

### 4. **Testing**
	 - Update existing tests in `web/src/__tests__/async/traces-api.servertest.ts` to cover new code paths
	 - Copy the approach in `web/src/__tests__/async/observations-api.servertest.ts` where each test runs both old and new implementations based on the feature flag.

## Implementation Notes

- Use `deriveFilters()` with existing `filterParams` from traces.ts
- Apply filters in events WHERE clause before aggregation (more efficient)
- Conditionally include observation metrics fields based on `includeMetrics`/`includeObservations`
- Handle field groups (io, scores, observations, metrics)
- Scores still need separate CTE (different table)
- Support pagination and ordering on aggregated fields
- Rely on the `EventsQueryBuilder` and try avoid direct SQL.

## Files to Modify

1. `packages/shared/src/server/repositories/events.ts` - **Main implementation** (~300 lines)
2. `packages/shared/src/server/index.ts` - Export new functions
3. `web/src/features/public-api/server/traces.ts` - Simplify to repository calls
4. Tests may need updates
