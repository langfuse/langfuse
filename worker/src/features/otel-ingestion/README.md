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

## Comparing sampled TypeScript batches with Rust

With TypeScript as the direct writer, `LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE`
selects a stable cohort by project and source file. At the default rate of `0`,
the worker can start and ingest batches with only the production tables installed. Rates of
`0.001`, `0.01`, and `0.05` select approximately 0.1%, 1%, and 5% of batches.
A sampled batch retains the input approved by masking. Each worker retains up to
four batches and 64 MiB of input in total. Saturation skips the comparison.

Only batches routed to the direct events writer participate. The TypeScript
queue job keeps its normal success or retry behavior. After its
direct event writes reach a terminal outcome, a background task prepares a fresh
native batch and runs the production Rust processor on the accepted input. The
comparison also runs when TypeScript throws after input acceptance, produces no
rows, or its writer drops rows. Masking rejections provide no input for a
comparison. Samples are in memory: a worker crash can lose a comparison.

Provision `events_native_test` on the same ClickHouse deployment before sampling.
For an unreplicated local database the following creates an empty table with the
current columns, defaults, partitioning, sorting key and engine:

```sql
CREATE TABLE events_native_test AS events_full;
```

For replicated tables, use the deployment's normal shard and replica topology
and give the shadow table its own replication path. Keep schema changes and
retention in sync with the comparison you intend to run. Only the primary table
should feed production materialized views.

The shadow writer uses the production Native transport with the isolated
destination. Rust consumes the primary media and overflow upload outcomes.
Evaluation and trace scheduling run their normal selection code, with adapters
that capture the requested writes. Model, pricing, prompt and skill reads can
observe changes between the two runs.

### Reading the results

- **Batch outcome.** `langfuse.ingestion.otel.shadow.pair` records the primary
  and shadow outcomes and failure stages. Group by `primary_outcome` and
  `shadow_outcome` to find one-sided failures. A real upload or queue failure and
  a simulated request have different meanings: the shadow can compare what it
  requested and what it did with the primary upload result.
- **Side effects.** `langfuse.ingestion.otel.shadow.effect_difference` counts
  missing and extra operations by kind, including evaluation payload digests.
  Filter by `coverage:complete` for fully observed comparisons. Partial comparisons
  retain the operations observed before a failure.
  Evaluation capture covers the execution upsert, the snapshot upload and its
  digest, and the job enqueue. Trace recording compares the span start and
  matched rules. Each implementation estimates dispatch capacity independently.
- **Stored rows.** `langfuse.ingestion.otel.shadow.row_verification` compares
  the acknowledged row keys in both tables. The verifier waits at least five
  seconds after the last batch fills the 64 MiB sampled-input target. Sparse traffic flushes
  when the oldest batch reaches 30 seconds. Each query reads up to 512 distinct keys across both
  tables. One query runs at a time per worker. It uses the production primary-key
  prefix, exact trace/span, start time and source file. ClickHouse hashes the
  stored columns, including defaults and derived columns, excluding only the
  ingestion clocks `created_at`, `updated_at`, and `event_ts`. The worker gets
  counts and digests. The `map_order_only` outcome isolates ordering changes
  within usage, cost and tool-definition maps. Each worker retains up to 16,384 pending locators or
  8 MiB of locator metadata. Excess locators count toward the `capacity`
  outcome. Duplicate or unattributable results are ambiguous. A query error
  increments `langfuse.ingestion.otel.shadow.verification_read_error`.
- **Timing.** Compare `langfuse.ingestion.otel.shadow.paired_processing_duration_ms`
  by `implementation` on successful, events-only pairs, grouped by
  `primary_media_path`. The distribution
  `processing_rust_to_ts_ratio` divides Rust elapsed time by TypeScript elapsed
  time for each individual batch. A value of 0.8 means Rust took 80% as long.
  Dual-write primary timings also include legacy work. Inspect
  `paired_writer_wait_duration_ms` separately: low shadow traffic can leave a
  row waiting for a periodic flush. The primary performs real uploads and job
  scheduling, while the shadow replays upload outcomes and captures requests.
  Shadow model and prompt lookups bypass Redis caches. These timings include
  that cost and the TypeScript side-effect I/O. The distributions measure the
  rollout workload, so they can guide a production-path benchmark.

### Investigating a difference

The persisted-row report includes counts and one example per mismatch type.
For a value or map-order difference, one additional batched read identifies
the columns involved. For example, `changedColumns: ["event_bytes", "input"]`
means both the input and its stored size differed. `orderOnlyColumns` lists maps
whose entries match when sorted. Each example gives the number of writes
acknowledged and the number of copies found on each side.

Use the logged `rowKey` in an authorized ClickHouse session to locate the
original ingestion file. Supply the example's project ID, UTC timestamp,
numeric trace hash and span ID as query parameters. Run against the side
that stored the row. Use `events_native_test` for a shadow-only row.

```sql
SELECT DISTINCT blob_storage_file_path
FROM events_full
WHERE project_id = {projectId:String}
  AND toStartOfMinute(start_time) = toStartOfMinute({startTime:DateTime64(6, 'UTC')})
  AND xxHash32(trace_id) = {traceHash:UInt32}
  AND span_id = {spanId:String}
  AND start_time = {startTime:DateTime64(6, 'UTC')}
```

If the example omits the span ID, omit its predicate. Historical span IDs can
contain arbitrary text. Multiple deliveries of the same span can return several
file paths. Inspect the reported columns on those rows in the same session.

Side-effect reports name the operation and give missing and extra counts. Batch
outcome reports give each implementation's failure stage and inserted row count.
Their `batchRowKeys` are examples from that delivery. If neither side stored a
row, use `jobId` to find the primary queue trace by `messaging.bullmq.job.input.id`
when that trace was retained.
