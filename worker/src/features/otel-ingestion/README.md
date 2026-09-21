# OTEL replay tests

Run the production direct-event processing phase against an isolated ClickHouse
table:

```sh
pnpm --filter worker run test:otel-replay
```

Use the normal worker test environment and a migrated ClickHouse database. The
test client uses `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, and
`CLICKHOUSE_DB`; Vitest loads the repository's `.env` without overriding supplied
environment variables. The configured user needs to read the `events_full`
schema and create, insert into, select from, and drop the test tables. An
unavailable ClickHouse server fails the run.

The tests start with decoded OTLP resource spans and call `processOtelEvents`,
the same function used by the queue. They exercise event normalization, media
transformation, enrichment, overflow handling, and the real ClickHouse writer.
External service responses and uploads are supplied by test doubles. Each run
creates a uniquely named Memory table from `events_full`, reads persisted rows
back, and drops the table during cleanup. Inserts are restricted to this test
destination.

The Memory table exercises ClickHouse types, column defaults, and serialization.
Production MergeTree deduplication and materialized views are outside this run.

This is an integration test of the direct-event phase. HTTP/protobuf decoding,
S3 input loading, masking, routing, and legacy writes remain outside this test
boundary. The existing `test:native-codec` suite compares the TypeScript writer
with Rust Native encoding inside ClickHouse. A future complete Rust processor
can consume the same replay inputs and use that table comparison.

## Remote execution

The same command can run from a checkout on an authorized remote host, including
a bastion with an appropriate runtime and database access, or locally through
an existing tunnel. Install the repository dependencies and build the shared
package as for local worker tests; provide the remote database connection in the
environment. No code needs to execute on the bastion when using a tunnel.

The current corpus is synthetic. Fetching production S3 batches and replaying a
time window are separate extensions; this command does not discover production
credentials, enqueue production jobs, or download customer data.
