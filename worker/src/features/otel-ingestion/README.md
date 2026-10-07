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

## Early-media rollout

`LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED` is the kill switch.
`LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS` selects projects by exact ID:

| Enabled | Project IDs           | Selected path                            |
| ------- | --------------------- | ---------------------------------------- |
| `false` | Any valid value       | Original TypeScript for everyone         |
| `true`  | Unset or empty        | Original TypeScript for everyone         |
| `true`  | `project-a,project-b` | Early extraction for those projects only |
| `true`  | `*`                   | Early extraction for everyone            |

Whitespace around IDs is ignored. Mixing `*` with IDs fails worker startup,
including when the toggle is disabled.
The selection happens before downloading or passing the document to Rust.
`LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED` and the media bucket configuration still
control whether media is extracted and uploaded; the selector does not enable
uploads by itself or change the existing late TypeScript detector.

Native discovery can extract more occurrences than the late TypeScript detector
would accept, including deeply nested media. Its temporary references identify
pending occurrences, not completed uploads. After normalization, the resolver
uploads eligible occurrences and restores the others inline before tokenization,
evaluation scheduling, and persistence. The late detector remains active, but
tests also check native extraction directly so it cannot hide missed candidates.

The early path replaces malformed UTF-8 sequences with U+FFFD before JSON
validation, following [OTLP receiver guidance](https://github.com/open-telemetry/opentelemetry-proto/blob/main/docs/specification.md#utf-8-string-handling).
Masking and media discovery use that same sanitized source. Masked responses pass
through the same boundary within the existing masking retry and fail-open/fail-closed
policy. Invalid JSON still fails; preparation never falls back to TypeScript.

Start with internal projects and a dedicated secondary OTEL worker pool:

- Primary workers redirect the canary IDs using
  `LANGFUSE_SECONDARY_OTEL_INGESTION_QUEUE_ENABLED_PROJECT_IDS` and keep early
  extraction disabled. That existing redirect list requires IDs without
  surrounding whitespace. Set
  `QUEUE_CONSUMER_OTEL_INGESTION_SECONDARY_QUEUE_IS_ENABLED=false` in this pool.
- Canary workers consume only the secondary OTEL queue, enable early extraction
  for those same IDs, and start with
  `LANGFUSE_OTEL_INGESTION_SECONDARY_QUEUE_PROCESSING_CONCURRENCY=1`.
  Set `QUEUE_CONSUMER_OTEL_INGESTION_QUEUE_IS_ENABLED=false` and
  `QUEUE_CONSUMER_OTEL_INGESTION_SECONDARY_QUEUE_IS_ENABLED=true` in this pool.
  Concurrency is per queue shard per worker; account for shard count and replicas
  when sizing the canary pool.
- Ensure other workers do not consume the secondary queue during this canary.
  A separate queue without a separate process does not isolate native crashes
  or out-of-memory failures. Other consumers hosted in the canary process share
  its fate too.

Broaden the project list after checking both media-heavy and media-poor traffic
in events-only and dual-write modes. Use `*` only for an intentional full rollout.
Configuration is read at worker startup: disable the toggle and restart/roll
workers to stop selecting early extraction for new jobs. In-flight processing is
not cancelled. Original S3 documents and queue payloads remain unchanged.

### Rollout telemetry

Datadog is the primary backend for rollout monitoring; CloudWatch is a reduced
secondary export.

- `langfuse.ingestion.otel.media_path{path=early|reference}` counts selected
  processing paths per queue attempt, after secondary-queue forwarding. The queue
  span has the same `langfuse.ingestion.otel.media_path` attribute. Selection does
  not imply that media was found or that processing completed.
- `langfuse.ingestion.otel.early_media.preparation` counts one final preparation
  outcome: `native`, `masking_drop`, or `error`.
  `preparation_duration_ms` measures validation, masking, compaction and validator
  disposal. Both use `outcome` and `extract_media` tags. They exclude S3 download
  and the subsequent ingestion pipeline. A native result may contain no media.
- Existing `langfuse.ingestion.otel.media` counters describe upload/reuse/failure
  callbacks and associations by `write_path=legacy|direct`. Reuse can avoid an S3
  upload, and dual writes can report more than one association for the same asset.
  Media counters, byte distributions, detection checks and processing duration
  also carry `media_path=early|reference`. Filter or group by this tag to compare
  pipelines, or omit the grouping to aggregate them. The tag describes the whole
  media-processing path: late TS detection within an early batch is still tagged
  `early`. Existing media duration
  covers late detection/resolution/uploads, not native preparation.

Watch queue age/retries, worker RSS/CPU/event-loop delay and restarts alongside
preparation errors and media outcomes. The dedicated pool provides a
cohort for resource comparisons without project-ID metric tags. Existing byte
counters do not measure whole-document compaction savings, and restore outcomes
have no dedicated counter. The reference S3-size metric counts JavaScript string
code units while the early path counts bytes; avoid exact cross-path size ratios
for non-ASCII input. These metrics are rollout diagnostics, not a substitute for
persisted-row and side-effect parity tests.
