# Trace readiness and dispatch

Ingestion tracks when a trace goes idle, and a dispatcher enqueues ready traces in batches to `events-dispatch-queue`. The [events-dispatch consumer](../eventsDispatch/eventsDispatch.ts) reads each batch from ClickHouse, stores the transcript and enqueues one job per routed consumer (Topics, trace transcript evals). Events dispatch is on by default. Set `LANGFUSE_EVENTS_DISPATCH_ENABLED=false` to disable the pipeline. `QUEUE_CONSUMER_EVENTS_DISPATCH_QUEUE_IS_ENABLED` (default on) picks the services that run the consumer and the dispatcher (worker-cpu on Langfuse Cloud); a Redis lock keeps one dispatcher active.

- **Trace dispatch** tracks rule-matched traces in the `{trace-dispatch:<shard>}` maps: ingestion → Redis → dispatcher → events-dispatch jobs. A trace is admitted when it passes its project's rule sampling, using a deterministic trace-ID value.

## Recording trace-rule selections

Requires `LANGFUSE_EVENTS_DISPATCH_ENABLED=true` and direct events-table
writes. Recording atomically updates keys under `{trace-dispatch:<shard>:<suffix>}`:

| Map              | Contents                                                                                                                                                   | Retention                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `b:<trace-hash>` | One string key per trace: MessagePack `[minStart, maxStart, serializedEventBytes]`, including nonmatches; raw 16-byte SHA-256 prefix of the JSON identity. | Native TTL, `LANGFUSE_TRACE_DISPATCH_BOUNDS_TTL_MS` after the latest activity (12 hours by default). |
| `pending`        | `{ revision, rules, failed_cnt }` with deduplicated rules; JSON `[projectId, traceId]` identity.                                                           | Eligible for cleanup two hours past due.                                                             |
| `due`            | Same JSON identity, scored by Redis arrival time plus project idle interval.                                                                               | Eligible for cleanup two hours past due.                                                             |

The tag suffix is the smallest base36 value whose CRC16 slot sits mid-range in the
shard's share of the 16384 slots, so shards spread evenly over cluster masters with
equal slot ranges. Drain pending work and switch writers and readers together when
changing key layout or shard count.

Activity merges bounds and resets their TTL. After bounds expire, arrivals
start fresh and discard old selections. Dispatch removes pending entries whose
bounds are missing.
Calls clean up at most 100 expired pending entries, so sparse traffic can delay
removal; key TTLs reclaim inactive maps.

Bytes estimate the weight of accepted events after field overflow.
Failed writes are unrecorded; retries may double-count. Acceptance precedes the
ClickHouse flush. `eventUpdateCount` is a TypeScript measurement only, not Redis state.

The dispatcher reads at most 10,000 oldest due candidates per shard per run, hydrates 50 at a time, and reuses the existing batch selection and byte limits. Bounds contain no event count, so event-count budgets never apply. It enqueues before removing matching revisions, preserving newer ingestion and bounds. Excess candidates stay due for the next run. Cleanup uses bounded Lua calls but may repeat; there is no hard five-second deadline. The events-dispatch consumer reads ClickHouse only for traces with at least one routed consumer rule and counts every trace's outcome in `langfuse.events_dispatch.trace_outcomes`. A job that fails its last attempt or is discarded counts all its traces as `outcome:lost`, since the dispatcher already acknowledged them; this is an upper bound when part of the batch was handed off before the failure. Storage is required: a trace whose transcript cannot be stored is not enqueued to its consumers.

`langfuse.trace_dispatch.redis_key_bytes` / `redis_key_entries` sample the recording maps every 60 seconds per reporting worker, summed across shards: `key:pending|due`. Per-trace bounds keys have no index, so it additionally reports `redis_key_bytes{key:bounds,shard:sampled_mean}`, the mean `MEMORY USAGE` of the bounds keys of up to 20 random pending traces per shard; no keyspace scan. Use max/latest across reporters, never sum these global gauges.

Metrics use `langfuse.trace_dispatch`:

- `event_updates` / `serialized_event_bytes`: `stage:admitted|recorded`, after
  sampling versus acknowledged Redis chunks. Timeouts can leave applied writes
  unacknowledged, so the difference does not prove loss.
- `tracked_traces` / `expired_traces`: acknowledged updates / cleaned pending entries.
- `dispatcher_traces`: fetched, hydrated and successfully enqueued counts per run
  (`stage`). Use `langfuse.periodic_runner.duration_ms` with
  `runner:trace_dispatcher` and `outcome:success|failed` for total runtime,
  excluding skipped lease attempts; compare with ready backlog and oldest due age.
- `filter_outcomes` / `filter_duration_ms`: per-span rule selection.
- `recording_batches` / `recording_duration_ms`: flush outcome and duration. Recording failures warn without failing ingestion; metrics collection failures fail the `trace_dispatch_metrics` runner.

Compare admitted volume with ingestion latency, worker CPU/RSS, Postgres load and
Redis CPU/memory. Queue metrics are under `langfuse.events_dispatch`.

## Readiness requirements

- Every admitted event refreshes the trace's idle deadline. Tracking uses the
  project's configured idle interval, or the deployment default when unset.
- Keep pending scheduling state separate from retained historical bounds. Enqueue
  acknowledgement clears pending state; history survives to support later arrivals.
- A late arrival within history retention opens a new pending window and reads the
  whole known trace, using the earliest and latest retained event starts plus the
  existing two-minute buffer. Backdated arrivals must preserve the previous tail.
- The consumer checks existing summaries against the job enqueue time. Retries
  skip facets completed by this job; later redispatches append updated summaries.
- Bounds, counters, revision and due time are merged atomically. Readiness is
  revalidated before enqueue, and acknowledgement must preserve any newer revision.
- Pending state must survive its idle interval plus recovery grace. Historical
  values have an independent logical TTL and expire without field scans.
- Use Redis 7-compatible operations on standalone Redis, Sentinel and Cluster.
  Every multi-key Lua call stays in one slot; cleanup and Lua batches are bounded.
  One renewable dispatcher lease coordinates scheduling across all shards.
- Redis loss and events outside retained history can leave gaps. There is no
  reconciler, and retained timestamps cannot recover data that was never observed.

## Controls

The gate and the tuning constants live in [eventsDispatch/config.ts](../eventsDispatch/config.ts) (`traceDispatchConfig`, `eventsDispatchConfig`); the env surface is:

- `LANGFUSE_EVENTS_DISPATCH_ENABLED` turns on recording at ingestion, the dispatcher and the consumer.
- `QUEUE_CONSUMER_EVENTS_DISPATCH_QUEUE_IS_ENABLED` (default on; worker-cpu only on Langfuse Cloud) consumes `events-dispatch-queue`, one job at a time, and runs the dispatcher. Its ClickHouse read settings (60 s limit, 2 threads, block size 512), pending-bytes cap and upload concurrency are constants in `eventsDispatch.ts`.
- `LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE` (default 120, at most 1,000) caps traces per events-dispatch job.
- A project's `tracing_readiness_settings.trace_idle_ms` overrides the default idle time (10 minutes, 2 in DEV). Saving refreshes its cache; failed reads fall back to the default.

Rule sampling is deterministic by trace ID. Consumers recheck active Topics settings and the rule's sample before reading ClickHouse.

Lua atomicity prevents command interleaving, but is not an ACID transaction
across Redis, BullMQ and ClickHouse and does not roll back writes on a runtime
script error. Duplicate runs and the accepted Redis failover gap remain part of
this pipeline's delivery contract. There is no reconciler.

## Dispatch and reads

One dispatcher holds the renewable `{trace-dispatch}:dispatcher` lease and snapshots each shard in turn, reading at most 10,000 due candidates per shard and run. It sorts ready IDs by project and due time across shards, then hydrates and revalidates state in single-slot calls of up to 50. Locality selection combines those calls into pools of up to 1,000. Jobs contain up to the configured trace cap and weight budgets; project leftovers can share a job. The dispatcher enqueues before acknowledging matching revisions, so concurrent intake stays pending and failed enqueueing can be retried. Successful enqueues are acknowledged by shard after each hydration window, including when a later enqueue fails, so Redis calls stay bounded by 50 traces rather than job size. Stable job IDs limit duplicates.

The events-dispatch consumer reads the supplied trace window. Per-trace Topics jobs check existing summaries for each facet: a summary processed since the job was enqueued is skipped on retry; a later redispatch generates and appends an updated row. There are no Redis completion markers or staged results. BullMQ still uses Redis for queue delivery.

`ReplacingMergeTree(created_at)` retains the summary with the latest processing
timestamp when the Topics sort key matches. That key includes the unit's start
hour. An event revealing an earlier start in a different hour can leave the
previous summary under its original key. The worker sets `created_at` when
summary processing starts, so it orders processing attempts.
An older, narrower dispatch processed later can replace a summary that includes
newer events. This is an accepted limitation; dispatch-order versioning must be
revisited before requiring the newest dispatch window to win.

Retaining the historical maximum preserves the previous tail even when a late
event's start precedes that tail by more than the query buffer. Once historical
bounds expire or are lost, the prior window cannot be reconstructed from this map.

### Trace-window size estimates

For a sampled trace, TypeScript measures the accepted post-overflow JSON row, excluding the size field. The native writer sums the UTF-8 lengths of the text, metadata and tool fields read by dispatch, plus a fixed allowance per span. This gives small spans weight without serializing the event a second time. Both estimates feed the same Redis totals and byte limits. ClickHouse computes the persisted `event_bytes` separately.

Pending state and history carry cumulative estimates for the retained read window.
Tracking adds newly accepted updates to valid pending totals. When reopening a
trace, it initializes totals from retained history before adding the new updates.
Acknowledgement preserves estimates with the bounds, including for oversized
exclusions. A late window therefore cannot make a known oversized trace appear
small or understate its batch weight by counting only its new events.

Missing estimates remain unknown through updates and redispatch until their
retained window expires. They are not replaced with zero or a count of only the
new events. These are admission estimates, not hard limits on actual ClickHouse
rows or query memory; the two-minute query buffer can include additional rows.
Tracking-volume metrics still count only updates accepted in the current ingestion
batch; dispatcher size distributions use the cumulative estimates.

The dispatcher emits `estimated_serialized_event_bytes` distributions under `langfuse.events_dispatch`, tagged with `scope:trace|batch`. Batch totals require known estimates for every member; `estimates_unavailable` counts unknown traces and affected batches. Estimates stay out of queue payloads and job IDs. Dispatch retries can emit another sample.

Events-dispatch read spans report the ingestion estimate alongside the input, output and metadata bytes actually read per batch.

### Weight budgets and oversized traces

The dispatcher closes a job before its summed byte estimates would exceed `eventsDispatchConfig.maxBatchBytes` (64 MiB), in addition to the trace cap. An over-budget slice is treated like one past its time envelope, and partials coalesce only within the budget. A single trace always forms a job, so a trace heavier than the budget runs alone. Locality packs traces above half of the budget in a separate lane, so one heavy trace does not split the light traces around it into extra jobs. Unknown estimates weigh nothing. Budget-limited jobs report `fill:partial`; the `scope:batch` estimate distributions show how close jobs run to the budget.

After hydration, a trace whose retained byte estimate exceeds `eventsDispatchConfig.maxTraceBytes` (50 MiB) is never queued or read. The dispatcher acknowledges it like a dispatched trace, increments `langfuse.trace_dispatch.excluded_traces` tagged with `reason:serialized_bytes|start_too_old`, and logs `Trace dispatch excluded trace` at warn level with `projectId`, `traceId`, `reason` and the byte estimate. Group that log by `@projectId` to find repeat offenders. Activity after the acknowledgement starts a new pending window that is evaluated again using its retained cumulative estimates, so a trace that keeps growing may be logged more than once. Traces with unknown estimates are never excluded.

Events dispatch streams full `events_full` payloads through `getEventsDispatchEventStream` in `@langfuse/shared`. Exact `(projectId, traceId)` pairs protect tenant boundaries; project, trace hash and a shared outer time window prune reads. Each selected trace also gets its own interval, so unrelated batch companions cannot widen the payload returned for that trace. `TRACE_QUERY_BUFFER_MS` pads each recorded interval by two minutes on both sides. This fixed margin neither waits for arrivals nor guarantees trace completeness; repeated intervals for the same pair form a union without duplicating rows. Queries use response compression and chunked multipart parameters for up to 10,000 UUID-sized trace/project IDs. The read timeout fails the job rather than accepting partial results. Beyond the dispatcher's weight budgets and trace exclusion, this does not cap observation count, query memory or dispatcher snapshot memory.

## Input storage

Events dispatch stores the assembled transcript once per routed trace, then enqueues one job per consumer with the IDs of every rule routed to it. The Topics job resolves those rules' facets at their current version and reads the object back; events dispatch makes no model calls. Each S3 request is bounded to 10 seconds so a stalled request cannot hold a slot indefinitely; the SDK attempt budget stays at its default. An oversized input or failed upload counts the trace as failed and enqueues nothing for it.

The shared `server/eventsDispatch` module uses the event-upload bucket and credentials:

```text
<prefix>events-dispatch/trace-transcript/<hash>/<projectId>/<safeTraceId>/<revision>.json
```

`hash` is the first three hex characters of SHA-256 over `JSON.stringify([projectId, traceId])`. Identifiers use the shared blob-key escaping helpers. The revision comes from the queued readiness entry; a new revision uses another key, while an ordinary PUT of the same revision can replace its object. `put` returns the key and every consumer job carries it as `transcriptS3Path`; readers never rebuild it, so the key format can change without breaking queued jobs.

The stored envelope contains `schemaVersion`, a nullable transcript, `executionIssues` and trace context (nullable session/name, source timestamp and environment). The frozen schema is [versions/v1.ts](../../../../packages/shared/src/server/eventsDispatch/versions/v1.ts); [serialization.ts](../../../../packages/shared/src/server/eventsDispatch/serialization.ts) adapts it to live types. Schema version and readiness revision are independent.

Events dispatch injects `TraceTranscriptStorage` from `createTraceTranscriptStorage()`. Keep storage details behind that interface. Context uses the Topics metadata selection; the transcript alone cannot reconstruct it. Dates inside messages are restored on read, while the trace-context timestamp stays an ISO string. Null transcripts are valid; missing objects, invalid content and download errors fail.

Mixed versions happen: rolling deploys, and self-hosters updating web and worker
at different times. A reader that meets an unknown `schemaVersion` must fail with
the retryable `UnsupportedTraceTranscriptVersionError`, never discard the job or
treat the object as missing. Consumers read inside retried jobs whose backoff
spans a deploy, so the retry lands on an updated reader. Deploy readers for a new
version before enabling its writer; if a writer ships first, the retries cover the
gap. Compatible optional fields may be added to V1 when absent values are safe for
old readers. A breaking change adds `versions/v2.ts`, its adapters and a read
dispatch on `schemaVersion`; existing objects are never rewritten.

Serialize the full envelope once. Skip the entire upload if `json.length` exceeds 1,000,000; do not truncate. This measures UTF-16 code units, not UTF-8 bytes, and does not bound assembly or serialization memory. Size skips emit an info log with identifiers, actual length and limit. StorageService owns upload retries and logs: SlowDown at warning level, other failures including request timeouts at error level. Exhausted failures count the trace as failed in `langfuse.events_dispatch.trace_outcomes`.

Configure the event upload bucket to expire transcripts under `<prefix>events-dispatch/trace-transcript/` after three days. Use a bucket lifecycle rule, the transcript cleaner below, or both. The cleaner deletes without a version ID, so on a bucket with versioning or soft delete it only hides objects; there, a lifecycle rule that expires noncurrent versions is still required. A rule for `evals/` alone does not cover this path. During rollout, check size-skip logs, S3 failures and Topics latency. Consumers that require files must schedule only after a successful PUT.

Like temporary span-eval inputs, these objects have no ingestion deletion references. Trace and project deletion do not remove them. They expire after three days (`TRACE_TRANSCRIPT_RETENTION_MS`). `eventsDispatch/transcriptCleaner.ts` lists `<prefix>events-dispatch/trace-transcript/` with the shared event-upload client, under one Redis lock, and deletes older objects. It starts when `LANGFUSE_EVENTS_DISPATCH_TRANSCRIPT_CLEANER_ENABLED=true` and emits `langfuse.events_dispatch.transcript_cleaner.{files_deleted,failures}`.

## Per-trace transcripts

The reader groups rows by project and trace. It assembles a trace when the pair changes and flushes the last trace only after successful end of stream. A stream error discards the partial final trace while draining already accepted work. Completion covers that query window, not future arrivals. Preserve exact tenant and trace boundaries when changing the reader.

Events dispatch assembles each trace with `assembleTranscriptContext`; the [shared transcript README](../../../../packages/shared/src/server/transcript/README.md) owns transcript semantics. It supplies both the conversation transcript and execution issues for storage. The per-trace Topics job reads the stored transcript and applies [its own model projection](../../../../packages/shared/src/server/transcript/topics-model-input.ts). Topics uses local token counts to enforce its [model input budgets](../topics/README.md).

## Capacity measurements

Queue metrics use the `langfuse.events_dispatch` prefix; map and dispatcher
snapshot metrics use `langfuse.trace_dispatch`. Normal ingestion with dispatch
disabled performs no aggregation or Redis calls for them.

| Metric                                                | Kind / tags           | Meaning                                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `queue_depth`                                         | Gauge; `type:delayed` | Delayed `events-dispatch-queue` jobs. Waiting, active, and failed depth stay on `langfuse.queue.events_dispatch.depth`. Request rate, wait time, and processing time use the generic `langfuse.queue.events_dispatch` series, the same as every other queue. |
| `queue_waiting_head_age_ms`                           | Gauge                 | Maximum creation age of the next FIFO `events-dispatch-queue` jobs in waiting/paused lists. Zero when empty.                                                                                                                                                 |
| `pending_traces`, `ready_traces`, `oldest_due_age_ms` | Gauges, untagged      | Dispatcher snapshot summed (age: maximum) across shards, emitted by the current dispatcher lease holder.                                                                                                                                                     |

The eligible and recorded counters reuse the already-computed serialized size and
per-trace aggregates. Recorded volume is emitted after each acknowledged Lua
chunk: earlier chunks remain counted if a later one fails. A timeout can mean
Redis applied an update without acknowledgement, so the stage difference includes
uncertain outcomes; it does not prove data loss. Writer acceptance still precedes
the ClickHouse flush. No additional serialization is performed.

`TraceDispatchMetricsRunner` starts when the dispatcher or events-dispatch consumer is enabled, independently of the generic queue-metrics flag. It samples the active pipeline's maps every 60 seconds per process and polls the queue every 30 seconds when dispatcher or consumer is enabled, plus collection time. No completed jobs or progressing dispatcher are required. Queue-age collection reads only the next waiting/paused job IDs and their timestamp fields; it never fetches or parses batch payloads. One failed collection does not suppress the others; failed samples are not reported as zero. Check `langfuse.trace_dispatch.memory_samples` for memory collection outcomes. Periodic-runner timestamps indicate runner activity, not successful memory collection.

Memory collection uses bounded per-shard Lua calls with `MEMORY USAGE ...
SAMPLES 5`, preserving the shared key prefix and Redis Cluster slot routing.
Missing keys report zero; there is no keyspace scan or exact full-hash traversal.
Memory sampling estimates storage, not process RSS or event payload size.

Map gauges are summed across readiness shards before they are emitted. Each
worker emits them, so a shard tag would multiply custom metrics by the shard
count on every reporting worker. The dispatcher snapshot gauges are untagged for
the same reason. Inspect a single shard's keys in Redis when diagnosing skew.

Queue/map snapshots are global and can be emitted by several workers: use max/latest across reporters, never sum duplicates. Instantaneous gauges can miss short-lived peaks. A retried job may re-enter behind newer jobs, so waiting-head age is a bounded-cost backlog indicator, not an exact oldest-created-job measurement across the entire queue.

Events-dispatch read spans (`langfuse.events_dispatch.read.*`) carry the query ID, batch shape (trace and project counts, event window) and consumed rows and bytes. `max_block_size` is a row-count hint, not a byte or memory limit.

### Locality grouping

The dispatcher sorts each hydrated window by project, minimum start minute, maximum start minute and `xxHash32(traceId)`. It finds the fewest feasible jobs under the trace cap, the weight budgets and an event-time envelope of at most one hour, or 125% of the first trace's observed span if larger. Within that job count, it minimizes project boundaries, then minute × trace count, then gaps between trace hashes. These are read-locality proxies, not measured ClickHouse scan costs.

Locality combines each window of at most 1,000 hydrated candidates with retained
partials. Compatible same-project partials may merge when their buffered time
intervals overlap and the combined batch respects the cap and envelope limits.
At most `maxBatchSize - 1` traces are retained across all partials; oldest-due
partials dispatch first when that budget is exceeded. The last window flushes
all remaining partials, so carry never outlives the current dispatch run.

Locality bounds selector input. Measure selector duration before increasing scale, especially with distant event times that force many jobs.

Compare `langfuse.events_dispatch.dispatched_batches` (tag `fill`) and `event_time_envelope_ms` with `langfuse.trace_dispatch.candidate_buffer_size` and `selector_duration_ms`. Per-trace event span stays on the events-dispatch read span. The envelope metric includes the reader's two-minute margin on each side; the selector's envelope limit does not. Payload and Redis state are unchanged.

## Monitor dispatcher memory

The dispatcher caps candidates per shard and run. Batch size limits jobs, not all dispatcher memory. Watch memory alongside backlog growth.

The worker enables Datadog Node runtime metrics. In Metrics Explorer, filter to
the environment and worker service, and inspect the maximum per
worker/container rather than a fleet average:

- `runtime.node.mem.rss`: total process memory; compare with the container limit.
- `runtime.node.mem.heap_used`: JavaScript heap in use.
- `langfuse.trace_dispatch.snapshot_size`, `pending_traces`, `ready_traces` and
  `oldest_due_age_ms`: snapshot and backlog growth.
- `langfuse.trace_dispatch.expired_traces{source:dispatcher}` and `langfuse.trace_dispatch.expired_traces`: pending entries expired by the dispatcher and by ingestion; the two writers are different events.
- `langfuse.periodic_runner.duration_ms` and `completed`, filtered by
  `runner:trace_dispatcher`: run duration and outcome.

Runtime memory is shared with other work in the process, so correlation with
dispatch runs does not isolate the dispatcher's allocations. Periodic sampling
can miss short peaks, and `snapshot_size` is emitted only after parsing/sorting
finishes. Check worker restarts/OOM events as well. Verify live metric delivery
and available instance tags in Datadog before relying on these signals.

## Mode and layout changes

Redis key-layout or shard-count changes require coordinating writers and dispatchers: drain pending work using the old layout. Deleting pending keys is not a drain. There is no history migration or reconciler.

On shutdown, the dispatcher stops scheduling and waits a bounded time for its active dispatch. This wait does not cancel issued Redis commands. Queue retention options are owned by the shared events-dispatch queue accessor.
