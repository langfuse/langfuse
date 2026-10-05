# OTEL replay tests

Run the OTEL replay suites against an isolated ClickHouse table:

```sh
pnpm --filter worker run test:otel-replay
```

Use the normal worker test environment and a migrated ClickHouse database. The
test client uses `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, and
`CLICKHOUSE_DB`; Vitest loads the repository's `.env` without overriding supplied
environment variables. The configured user needs to read the `events_full`
schema and create, insert into, select from, and drop the test tables. An
unavailable ClickHouse server fails the run.

The corpus, integration, and property suites serialize their fixtures to S3
document bytes and pass those bytes to the production OTEL queue processor. The
queue performs the normal download and JSON decoding; normalization, enrichment,
tokenization, media and overflow handling, and ClickHouse persistence use the
TypeScript implementations. Model and prompt lookups, media uploads, and
evaluation scheduling use controlled test doubles.

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

## Remote execution

The same command can run from a checkout on an authorized remote host, including
a bastion with an appropriate runtime and database access, or locally through
an existing tunnel. Install the repository dependencies and build the shared
package as for local worker tests; provide the remote database connection in
the environment. No code needs to execute on the bastion when using a tunnel.

The current corpus is synthetic. Fetching production S3 batches and replaying a
time window are separate extensions; this command does not discover production
credentials, enqueue production jobs, or download customer data.
