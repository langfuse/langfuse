# Internal cloud trace-batch experiment

This read-only experiment measures full-event reads and transcript assembly for
idle traces. It requires
`NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` and explicit opt-in. All four enablement
flags below default to `false`; an ordinary release needs no infrastructure
changes. These internal controls are intentionally absent from env templates.

## Controls

| Variable                                      | Default   | Role                                                                                                       |
| --------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `LANGFUSE_TRACE_BATCH_INGESTION_ENABLED`      | `false`   | Track accepted direct-v4 event writes in Redis.                                                            |
| `LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED`     | `false`   | Schedule idle traces into BullMQ jobs.                                                                     |
| `QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED` | `false`   | Register the batch worker.                                                                                 |
| `LANGFUSE_TRACE_BATCH_READ_ENABLED`           | `false`   | Allow the worker to query ClickHouse; otherwise discard jobs.                                              |
| `LANGFUSE_TRACE_BATCH_SAMPLING_RATE`          | `1`       | Fraction admitted by ingestion, from 0 to 1.                                                               |
| `LANGFUSE_TRACE_BATCH_STRATEGY`               | `project` | Choose project-order packing or opt-in locality grouping.                                                  |
| `LANGFUSE_TRACE_BATCH_MAX_SIZE`               | `60`      | Maximum traces per job, up to 10,000.                                                                      |
| `LANGFUSE_TRACE_BATCH_MAX_THREADS`            | `2`       | ClickHouse threads per query (positive integer).                                                           |
| `LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE`         | unset     | Optional positive `max_block_size` hint; unset inherits the server profile.                                |
| `LANGFUSE_TRACE_BATCH_EXPERIMENT_ID`          | unset     | Optional 1–64 character attempt/query label: letters, digits, `.`, `_`, `-`; first character alphanumeric. |
| `LANGFUSE_TRACE_BATCH_CONCURRENCY`            | `2`       | Concurrent batch jobs per worker process.                                                                  |
| `LANGFUSE_TRACE_BATCH_IDLE_MS`                | `600000`  | Idle time before a trace is ready (10 minutes).                                                            |
| `LANGFUSE_TRACE_BATCH_PENDING_TTL_MS`         | `7200000` | Pending retention and inactivity expiry (2 hours).                                                         |
| `LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS`   | `30000`   | Dispatcher cadence (30 seconds).                                                                           |

Producer, dispatcher and consumer can run independently. Sampling reuses the
evaluator's deterministic trace-ID sampler; every observation of the same trace
gets the same admission decision. Dispatch and consumption do not resample.
Cloud guards cover ingestion, dispatcher execution, worker registration and
processing, and the shared queue accessor, including admin queue inspection.

## Redis state and expiry

- `{trace-batch}:due`: sorted set, with JSON `[projectId, traceId]` members and
  Redis server time plus idle delay as the score.
- `{trace-batch}:state`: hash with the same members and JSON
  `{minStart, maxStart, revision, eventUpdateCount, serializedEventBytes}` values. Bounds describe observed event start
  times; revision protects newer ingestion from an older dispatch acknowledgment.
- `{trace-batch}:dispatcher`: renewable dispatcher lease.

No event payloads are stored here. Atomic Lua updates accumulate estimates and
refresh bounds, revision and readiness. Each admitted intake
sets a shared absolute expiry on both pending keys with `PEXPIREAT`, preserving
any later existing expiry using `PEXPIRETIME` (Redis 7+). With no further intake,
both keys expire after the retention period even if every application stops;
idle time is not added to this deadline.

This is a whole-key inactivity backstop, not native per-member expiry. During
continuous intake, bounded Lua cleanup removes members whose due time is older
than retention; ingestion and dispatcher both perform cleanup.

## Dispatch and reads

One dispatcher holds the renewable lease. It snapshots ready IDs, sorts them by
project, then hydrates and revalidates state in chunks of 1,000. Jobs contain up
to the configured trace cap; project leftovers can share a job. The dispatcher
enqueues before acknowledging matching revisions, so concurrent intake stays
pending and failed enqueueing can be retried. Stable job IDs limit duplicates.

### Pending-window size estimates

Accepted direct-v4 writes contribute their final serialized UTF-8 event size after
field overflow handling, reusing the writer's existing `event_bytes` calculation.
The accounting field itself is excluded. Acceptance means admission to the writer,
not confirmation of a ClickHouse flush. `eventUpdateCount` counts accepted updates,
including retries and repeated observation versions; neither counter represents
unique observations or a trace's lifetime total. Deletion after enqueue, readiness
and two-hour retention are unchanged. Later arrivals start another pending window.
Entries missing either counter remain unknown until dispatch or expiry removes them.

The dispatcher emits `estimated_event_update_count` and
`estimated_serialized_event_bytes` distributions under `langfuse.trace_batch`, tagged
with `scope:trace|batch` and `strategy`. Batch totals require known estimates for
every member; `estimates_unavailable` counts unknown traces and affected batches.
Estimates stay out of queue payloads, job IDs and batch selection. They do not cap
work or change oversized-trace handling. Dispatch retries can emit another sample.

Serialized event bytes differ from the reader's `io_metadata_bytes` metric: they
include the serialized event fields and JSON encoding, and do not represent RAM,
network transfer or ClickHouse scan bytes. After rollout, collect a stable hour
with unchanged sampling and batching settings; compare trace/batch distributions,
unknown-estimate counts, ingestion latency and Redis command rate/CPU/memory with
the baseline before choosing any size-aware batching policy.

The worker streams full `events_full` payloads and records batch observation,
trace, project and logical payload-byte metrics. The `input_bytes`, `output_bytes`
and `metadata_bytes` distributions under `langfuse.trace_batch` each report one
total per completed batch read; `io_metadata_bytes` retains their combined total.
Sizes count UTF-8 bytes, including metadata keys and values, excluding JSON
transport framing/escaping and compression. They do not measure ClickHouse bytes
scanned or per-trace ingestion size; retries can record another batch sample.
Exact `(projectId, traceId)`
pairs protect tenant boundaries; project, trace hash and a shared outer time
window prune reads. Each selected trace also gets its own interval, so unrelated
batch companions cannot widen the payload returned for that trace.
`TRACE_QUERY_BUFFER_MS` pads each recorded interval by two minutes on both sides.
This fixed margin neither waits for arrivals nor guarantees trace completeness;
repeated intervals for the same pair form a union without duplicating rows.
Queries use response compression and chunked multipart parameters for up to
10,000 UUID-sized trace/project IDs. The fixed 30-second timeout fails the job
rather than accepting partial results. This does not cap observation count,
query memory or dispatcher snapshot memory.

## Per-trace transcripts

The reader orders only by project ID and trace ID. The worker keeps
one trace's observations, assembles it when the pair changes, and flushes the last
trace only after a successful end of stream. A stream error discards the current
partial trace; earlier completed traces have already emitted samples. Each trace
uses the shared depth-first ordering and transcript assembler. Transcripts are
ephemeral: neither logs nor job results contain their content.

Completion means all rows returned for that pair's query window, not that no late
events can arrive. Event versions follow the current ClickHouse merge state;
the shared ordering function keeps one observation per ID. Retries can repeat
per-trace samples.

These distributions use the `langfuse.trace_batch` prefix:

| Metric | Sample |
| --- | --- |
| `transcript_assembly_duration_ms` | One trace's ordering and assembly time, excluding I/O conversion, stream waits and tokenization; `has_transcript:true\|false`. |
| `transcript_tokens` | Token estimate of the complete transcript JSON (history, current turn and provenance); zero when no transcript can be assembled. |

Transcript token counts use the existing local worker-thread pool and bundled
tiktoken WASM, without a network or model API call. The `gpt-4o` configuration
selects `o200k_base`, also used by GPT-5 mini and nano
([OpenAI mapping](https://github.com/openai/tiktoken/blob/main/tiktoken/model.py)); metrics are tagged
`tokenizer:o200k_base`. These are serialized-payload estimates, not provider
billing counts or a model's full request framing.
Unknown estimates are omitted and counted in `token_estimation_unavailable`.
Rejected estimates increment `token_estimation_failed` and omit the token sample;
they do not retry the batch. Only the assembled transcript is tokenized.

The worker submits one transcript for tokenization while streaming the next
trace's observations. Before submitting another transcript it awaits the previous
promise, keeping at most one pending token estimate per batch. Success and stream
failure both drain accepted promises; a stream failure never assembles its
partial final trace. Assembly itself remains synchronous. `read_duration_ms`
includes all this processing.

Memory includes the current trace, the previous transcript being tokenized and
stream buffers, multiplied by active batch jobs. A single trace remains unbounded.
The default two-thread tokenizer pool is shared with ingestion; overlap hides
waiting time but does not remove CPU use or contention. Its existing 30-second
timeout rejects the promise without cancelling queued/running encoding, so the
pending-promise bound is not a cancellation guarantee. Watch tokenization failures
alongside `runtime.node.mem.rss`, `runtime.node.mem.heap_used`, worker
CPU and queue depth before raising batch concurrency.

ClickHouse must sort the filtered result, so compare query memory and latency against the unordered
baseline before increasing load.

Enable percentile aggregations for these distribution metrics in Datadog
Metrics Summary, then select p50, p75, p90, p95 and p99 in Metrics Explorer.
Datadog computes these across workers; do not average worker percentiles.
See [Datadog distributions](https://docs.datadoghq.com/metrics/distributions/).
Metric delivery and percentile configuration must be verified after deployment.

## Capacity measurements

The following metrics use the `langfuse.trace_batch` prefix. All additions are
inside the existing cloud experiment paths; normal ingestion with tracking
disabled performs no new aggregation or Redis calls.

| Metric | Kind / tags | Meaning |
| --- | --- | --- |
| `event_updates`, `serialized_event_bytes` | Counters; `stage:eligible\|sampled\|recorded` | Accepted, valid-start-time updates before sampling, after sampling, and in Redis-acknowledged chunks. Repeated updates count again. |
| `read_attempts` | Counter; `outcome:success\|failure\|discard` | One outcome per processor invocation, including retries, validation failures and disabled/expired discards. |
| `read_duration_ms` | Distribution; same outcome tags | Wall-clock processor duration, including failed and discarded attempts. |
| `active_reads` | Per-process gauge | Streams currently being consumed; failures decrement the count too. |
| `failed_read_observation_count`, `failed_read_input_bytes`, `failed_read_output_bytes`, `failed_read_metadata_bytes`, `failed_read_io_metadata_bytes` | Distributions | Partial logical rows/bytes consumed before a stream failure. Separate from successful throughput. |
| `queue_depth` | Gauge; `type:waiting\|active\|delayed\|failed` | Global BullMQ snapshots; waiting includes paused work. |
| `queue_waiting_head_age_ms` | Gauge | Maximum creation age of the next FIFO jobs in waiting/paused lists. Zero when empty. |
| `redis_key_bytes` | Gauge; `key:due\|state` | Estimated memory of each readiness key, including Redis overhead. |
| `redis_key_entries` | Gauge; `key:due\|state` | `ZCARD` / `HLEN` at the memory snapshot. |

The eligible/sampled counters reuse the already-computed serialized size and
per-trace aggregates. Recorded volume is emitted after each acknowledged Lua
chunk: earlier chunks remain counted if a later one fails. A timeout can mean
Redis applied an update without acknowledgement, so the stage difference includes
uncertain outcomes; it does not prove data loss. Writer acceptance still precedes
the ClickHouse flush. No additional serialization is performed.

`TraceBatchMetricsRunner` starts when either the dispatcher or consumer is
enabled in a cloud worker, independently of the generic queue-metrics flag.
It polls the queue every 30 seconds and map memory every 60 seconds per process,
plus collection time. No completed jobs or progressing dispatcher are required.
Queue-age collection reads only the next waiting/paused job IDs and their
timestamp fields; it never fetches or parses batch payloads.
One failed collection does not suppress the others; failed samples are not
reported as zero. Check `langfuse.periodic_runner.completed` and
`last_healthy_timestamp_seconds` with `runner:trace_batch_metrics` for freshness.

Memory collection uses one bounded two-key Lua call with `MEMORY USAGE ...
SAMPLES 5`, preserving the shared key prefix and Redis Cluster slot routing.
Missing keys report zero; there is no keyspace scan or exact full-hash traversal.
Memory sampling estimates storage, not process RSS or event payload size.

Queue/map snapshots are global and can be emitted by several workers: use
max/latest across reporters, never sum duplicates. For map totals, first
deduplicate reporters per `key`, then add the due/state estimates. In contrast,
`active_reads` is local to a worker; distinct live worker series may be summed.
It is emitted on stream start/finish and on each metrics-runner cycle, including
zero when idle, so unchanged long-running reads remain visible.
Instantaneous gauges can miss short-lived peaks. A retried job may re-enter
behind newer jobs, so waiting-head age is a bounded-cost backlog indicator, not
an exact oldest-created-job measurement across the entire queue.

With an experiment ID, start/completion logs include `jobId`, `attempt`,
`queryId` and `experimentId`, with the completion outcome. The per-read UUID is
forwarded to ClickHouse as `query_id` and remains the root correlation ID for
the stream. Discards and validation failures have no query ID. Identifiers are
not metric tags and logs contain no event payloads. Successful batch metrics and
job return values retain their existing meanings.

Completion logs also correlate the requested `batchTraceCount`, distinct
`batchProjectCount`, `eventTimeSpanMs` (outer event-time span, without query
buffering), and `maxTraceSpanMs` with the outcome and `durationMs`. These are
batch-locality proxies, not measured ClickHouse scan costs. `observationCount`,
`foundTraceCount`, `foundProjectCount` and separate `inputBytes`, `outputBytes`,
`metadataBytes` describe rows consumed by that attempt. `partial: true` marks
failed reads, including failures before any row arrives; zero then does not mean
the requested batch was empty. Successful counts cover the completed stream,
not unique ingested events. Discarded/unparsed jobs omit stream counters.
Use these existing logs to compare batch shape and volume across outcomes by
query ID; no payload contents, project-ID lists or per-batch metric tags are added.

With an experiment ID, the BullMQ processing span also carries attributes under
`langfuse.trace_batch.*`: `experiment_id`, `job_id`, `attempt` (one-based),
`query_id`, `batch_trace_count`, `batch_project_count`, `event_time_span_ms`,
and `max_trace_span_ms`. Shape and query ID are attached before reading, so they
remain available if the stream fails. Completion adds `outcome`, `duration_ms`,
`observation_count`, `found_trace_count`, `found_project_count`, `input_bytes`,
`output_bytes`, `metadata_bytes`, and `partial`, with the same semantics as the
logs. Discards and validation failures omit query/stream fields. These reuse
existing aggregates without additional queries or serialization. Payloads and
project/trace-ID lists are not attached. Dispatcher size estimates remain aggregate
metrics, not per-job span attributes; consumed bytes are not estimated total size.
Span availability follows the existing tracing sampling and retention settings.

For the initial scaling curve, use deterministic trace sampling at 10%, 20%,
50%, then 100% across the same project population. Annotate fixed UTC windows;
pause tracking and drain old readiness/queued work between settings. Warm up at
least 20 minutes and compare a settled hour at each stage, holding batch/query
settings fixed. Plot actual admitted updates/bytes and returned rows/bytes against
CPU, memory and backlog rather than assuming configured percentages equal load.
These additions do not generate amplified reads or change batching, query limits,
late-arrival behavior, queue payloads or retention.

Pair the metrics with per-worker RSS/CPU/event-loop and network telemetry, Redis
primary telemetry, and experiment-filtered ClickHouse query logs. Include failed
attempts in CPU cost, count successful root results once, and verify distributed
CPU-counter accounting before summing query parts. Query memory peaks are not
actual concurrent replica RAM. Validate live metric delivery and units before
raising production load.

## Compare reader settings

Establish a fresh control measurement after deploying this reader: both arms
must use the same per-trace windows and compression. Hold sampling, batch cap,
concurrency, threads, idle delay and traffic cohort constant; then change only
block size (and the identifying label):

| Variable                              | Control               | Treatment         |
| ------------------------------------- | --------------------- | ----------------- |
| `LANGFUSE_TRACE_BATCH_MAX_THREADS`    | `2`                   | `2`               |
| `LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE` | unset                 | `512`             |
| `LANGFUSE_TRACE_BATCH_EXPERIMENT_ID`  | `trace-block-control` | `trace-block-512` |

Run these settings only in cloud workers with the existing four enablement
flags explicitly set to `true`. Changing a query setting does not enable any
part of the pipeline. `max_block_size` is a row-count hint, not a byte or memory
limit; large inputs may still dominate memory. Keep the initial cap at 120 when
comparing existing experiments; raising the supported ceiling is not a rollout
recommendation.

With an experiment ID, each read attempt logs its label, build ID, configured
threads/block size, batch size, concurrency, sampling and timing controls before
querying, including failed attempts. The same ID enters ClickHouse
`log_comment` alongside existing surface/route/project attribution. Leave the ID
unset to suppress these per-attempt logs. Strategy attribution uses the
dispatcher metrics described below. Compare
query memory/latency and worker memory as well as input/output/metadata byte
metrics. Redis storage load tests do not measure selector or query memory.

### Opt-in locality grouping

`LANGFUSE_TRACE_BATCH_STRATEGY=locality` changes grouping only after dispatch is
explicitly enabled in a cloud region. The default `project` strategy preserves
project ordering and carries unfinished jobs across hydration chunks.

Locality sorts each hydrated window by project, minimum start minute, maximum
start minute and `xxHash32(traceId)`. It finds the fewest feasible jobs under the
trace cap and an event-time envelope of at most one hour, or 125% of the first
trace's observed span if larger. Within that job count, it minimizes project
boundaries, then minute × trace count, then gaps between trace hashes. These are
read-locality proxies, not measured ClickHouse scan costs.

Locality combines each window of at most 1,000 hydrated candidates with retained
partials. Compatible same-project partials may merge when their buffered time
intervals overlap and the combined batch respects the cap and envelope limits.
At most `maxBatchSize - 1` traces are retained across all partials; oldest-due
partials dispatch first when that budget is exceeded. The last window flushes
all remaining partials, so carry never outlives the current dispatch run.

The full ready-ID snapshot remains unchanged; only selector input is bounded. Selector
cost is O(n × k × cap), where k is the fewest feasible jobs. Measure duration
before increasing scale, especially with distant event times that force many jobs.

Compare `dispatched_batches` (tags `strategy`, `fill`),
`event_time_envelope_ms`, `observed_start_span_ms`, `candidate_buffer_size` and
`selector_duration_ms` under `langfuse.trace_batch`. The envelope metric includes
the reader's two-minute margin on each side; the selector's envelope limit does
not. Payload and Redis state are unchanged.

## Monitor dispatcher memory

The baseline intentionally snapshots the complete ready cohort. Batch size limits
jobs, not snapshot memory. Retain this behavior for the initial experiment and
watch memory alongside backlog growth before deciding whether to add paging.

The worker enables Datadog Node runtime metrics. In Metrics Explorer, filter to
the experiment environment and worker service, and inspect the maximum per
worker/container rather than a fleet average:

- `runtime.node.mem.rss`: total process memory; compare with the container limit.
- `runtime.node.mem.heap_used`: JavaScript heap in use.
- `langfuse.trace_batch.snapshot_size`, `pending_traces`, `ready_traces` and
  `oldest_due_age_ms`: snapshot and backlog growth.
- `langfuse.periodic_runner.duration_ms` and `completed`, filtered by
  `runner:trace_batch_dispatcher`: run duration and outcome.

Runtime memory is shared with other work in the process, so correlation with
dispatch runs does not isolate the dispatcher's allocations. Periodic sampling
can miss short peaks, and `snapshot_size` is emitted only after parsing/sorting
finishes. Check worker restarts/OOM events as well. Verify live metric delivery
and available instance tags in Datadog before relying on these signals.

## Stop and drain

Disable ingestion and dispatch to stop new work. Leave the consumer enabled and
set the read flag to `false` to complete and remove jobs without querying or
parsing their payloads. Jobs at least two hours old are also discarded on pickup.
Reads already in progress finish under their query timeout.

On process shutdown, the dispatcher stops scheduling and waits up to five seconds
for its active dispatch. If Redis stalls, it logs a warning and lets the remaining
shutdown steps proceed. This timeout does not cancel an already issued Redis command.

BullMQ waiting jobs have no autonomous TTL: disabling all consumers leaves them
queued until consumption resumes. Draining requires an active, unpaused worker;
delayed jobs become eligible later. Normal completed jobs retain IDs for up to
one hour / 10,000 jobs, and failures retain up to 1,000 jobs under BullMQ's
lazy retention rules. Drain and expired jobs are removed immediately on success.

For an already enabled cloud experiment, explicitly set the new read flag to
`true` when deploying this version if reads should continue; leaving it unset
drains instead. Upgrade all producers before relying on native expiry: older
producers do not install or refresh that TTL.
