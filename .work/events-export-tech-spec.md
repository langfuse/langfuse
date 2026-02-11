# Events Export Technical Specification

## 1. System Overview

### 1.1 Core Purpose and Value Proposition
This project implements scheduled export functionality for Langfuse's new unified `events` table in ClickHouse, enabling users to export event data to:
- **CSV/JSON/JSONL** files (Phase 1) - Direct download via export button
- **S3/S3-compatible storage** (Phase 2) - Scheduled automated exports
- **PostHog** (Phase 2) - Real-time analytics integration
- **Mixpanel** (Phase 2) - Product analytics integration

The events table is a denormalized table that replaces the legacy `traces` and `observations` tables, containing all trace data copied to each event row to eliminate JOINs.

### 1.2 Key Workflows

#### Phase 1: CSV Export Button
1. User clicks export button in events table UI
2. System validates RBAC permission (`batchExports:create`)
3. Creates `batchExport` record in PostgreSQL with status `QUEUED`
4. Queues job to BullMQ `BatchExportQueue`
5. Worker processes job:
   - Queries ClickHouse events table with filters
   - Streams data to avoid memory issues
   - Transforms to requested format (CSV/JSON/JSONL)
   - Uploads to S3
   - Updates record with signed URL
   - Sends email notification

#### Phase 2: Scheduled Integrations
1. Scheduler triggers integration job based on frequency (hourly/daily/weekly)
2. Worker processes job:
   - Queries events table for time range
   - Streams and transforms data
   - Uploads to destination (S3/PostHog/Mixpanel)
   - Updates `lastSyncAt` cursor for incremental exports

### 1.3 System Architecture

```
┌─────────────┐
│   Web App   │
│  (Next.js)  │
└──────┬──────┘
       │ tRPC
       ▼
┌─────────────────┐
│  PostgreSQL     │
│  - batch_exports│
│  - integrations │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐      ┌──────────────┐
│  Worker         │─────▶│  ClickHouse  │
│  (Express.js)   │◀─────│  (events)    │
└──────┬──────────┘      └──────────────┘
       │
       ▼
┌─────────────────┐
│  BullMQ Queues  │
│  - BatchExport  │
│  - Integrations │
└─────────────────┘
```

## 2. Project Structure

### 2.1 File Organization

```
packages/shared/
├── src/
│   ├── interfaces/
│   │   └── tableNames.ts                    # Add Events to BatchTableNames enum
│   ├── features/
│   │   └── batchExport/
│   │       └── types.ts                      # Already uses BatchTableNames
│   ├── server/
│   │   ├── analytics-integrations/
│   │   │   └── types.ts                      # Add AnalyticsEventEvent type
│   │   ├── repositories/
│   │   │   └── events.ts                     # Add getEventsForBlobStorageExport, getEventsForAnalyticsIntegrations
│   │   ├── queries/
│   │   │   └── clickhouse-sql/
│   │   │       └── event-query-builder.ts    # Use for query construction
│   └── eventsTable.ts                        # Column definitions

worker/
├── src/
│   ├── features/
│   │   ├── batchExport/
│   │   │   └── handleBatchExportJob.ts       # Add Events case
│   │   ├── database-read-stream/
│   │   │   └── event-stream.ts              # NEW: getEventsStream
│   │   ├── blobstorage/
│   │   │   └── handleBlobStorageIntegrationProjectJob.ts  # Add events case
│   │   ├── posthog/
│   │   │   ├── handlePostHogIntegrationProjectJob.ts     # Add events processing
│   │   │   └── transformers.ts              # Add transformEventToPostHogEvent
│   │   └── mixpanel/
│   │       ├── handleMixpanelIntegrationProjectJob.ts    # Add events processing
│   │       └── transformers.ts              # Add transformEventToMixpanelEvent
│   └── __tests__/
│       └── event-stream.test.ts              # NEW: Unit tests

web/
├── src/
│   ├── features/
│   │   └── batch-exports/
│   │       └── server/
│   │           └── batchExport.ts            # Already supports all tables
│   └── components/
│       └── BatchExportTableButton.tsx        # Add Events warning message
```

## 3. Feature Specification

### 3.1 Phase 1: CSV Export Button

#### 3.1.1 User Story
As a user, I want to export events from the events table to CSV/JSON/JSONL format so I can analyze the data offline.

#### 3.1.2 Requirements
- Export button in events table UI (matches existing traces/observations pattern)
- Support current filter state from the table
- Support CSV, JSON, JSONL formats
- Respect RBAC permissions (`batchExports:create`)
- Handle large datasets via streaming
- Email notification when export is ready

#### 3.1.3 Implementation Steps

##### Step 1: Add Events to BatchTableNames Enum
**File**: `packages/shared/src/interfaces/tableNames.ts`

```typescript
export enum BatchTableNames {
  Scores = "scores",
  Sessions = "sessions",
  Traces = "traces",
  Observations = "observations",
  Events = "events",  // NEW
  DatasetRunItems = "dataset_run_items",
  DatasetItems = "dataset_items",
  AuditLogs = "audit_logs",
}
```

##### Step 2: Create Events Stream Function
**File**: `worker/src/features/database-read-stream/event-stream.ts` (NEW)

```typescript
import {
  FilterCondition,
  TracingSearchType,
  orderBy,
} from "@langfuse/shared";
import {
  queryClickhouseStream,
  logger,
  FilterList,
  createFilterFromFilterState,
  eventsTableUiColumnDefinitions,
  clickhouseSearchCondition,
  orderByToClickhouseSql,
} from "@langfuse/shared/src/server";
import { Readable } from "stream";
import { env } from "../../env";
import { fetchCommentsForExport } from "./fetchCommentsForExport";
import { EventsQueryBuilder } from "@langfuse/shared/src/server/queries/clickhouse-sql/event-query-builder";
import { convertDateToClickhouseDateTime } from "@langfuse/shared/src/server/clickhouse/client";

const BATCH_SIZE = 1000; // Fetch comments in batches

export type EventRecord = {
  id: string;
  trace_id: string;
  project_id: string;
  start_time: Date;
  end_time: Date | null;
  name: string | null;
  type: string;
  environment: string | null;
  version: string | null;
  user_id: string | null;
  session_id: string | null;
  level: string;
  status_message: string | null;
  prompt_name: string | null;
  model_id: string | null;
  provided_model_name: string | null;
  model_parameters: unknown;
  usage_details: Record<string, unknown>;
  cost_details: Record<string, unknown>;
  total_cost: number | null;
  input: unknown;
  output: unknown;
  metadata: Record<string, unknown>;
  latency: number | null;
  time_to_first_token: number | null;
  // ... all other fields from eventsTableCols
};

export const getEventsStream = async (props: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  orderBy?: orderBy;
  rowLimit?: number;
}): Promise<Readable> => {
  const {
    projectId,
    cutoffCreatedAt,
    filter = [],
    searchQuery,
    searchType,
    orderBy: orderByState,
    rowLimit = env.BATCH_EXPORT_ROW_LIMIT,
  } = props;

  const clickhouseConfigs = {
    request_timeout: 180_000, // 3 minutes
    clickhouse_settings: {
      join_algorithm: "partial_merge" as const,
      http_send_timeout: 300,
      http_receive_timeout: 300,
    },
  };

  // Build filters using EventsQueryBuilder
  const observationsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  // Add timestamp cutoff filter
  observationsFilter.push(
    ...createFilterFromFilterState(
      [
        {
          column: "startTime",
          operator: "<" as const,
          value: cutoffCreatedAt,
          type: "datetime" as const,
        },
      ],
      eventsTableUiColumnDefinitions,
    ),
  );

  const appliedFilter = observationsFilter.apply();
  const search = clickhouseSearchCondition(
    searchQuery,
    searchType,
    "e",
    ["span_id", "name", "user_id", "session_id", "trace_id"],
  );

  // Build query using EventsQueryBuilder
  const queryBuilder = new EventsQueryBuilder({ projectId })
    .selectFieldSet("base", "calculated", "io", "metadata")
    .selectIO(false) // Full I/O for exports (no truncation)
    .where(appliedFilter)
    .where(search);

  // Add order by
  if (orderByState) {
    const chOrderBy = orderByToClickhouseSql(
      [orderByState],
      eventsTableUiColumnDefinitions,
    );
    queryBuilder.orderBy(chOrderBy);
  } else {
    // Default ordering
    queryBuilder.orderBy(
      "ORDER BY e.start_time DESC, xxHash32(e.trace_id) DESC, e.span_id DESC",
    );
  }

  queryBuilder.limit(rowLimit, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const asyncGenerator = queryClickhouseStream<EventRecord>({
    query,
    params: {
      ...params,
      ...search.params,
    },
    clickhouseConfigs,
    tags: {
      feature: "batch-export",
      type: "event",
      kind: "export",
      projectId,
    },
  });

  // Helper function to process a single event row
  const processEventRow = (
    bufferedRow: EventRecord,
    commentsByEvent: Map<string, any[]>,
  ) => {
    return {
      ...bufferedRow,
      comments: commentsByEvent.get(bufferedRow.id) ?? [],
    };
  };

  // Convert async generator to Node.js Readable stream
  let recordsProcessed = 0;

  return Readable.from(
    (async function* () {
      let rowBuffer: EventRecord[] = [];
      let eventIds: string[] = [];

      for await (const row of asyncGenerator) {
        rowBuffer.push(row);
        eventIds.push(row.id);

        // Process in batches
        if (rowBuffer.length >= BATCH_SIZE) {
          // Fetch comments for this batch (events are observations)
          const commentsByEvent = await fetchCommentsForExport(
            projectId,
            "OBSERVATION",
            eventIds,
          );

          // Process each row in the buffer
          for (const bufferedRow of rowBuffer) {
            recordsProcessed++;
            if (recordsProcessed % 10000 === 0) {
              logger.info(
                `Streaming events for project ${projectId}: processed ${recordsProcessed} rows`,
              );
            }

            yield processEventRow(bufferedRow, commentsByEvent);
          }

          // Reset buffers
          rowBuffer = [];
          eventIds = [];
        }
      }

      // Process remaining rows in buffer
      if (rowBuffer.length > 0) {
        const commentsByEvent = await fetchCommentsForExport(
          projectId,
          "OBSERVATION",
          eventIds,
        );

        for (const bufferedRow of rowBuffer) {
          recordsProcessed++;
          if (recordsProcessed % 10000 === 0) {
            logger.info(
              `Streaming events for project ${projectId}: processed ${recordsProcessed} rows`,
            );
          }

          yield processEventRow(bufferedRow, commentsByEvent);
        }
      }
    })(),
  );
};
```

**Key Implementation Details**:
- Uses `EventsQueryBuilder` for consistent query construction
- Fetches comments in batches of 1000 for efficiency
- Streams data to avoid memory issues with large datasets
- Logs progress every 10,000 rows
- Uses `OBSERVATION` as comment object type (events are observations)

##### Step 3: Update Batch Export Worker Handler
**File**: `worker/src/features/batchExport/handleBatchExportJob.ts`

Add import:
```typescript
import { getEventsStream } from "../database-read-stream/event-stream";
```

Modify stream selection logic (around line 130):
```typescript
const dbReadStream =
  parsedQuery.data.tableName === BatchExportTableName.Observations
    ? await getObservationStream({
        projectId,
        cutoffCreatedAt: jobDetails.createdAt,
        ...parsedQuery.data,
      })
    : parsedQuery.data.tableName === BatchExportTableName.Traces
      ? await getTraceStream({
          projectId,
          cutoffCreatedAt: jobDetails.createdAt,
          ...parsedQuery.data,
        })
      : parsedQuery.data.tableName === BatchExportTableName.Events
        ? await getEventsStream({
            projectId,
            cutoffCreatedAt: jobDetails.createdAt,
            ...parsedQuery.data,
          })
        : await getDatabaseReadStreamPaginated({
            projectId,
            cutoffCreatedAt: jobDetails.createdAt,
            ...parsedQuery.data,
          });
```

##### Step 4: Update UI Export Button
**File**: `web/src/components/BatchExportTableButton.tsx`

Add warning message for Events table (around line 76):
```typescript
const getWarningMessage = () => {
  switch (props.tableName) {
    case BatchTableNames.Traces:
      return "Note: Filters on observation-level columns (Level, Tokens, Cost, Latency) and Comments are not included in trace exports. You may receive more data than expected.";
    case BatchTableNames.Observations:
      return "Note: Filters on trace-level columns (Trace Name, Trace Tags, User ID, Trace Environment) and Comments are not included in observation exports. You may receive more data than expected.";
    case BatchTableNames.Events:
      return "Note: Filters on Comments are not included in event exports. You may receive more data than expected.";
    case BatchTableNames.Sessions:
      return "Note: Filters on Comments are not included in session exports. You may receive more data than expected.";
    case BatchTableNames.AuditLogs:
      return "Note: Filters are not applied to audit log exports. All audit logs for this project will be exported.";
    default:
      return null;
  }
};
```

**Note**: The existing `BatchExportTableButton` component already supports all table names via the `BatchTableNames` enum, so no other changes are needed. The component will automatically work once `Events` is added to the enum.

#### 3.1.4 Error Handling and Edge Cases

**Large Dataset Handling**:
- Use streaming to avoid memory exhaustion
- Set ClickHouse timeouts appropriately (180s request, 300s HTTP)
- Log progress every 10,000 rows for monitoring

**Filter Edge Cases**:
- Comments are fetched separately and may not match all filters
- Warn users that comment filters are not applied

**Empty Results**:
- Handle gracefully - create empty file and return signed URL
- No special error handling needed

**ClickHouse Connection Issues**:
- Retry logic handled by ClickHouse client
- Mark export as FAILED if query fails after retries

### 3.2 Phase 2: Scheduled Integrations

#### 3.2.1 S3/Blob Storage Integration

##### User Story
As a user, I want to schedule automatic exports of events to S3/S3-compatible storage so I can build data pipelines.

##### Requirements
- Support hourly, daily, weekly export frequencies
- Support JSON, CSV, JSONL file formats
- Support FULL_HISTORY, FROM_TODAY, FROM_CUSTOM_DATE export modes
- Chunked historical exports (one frequency period per job)
- Encrypted storage of S3 credentials

##### Implementation Steps

**Step 1: Add AnalyticsEventEvent Type**
**File**: `packages/shared/src/server/analytics-integrations/types.ts`

Add type at end of file (following existing `AnalyticsTraceEvent`, `AnalyticsGenerationEvent`, `AnalyticsScoreEvent` pattern):

```typescript
export type AnalyticsEventEvent = {
  langfuse_id: unknown;
  timestamp: unknown;
  langfuse_event_name?: unknown;
  langfuse_trace_name?: unknown;
  langfuse_trace_id?: unknown;
  langfuse_url?: unknown;
  langfuse_user_url?: unknown;
  langfuse_cost_usd?: unknown;
  langfuse_input_units?: unknown;
  langfuse_output_units?: unknown;
  langfuse_total_units?: unknown;
  langfuse_session_id?: unknown;
  langfuse_project_id?: unknown;
  langfuse_user_id?: unknown;
  langfuse_latency?: unknown;
  langfuse_time_to_first_token?: unknown;
  langfuse_release?: unknown;
  langfuse_version?: unknown;
  langfuse_model?: unknown;
  langfuse_level?: unknown;
  langfuse_type?: unknown;
  langfuse_tags?: unknown;
  langfuse_environment?: unknown;
  langfuse_event_version?: unknown;
  posthog_session_id?: unknown;
  mixpanel_session_id?: unknown;
};
```

**Step 2: Add Events Export Functions**
**File**: `packages/shared/src/server/repositories/events.ts`

Add functions at the end of the file (following the pattern of `getScoresForBlobStorageExport` and `getScoresForAnalyticsIntegrations` in `scores.ts`):

```typescript
import { queryClickhouseStream } from "./clickhouse";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { env } from "../../env";
import type { AnalyticsEventEvent } from "../analytics-integrations/types";

/**
 * Streams events from ClickHouse for blob storage export.
 * Follows the pattern of getTracesForBlobStorageExport and getScoresForBlobStorageExport.
 */
export const getEventsForBlobStorageExport = function (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const query = `
    SELECT
      span_id as id,
      trace_id,
      project_id,
      start_time,
      end_time,
      name,
      type,
      environment,
      version,
      user_id,
      session_id,
      level,
      status_message,
      prompt_name,
      prompt_id,
      prompt_version,
      model_id,
      provided_model_name,
      model_parameters,
      usage_details,
      cost_details,
      total_cost,
      input,
      output,
      mapFromArrays(metadata_names, metadata_values) as metadata,
      if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time)) as latency_ms,
      if(isNull(completion_start_time), NULL, date_diff('millisecond', start_time, completion_start_time)) as time_to_first_token_ms,
      tags,
      release,
      trace_name,
      parent_span_id
    FROM events FINAL
    WHERE project_id = {projectId: String}
    AND start_time >= {minTimestamp: DateTime64(3)}
    AND start_time <= {maxTimestamp: DateTime64(3)}
  `;

  return queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
    },
    tags: {
      feature: "blobstorage",
      type: "event",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
    },
  });
};

/**
 * Streams events from ClickHouse for analytics integrations (PostHog, Mixpanel).
 * Transforms raw ClickHouse records to AnalyticsEventEvent format.
 * Follows the pattern of getTracesForAnalyticsIntegrations and getScoresForAnalyticsIntegrations.
 */
export const getEventsForAnalyticsIntegrations = async function* (
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
) {
  const query = `
    SELECT
      span_id as id,
      trace_id,
      start_time,
      name,
      type,
      environment,
      version,
      user_id,
      session_id,
      level,
      provided_model_name,
      total_cost,
      usage_details,
      tags,
      release,
      trace_name,
      if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time) / 1000) as latency,
      if(isNull(completion_start_time), NULL, date_diff('millisecond', start_time, completion_start_time) / 1000) as time_to_first_token,
      metadata['$posthog_session_id'] as posthog_session_id,
      metadata['$mixpanel_session_id'] as mixpanel_session_id
    FROM events FINAL
    WHERE project_id = {projectId: String}
    AND start_time >= {minTimestamp: DateTime64(3)}
    AND start_time <= {maxTimestamp: DateTime64(3)}
  `;

  const records = queryClickhouseStream<Record<string, unknown>>({
    query,
    params: {
      projectId,
      minTimestamp: convertDateToClickhouseDateTime(minTimestamp),
      maxTimestamp: convertDateToClickhouseDateTime(maxTimestamp),
    },
    tags: {
      feature: "analytics-integration",
      type: "event",
      kind: "analytic",
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS,
    },
  });

  const baseUrl = env.NEXTAUTH_URL?.replace("/api/auth", "");
  for await (const record of records) {
    yield {
      timestamp: record.start_time,
      langfuse_id: record.id,
      langfuse_event_name: record.name,
      langfuse_trace_name: record.trace_name,
      langfuse_trace_id: record.trace_id,
      langfuse_url: `${baseUrl}/project/${projectId}/traces/${record.trace_id}?observationId=${record.id}`,
      langfuse_user_url: record.user_id
        ? `${baseUrl}/project/${projectId}/users/${encodeURIComponent(record.user_id as string)}`
        : undefined,
      langfuse_cost_usd: record.total_cost,
      langfuse_input_units: (record.usage_details as Record<string, unknown>)?.input ?? null,
      langfuse_output_units: (record.usage_details as Record<string, unknown>)?.output ?? null,
      langfuse_total_units: (record.usage_details as Record<string, unknown>)?.total ?? null,
      langfuse_session_id: record.session_id,
      langfuse_project_id: projectId,
      langfuse_user_id: record.user_id,
      langfuse_latency: record.latency,
      langfuse_time_to_first_token: record.time_to_first_token,
      langfuse_release: record.release,
      langfuse_version: record.version,
      langfuse_model: record.provided_model_name,
      langfuse_level: record.level,
      langfuse_type: record.type,
      langfuse_tags: record.tags,
      langfuse_environment: record.environment,
      langfuse_event_version: "1.0.0",
      posthog_session_id: record.posthog_session_id ?? null,
      mixpanel_session_id: record.mixpanel_session_id ?? null,
    } satisfies AnalyticsEventEvent;
  }
};
```

**Note**: The functions are auto-exported via the following chain (already in place):
- `packages/shared/src/server/repositories/index.ts` exports `export * from "./events"` (line 4)
- `packages/shared/src/server/index.ts` exports `export * from "./repositories"` (line 94)
- `packages/shared/src/server/index.ts` exports `export * from "./analytics-integrations/types"` (line 120) - includes `AnalyticsEventEvent`

No additional export configuration needed.

**Step 3: Update Blob Storage Worker Handler**
**File**: `worker/src/features/blobstorage/handleBlobStorageIntegrationProjectJob.ts`

Add import:
```typescript
import {
  getEventsForBlobStorageExport,
} from "@langfuse/shared/src/server";
```

Modify `processBlobStorageExport` function signature (around line 146):
```typescript
const processBlobStorageExport = async (config: {
  // ... existing config
  table: "traces" | "observations" | "scores" | "events";  // MODIFY
  // ...
}) => {
```

Add case in switch statement (around line 192):
```typescript
switch (config.table) {
  case "traces":
    dataStream = getTracesForBlobStorageExport(
      config.projectId,
      config.minTimestamp,
      config.maxTimestamp,
    );
    break;
  case "observations":
    dataStream = getObservationsForBlobStorageExport(
      config.projectId,
      config.minTimestamp,
      config.maxTimestamp,
    );
    break;
  case "scores":
    dataStream = getScoresForBlobStorageExport(
      config.projectId,
      config.minTimestamp,
      config.maxTimestamp,
    );
    break;
  case "events":  // NEW
    dataStream = getEventsForBlobStorageExport(
      config.projectId,
      config.minTimestamp,
      config.maxTimestamp,
    );
    break;
  default:
    throw new Error(`Unsupported table type: ${config.table}`);
}
```

**Note**: The blob storage integration UI already supports selecting tables, so adding "events" to the enum will automatically make it available in the UI.

#### 3.2.2 PostHog Integration

##### User Story
As a user, I want to automatically send events to PostHog so I can analyze them alongside other product analytics.

##### Requirements
- Stream events to PostHog via SDK
- Transform events to PostHog event format
- Maintain `lastSyncAt` cursor for incremental exports
- Handle PostHog API errors gracefully
- Batch events for efficient transmission

##### Implementation Steps

**Step 1: Use Events Query Function**
**Note**: The `getEventsForAnalyticsIntegrations` function is already added to `packages/shared/src/server/repositories/events.ts` in Step 1 of S3/Blob Storage Integration above.

**Step 2: Create Events Transformer**
**File**: `worker/src/features/posthog/transformers.ts`

Add function (following the pattern of `transformTraceForPostHog`, `transformGenerationForPostHog`, `transformScoreForPostHog`):
```typescript
import { v5 } from "uuid";
import type { AnalyticsEventEvent } from "@langfuse/shared/src/server";

// UUID v5 namespace for PostHog (reuse existing constant in file)
const POSTHOG_UUID_NAMESPACE = "0f6c91df-d035-4813-b838-9741ba38ef0b";

export const transformEventForPostHog = (
  event: AnalyticsEventEvent,
  projectId: string,
): PostHogEvent => {
  const uuid = v5(`${projectId}-${event.langfuse_id}`, POSTHOG_UUID_NAMESPACE);

  // Extract session IDs and exclude from properties
  const { posthog_session_id, mixpanel_session_id, ...otherProps } = event;

  return {
    distinctId: event.langfuse_user_id
      ? (event.langfuse_user_id as string)
      : uuid,
    event: "langfuse event",
    properties: {
      ...otherProps,
      $session_id: posthog_session_id ?? null,
      // PostHog-specific: add user profile enrichment or mark as anonymous
      ...(event.langfuse_user_id && event.langfuse_user_url
        ? {
            $set: {
              langfuse_user_url: event.langfuse_user_url,
            },
          }
        : // Capture as anonymous PostHog event (cheaper/faster)
          // https://posthog.com/docs/data/anonymous-vs-identified-events?tab=Backend
          { $process_person_profile: false }),
    },
    timestamp: event.timestamp as Date,
    uuid,
  };
};
```

**Step 3: Update Worker Handler**
**File**: `worker/src/features/posthog/handlePostHogIntegrationProjectJob.ts`

Add import:
```typescript
import {
  getEventsForAnalyticsIntegrations,
} from "@langfuse/shared/src/server";
import { transformEventForPostHog } from "./transformers";
```

Add processing function (after `processPostHogScores`, following the exact pattern):
```typescript
const processPostHogEvents = async (config: PostHogExecutionConfig) => {
  const events = getEventsForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(`Sending events for project ${config.projectId} to PostHog`);

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
    ...postHogSettings,
  });

  posthog.on("error", (error) => {
    logger.error(
      `Error sending events to PostHog for project ${config.projectId}: ${error}`,
    );
    throw new Error(
      `Error sending events to PostHog for project ${config.projectId}: ${error}`,
    );
  });

  let count = 0;
  for await (const event of events) {
    count++;
    const postHogEvent = transformEventForPostHog(event, config.projectId);
    posthog.capture(postHogEvent);
    if (count % 10000 === 0) {
      await posthog.flush();
      logger.info(
        `Sent ${count} events to PostHog for project ${config.projectId}`,
      );
    }
  }
  await posthog.flush();
  logger.info(
    `Sent ${count} events to PostHog for project ${config.projectId}`,
  );
};
```

Update main handler to include events (around line 169):
```typescript
await Promise.all([
  processPostHogTraces(executionConfig),
  processPostHogGenerations(executionConfig),
  processPostHogScores(executionConfig),
  processPostHogEvents(executionConfig),  // NEW
]);
```

#### 3.2.3 Mixpanel Integration

##### User Story
As a user, I want to automatically send events to Mixpanel so I can analyze them in my product analytics dashboard.

##### Requirements
- Stream events to Mixpanel via custom client
- Transform events to Mixpanel event format
- Maintain `lastSyncAt` cursor for incremental exports
- Handle Mixpanel API errors gracefully
- Batch events for efficient transmission

##### Implementation Steps

**Step 1: Create Events Transformer**
**File**: `worker/src/features/mixpanel/transformers.ts`

Add function (following the pattern of `transformTraceForMixpanel`, `transformGenerationForMixpanel`, `transformScoreForMixpanel`):
```typescript
import { v5 } from "uuid";
import type { AnalyticsEventEvent } from "@langfuse/shared/src/server";

// UUID v5 namespace for Mixpanel (reuse existing constant in file)
const MIXPANEL_UUID_NAMESPACE = "8f7c3e42-9a1b-4d5f-8e2a-1c6b9d3f4e7a";

export const transformEventForMixpanel = (
  event: AnalyticsEventEvent,
  projectId: string,
): MixpanelEvent => {
  const insertId = v5(
    `${projectId}-${event.langfuse_id}`,
    MIXPANEL_UUID_NAMESPACE,
  );

  // Extract session IDs and exclude from properties
  const { posthog_session_id, mixpanel_session_id, ...otherProps } = event;

  return {
    event: "[Langfuse] Event",
    properties: {
      time: new Date(event.timestamp as Date).getTime(),
      distinct_id: event.langfuse_user_id
        ? (event.langfuse_user_id as string)
        : insertId,
      $insert_id: insertId,
      ...(event.langfuse_user_id
        ? { $user_id: event.langfuse_user_id as string }
        : {}),
      session_id:
        mixpanel_session_id || event.langfuse_session_id
          ? (mixpanel_session_id as string) ||
            (event.langfuse_session_id as string)
          : undefined,
      ...otherProps,
    },
  };
};
```

**Step 2: Update Worker Handler**
**File**: `worker/src/features/mixpanel/handleMixpanelIntegrationProjectJob.ts`

Add import:
```typescript
import {
  getEventsForAnalyticsIntegrations,
} from "@langfuse/shared/src/server";
import { transformEventForMixpanel } from "./transformers";
```

Add processing function (after `processMixpanelScores`, following the exact pattern):
```typescript
const processMixpanelEvents = async (config: MixpanelExecutionConfig) => {
  const events = getEventsForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(`Sending events for project ${config.projectId} to Mixpanel`);

  const mixpanel = new MixpanelClient({
    projectToken: config.decryptedMixpanelProjectToken,
    region: config.mixpanelRegion,
  });

  let count = 0;
  for await (const event of events) {
    count++;
    const mixpanelEvent = transformEventForMixpanel(event, config.projectId);
    mixpanel.addEvent(mixpanelEvent);

    if (count % 1000 === 0) {
      await mixpanel.flush();
      logger.info(
        `Sent ${count} events to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await mixpanel.flush();
  logger.info(
    `Sent ${count} events to Mixpanel for project ${config.projectId}`,
  );
};
```

Update main handler to include events (around line 169):
```typescript
await Promise.all([
  processMixpanelTraces(executionConfig),
  processMixpanelGenerations(executionConfig),
  processMixpanelScores(executionConfig),
  processMixpanelEvents(executionConfig),  // NEW
]);
```

## 4. Database Schema

### 4.1 Existing Tables (No Changes Required)

#### 4.1.1 batch_exports Table
**Location**: `packages/shared/prisma/schema.prisma`

```prisma
model BatchExport {
  id          String   @id @default(uuid())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  projectId   String
  userId      String
  finishedAt  DateTime?
  expiresAt   DateTime?
  name        String
  status      BatchExportStatus
  query       Json     // Contains tableName, filter, searchQuery, etc.
  format      BatchExportFileFormat
  url         String?
  log         String?

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id])

  @@index([projectId])
  @@index([status])
}
```

**Note**: No schema changes needed - the `query` JSON field already supports any table name via `BatchTableNames` enum.

#### 4.1.2 blob_storage_integrations Table
**Location**: `packages/shared/prisma/schema.prisma`

```prisma
model BlobStorageIntegration {
  id              String   @id @default(uuid())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  projectId       String   @unique
  enabled         Boolean  @default(false)
  bucketName      String
  endpoint        String?
  region          String   @default("auto")
  accessKeyId     String?
  encryptedSecretAccessKey String?
  prefix          String?
  forcePathStyle  Boolean  @default(false)
  type            BlobStorageType
  fileType        BlobStorageFileType
  exportMode      BlobStorageExportMode
  exportFrequency BlobStorageExportFrequency
  customStartDate DateTime?
  lastSyncAt      DateTime?
  nextSyncAt      DateTime?

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([enabled, nextSyncAt])
}
```

**Note**: No schema changes needed - the integration already supports table selection via configuration.

#### 4.1.3 posthog_integrations Table
**Location**: `packages/shared/prisma/schema.prisma`

```prisma
model PostHogIntegration {
  id                      String   @id @default(uuid())
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  projectId               String   @unique
  enabled                 Boolean  @default(false)
  encryptedPostHogApiKey  String
  posthogHostName         String
  lastSyncAt              DateTime?

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([enabled])
}
```

**Note**: No schema changes needed - events will be processed alongside traces/generations/scores.

#### 4.1.4 mixpanel_integrations Table
**Location**: `packages/shared/prisma/schema.prisma`

```prisma
model MixpanelIntegration {
  id                           String   @id @default(uuid())
  createdAt                    DateTime @default(now())
  updatedAt                    DateTime @updatedAt
  projectId                    String   @unique
  enabled                      Boolean  @default(false)
  encryptedMixpanelProjectToken String
  mixpanelRegion              String
  lastSyncAt                   DateTime?

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([enabled])
}
```

**Note**: No schema changes needed - events will be processed alongside traces/generations/scores.

### 4.2 ClickHouse Events Table
**Location**: `packages/shared/clickhouse/scripts/dev-tables.sh`

The events table is already created and contains all necessary columns. Key characteristics:
- **Engine**: ReplacingMergeTree with `event_ts` and `is_deleted` versioning
- **Partitioning**: Monthly by `start_time`
- **Primary Key**: `(project_id, start_time, xxHash32(trace_id))`
- **Denormalized**: All trace data copied to each event row

**No schema changes required** - the table already supports all export use cases.

## 5. Server Actions

### 5.1 Database Actions

#### 5.1.1 Create Batch Export
**Location**: `web/src/features/batch-exports/server/batchExport.ts`

**Action**: Create batch export record and queue job
- **Input**: `CreateBatchExportSchema` (projectId, name, query, format)
- **Process**:
  1. Validate RBAC permission (`batchExports:create`)
  2. Create `batchExport` record in PostgreSQL with status QUEUED
  3. Create audit log entry
  4. Queue job to `BatchExportQueue`
- **Return**: BatchExport record

**SQL Operations**:
```sql
INSERT INTO batch_exports (id, project_id, user_id, status, name, format, query, created_at)
VALUES (?, ?, ?, 'QUEUED', ?, ?, ?::jsonb, NOW())
```

#### 5.1.2 Process Batch Export Job
**Location**: `worker/src/features/batchExport/handleBatchExportJob.ts`

**Action**: Process BullMQ job
- **Input**: Job payload with `batchExportId` and `projectId`
- **Process**:
  1. Fetch batch export record from PostgreSQL
  2. Check status (skip if CANCELLED or old)
  3. Update status to PROCESSING
  4. Parse query and select appropriate stream function
  5. Stream data from ClickHouse
  6. Transform to requested format
  7. Upload to S3 via StorageServiceFactory
  8. Update record with signed URL and COMPLETED status
  9. Send email notification
- **Error Handling**: Mark as FAILED on error, log error message

#### 5.1.3 Get Events Stream
**Location**: `worker/src/features/database-read-stream/event-stream.ts`

**Action**: Query ClickHouse events table
- **Input**: projectId, cutoffCreatedAt, filter, searchQuery, searchType, orderBy, rowLimit
- **Process**:
  1. Build query using EventsQueryBuilder
  2. Apply filters and search conditions
  3. Execute streaming query via `queryClickhouseStream`
  4. Fetch comments in batches
  5. Yield event records as AsyncGenerator
- **Return**: Node.js Readable stream

**ClickHouse Query Pattern**:
```sql
SELECT 
  e.span_id as id,
  e.trace_id,
  e.start_time,
  -- ... all exportable fields
FROM events e
WHERE e.project_id = {projectId: String}
  AND e.start_time < {cutoffCreatedAt: DateTime64(3)}
  -- ... additional filters
ORDER BY e.start_time DESC
LIMIT {rowLimit: Int64}
```

#### 5.1.4 Process Blob Storage Integration
**Location**: `worker/src/features/blobstorage/handleBlobStorageIntegrationProjectJob.ts`

**Action**: Process scheduled blob storage export
- **Input**: Job payload with `projectId`
- **Process**:
  1. Fetch blob storage integration configuration
  2. Determine time range based on `lastSyncAt` and frequency
  3. For each table (traces, observations, scores, events):
     - Stream data from ClickHouse
     - Transform to requested format
     - Upload to S3
  4. Update `lastSyncAt` and `nextSyncAt`
- **Error Handling**: Log errors, continue with other tables

#### 5.1.5 Process PostHog Integration
**Location**: `worker/src/features/posthog/handlePostHogIntegrationProjectJob.ts`

**Action**: Process scheduled PostHog export
- **Input**: Job payload with `projectId`
- **Process**:
  1. Fetch PostHog integration configuration
  2. Determine time range based on `lastSyncAt`
  3. For each data type (traces, generations, scores, events):
     - Stream data from ClickHouse
     - Transform to PostHog event format
     - Send via PostHog SDK
  4. Update `lastSyncAt`
- **Error Handling**: Log errors, continue with other data types

#### 5.1.6 Process Mixpanel Integration
**Location**: `worker/src/features/mixpanel/handleMixpanelIntegrationProjectJob.ts`

**Action**: Process scheduled Mixpanel export
- **Input**: Job payload with `projectId`
- **Process**:
  1. Fetch Mixpanel integration configuration
  2. Determine time range based on `lastSyncAt`
  3. For each data type (traces, generations, scores, events):
     - Stream data from ClickHouse
     - Transform to Mixpanel event format
     - Send via Mixpanel client
  4. Update `lastSyncAt`
- **Error Handling**: Log errors, continue with other data types

### 5.2 Other Actions

#### 5.2.1 S3 Upload
**Location**: `packages/shared/src/server/storage/StorageServiceFactory.ts`

**Action**: Upload file to S3
- **Input**: fileName, fileType, data (stream), partSize
- **Process**:
  1. Create multipart upload
  2. Stream data in chunks
  3. Complete multipart upload
  4. Generate signed URL
- **Return**: Signed URL with expiration

#### 5.2.2 Email Notification
**Location**: `packages/shared/src/server/email/sendBatchExportSuccessEmail.ts`

**Action**: Send email when export completes
- **Input**: user email, export name, download URL
- **Process**: Send email via email service
- **Error Handling**: Log errors, don't fail export

## 6. Design System

### 6.1 Visual Style
No new UI components required - existing `BatchExportTableButton` component will automatically support Events table once enum is updated.

### 6.2 Core Components

#### 6.2.1 BatchExportTableButton
**Location**: `web/src/components/BatchExportTableButton.tsx`

**Props Interface**:
```typescript
export type BatchExportTableButtonProps = {
  projectId: string;
  tableName: BatchExportTableName;  // Now includes Events
  orderByState: OrderByState;
  filterState: any;
  searchQuery?: any;
  searchType?: any;
};
```

**Usage**: Already supports all table names via enum - no changes needed except warning message.

## 7. Component Architecture

### 7.1 Server Components
No new server components required.

### 7.2 Client Components
No new client components required - existing `BatchExportTableButton` handles all export functionality.

## 8. Authentication & Authorization

### 8.1 RBAC Implementation

#### 8.1.1 Batch Export Permission
**Scope**: `batchExports:create`
**Location**: `web/src/features/batch-exports/server/batchExport.ts`

**Check**: Validated via `throwIfNoProjectAccess` before creating export.

#### 8.1.2 Integration Permissions
**Scope**: `integrations:CRUD`
**Location**: Integration configuration pages

**Check**: Validated before creating/updating integrations.

### 8.2 Audit Logging
All configuration changes logged via `auditLog()`:
- Batch export creation
- Integration configuration changes

## 9. Data Flow

### 9.1 CSV Export Flow

```
User clicks export button
  ↓
tRPC batchExport.create
  ↓
Validate RBAC (batchExports:create)
  ↓
Create batchExport record (QUEUED)
  ↓
Queue BullMQ job
  ↓
Worker: handleBatchExportJob
  ↓
getEventsStream() → ClickHouse query
  ↓
Stream data → Transform (CSV/JSON/JSONL)
  ↓
Upload to S3
  ↓
Update batchExport (COMPLETED, URL)
  ↓
Send email notification
```

### 9.2 Scheduled Integration Flow

```
Scheduler triggers job
  ↓
Worker: handleBlobStorageIntegrationProjectJob
  ↓
Fetch integration config
  ↓
Determine time range (lastSyncAt → now)
  ↓
For each table (traces, observations, scores, events):
  ↓
  Stream from ClickHouse
  ↓
  Transform to format
  ↓
  Upload to S3
  ↓
Update lastSyncAt, nextSyncAt
```

## 10. Testing

### 10.1 Unit Tests

#### 10.1.1 Event Stream Tests
**File**: `worker/src/__tests__/event-stream.test.ts` (NEW)

**Note**: Worker uses Vitest, not Jest. Use Vitest syntax.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEventsStream } from "../features/database-read-stream/event-stream";
import { BatchExportTableName } from "@langfuse/shared";

describe("getEventsStream", () => {
  it("should stream events with filters", async () => {
    const stream = await getEventsStream({
      projectId: "test-project",
      cutoffCreatedAt: new Date(),
      filter: [
        {
          column: "type",
          operator: "=",
          value: "GENERATION",
          type: "stringOptions",
        },
      ],
      rowLimit: 100,
    });

    const events: any[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty("id");
    expect(events[0]).toHaveProperty("trace_id");
  });

  it("should handle empty results", async () => {
    const stream = await getEventsStream({
      projectId: "non-existent-project",
      cutoffCreatedAt: new Date("2000-01-01"),
      filter: null,
      rowLimit: 100,
    });

    const events: any[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events.length).toBe(0);
  });

  it("should include comments in export", async () => {
    // Test that comments are fetched and included
  });
});
```

**Run tests with**: `pnpm run test --filter=worker -- event-stream`

#### 10.1.2 Batch Export Handler Tests
**File**: `worker/src/__tests__/batchExport.test.ts`

Add test case (using Vitest):
```typescript
import { describe, it, expect, vi } from 'vitest';

it("should handle Events table export", async () => {
  // Create batch export for Events table
  // Verify stream is called with correct parameters
  // Verify file is uploaded to S3
});
```

**Run tests with**: `pnpm run test --filter=worker -- batchExport`

### 10.2 Integration Tests

#### 10.2.1 Blob Storage Integration Tests
**File**: `worker/src/__tests__/blobStorage.test.ts`

Add test case (using Vitest):
```typescript
import { describe, it, expect, vi } from 'vitest';

it("should export events to blob storage", async () => {
  // Create blob storage integration with events table
  // Trigger job
  // Verify events are exported to S3
});
```

**Run tests with**: `pnpm run test --filter=worker -- blobStorage`

#### 10.2.2 PostHog Integration Tests
**File**: `worker/src/__tests__/posthog.test.ts`

Add test case (using Vitest):
```typescript
import { describe, it, expect, vi } from 'vitest';

it("should send events to PostHog", async () => {
  // Create PostHog integration
  // Trigger job
  // Verify events are sent to PostHog
});
```

**Run tests with**: `pnpm run test --filter=worker -- posthog`

### 10.3 Test Requirements
- All tests must be independent and not rely on shared state
- Worker tests use **Vitest** (not Jest) - see `CLAUDE.md` for test commands
- Use test database with seeded data
- Mock external services (S3, PostHog, Mixpanel)
- Test error handling scenarios
- Test large dataset handling (streaming)

## 11. Environment Variables

### 11.1 Required Variables
- `LANGFUSE_S3_BATCH_EXPORT_ENABLED` - Enable batch export feature
- `LANGFUSE_S3_BATCH_EXPORT_BUCKET` - S3 bucket for exports
- `ENCRYPTION_KEY` - Required for storing integration credentials
- `QUEUE_CONSUMER_*_QUEUE_IS_ENABLED` - Enable specific integration queues

### 11.2 Optional Variables
- `BATCH_EXPORT_ROW_LIMIT` - Maximum rows per export (default: 10M)
- `BATCH_EXPORT_DOWNLOAD_LINK_EXPIRATION_HOURS` - URL expiration (default: 1)

## 12. Error Handling

### 12.1 ClickHouse Query Errors
- Retry logic handled by ClickHouse client
- Mark export as FAILED if query fails after retries
- Log error message in `batchExport.log` field

### 12.2 S3 Upload Errors
- Retry logic handled by StorageServiceFactory
- Mark export as FAILED if upload fails
- Log error message

### 12.3 Integration Errors
- Log errors but continue with other data types
- Update `lastSyncAt` only on successful completion
- Send alert if integration fails repeatedly

## 13. Performance Considerations

### 13.1 Streaming
- All exports use streaming to avoid memory issues
- ClickHouse queries use `queryClickhouseStream` for large datasets
- Comments fetched in batches of 1000

### 13.2 Query Optimization
- Use EventsQueryBuilder for consistent query construction
- Apply filters at query time to reduce data transfer
- Use appropriate ClickHouse timeouts for large exports

### 13.3 Batching
- PostHog: Flush every 10,000 events
- Mixpanel: Flush every 1,000 events
- Comments: Fetch in batches of 1,000

## 14. Security Considerations

### 14.1 RBAC
- All export operations require appropriate permissions
- Integration configurations require `integrations:CRUD` scope

### 14.2 Encryption
- Integration credentials encrypted using AES-256-GCM
- Stored in `encryptedSecretAccessKey`, `encryptedPostHogApiKey`, etc.

### 14.3 URL Validation
- PostHog hostname validated to prevent SSRF attacks
- Signed URLs expire after configured time

## 15. Migration and Deployment

### 15.1 Database Migrations
No database migrations required - existing tables support events via JSON fields.

### 15.2 Code Deployment
1. Deploy shared package with updated `BatchTableNames` enum
2. Deploy worker with new stream functions and handlers
3. Deploy web with updated warning messages
4. No breaking changes - backward compatible

### 15.3 Rollback Plan
- Remove `Events` from `BatchTableNames` enum
- Remove event stream functions
- Remove event cases from handlers
- No data migration required

## 16. Monitoring and Observability

### 16.1 Logging
- All operations logged with appropriate tags
- Progress logged every 10,000 rows for large exports
- Errors logged with full context

### 16.2 Metrics
- Export success/failure rates
- Export duration
- Rows processed per export
- Integration sync status

### 16.3 Alerts
- Failed exports
- Integration sync failures
- S3 upload errors

## 17. Documentation Updates

### 17.1 User Documentation
- Update export documentation to include Events table
- Update integration documentation for PostHog/Mixpanel events

### 17.2 Developer Documentation
- Document new stream functions
- Document event transformation patterns
- Update architecture diagrams

## 18. Future Enhancements (Out of Scope)

- Real-time event streaming
- Custom export formats
- Export scheduling UI
- Export templates
- Incremental export diffs
