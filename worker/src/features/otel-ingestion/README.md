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
4. One generated suite also compares what the TypeScript and Rust paths hand evaluation scheduling for each span. It builds spans from every attribute key the TypeScript processor names and lists the keys the two paths still read differently.

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

## Rust shadow run

With TypeScript as the direct writer, `LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE` (0 to 1, default 0) selects a share of batches that the Rust path processes as well, for comparison. A batch of any size qualifies when its project uses early media extraction, it takes the direct events write and ingestion masking is off. The choice is fixed per project and file, so a retry repeats it and a higher rate keeps the files a lower rate chose.

**Setup.** Run [`otel-shadow-table.sql`](../../../../packages/shared/clickhouse/scripts/otel-shadow-table.sql) in the ingestion writer's database before raising the rate; `pnpm --filter=shared run ch:dev-tables` does it locally. The statement suits ClickHouse Cloud and a single node; a self-managed replicated cluster needs `ON CLUSTER` and a Replicated engine, as the `events_full` migration has. The table copies the `events_full` columns as they are at that moment, so drop and recreate it after a migration changes them. Its parts expire an hour into the day after they were written, because project and trace deletion do not reach it. The worker refuses to start with a rate above 0 while the OpenTelemetry SDK is disabled, because the shadow's metrics are told apart through its context.

**What runs.** The job runs the TypeScript direct step as usual and returns its result or error. Afterwards, without holding the job, the worker prepares the downloaded input again and calls `processRustOtelEvents`, the function that writes `events_full` when Rust is the direct writer. It receives writes that store nothing in production: rows go to a separate writer that accepts `events_native_test` only, media uploads answer with the id derived from the content hash, and evaluation and trace-activity writes are recorded and skipped. Model, prompt, skill and rule lookups are the production ones and share their caches, and decoding a media body takes a slot in the shared media upload pool. At most two Rust runs are in flight per worker, each holding its downloaded input and a native batch until it finishes; a batch sampled beyond that skips its run.

**Telemetry.** The Rust run has its own trace (`otel-rust-shadow`), whose span carries the file key and, after a failure, the failure class. The metrics it records are named `langfuse.shadow.*` (for example `langfuse.shadow.ingestion.event` instead of `langfuse.ingestion.event`), in Datadog and CloudWatch, so production series and monitors do not include them. With JSON logs its lines carry `langfuse.shadow_run`. Logs and metrics the Rust addon emits itself are not marked.

**Reading a comparison.** Metrics use the prefix `langfuse.ingestion.otel.shadow.`.

- `batch` counts each sampled batch by `result` (`both_ok`, `rust_failed`, `ts_failed`, `both_failed`, `skipped`), with each side's failure class (`ts_error`, `rust_error`: the native error code, else the job failure reason) and `rust_stage` (`prepare`, `process`). `eval_writes` says whether both sides made the same evaluation writes by id: job executions, queued jobs, snapshots and trace activity. `eval_snapshots` says whether the observation snapshots have the same content. An `OTEL shadow batch differs` warning lists the ids only one side wrote and the snapshot fields that differ.
- `rows` counts stored rows by `outcome`. The worker compares the stored rows of every `both_ok` batch in the background, 20 seconds after the batch at the earliest. One query reads up to about 3,500 rows of many batches from both tables by primary key, and the worker runs one such query at a time, bounded by two threads and a 60 second limit. A row has a counterpart only under the same file, trace id, span id and start time, so `different` always means that both sides stored the row and at least one other column differs; a span the two sides store under different start times counts as `missing_rust` and `missing_ts`. The query returns counts, column names and up to three span ids per file, never values. The other outcomes are `matched`, `not_found` (in neither table), `read_error` (a read of the file failed; counts every row of that file that no read found) and `unverified` (the start time is not readable, or the batch would have taken the rows waiting on that worker above 100,000). `rows.changed_column` counts files per differing column, and an `OTEL shadow rows differ` warning names the file. Every column a writer sets is compared except the three write-time clocks; `event_bytes` and the materialized and alias columns follow from those. Maps are compared regardless of key order.
- `duration_ms` records how long each `implementation` took per `phase` (`prepare`, `process`). Only TypeScript performs real uploads and evaluation writes, and the Rust run shares the process with later jobs, so compare batches tagged `side_effects:none` and `write_mode:events_only`. TypeScript's legacy conversion and legacy writes are not included.

**Limits.** A batch whose TypeScript processing fails before the direct step is not compared. A failed TypeScript media upload shows as a differing row, because the Rust run does not upload. Rows that reach ClickHouse after the comparison read count as missing, or as `not_found` when both sides are late. A span that arrives in two files, such as an exporter retry, keeps one row in `events_full`; when the other file's row is the one kept, the sampled file's span counts as `missing_ts`. Comparisons not finished at shutdown are dropped, and a Rust run still going then can report a failure.
