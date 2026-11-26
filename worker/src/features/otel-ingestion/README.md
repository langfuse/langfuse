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

With TypeScript as the direct writer, `LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE` (0 to 1, default 0) selects a share of batches that the Rust path processes as well, and the worker compares the two. The Rust run writes rows to `events_native_test` only. It uploads no media and makes no evaluation or trace-activity write.

**Setup.** Run `otel-shadow-table.sql`, one of the shared package's ClickHouse scripts, in the ingestion writer's database before raising the rate; `pnpm --filter=shared run ch:dev-tables` does it locally. It is not a migration, so drop and recreate the table after a migration changes the `events_full` columns. Rows expire early on the next UTC day.

**Reading a comparison.** Metrics use the prefix `langfuse.ingestion.otel.shadow.`; the Rust run's own metrics are named `langfuse.shadow.*`.

`batch` by `result`:

- `both_ok`, `rust_failed`, `ts_failed`, `both_failed`: which path failed, with the failure class in `ts_error` and `rust_error`. `row_keys` says whether both wrote the same rows in this attempt; rows left by an earlier attempt of the same file can make the stored rows match when the attempts did not. It is `unchecked` when TypeScript could not build or write a span's row. `eval_writes` and `eval_snapshots` say whether both made the same evaluation writes, and are `unchecked` when one of TypeScript's evaluation writes failed.
- `throttled`: selected by the rate but not sampled, because too many rows waited to be compared on that worker. An `OTEL shadow sampling is throttled` warning gives the effective rate.
- `skipped`: sampled, but the worker was at its limit of Rust runs in flight.

`rows` by `outcome`:

- `matched`: both paths stored the row with equal columns.
- `different`: both paths stored the row and another column differs; `rows.changed_column` names it.
- `missing_rust`, `missing_ts`: the named path has no row under that file, trace id, span id and start time. A span the two paths store under different start times counts as both.
- `not_found`: neither table had the row when it was read.
- `read_error`, `unverified`: the read failed, or the row's start time was not readable.

For `duration_ms`, compare only batches tagged `side_effects:none` and `write_mode:events_only`.

**Limits.**

- A failed TypeScript media upload shows as a `different` row, because the Rust run does not upload.
- Rows that reach ClickHouse after the comparison read count as missing, or as `not_found` when both sides are late.
- A span sent twice, such as an exporter retry, is stored in two files but keeps one row in `events_full`. When the kept row belongs to the other file, the sampled file's span counts as `missing_ts`.
- A batch whose TypeScript processing fails before the direct step is not compared.
- The Rust addon records five counters under their production names, so they read high by the sample rate: `langfuse.ingestion.otel.conversion_failure`, `langfuse.ingestion.metadata_dropped`, `langfuse.ingestion.metadata_undecoded`, `langfuse.ingestion.usage_details.validation_failure` and `langfuse.ingestion.usage_details.total_mismatch`.
- A model, prompt or rule lookup that fails during the Rust run only, or a rule lookup that fails for TypeScript only, can show as `different` in `row_keys` or `eval_writes`.
