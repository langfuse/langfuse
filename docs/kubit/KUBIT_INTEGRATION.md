# Kubit Analytics Integration

This document describes the Kubit analytics integration added to Langfuse. It enables automatic, scheduled export of traces, observations, scores, and enriched events from Langfuse to an AWS Kinesis Data Stream, from which downstream analytics systems can consume the data.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Langfuse Web                                                       │
│                                                                     │
│  /settings/integrations/kubit  ──►  kubitIntegrationRouter         │
│                                         │                           │
│                              ┌──────────┘                          │
│                              │  PostgreSQL                          │
│                              │  kubit_integrations table           │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  Langfuse Worker                                                    │
│                                                                     │
│  KubitIntegrationQueue  (cron: every 15 min)                        │
│  └─► handleKubitSchedule                                            │
│        • Query all enabled integrations from PostgreSQL             │
│        • Filter to those due (syncIntervalMinutes elapsed)          │
│        • Enqueue one job per project                                │
│                                                                     │
│  KubitIntegrationProcessingQueue  (per-project job)                 │
│  └─► handleKubitProjectJob                                          │
│        • Acquire distributed Redis lock (one worker per project)    │
│        • Exchange API key for temporary AWS credentials             │
│        • Determine sync window (pin maxTimestamp for retries)       │
│        • Run processors concurrently (Promise.allSettled)           │
│          ├── traces          (TRACES_OBSERVATIONS, T_O_EVENTS)      │
│          ├── observations    (TRACES_OBSERVATIONS, T_O_EVENTS)      │
│          ├── scores          (always)                               │
│          └── enriched events (EVENTS, T_O_EVENTS)                  │
│        • On success: advance lastSyncAt, clear tracking columns     │
│        • On failure: save lastError, re-throw for BullMQ retry      │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼  AWS Kinesis PutRecords (SigV4)
                     AWS Kinesis Data Stream
```

---

## Changed / Added Files

### `packages/shared/prisma/migrations/20260311000000_add_kubit_integration/migration.sql`
**New file — database schema**

Creates the `kubit_integrations` table in PostgreSQL. One row per project, keyed on `project_id` (FK → `projects` with `ON DELETE CASCADE`).

| Column | Type | Purpose |
|---|---|---|
| `project_id` | TEXT PK | Ties the integration to a Langfuse project |
| `endpoint_url` | TEXT | Base URL of the credential exchange endpoint |
| `encrypted_api_key` | TEXT | AES-encrypted API key |
| `enabled` | BOOLEAN | Toggle sync on/off without deleting config |
| `sync_interval_minutes` | INT (default 60) | How often to sync per project |
| `request_timeout_seconds` | INT (default 30) | HTTP timeout per Kinesis batch request |
| `encrypted_aws_access_key_id` | TEXT nullable | Cached STS credential |
| `encrypted_aws_secret_access_key` | TEXT nullable | Cached STS credential |
| `encrypted_aws_session_token` | TEXT nullable | Cached STS credential |
| `aws_credentials_expiry` | TIMESTAMP nullable | When the STS credentials expire |
| `aws_kinesis_stream_name` | TEXT nullable | Kinesis stream name (from credential response) |
| `aws_kinesis_region` | TEXT nullable | AWS region (from credential response) |
| `aws_kinesis_partition_key` | TEXT nullable | Workspace-level partition key |
| `last_sync_at` | TIMESTAMP nullable | High-water mark; advances after each successful sync |
| `last_error` | TEXT nullable | Last error message; cleared on success |
| `current_sync_max_timestamp` | TIMESTAMP nullable | Pinned upper bound for the current retry window |
| `traces_synced_at` | TIMESTAMP nullable | Per-processor completion tracking for retries |
| `observations_synced_at` | TIMESTAMP nullable | Per-processor completion tracking for retries |
| `events_synced_at` | TIMESTAMP nullable | Per-processor completion tracking for retries |
| `scores_synced_at` | TIMESTAMP nullable | Per-processor completion tracking for retries |
| `created_at` | TIMESTAMP | When the integration was first configured |

---

### `packages/shared/src/server/queues.ts`
**Modified — adds Kubit queue types**

Registers two new queues following the existing pattern used by the Mixpanel and Blob Storage integrations:

- **`KubitIntegrationQueue`** — scheduler queue (cron-triggered, decides which projects to sync)
- **`KubitIntegrationProcessingQueue`** — per-project processing queue (performs the actual data export)

Adds corresponding `QueueName` and `QueueJobs` enum values, plus `TQueueJobTypes` entries for type-safe job payloads.

---

### `packages/shared/src/server/redis/kubitIntegrationQueue.ts`
**New file — scheduler queue**

Singleton queue that fires a cron job every 15 minutes (`*/15 * * * *`). The 15-minute cadence is finer than the default 60-minute sync interval so projects with different `syncIntervalMinutes` values are all checked regularly. The actual due-check is done in `handleKubitSchedule`.

---

### `packages/shared/src/server/redis/kubitIntegrationProcessingQueue.ts`
**New file — per-project processing queue**

Singleton queue for per-project sync jobs. Configured with:
- **5 retry attempts** with exponential backoff (5s base)
- `removeOnComplete: true` to keep Redis clean

---

### `packages/shared/src/server/repositories/traces.ts` / `observations.ts` / `scores.ts`
**Modified — adds ClickHouse streaming queries**

Adds one async generator per entity type (`getTracesForKubit`, `getObservationsForKubit`, `getScoresForKubit`). Each:
- Queries ClickHouse via `queryClickhouseStream` (memory-efficient, no full result set loaded at once)
- Filters by `project_id`, timestamp window (`minTimestamp` → `maxTimestamp`), and `is_deleted = 0`
- Yields rows tagged with `entity_type` so the downstream client can route them correctly

---

### `packages/shared/src/server/repositories/events.ts`
**Modified — adds ClickHouse streaming query for V4 enriched observations**

Adds `getEventsForKubit` — an async generator that streams V4 enriched observations from the events table. Used when `LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE=true`. These records denormalize trace-level fields (userId, sessionId, tags, etc.) directly into each observation row, providing a single enriched record per span.

---

### `web/src/features/kubit-integration/types.ts`
**New file — validation schema**

Defines `kubitIntegrationFormSchema` using Zod v4. Validates all user-configurable fields. Shared between the frontend form and the API router.

---

### `web/src/features/kubit-integration/kubit-integration-router.ts`
**New file — tRPC router**

Three procedures, all behind the `integrations:CRUD` RBAC scope:

| Procedure | What it does |
|---|---|
| `get` | Reads integration config for a project. The API key is **never returned** — only metadata (enabled status, last sync time, last error, export source). |
| `update` | Creates or updates the integration. The API key is AES-encrypted before storage using `ENCRYPTION_KEY`. If a row already exists and no new API key is provided, the existing encrypted key is preserved. Also clears `lastError` and `lastSyncAt` on update. |
| `delete` | Deletes the integration row entirely, disabling all future syncs. |

All mutations (`update`, `delete`) write an audit log entry.

---

### `web/src/pages/project/[projectId]/settings/integrations/kubit.tsx`
**New file — settings UI page**

Settings page at `/project/[projectId]/settings/integrations/kubit`. Access is restricted to users with the `integrations:CRUD` scope (project admin or owner).

**Configuration form fields:**

| Field | Default | Constraints | Description |
|---|---|---|---|
| Endpoint URL | — | Must be a valid URL | Base URL for the credential exchange endpoint |
| API Key | — | Required on first save; blank = keep existing | Never pre-filled, never returned by the API |
| Sync Interval | 60 min | 15–1440 | How often to sync per project |
| Request Timeout | 30 s | 5–300 | Per-request HTTP timeout |
| Enabled | off | — | Enables/disables sync without deleting config |

**Status section** — shows `lastSyncAt`, `lastError` (if any), and per-processor sync timestamps.

**Actions** — Save (create/update) and Reset (deletes the row, requires confirmation).

---

### `worker/src/queues/kubitQueue.ts`
**New file — queue processors**

Wires up two processors:
- `kubitIntegrationProcessor` → `handleKubitSchedule`
- `kubitIntegrationProcessingProcessor` → `handleKubitProjectJob`, wrapped in an OpenTelemetry span

---

### `worker/src/features/kubit/handleKubitSchedule.ts`
**New file — scheduler logic**

Runs every 15 minutes. Queries all enabled integrations from PostgreSQL, filters to those where `now - lastSyncAt >= syncIntervalMinutes`, and enqueues one processing job per due project.

Jobs are deduplicated by `jobId = "${projectId}-${lastSyncAt?.toISOString()}"` — if the scheduler fires twice before a sync completes, the second enqueue is a no-op.

---

### `worker/src/features/kubit/handleKubitProjectJob.ts`
**New file — per-project sync logic**

The main job handler. Key behaviours:

**Distributed locking** — A Redis lock (`kubit:lock:{projectId}`, TTL 4 hours) ensures only one worker processes a given project at a time. If the lock is held by another worker the job exits immediately.

**Credential management** — AWS STS credentials are cached encrypted in PostgreSQL. Before each sync, the handler checks expiry (with a 5-minute buffer). If expired or missing, it calls `{endpointUrl}/token` with the API key to obtain fresh credentials. On 401/403, the integration is permanently disabled. On 5xx, the job throws so BullMQ retries.

**Sync window pinning** — On the first attempt, `maxTimestamp = now` is persisted as `currentSyncMaxTimestamp`. Retries reuse the same pinned timestamp, preventing the window from drifting between attempts.

**Per-processor skip on retry** — After each processor completes, its `{entity}SyncedAt` column is written. On retry, processors whose `syncedAt >= maxTimestamp` are skipped, preventing duplicate sends.

**Pipeline mode routing** — Which processors run is determined automatically by the `LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE` env var:

| `LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE` | Processors |
|---|---|
| `false` (default) | traces, observations, scores |
| `true` | enriched observations (V4), scores |

**allSettled behaviour** — All processors run to completion via `Promise.allSettled` before any error is thrown. This prevents lingering processors from one job run overlapping with the next retry.

**Error recording** — On failure, the error message is saved to `lastError` in PostgreSQL so it is visible in the settings UI.

---

### `worker/src/features/kubit/kubitClient.ts`
**New file — Kinesis PutRecords client**

Sends enriched events to AWS Kinesis using the SigV4-signed PutRecords API directly via `fetch` (no AWS SDK dependency).

**Record structure:**
- `Data`: base64-encoded JSON of the event enriched with `wid` (workspace ID, used for stream partitioning)
- `PartitionKey`: `{workspaceId}/{event.id}`

**Batch splitting** — Each `flush()` call splits the in-memory buffer into PutRecords chunks, each respecting:
- ≤ 250 records per call (Kinesis hard limit)
- ≤ 5 MB total per call (Kinesis hard limit)

**`shouldFlush()`** — Returns `true` when the in-memory buffer reaches 25 MB, signalling the caller to flush early and bound peak memory usage during large historical syncs.

**Partial failure retry** — When `FailedRecordCount > 0`, only the failed records are retried (up to 5 attempts, 1s/2s/4s/8s/16s backoff).

**HTTP error retry** — `sendChunkWithRetry` retries the full chunk on non-2xx responses (up to 5 attempts, 5s/10s/20s/40s/80s + ±25% jitter to avoid thundering herd across parallel processors).

---

### `worker/src/__tests__/handleKubitProjectJob.test.ts`
**New file — 37 unit tests**

All mocks are hoisted via `vi.hoisted`. Prisma, ClickHouse generators, global `fetch`, and the `RedisLock` class are fully mocked so tests run without any infrastructure.

| Group | Tests | What is verified |
|---|---|---|
| **Early exits** | 4 | No integration → returns immediately, never acquires lock. Lock held → returns immediately, never calls processors, never releases lock. Redis unavailable (skipped) → proceeds without lock. 401 → disables integration, returns cleanly. |
| **Lock lifecycle** | 3 | Released after success. Released even when a processor throws (finally block). Lock key is `kubit:lock:{projectId}`. |
| **Sync window** | 3 | `currentSyncMaxTimestamp` is written on first attempt. Existing value is reused on retry (no new write). Pinned timestamp is passed to all processor functions. |
| **Per-processor skip** | 5 | Each of traces/observations/scores/events is individually skipped when `syncedAt >= maxTimestamp`. All four skipped → final cleanup still runs. `syncedAt` from a previous window is not treated as done. |
| **Success path** | 3 | Each processor's `syncedAt` is written individually as it completes. `lastSyncAt` advances to `maxTimestamp`. All tracking columns (`currentSyncMaxTimestamp`, all `syncedAt`, `lastError`) are cleared to `null`. |
| **Failure path** | 5 | Job re-throws so BullMQ retries. Successful processors are marked done; failed processor is not. `lastSyncAt` is not advanced. `lastError` is written with the error message. All processors run to completion before throwing (allSettled). |
| **Credential refresh** | 4 | Expired credentials trigger a token exchange. Valid credentials skip the exchange. Credentials expiring within 5 minutes are refreshed (buffer window). 403 disables integration without throwing. 500 throws without disabling (retryable). |
| **Sync cursor** | 2 | `lastSyncAt` is used as `minTimestamp` when set. Falls back to `2000-01-01` on first ever sync. |
| **Export source routing** | 8 | `TRACES_OBSERVATIONS` runs traces/observations/scores, not events. `EVENTS` runs events/scores only. `TRACES_OBSERVATIONS_EVENTS` runs all four. Correct timestamps passed to `getEventsForKubit`. `eventsSyncedAt` is written, respected for skip, and cleared on success. Events failure in `T_O_EVENTS` mode does not prevent other processors from completing. |

### `worker/src/__tests__/kubitClient.test.ts`
**New file — 19 unit tests**

Uses `vi.stubGlobal("fetch", ...)` to intercept Kinesis PutRecords calls. Fake timers (`vi.useFakeTimers()`) are used for retry backoff tests to keep the suite fast.

| Group | Tests | What is verified |
|---|---|---|
| **Record structure** | 6 | One fetch call per flush for a small batch. Required headers present (`X-Amz-Target`, `Content-Type`, `Authorization`, `X-Amz-Security-Token`). `Data` field is base64-encoded JSON of the event enriched with `wid`. `wid` is present on every record. `PartitionKey` is `{workspaceId}/{event.id}` for events with a string id. UUID fallback for events with no id, numeric id, or empty string id. |
| **Batch splitting** | 2 | 1100 events → at least 5 PutRecords calls, each ≤ 250 records, total 1100. 10 × ~600 KB events → at least 2 calls due to 5 MB limit. |
| **shouldFlush / flush** | 3 | Empty flush is a no-op. Batch is cleared after flush. `shouldFlush` returns false below 25 MB, true once threshold is crossed. |
| **Partial failure retry** | 3 | After a partial failure, only failed records are retried. Succeeds when failures resolve within 5-attempt budget. Throws with "records failed after" after exhausting all 25 total attempts (5 outer × 5 inner). |
| **HTTP error retry** | 3 | Throws with the HTTP status code on non-2xx response. Retries and resolves when Kinesis recovers on the second attempt. Throws after exhausting all 5 outer retry attempts. |
| **destroy** | 2 | Resolves without throwing. Does not flush buffered events. |

Run all kubit tests:
```bash
pnpm run test --filter=worker -- handleKubitProjectJob
pnpm run test --filter=worker -- kubitClient
```

### Coverage

| File | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `kubitClient.ts` | 100% | 98% | 100% | 100% |
| `handleKubitProjectJob.ts` | 88% | 93% | 97% | 88% |

The uncovered 12% of `handleKubitProjectJob.ts` consists of OpenTelemetry span attribute calls (only execute when a tracing span is active, which is not set up in unit tests) and logging statements inside retry loops.

---

## Data Flow Summary

```
Every 15 min
    │
    ▼
handleKubitSchedule
    │ reads enabled integrations from PostgreSQL
    │ filters to those due (syncIntervalMinutes elapsed since lastSyncAt)
    │
    ▼  one job per due project
handleKubitProjectJob
    │
    ├── acquire Redis lock (kubit:lock:{projectId})
    │
    ├── exchange API key → temporary AWS credentials (cached in PostgreSQL)
    │
    ├── pin maxTimestamp = now (persisted for retry idempotency)
    │
    ├── (concurrent, Promise.allSettled)
    │   ├── getTracesForKubit(projectId, minTs, maxTs)        ← ClickHouse stream
    │   ├── getObservationsForKubit(projectId, minTs, maxTs)  ← ClickHouse stream
    │   ├── getScoresForKubit(projectId, minTs, maxTs)        ← ClickHouse stream
    │   └── getEventsForKubit(projectId, minTs, maxTs)        ← ClickHouse stream (V4 mode only)
    │         │ (legacy: traces+observations+scores / V4: enriched observations+scores)
    │         ▼
    │    KubitClient.addEvent(event)   — enriches with wid
    │    KubitClient.flush()           — called every 25 MB + end of stream
    │         │
    │         │  SigV4-signed PutRecords
    │         │  ≤ 250 records / ≤ 5 MB per call
    │         ▼
    │    AWS Kinesis Data Stream
    │
    └── on success: lastSyncAt = maxTimestamp, clear tracking columns
        on failure: lastError = message, re-throw for BullMQ retry
```

---

## Security Notes

- The API key is **never stored in plaintext**. It is AES-encrypted using Langfuse's existing `ENCRYPTION_KEY` environment variable before being written to PostgreSQL, and decrypted only in the worker at sync time.
- AWS STS credentials returned by the token endpoint are also stored encrypted.
- The API key is **never returned** by the `get` tRPC procedure — only metadata is exposed to the frontend.
- All CRUD operations require the `integrations:CRUD` RBAC scope (project admin or owner).
- All mutations are recorded in the Langfuse audit log.
