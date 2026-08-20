# Blob Storage Integration — Sync Status State Machine

The blob storage exporter's UI status is derived from five DB fields on
`BlobStorageIntegration`. No explicit `status` column exists — the status is
computed at read time by `deriveSyncStatus.ts`.

## DB fields (the state vector)

| Field                           | Type           | Written by                                                                           |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| `enabled`                       | boolean        | Web (save), Worker (catch — disables on a final-attempt customer-fault)              |
| `lastError`                     | string \| null | Worker (catch / success)                                                             |
| `lastSyncAt`                    | Date \| null   | Worker (success)                                                                     |
| `nextSyncAt`                    | Date \| null   | Worker (success / empty-window), Web (save)                                          |
| `runStartedAt`                  | Date \| null   | Worker (start / end), Web (save clears it)                                           |
| `lastFailureNotificationSentAt` | Date \| null   | Worker (cooldown claim before the "failed" email), Web (save with enabled clears it) |

## Derived states (precedence top-to-bottom)

```
disabled    ← enabled = false (set by user save, or by the worker after a
              final-attempt customer-config/credential failure)
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
         │ save sets nextSyncAt = now (on mode change or save while errored)
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
                   │ final-attempt customer-fault → enabled = false
                   ▼
              ┌──────────┐
              │ disabled │
              └──────────┘
```

## Transition detail

| From            | Trigger                                                           | Writes                                                                                                              | To                                                                                            |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **any**         | User saves with `enabled=false`                                   | `runStartedAt=null`                                                                                                 | **disabled**                                                                                  |
| **any**         | User saves with `enabled=true`                                    | `runStartedAt=null`; `nextSyncAt=now` if errored or mode changed                                                    | **idle**, **queued**, **up_to_date**, or stays **error** (`lastError` is not cleared by save) |
| **disabled**    | User saves `enabled=true`                                         | (as above)                                                                                                          | **idle**, **queued**, **up_to_date**, or stays **error**                                      |
| **idle**        | Scheduler finds `lastSyncAt=null`                                 | Enqueues BullMQ job (no DB write)                                                                                   | stays **idle**                                                                                |
| **queued**      | Scheduler finds `nextSyncAt<=now`                                 | Enqueues BullMQ job (no DB write)                                                                                   | stays **queued**                                                                              |
| **idle/queued** | Worker starts job                                                 | `runStartedAt=now`                                                                                                  | **running**                                                                                   |
| **running**     | Worker: integration disabled                                      | `runStartedAt=null`                                                                                                 | **disabled**                                                                                  |
| **running**     | Worker: empty time window                                         | `runStartedAt=null`, `nextSyncAt=now+frequency`, `lastError=null`                                                   | **up_to_date** (or **idle** if never synced)                                                  |
| **running**     | Worker: export succeeds, caught up                                | `lastSyncAt=max`, `nextSyncAt=max+freq`, `lastError=null`, `runStartedAt=null`                                      | **up_to_date**                                                                                |
| **running**     | Worker: export succeeds, not caught up                            | `lastSyncAt=max`, `nextSyncAt=now`, `lastError=null`, `runStartedAt=null` + re-enqueues job                         | **queued** (immediately)                                                                      |
| **running**     | Worker: export fails (retries left)                               | `lastError=msg`, `lastErrorAt=now`, `runStartedAt=null` (no email — a later retry may succeed)                      | **error**                                                                                     |
| **running**     | Worker: export fails, retries exhausted                           | `lastError=msg`, `lastErrorAt=now`, `runStartedAt=null` (+ cooldown-gated "failed" email)                           | **error**                                                                                     |
| **running**     | Worker: retries exhausted on a customer-config/credential failure | `lastError=msg`, `lastErrorAt=now`, `runStartedAt=null`, `enabled=false` (+ one-time "disabled" email, no cooldown) | **disabled**                                                                                  |
| **error**       | User saves (enabled, same mode)                                   | `runStartedAt=null`, `nextSyncAt=now`                                                                               | stays **error** (`lastError` preserved; scheduler re-enqueues via `nextSyncAt`)               |
| **error**       | User clicks Run Now                                               | Enqueues manual job (no DB write)                                                                                   | stays **error** until worker clears `lastError` (success or empty-window)                     |
| **running**     | Stale `runStartedAt` > 2h                                         | (no write — derived only)                                                                                           | falls through to **queued**, **idle**, or **up_to_date**                                      |
| **up_to_date**  | Clock passes `nextSyncAt`                                         | (no write — derived only)                                                                                           | **queued**                                                                                    |

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

| File                                                                        | Role                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| `deriveSyncStatus.ts`                                                       | Derives display status from DB fields             |
| `types.ts`                                                                  | Form zod schema, `BlobStorageSyncStatus` type     |
| `../analytics-integrations/exportSource.ts`                                 | Export-source option/alert UI adapters (pure); policy in `packages/shared/.../export-source-policy.ts` |
| `service.ts`                                                                | Upsert logic (web save path)                      |
| `blobstorage-integration-router.ts`                                         | tRPC router (save, runNow)                        |
| `worker/src/features/blobstorage/handleBlobStorageIntegrationProjectJob.ts` | Worker job handler                                |
| `worker/src/features/blobstorage/handleBlobStorageIntegrationSchedule.ts`   | Scheduler (enqueues due jobs)                     |

## UI Owner Map

**Surface**: Project Settings → Integrations → Blob Storage — export
configuration form plus sync status display.

**Entry point**:
`web/src/pages/project/[projectId]/settings/integrations/blobstorage.tsx`
owns the lifecycle: the tRPC `get` query (with status-driven refetch
interval), the sync-status badge, and page layout. It mounts the two
feature components below.

**Structure** (`components/`):

| File                                  | Role                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `BlobStorageIntegrationContainer.tsx` | State layer: export-source policy context assembly, the four mutations, entity-action buttons (Validate / Run Now / Reset), loading gate, identity key |
| `BlobStorageIntegrationForm.tsx`      | Disposable draft layer: `useForm` + schema, fields, Save; no tRPC                                                                        |
| `formValues.ts`                       | Pure `buildBlobStorageFormValues()` + shared `BlobStorageFormControl` type                                                               |
| `StorageProviderFields.tsx`           | Provider select + provider-dependent connection fields                                                                                   |
| `ExportScheduleFields.tsx`            | Frequency, file type, export mode, custom start date                                                                                     |
| `ExportSourceField.tsx`               | Source selector + blocked-save alert (LFE-10296)                                                                                         |
| `ExportFieldGroupsField.tsx`          | Field-group checkboxes                                                                                                                   |
| `GzipCompressionField.tsx`            | Gzip toggle; self-hides for Parquet                                                                                                      |
| `BlobStorageStatusSection.tsx`        | Status header, last-error alert, sync card                                                                                               |

**External consumers**: none — the components are only mounted by the
settings page above.

**State ownership — draft-lifetime model**: server state lives in the
tRPC query (page). Form state is a **disposable draft scoped to one
entity identity**: the container mounts `BlobStorageIntegrationForm`
keyed on `projectId` + config existence, only after the query and
project have resolved. Initial values flow in once via `defaultValues`;
edits flow out only via `onSubmit`. There is no reset path at all — no
reactive `values`, no `resetOptions`, no reset `useEffect`. Identity
changes (project switch, create, delete) remount the form; same-entity
refetches (5s status poll, post-save invalidation) keep the key stable
and therefore can never wipe or leak a draft. Consequence, by design:
clean fields do not live-update from background refetches while the
form is mounted. Field-group components receive the typed `control`
prop and subscribe to individual fields with `useWatch`; there is no
local Zustand store and no feature `useEffect`.

**Performance boundaries**: a keystroke or select change rerenders only
the field-group component watching that field. The form layer reads no
field values and holds no async state; mutation pending-state lives in
the container.
