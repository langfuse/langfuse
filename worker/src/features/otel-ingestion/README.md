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

The corpus, integration, and property suites serialize their fixtures to S3
document bytes and replay identical bytes through the production OTEL queue in
both the original TypeScript path and the early-media TypeScript path. The
harness checks the selected S3 download method and compares persisted rows after
each run. Both paths use TypeScript normalization, enrichment, tokenization,
media and overflow handling, and the production JSON writer. Model and prompt
lookups, media uploads, and evaluation scheduling use controlled test doubles.

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

Dual comparisons check persisted `events_full`, trace, and observation rows
between the original extractor and early extraction, excluding only generated
`created_at`, `updated_at`, and `event_ts` timestamps. Media checks compare the
content and logical associations requested from the upload/link services rather
than requiring identical call counts, since early extraction can reuse an
upload. Directed expectations supplement parity so both paths dropping media
does not count as success. These checks cover the effect of early extraction on
dual writes, not independent correctness of every legacy transformation.

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
