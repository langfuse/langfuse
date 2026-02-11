# Scheduled Exports for Events Table (CSV, S3, PostHog, Mixpanel)

**Context:** Engineering > Event Table Transition > **LFE-8339**

## Suggestions (labels)
- `integration-s3`
- `integration-posthog`
- `feat-exports`
- `feat-blob-storage-export`
- `feat-csv-export`

## Related to
- **LFE-5865** bug: Empty exports on scheduled exports
- **LFE-6371** Exports failing because CH memory is exceeded

---

## Project Overview

Langfuse is migrating from legacy `traces`/`observations` tables to a new unified `events` table in ClickHouse. This project implements scheduled export functionality for the new events table experience, matching the existing export capabilities.

## Objective

Build scheduled exports from the new events table to:

1. **CSV** (download button) — Phase 1
2. **S3/S3-compatible storage** — Phase 2
3. **PostHog** — Phase 2
4. **Mixpanel** — Phase 2

---

## Architecture Overview

### Existing Export Infrastructure

| Feature | Web Location | Worker Location | Database Table |
|---|---|---|---|
| Batch Export (CSV/JSON) | `web/src/features/batch-exports/` | `worker/src/features/batchExport/` | `batch_exports` |
| S3/Blob Storage | `web/src/features/blobstorage-integration/` | `worker/src/features/blobstorage/` | `blob_storage_integrations` |
| PostHog | `web/src/features/posthog-integration/` | `worker/src/features/posthog/` | `posthog_integrations` |
| Mixpanel | `web/src/features/mixpanel-integration/` | `worker/src/features/mixpanel/` | `mixpanel_integrations` |

### Key Patterns to Follow

- **Encryption:** AES-256-GCM for API keys/secrets via  
  `packages/shared/src/encryption/encryption.ts`
- **Queues:** Two-tier BullMQ pattern (scheduler queue → processing queue)
- **Data Streaming:** ClickHouse → Transform → Upload (handles large datasets)
- **RBAC:** Check `integrations:CRUD` scope for scheduled integrations, `batchExports:create` for CSV
- **Audit Logging:** All configuration changes logged via `auditLog()`

---

## New Events Table Details

### Schema Location
`packages/shared/clickhouse/scripts/dev-tables.sh` (lines 136–300)

### Key Characteristics
- **Engine:** ReplacingMergeTree with `event_ts` and `is_deleted` versioning
- **Partitioning:** Monthly by `start_time`
- **Primary Key:** `(project_id, start_time, xxHash32(trace_id))`
- **Denormalized:** Trace data (`user_id`, `session_id`, `tags`, etc.) is copied to each event row — no JOINs needed

### Column Definitions
`packages/shared/src/eventsTable.ts` — defines all exportable columns including:

- **Identity:** `span_id`, `trace_id`, `parent_span_id`
- **Temporal:** `start_time`, `end_time`, `completion_start_time`
- **Model:** `model_id`, `provided_model_name`, `model_parameters`
- **Usage:** `usage_details`, `cost_details` (Map types)
- **I/O:** `input`, `output` (ZSTD compressed)
- **Metadata:** JSON type with materialized indexes

### Query Builder
`packages/shared/src/server/queries/clickhouse-sql/event-query-builder.ts`

---

## Phase 1: CSV Export Button

### Requirements
1. Add export button to events table UI (match existing traces/observations table pattern)
2. Support current filter state from the table
3. Support CSV, JSON, JSONL formats

### Implementation Steps

1. **Create Events Stream Function** (new file in `worker/src/features/database-read-stream/`)

   ```ts
   // Similar to getTraceStream() and getObservationStream()
   // Query events table with filters, return AsyncGenerator
   export async function* getEventsStream(params: {
     projectId: string;
     cutoffCreatedAt: Date;
     filter: FilterType[];
     orderBy: OrderByType;
   }): AsyncGenerator<EventRecord>

	2.	Update Batch Export Types (packages/shared/src/features/batchExport/types.ts)
	•	Add Events to BatchTableNames enum
	•	Define EventExportSchema for the query shape
	3.	Update Worker Handler (worker/src/features/batchExport/handleBatchExportJob.ts)
	•	Add case for BatchExportTableName.Events that calls getEventsStream()
	4.	Add UI Export Button
	•	Reference existing pattern in web/src/features/batch-exports/
	•	Wire up to existing tRPC batchExport.create procedure

Data Flow

UI Button Click
  -> tRPC batchExport.create (validates, creates DB record)
  -> BullMQ BatchExportQueue
  -> Worker: handleBatchExportJob
     -> getEventsStream() queries ClickHouse
     -> streamTransformations[format]() converts to CSV/JSON/JSONL
     -> StorageServiceFactory uploads to S3
     -> Update batch_exports record with signed URL
     -> Send email notification


⸻

Phase 2: Scheduled Integrations

S3/Blob Storage Integration

Reference Implementation:
worker/src/features/blobstorage/handleBlobStorageIntegrationProjectJob.ts
	1.	Add Events Export Function (in packages/shared/src/server/repositories/events.ts)

export async function* getEventsForBlobStorageExport(
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
): AsyncGenerator<EventRecord>

export async function* getEventsForAnalyticsIntegrations(
  projectId: string,
  minTimestamp: Date,
  maxTimestamp: Date,
): AsyncGenerator<EventRecord>


	2.	Update Worker Handler
	•	Modify handleBlobStorageIntegrationProjectJob.ts
	•	Add events table option alongside traces/observations/scores
	•	OR create parallel handler for events-only export
	3.	Configuration Options
	•	Export frequency: hourly, daily, weekly
	•	File format: JSON, CSV, JSONL
	•	Export mode: FULL_HISTORY, FROM_TODAY, FROM_CUSTOM_DATE
	•	Chunked historical exports (one frequency period per job)

PostHog Integration

Reference Implementation:
worker/src/features/posthog/handlePostHogIntegrationProjectJob.ts
	1.	Use Events Query Function
	•	The getEventsForAnalyticsIntegrations function is already added to packages/shared/src/server/repositories/events.ts in Step 1 of S3/Blob Storage Integration above


	2.	Create Events Transformer (worker/src/features/posthog/transformers.ts)

export function transformEventToPostHogEvent(event: EventRecord): PostHogEvent {
  return {
    event: 'langfuse_event',
    distinctId: event.user_id || event.trace_id,
    timestamp: event.start_time,
    properties: {
      trace_id: event.trace_id,
      span_id: event.span_id,
      name: event.name,
      type: event.type,
      // ... map relevant fields
    }
  };
}


	3.	Update Worker Handler
	•	Process events alongside or instead of traces/generations/scores
	•	Maintain lastSyncAt cursor for incremental exports

Mixpanel Integration

Reference Implementation:
worker/src/features/mixpanel/handleMixpanelIntegrationProjectJob.ts
	•	Same pattern as PostHog
	•	Use custom MixpanelClient (worker/src/features/mixpanel/mixpanelClient.ts)
	•	Transform events to Mixpanel event format

⸻

Technical Requirements

Environment Variables
	•	LANGFUSE_S3_BATCH_EXPORT_ENABLED — Enable batch export feature
	•	LANGFUSE_S3_BATCH_EXPORT_BUCKET — S3 bucket for exports
	•	ENCRYPTION_KEY — Required for storing integration credentials
	•	QUEUE_CONSUMER_*_QUEUE_IS_ENABLED — Enable specific integration queues

Testing

Web Package (Jest):

pnpm test -- --testPathPatterns="batch-export"

Worker Package (Vitest):

pnpm run test --filter=worker -- batchExport

Test Requirements
	•	Unit tests for stream functions
	•	Integration tests for export handlers
	•	Tests must be independent and not rely on shared state

Code Conventions
	•	Use Zod v4 (import from 'zod/v4')
	•	Follow existing feature folder structure
	•	Use tRPC for type-safe APIs
	•	Avoid over-engineering — match existing patterns
	•	Don’t add features beyond what’s specified

⸻

Files to Study

Purpose	Path
Batch export worker	worker/src/features/batchExport/handleBatchExportJob.ts
Batch export types	packages/shared/src/features/batchExport/types.ts
Batch export UI	web/src/features/batch-exports/components/
Batch export tRPC	web/src/features/batch-exports/server/batchExport.ts
S3 integration worker	worker/src/features/blobstorage/handleBlobStorageIntegrationProjectJob.ts
PostHog worker	worker/src/features/posthog/handlePostHogIntegrationProjectJob.ts
Mixpanel worker	worker/src/features/mixpanel/handleMixpanelIntegrationProjectJob.ts
Events table columns	packages/shared/src/eventsTable.ts
Events query builder	packages/shared/src/server/queries/clickhouse-sql/event-query-builder.ts
Events table schema	packages/shared/clickhouse/scripts/dev-tables.sh
Trace stream example	worker/src/features/database-read-stream/trace-stream.ts
Observation stream example	worker/src/features/database-read-stream/observation-stream.ts
Encryption utils	packages/shared/src/encryption/encryption.ts
Storage service	Search for StorageServiceFactory


⸻

Development Setup

pnpm i
pnpm run infra:dev:up    # Start Docker (Postgres, ClickHouse, Redis, MinIO)
pnpm run dev:web         # Web app on localhost:3000
pnpm run dev:worker      # Worker process

# Login: demo@langfuse.com / password


⸻

Deliverables

Phase 1
	•	Events stream function for batch exports
	•	Updated batch export types with Events table
	•	Updated batch export worker handler
	•	Export button in events table UI
	•	Tests for new functionality

Phase 2
	•	Events export for S3/Blob storage integration
	•	Events export for PostHog integration
	•	Events export for Mixpanel integration
	•	Tests for all integrations

⸻

Notes
	•	Match existing UI/UX patterns exactly
	•	Maintain backwards compatibility with legacy tables during transition
	•	Events table is denormalized — no need to JOIN with traces table
	•	Use streaming for large exports to avoid memory issues
	•	Follow RBAC patterns for permission checks

