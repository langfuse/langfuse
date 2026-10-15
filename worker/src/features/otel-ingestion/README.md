# OTEL replay tests

Run the OTEL replay suites against an isolated ClickHouse table:

```sh
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

## Main-thread telemetry

`langfuse.ingestion.otel.early_media.preparation_duration_ms` retains its elapsed
preparation scope and adds `codepath`: `inline_check` for small marker-free inputs
(up to 128 KiB), `uv_dispatch` when extraction or masking dispatches native work,
and `disabled` when neither is needed. Small inputs with a marker use
`uv_dispatch` even though the inline check ran first. `outcome=unchanged` means
original bytes are reused, not that the payload has no media.

`langfuse.ingestion.otel.main_thread_duration_ms` records one accumulated sample
per measured phase per early-media queue attempt, tagged with `media_path=early` and downstream
`media_presence` (or `unknown` on unclassified attempts). It covers candidate
checking, native input copying/dispatch and result materialization, input
length accounting, UTF-8 decoding and JSON parsing, masking JSON, legacy/direct
conversion, schema validation, media scans/JSON/rewrite, decoding/hashing, and
record serialization/metadata flattening. Repeated media and per-record segments
are summed before emission. Nested segments count only toward their outer phase.

Reference-path calls are passthroughs: no clocks are read and no main-thread
phase samples are emitted. Each measured callback is synchronous. Native promises are awaited after its
timer stops. Download, libuv queue/compute, masking HTTP, uploads/association
writes, database waits and disposal awaits are excluded. These are coarse
explicit wall-clock timings of selected synchronous blocks, not a CPU profile:
GC/OS pauses inside a block are included; small bookkeeping, library-internal
async continuations, tokenization and deferred writer flushes are not a complete
accounting of all process CPU. The existing elapsed distributions are unchanged.
