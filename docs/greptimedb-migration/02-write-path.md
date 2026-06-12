# Detailed Design 02: Write Path ClickHouse → GreptimeDB (approved, includes codex v1+v2 review)

> Based on 00/01/poc-results. This document is the 02 implementation spec; new sessions implement directly from it.

## Implementation Status (2026-06, session 4b6edc03)

The write path is implemented and flipped to be the primary path (worker reads the full history from raw_events and rebuilds, skipping the CH baseline). ClickHouse writes are kept for now for read-path compatibility (04 not yet done).

- ✅ SDK `@greptime/ingester` extended with `Decimal128` (cost DECIMAL(38,12), lossless precision); openfuse library with 10 tables; connection layer `greptime/client.ts`; `rawEvents` (write + full-history read) / `converters` (dedup + round-trip) / `schemaUtils` / `deletion`; `GreptimeWriter` (projection + EAV fan-out).
- ✅ Flip: `processEventBatch` raw_events fail-closed; `ingestionQueue` reads raw_events instead of S3; `IngestionService` `rebuildFromHistory` (skips CH baseline) + deterministic sort (invariant 8); BullMQ payload adds `entityType/batchId`; Redis seen-cache at batch level.
- ✅ Verification: 14 module smoke checks + 3 flip e2e smoke checks (out-of-order input still correct) all pass; converters unit tests + SDK Decimal128 unit test.
- **Faithful replication of original Langfuse semantics (intentional, not a gap)**:
  - **raw_events is a fail-closed, pre-enqueue, pre-sampling SoT** — fully consistent with the original S3 event store: the original processEventBatch also writes fail-closed to S3 first (for all events; sampling only gates enqueue), and raw_events precisely replicates this role. Sampled-out events entering the SoT is pre-existing semantics.
  - **Deletion**: raw_events uses `append_mode` + **TTL** to control the retention period (event-store standard); no row-level hard-delete. The original S3 event store also relied on lifecycle expiration. Deletion compliance is satisfied jointly by `deletion.ts` over projection + EAV (which can DELETE) and raw payload TTL expiration.
  - **Rolling deploy**: when the worker reads empty raw_events and the job carries a `fileKey` (old S3-era job), it falls back to the original S3 event-store read path (`readEventsFromS3Fallback`), so no in-flight job is lost. This fallback can be removed once the old queue is drained.
- ✅ **Delete resurrection (tombstone, implemented)**: when `deletion.ts` deletes an entity, it **appends a tombstone event** to raw_events + deletes the projection/EAV. `parseRawEventHistory` detects the tombstone (with no live event after it → `deleted=true`, supports re-create). `IngestionService.mergeAndWrite(...,deleted)` → final record `is_deleted=1`. Replay only rebuilds the soft-deleted projection (queries filter with `WHERE is_deleted=false`), it does not resurrect. **Project-level deletion** is not tombstoned (entity ids cannot be enumerated); it relies on "deleting a project means no further reprocess" — a bulk reprocess-all over an already-deleted project would still resurrect, leaving a project-level deleted-set as a follow-up.
- ⚠️ **Genuine follow-ups**:
  1. **projection + EAV are non-atomic**: `GreptimeWriter` does a single combined `client.write([...tables])` (projection + EAV share gRPC fate), eliminating the common network split; GreptimeDB has no cross-table transactions, and a residual server partial is backstopped by a drop metric + idempotent rebuild. A reconciliation job can still be added.
  2. **The "Implementation Breakdown" below is the original plan intent**; as-built deviations are in this status section (S3 still upstream, raw_events not deleted, etc.).
  2. **The otel path** is not flipped (still on the original dual-write, does not read raw_events) → split-brain; current scope is public ingestion only.
  3. **S3 + CH kept for now**: the S3 event store is still being written (dual-write SoT during transition), and CH projection writes are kept for read-path compatibility; remove S3/CH after the read path (04) is migrated + the old queue is drained.
  4. `@greptime/ingester` is a local `file:` dependency; CI reproducibility requires it to be published/vendored first.

## Context

Hard fork, storage ClickHouse → GreptimeDB, option 2 (GreptimeDB carries the SoT + projection, drops the S3 event store). This document = the ingestion write path.

**Core decisions (settled):**
1. **App-side merge, reusing existing functions** (not changed to pure append): tags = union / metadata = deep-merge, reusing `overwriteObject` / `mergeRecords`.
2. **Full-history rebuild** (does not read the projection baseline): the worker reads all events for the entity from raw_events, sorts deterministically, and rebuilds the full snapshot from `{}` via an `overwriteObject` chain, writing it to the projection. The write path does not read the projection; the projection degrades to a pure projection, only the read path (04) reads it. Out-of-order naturally disappears.
3. **Worker direct write** (gRPC ingester); pipeline not used in 02 (kept for OTel / pure-conversion helpers).
4. The projection table keeps metadata (JSON) / tags (JSON) columns (single-table read for the read path) + EAV sub-tables (filtering).

## Data Flow

```
API → raw_events(append, SoT, direct gRPC write) → BullMQ(entity ref)
Worker: read ALL raw_events WHERE (project_id, entity_type, entity_id)
      → dedup by event_id → deterministic sort → enrich(Postgres) → merge from scratch(overwriteObject, baseline={})
      → write full snapshot → projection + EAV(*_metadata last_non_null / *_tags append)
Read path (04) reads the projection
```

## Hard Invariants (nailed down, otherwise rework — codex v1+v2 review)

1. **Out-of-order**: full-history rebuild, does not depend on arrival order, no need for field-level version guards.
2. **time_index uniqueness**: the projection merges on `(pk=(project_id,id), time_index)`. On write, time_index must use the merged immutable logical time (trace.timestamp / observation.start_time / score.timestamp), guaranteeing it is constant for the same entity → one row, making read `LIMIT 1` reliable. Multiple time_index for the same pk → alert + reprocess. Projection `merge_mode='last_non_null'`.
3. **metadata EAV = merge table**: `merge_mode='last_non_null'`, PK `(project_id,entity_id,key)`, write the full merged metadata → value update overwrites correctly. **Must not append** (stale hit). `*_tags` = append (union only grows).
4. **dedup**: raw_events append; the worker reads and handles duplicates by `event_id`; the Redis seen-cache stays at **job/batch level** (using batchId), not degraded to event level.
5. **cost = `DECIMAL(38,12)`**: not degraded to Float64. First verify the ingester supports decimal; if not, explicitly note the workaround.
6. **[codex v2] raw_events retention >= projection retention**: full rebuild depends on complete history. If a create expires due to TTL → an incomplete rebuild loses immutable/metadata/tags. **TTL must not be used as a cost-control mechanism** (unless a checkpoint/snapshot is introduced, later).
7. **[codex v2] created_at = `min(raw_events.ingested_at)`** (ingestion time), not the logical event timestamp (otherwise historical SDK timestamps pollute it); updated_at = now; event_ts = now. Produce a field-semantics table.
8. **[codex v2] deterministic replay sort**: `event_ts ASC` + `create-before-update` (type priority) + `ingested_at` + `event_id`. Extend `toTimeSortedEventList` (IngestionService/index.ts:1006). All helpers that depend on the "last event" (e.g. observation prompt lookup, index.ts:767) consume the same sorted list.
9. **[codex v2] duplicate event_id policy**: choose one of first-ingested / last-ingested / mismatch-alert (affects idempotency), defined explicitly.

## Implementation Breakdown

1. **Connection layer** — new `packages/shared/src/server/greptime/client.ts` (modeled on clickhouse/client.ts): write = singleton `@greptime/ingester` (gRPC, conservative retry); read = `mysql2` pool (MySQL wire, for full-history reads + 04). env (`env.ts` ×2): `GREPTIME_GRPC_URL/SQL_HOST/PORT/SQL_READ_ONLY_HOST/DB/USER/PASSWORD/SQL_MAX_OPEN_CONNECTIONS/RAW_EVENTS_TABLE`. CH env kept during transition. health check.
2. **raw_events write** — new `greptime/rawEvents.ts` `writeRawEvents()` (ingester direct write, SoT verbatim, one event one row); change `processEventBatch.ts` S3 upload → writeRawEvents, fail-closed, BullMQ payload drops fileKey and carries `{type,entityType,eventBodyId,batchId}`.
3. **Worker consume + reprocess** — `ingestionQueue.ts`: delete S3 LIST/download, change to `readRawEventsForEntity()` (full history, deterministic sort, event_id dedup); Redis seen at job/batch level; delete blob_storage_file_log write + S3-slowdown; `otelIngestionQueue.ts` likewise. reprocess = same path, worker-driven.
4. **merge rebuild** — `IngestionService/index.ts`: delete `getClickhouseRecord`; change `recordsToMerge` from `[chRecord,...new]` to `[...allHistory]`; reuse `overwriteObject` / `mergeRecords` / `immutableEntityKeys` / `toTimeSortedEventList` (extended tie-break); enrich/cost/tokenization unchanged; delete ClickhouseReadSkipCache.
5. **GreptimeWriter** — new `worker/src/services/GreptimeWriter/index.ts` (port of ClickhouseWriter): singleton + batch queue + flush + requeue + split; `TableName` = Traces/Observations/Scores (DatasetRunItems moved out of 02); `writeToGreptime` (gRPC): full projection row (ms, metadata/tags/cost/usage → Json, cost → DECIMAL(38,12), reserved-word quoting, time_index = immutable); EAV fan-out (metadata → `*_metadata` last_non_null PK includes key; tags → `*_tags` append). `quoteIdent()` + `GREPTIME_RESERVED=["id","name","value","key","type","level","timestamp"]`.
6. **converters / deletion / retention** — new `greptime/converters.ts` (raw event_body → record); `ingestionFileDeletion.ts` → DELETE raw_events/projection/EAV; retention = GreptimeDB TTL (respecting invariant 6).
7. **Files**: new `greptime/{client,rawEvents,schemaUtils,converters}.ts` + `GreptimeWriter`; change processEventBatch/ingestionQueue/otelIngestionQueue/IngestionService/definitions/ingestionFileDeletion/env×2/health endpoint; **leave untouched** utils.ts / merge functions / immutableEntityKeys / enrich / BullMQ / Zod schema.

## Risks

- **R1 (core) raw_events history-scan latency**: every event triggers a full-history read + rebuild for that entity. Per-entity event counts are usually limited; need to benchmark long traces / high-frequency updates. **Cannot truncate history via TTL to control cost (invariant 6)**.
- R2 ingester v0.1.0 (verify unary write error classification, Json/DECIMAL round-trip).
- R3 time_index uniqueness violation (invariant 2).
- R6 raw_events JSON size (keep split/truncate).

## Rollout

dual-write (CH + Greptime reconciliation) → switch reads → delete CH. **Before switching production ingestion, dataset_run_item support must be in place first** (not included in 02).

## Verification

1. seed schema (raw_events + projection [with metadata/tags JSON] + EAV [metadata last_non_null PK includes key, tags append]) via `execute_sql` / `describe_table`.
2. ingest trace-create + generation-create/update + score → raw_events count matches.
3. worker → `SELECT * FROM traces WHERE id=?` single merged row (name from create, metadata deep-merge, tags union); traces_metadata one row per key.
4. Out-of-order: an old event_ts arriving late → correct state. 5. metadata value update: env prod→staging, only staging remains. 6. EAV `explain_query` uses the index. 7. R1: concurrent + long-history p50/95/99. 8. reprocess: delete projection → rebuild consistent. 9. Idempotency: replay produces no duplicates. 10. Tests: adapt IngestionService/processEventBatch tests; merge unit tests pass as-is.

## Environment

GreptimeDB local localhost:4002 (mysql, no password), MCP `mcp__greptimedb__*` read-only (use `mysql -h127.0.0.1 -P4002 public` or the ingester for table creation/writes). TS SDK `/Users/dennis/programming/javascript/greptimedb-ingester-ts` (@greptime/ingester v0.1.0).
