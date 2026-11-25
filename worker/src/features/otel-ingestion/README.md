# OTEL replay tests

Run the OTEL replay suites against an isolated ClickHouse table:

```sh
pnpm --filter worker run build
pnpm --filter worker run test:otel-replay
```

Use local or disposable test services: migrated ClickHouse and Postgres databases
and Redis without active ingestion consumers. The
test client uses `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, and
`CLICKHOUSE_DB`; Vitest loads the repository's `.env` without overriding supplied
environment variables. The configured user needs to read the `events_full`
schema and create, insert into, select from, and drop the test tables. An
unavailable ClickHouse server fails the run.

## What a replay checks

1. Run the same stored JSON through original TypeScript, TypeScript with early
   media extraction, and Rust with early media extraction. The Rust
   path also normalizes and enriches spans and detects remaining media.
2. Let each production writer encode and send its insert. The test client
   redirects, for example, an `events_full` insert to a fresh table with the
   same columns and defaults. An insert into an unexpected table fails the test.
3. Flush the writers and compare the rows ClickHouse stored. In dual-write
   tests, the harness also processes its own legacy jobs and checks the trace
   and observation tables. It removes those jobs even if processing fails.

The test tables use the Memory engine. They exercise serialization, column types,
and defaults. MergeTree deduplication and materialized views need separate coverage.
Generated cases have reproducible seeds. The harness disables retries, blob-storage
file logging, and background trace evaluation jobs.

## Scope and caveats

- Scratch tables isolate ClickHouse inserts and provide predictable readback
  targets. They do not isolate the whole application from production services.
  Dual tests create Postgres project/session state and real Redis jobs; run them
  only against test services. Another worker consuming those jobs would race the
  harness.
- Each replay processes one document under the direct-v4 route, with optional
  legacy writes. The job explicitly selects ingestion version 4; an empty
  staging table does not test the queue-forwarded events route.
- Legacy merge reads still target ordinary trace and observation tables. Dual
  cases use fresh projects with no existing rows. They do not cover updates
  across replay calls: a later call cannot read the earlier scratch writes.
  Such tests need reads and writes to share the same isolated state first.
- The harness invokes production queue processors in-process, including the
  legacy jobs it enqueues. It does not exercise BullMQ worker consumption,
  Redis deserialization, scheduling, or retries.
- Media uploads and association writes use test doubles. Their calls can verify
  content and destinations, but do not prove object-storage persistence or
  Postgres media/link persistence. Model/prompt lookups and evaluation services
  are also controlled rather than end-to-end.

The current corpus is synthetic. Production S3 capture is a separate extension:
preserve the raw object bytes, then replay against local services with an
explicit routing/configuration context. Running from a bastion is compatible
with that model, but pointing this test command at production databases or
queues is not.

## Persisted event size

`events_full.event_bytes` uses ClickHouse's `byteSize(...)` estimate of input, output, metadata, trace/span/user/session identifiers, names and status text after media extraction and overflow. Internal bookkeeping, derived values and copied experiment metadata are excluded. This measures typed, uncompressed customer payload rather than JSON length or disk usage. Core and billing projections retain the untruncated payload estimate. Keep the formula stable across small schema additions; include new large customer payload fields through a later migration.

At startup, TypeScript writers detect the sizing DEFAULT with `DESCRIBE TABLE events_full`. If confirmed, direct and staging writes omit `event_bytes`; otherwise they keep their legacy estimates. Detection failures warn and continue. The mode stays fixed until restart. Native blocks always omit the column and require the migration first. Older writers may still supply explicit sizes. Historical rows and backfill accounting are unchanged. Restore older writers before rolling back the database default.

Raw ingress limits and byte-length telemetry remain pre-media measurements. Trace dispatch intake estimates read capacity separately for sampled spans. See [trace-window size estimates](../traceDispatch/README.md#trace-window-size-estimates).

## Rust direct processing

`LANGFUSE_OTEL_DIRECT_IMPLEMENTATION=rust` selects Rust for direct events-table writes in projects admitted by the early-media selector. It requires early extraction; media uploads remain optional. Unselected projects keep the original TypeScript path. Legacy writes remain in TypeScript in dual-write mode; events-only Rust jobs skip constructing the TypeScript span graph. The Rust path retains the native media registry through normalization and service calls.

Native errors reject the job without falling back to TypeScript processing.

## Comparing TypeScript and Rust ingestion

With TypeScript as the direct writer, `LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE` selects batches by project and source file. The default of `0` requires only the production tables. Use `0.001`, `0.01` and `0.05` for a 0.1%, 1% and 5% rollout. Each increase includes the earlier sample.

The worker retains up to four accepted inputs totaling 64 MiB. When TypeScript processing returns or throws, the worker passes the post-masking input to the same `processRustOtelEvents` that writes to `events_full` when `LANGFUSE_OTEL_DIRECT_IMPLEMENTATION=rust` selects Rust as the primary writer. Both runs resolve models, prompts and skills through their production services and evaluate the scheduling rules. The shadow uses the native writer with `events_native_test` as its destination. The replay receives its media, evaluation, and trace-recording handlers as arguments. They compare each write request and return the corresponding primary result. Rule and sampling lookups can still refresh shared Redis caches. Primary exceptions still propagate to the ingestion queue.

Before enabling sampling, run the [shadow table setup SQL](../../../../packages/shared/clickhouse/migrations/otel-shadow/0061.sql) in the ingestion writer's database. It clones the current event columns and defaults on an unreplicated installation.

When a forward migration changes those columns, add the corresponding SQL for existing shadow tables under [otel-shadow](../../../../packages/shared/clickhouse/migrations/otel-shadow), using the same version number. On installations with sampling enabled, pause sampling during the upgrade and apply the shadow SQL for the versions being crossed.

The worker supplies `created_at` when it processes a batch, so backfilled spans land in the current UTC day. Each day's parts become eligible for expiry at 00:10 UTC the next day. The ten-minute grace covers ordinary verifier lag across midnight. ClickHouse removes expired parts asynchronously. Deleting a trace or project from the primary tables can still leave its full input, output and metadata in the shadow table until cleanup.

Each processor records the row keys its writer accepted. After replay, the worker compares those keys and queues them for a background read of both tables. Graceful shutdown drains the buffer. A worker crash can lose outstanding comparisons. The `row_verification` metric counts keys skipped at capacity and keys left unverified after a read error.

### Reading a comparison

Metrics use the prefix `langfuse.ingestion.otel.shadow.`.

- `pair` reports each processor’s outcome (enqueued rows, empty batch or exception) and the stage that failed. The discrepancy log includes enqueue counts, handled failures by stage and up to three row keys. For a shadow exception, `shadow_failure_reason` identifies a known native error code or failure category. Raw exception messages can contain span IDs and field values.
- The same log counts missing and extra service requests by kind. For an evaluation that matches, this includes the observation snapshot, execution record and queue request. For trace dispatch it compares trace IDs, start times and selected rules. Each path uses its own size estimate. Failed attempts count, so check the failure stages before attributing later missing requests.
- The worker groups row checks by 64 MiB of sampled input and checks smaller groups after 30 seconds. One indexed query reads both tables for up to 64 keys. If an enqueued row is still missing, the worker checks that key once more after 30 seconds. A missing result means the row was absent at the final read. A later insert can still succeed. Graceful shutdown flushes the writers before the final check.
- When both rows are visible, the verifier compares every column except the three write-time clocks. Mismatch reports identify the row and changed columns, including maps that differ only in key order. They omit field values.
- In worker JSON logs, filter by `otel_ingestion_mode:shadow` for calls made during replay. The batch report distinguishes `shadow_only_failure`, `primary_only_failure`, and `both_failed` even with text logging. Replayed lookups and inserts also emit ordinary service logs, which can include lookup names or driver error messages.
- For asynchronous shadow insert failures, filter `langfuse.queue.clickhouse_writer.rows_dropped` by `entity_type:events_native_test` and `format:native-test`. A batch can finish processing before the writer exhausts its insert retries.
- Compare `paired_processing_duration_ms` for successful events-only batches with the same primary media path. Filter on `primary_effects:none` to select batches where TypeScript attempted no captured media, evaluation or trace-dispatch writes. Both paths can still perform enrichment reads, and Rust can benefit from caches warmed by TypeScript. The measurement excludes the buffered writer wait.

For standard OTEL files, the discrepancy log includes `sourceFile` even when both writers enqueued zero rows. Resolve it under `<event upload prefix>otel/<projectId>/` in the event bucket. For other file layouts, use a reported row key in an authorized ClickHouse session. Query the side that stored the row and omit the span predicate if the example has no span ID. Multiple deliveries can return several file paths.

```sql
SELECT DISTINCT blob_storage_file_path
FROM events_full
WHERE project_id = {projectId:String}
  AND toStartOfMinute(start_time) = toStartOfMinute({startTime:DateTime64(6, 'UTC')})
  AND xxHash32(trace_id) = {traceHash:UInt32}
  AND span_id = {spanId:String}
  AND start_time = {startTime:DateTime64(6, 'UTC')}
```
