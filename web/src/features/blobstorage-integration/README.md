# Blob Storage Integration — Sync Status State Machine

The blob storage exporter's UI status is derived from five DB fields on
`BlobStorageIntegration`. No explicit `status` column exists — the status is
computed at read time by `deriveSyncStatus.ts`.

## DB fields (the state vector)

| Field | Type | Written by |
|---|---|---|
| `enabled` | boolean | Web (save) |
| `lastError` | string \| null | Worker (catch / success) |
| `lastSyncAt` | Date \| null | Worker (success) |
| `nextSyncAt` | Date \| null | Worker (success / empty-window), Web (save) |
| `runStartedAt` | Date \| null | Worker (start / end), Web (save clears it) |

## Derived states (precedence top-to-bottom)

```
disabled    ← enabled = false
error       ← lastError != null
running     ← runStartedAt != null AND age < 2h
queued      ← nextSyncAt <= now
idle        ← lastSyncAt = null (never exported)
up_to_date  ← fallthrough
```

## Transition diagram

```
                      ┌──────────────────────────────────────────┐
                      │           User saves (web)               │
                      │  runStartedAt = null                     │
                      │  if errored+enabled: nextSyncAt = now    │
                      │  if mode changed: lastSyncAt = null,     │
                      │                   nextSyncAt = now       │
                      └────────────────┬─────────────────────────┘
                                       │
    ┌──────────┐                       ▼
    │ disabled │◄──── enabled = false (any state)
    └──────────┘
         │ user enables
         ▼
    ┌──────────┐   nextSyncAt = null, lastSyncAt = null
    │   idle   │◄──── freshly created, never synced
    └──────────┘
         │ save sets nextSyncAt = now (on first save/mode change)
         ▼
    ┌──────────┐   nextSyncAt <= now
    │  queued  │◄──── scheduler finds row (lastSyncAt=null OR nextSyncAt<=now)
    └──────────┘      and enqueues a BullMQ job (no DB write)
         │
         │ worker picks up job, sets runStartedAt = new Date()
         ▼
    ┌──────────┐
    │ running  │   runStartedAt set, age < 2h
    └──────────┘
        ╱    ╲
  success    failure
      ╱        ╲
     ▼          ▼
┌───────────┐  ┌───────┐
│ up_to_date│  │ error │
└───────────┘  └───────┘
```

## Transition detail

| From | Trigger | Writes | To |
|---|---|---|---|
| **any** | User saves with `enabled=false` | `runStartedAt=null` | **disabled** |
| **any** | User saves with `enabled=true` | `runStartedAt=null`; `nextSyncAt=now` if errored or mode changed | **idle**, **queued**, or stays **error** (`lastError` is not cleared by save) |
| **disabled** | User saves `enabled=true` | (as above) | **idle**, **queued**, or stays **error** |
| **idle** | Scheduler finds `lastSyncAt=null` | Enqueues BullMQ job (no DB write) | stays **idle** |
| **queued** | Scheduler finds `nextSyncAt<=now` | Enqueues BullMQ job (no DB write) | stays **queued** |
| **queued** | Worker starts job | `runStartedAt=now` | **running** |
| **running** | Worker: integration disabled | `runStartedAt=null` | **disabled** |
| **running** | Worker: empty time window | `runStartedAt=null`, `nextSyncAt=now+frequency`, `lastError=null` | **up_to_date** (or **idle** if never synced) |
| **running** | Worker: export succeeds, caught up | `lastSyncAt=max`, `nextSyncAt=max+freq`, `lastError=null`, `runStartedAt=null` | **up_to_date** |
| **running** | Worker: export succeeds, not caught up | `lastSyncAt=max`, `nextSyncAt=now`, `lastError=null`, `runStartedAt=null` + re-enqueues job | **queued** (immediately) |
| **running** | Worker: export fails | `lastError=msg`, `lastErrorAt=now`, `runStartedAt=null` | **error** |
| **error** | User saves (enabled, same mode) | `runStartedAt=null`, `nextSyncAt=now` | stays **error** (`lastError` preserved; scheduler re-enqueues via `nextSyncAt`) |
| **error** | User clicks Run Now | Enqueues manual job (no DB write) | stays **error** until worker starts |
| **running** | Stale `runStartedAt` > 2h | (no write — derived only) | falls through to **queued**, **idle**, or **up_to_date** |
| **up_to_date** | Clock passes `nextSyncAt` | (no write — derived only) | **queued** |

## Safety valve

If a worker crashes without clearing `runStartedAt`, the 2h TTL in
`deriveSyncStatus` lets the status fall through to whatever the underlying
fields indicate (typically **queued**, since the scheduler will re-enqueue on
the next tick). No explicit cleanup is needed.

## Run Now (manual trigger)

Run Now only enqueues a BullMQ job with a unique `manual-` jobId. It does not
write any DB state. The worker then follows the normal running → success/failure
path. The UI shows the current status (error/up_to_date/queued) until the
worker picks up the job and sets `runStartedAt`.

## Key files

| File | Role |
|---|---|
| `deriveSyncStatus.ts` | Derives display status from DB fields |
| `types.ts` | `BlobStorageSyncStatus` type |
| `service.ts` | Upsert logic (web save path) |
| `blobstorage-integration-router.ts` | tRPC router (save, runNow) |
| `worker/src/features/blobstorage/handleBlobStorageIntegrationProjectJob.ts` | Worker job handler |
| `worker/src/features/blobstorage/handleBlobStorageIntegrationSchedule.ts` | Scheduler (enqueues due jobs) |
