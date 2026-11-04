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

The corpus, integration, and property suites replay identical stored JSON bytes
through the production OTEL queue with early Rust media extraction off and on.
Both runs retain TypeScript normalization, enrichment, tokenization, remaining
media detection, overflow handling, and the production JSON writer. Model and
prompt lookups, media uploads, and evaluation scheduling use test doubles.

Each replay creates isolated Memory tables from the live schema and uses the
production JSON writer singleton. A thin client adapter substitutes the
temporary destination table for production table names and rejects unmapped
inserts. Blob-storage file logging and background trace evaluation jobs are
disabled. The harness drains the writer before reading persisted rows. The
integration suite also covers dual writes by draining only its queued legacy
jobs into isolated trace and observation tables and removing those jobs even
when legacy processing fails. The suites keep generated seeds reproducible and
disable retries. Memory tables cover ClickHouse types, defaults, and serialization;
MergeTree deduplication and production materialized views are outside the run.

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

`events_full.event_bytes` is ClickHouse's `byteSize(...)` estimate of the final typed row after media extraction and field overflow. Migration 0056 explicitly lists all application-owned columns, excluding `event_bytes` itself, aliases and other materialized derivatives. This is a stable estimate, not a requirement to track every column addition. Include fields expected to hold large payloads through a new migration if their omission materially affects the estimate. ClickHouse rejects `*` and `COLUMNS()` in column DEFAULT expressions. Native CI compares the estimate with the live row's typed size, allowing 5% drift, using captured, generated and payload-heavy rows. Strings count UTF-8 bytes plus ClickHouse's in-memory overhead; maps, arrays, tuples and numeric values use their typed sizes. This is indicative uncompressed volume, not JSON serialization length or compressed disk usage. The core and billing materialized views carry the full-row value, even when core truncates input/output/metadata.

Deploy the migration before writers that omit `event_bytes`. When v4 event writes are enabled, worker startup checks the `byteSize` DEFAULT with `DESCRIBE TABLE events_full` and exits before queue consumers load if it is absent, so automated web migrations or manual migrations must finish first. This uses table metadata permissions implied by table-level SELECT or INSERT grants, without querying system tables. The DEFAULT accepts explicit values from older workers during a rolling deployment; those rows retain the old metric until every writer is upgraded. No existing parts are materialized or backfilled. To roll back, restore older writers before resetting the default to zero. Staging propagation also omits the column so the calculation sees the joined v4 row rather than the staging/trace inputs. Live experiment propagation also uses this default; historical backfill writers keep their existing accounting behavior.

Raw ingress limits and byte-length telemetry remain pre-media measurements. Trace-batch intake keeps its own JSON size estimate for read-capacity guards, computed only when intake is enabled.
