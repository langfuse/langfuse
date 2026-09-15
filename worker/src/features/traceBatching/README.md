# Internal cloud trace-batch experiment

This read-only experiment measures full-event reads for idle traces. It requires
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
  `{minStart, maxStart, revision}` values. Bounds describe observed event start
  times; revision protects newer ingestion from an older dispatch acknowledgment.
- `{trace-batch}:dispatcher`: renewable dispatcher lease.

No event payloads, per-trace byte counts or observation counts are stored here.
Atomic Lua updates refresh bounds, revision and readiness. Each admitted intake
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
unset to suppress these per-attempt logs. Strategy attribution belongs to the
separate locality change; this reader does not add a strategy control. Compare
query memory/latency and worker memory as well as input/output/metadata byte
metrics. Redis storage load tests do not measure selector or query memory.

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
producers do not install or refresh that TTL. Locality and load-test artifacts belong in separate follow-up changes.
