# Internal cloud trace-batch experiment

This read-only experiment measures full-event reads for idle traces. It requires
`NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` and explicit opt-in. All four enablement
flags below default to `false`; an ordinary release needs no infrastructure
changes. These internal controls are intentionally absent from env templates.

## Controls

| Variable                                      | Default   | Role                                                          |
| --------------------------------------------- | --------- | ------------------------------------------------------------- |
| `LANGFUSE_TRACE_BATCH_INGESTION_ENABLED`      | `false`   | Track accepted direct-v4 event writes in Redis.               |
| `LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED`     | `false`   | Schedule idle traces into BullMQ jobs.                        |
| `QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED` | `false`   | Register the batch worker.                                    |
| `LANGFUSE_TRACE_BATCH_READ_ENABLED`           | `false`   | Allow the worker to query ClickHouse; otherwise discard jobs. |
| `LANGFUSE_TRACE_BATCH_SAMPLING_RATE`          | `1`       | Fraction admitted by ingestion, from 0 to 1.                  |
| `LANGFUSE_TRACE_BATCH_STRATEGY`               | `project` | Choose project-order packing or opt-in locality grouping.     |
| `LANGFUSE_TRACE_BATCH_MAX_SIZE`               | `60`      | Maximum traces per job, up to 1,000.                          |
| `LANGFUSE_TRACE_BATCH_CONCURRENCY`            | `2`       | Concurrent batch jobs per worker process.                     |
| `LANGFUSE_TRACE_BATCH_IDLE_MS`                | `600000`  | Idle time before a trace is ready (10 minutes).               |
| `LANGFUSE_TRACE_BATCH_PENDING_TTL_MS`         | `7200000` | Pending retention and inactivity expiry (2 hours).            |
| `LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS`   | `30000`   | Dispatcher cadence (30 seconds).                              |

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
pairs protect tenant boundaries; project, trace hash and a shared batch time
window prune reads. `TRACE_QUERY_BUFFER_MS` pads the earliest and latest recorded
start times by two minutes each. This fixed query margin can include observations
outside the recorded bounds; it neither waits for arrivals nor guarantees trace
completeness. Query limits are fixed at two threads and 30 seconds with
timeouts failing the job. Per-trace windows, query tuning controls and allocation
based on trace size are separate experiments.

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

Locality selections dispatch immediately per window of at most 1,000 candidates.
Partials do not carry between windows, which can increase small jobs. The full
ready-ID snapshot remains unchanged; only selector input is bounded. Selector
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
producers do not install or refresh that TTL. Locality partial carry, query controls and load
test artifacts belong in separate follow-up changes.
