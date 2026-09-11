# Trace batch read experiment

This opt-in worker experiment measures how much ready traces can share a
ClickHouse query. It reads full input, output, metadata and tool fields, streams
and counts the rows, then discards the payloads. It does not run evaluators,
generate transcripts, or write topic results.

## Data flow

Direct-v4 OTel ingestion collects accepted event writes, samples trace IDs, and atomically updates
two Redis keys: `{trace-batch}:due` (sorted set) and `{trace-batch}:state` (hash).
The shared Redis client adds the configured key prefix; the hash tag puts both
keys in one Redis Cluster slot. There is no project index. Each member encodes
`[projectId, traceId]`; state holds the minimum/maximum observation start time
and a unique revision. Redis server time determines ten minutes of inactivity;
observation start time determines the query bounds.

One lease-owning dispatcher snapshots at most 1,000 due members and their state
atomically and enqueues one batch per project containing all of that project's
traces in the snapshot. There is no additional per-project batch-size cap;
projects spanning multiple snapshots can produce multiple batches.
It acknowledges only after enqueue succeeds, atomically removing state and due
membership when the revision still matches. New arrivals remain scheduled.
Each run stops at 10 seconds or 10,000 traces, checking the budget between jobs;
an in-flight Redis/queue operation can exceed that elapsed-time budget. A
60-second lease is renewed before snapshots and enqueues. Shutdown waits for the
in-flight dispatch to finish and stops before another batch.

The consumer makes one streamed query per batch with exact project/trace
filters, explicit trace-hash pruning, and each trace's min/max start time plus a
two-minute buffer. No observation-count cap silently truncates a trace. Queries
use at most two execution threads and a 30-second execution limit; failures
throw and follow the queue's three-attempt retry policy. Only counts and logical
I/O/metadata bytes are retained in job results.

## Controls and rollout

All enablement flags default to `false`. Sampling defaults to `1` (100%), so
enabled intake tracks every eligible trace unless a lower rate is configured.

| Setting                                       | Default  | Purpose                                            |
| --------------------------------------------- | -------- | -------------------------------------------------- |
| `LANGFUSE_TRACE_BATCH_INGESTION_ENABLED`      | `false`  | Track accepted direct-v4 event writes in Redis     |
| `LANGFUSE_TRACE_BATCH_SAMPLING_RATE`          | `1`      | Stable trace admission fraction, 0–1 (`0.1` = 10%) |
| `LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED`     | `false`  | Turn ready state into queue jobs                   |
| `QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED` | `false`  | Consume existing `trace-batch` jobs                |
| `LANGFUSE_TRACE_BATCH_CONCURRENCY`            | `2`      | Concurrent reads **per enabled worker process**    |
| `LANGFUSE_TRACE_BATCH_IDLE_MS`                | `600000` | Inactivity before a trace becomes due              |
| `LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS`   | `30000`  | Delay between dispatcher runs                      |

Deploy with flags off. Start consumers on a small, known number of worker
processes, enable the dispatcher, then enable intake on direct-v4 ingestion
workers. Multiple dispatcher processes may be enabled; only the lease owner
dispatches. Consumer concurrency multiplies across the fleet; this is not a
global ClickHouse concurrency limit. Bounded Redis snapshots do not cap payload bytes.

For a normal stop, disable **intake** first and keep dispatcher and consumers
running until Redis pending/ready counts and the queue's waiting/active counts
reach zero. Then disable the dispatcher and consumers. For an immediate stop
to reads, disable consumers and disable intake/dispatcher to stop backlog
growth; existing jobs remain available to resume. These are startup env flags,
so changing them requires a worker rollout. Keep this code deployed while
draining; reverting consumer code cannot drain its queue.

Sampling reuses the evaluator's versioned SHA-256 helper with the trace ID as
its target. At a fixed rate, every observation and retry of a trace gets the
same decision. Increasing the rate includes the previous sample. The rate is
validated between 0 and 1; 0 admits no new traces and 1 admits all. Sampling is
applied once per distinct trace in an ingestion job before Redis tracking.
Normal ClickHouse ingestion is unaffected, and the dispatcher/consumer never
resample admitted work. The project ID still scopes state and queue batches;
it is not part of the sampling hash, matching trace-level evaluator sampling.

Keep the rate consistent across producers and stable during measurements.
Changing rates or running mixed-rate replicas can stop readiness/bounds updates
for an already pending trace if it leaves the sample. Exclude rollout transition
windows from results; a clean comparison can stop intake and drain before
changing the rate and resuming. Sampling makes batches smaller, so sample rates
do not translate directly into query-count reductions or the unsampled batch
distribution: a nonempty project batch still issues one query.

## Datadog

`langfuse.trace_batch.size` is a DogStatsD **distribution**, emitted once after
each successful enqueue call. Enable percentile aggregations on this metric
in **Metrics Summary** before building p50/p75/p90/p95/p99 charts. Datadog
aggregates distributions across hosts; `avg` is the mean and `p50` the median.
See [Datadog distributions](https://docs.datadoghq.com/metrics/distributions/).

Use the same environment/region filter for all queries below (`$scope` denotes
that filter):

```text
avg:langfuse.trace_batch.size{$scope}
p50:langfuse.trace_batch.size{$scope}
p75:langfuse.trace_batch.size{$scope}
p90:langfuse.trace_batch.size{$scope}
p95:langfuse.trace_batch.size{$scope}
p99:langfuse.trace_batch.size{$scope}

a = sum:langfuse.trace_batch.dispatched_traces{$scope,batch_kind:singleton}.as_count()
b = sum:langfuse.trace_batch.dispatched_traces{$scope}.as_count()
singleton trace percentage = 100 * a / b
```

For a whole-window singleton percentage, sum each counter over the window
before dividing. Leave intervals without dispatches as no data. This weights
by **traces**, not by batches. No project or trace IDs are attached to metrics.

Also inspect these metrics under `langfuse.trace_batch`:

| Metric                                                          | Meaning                                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ingestion_trace_count`                                         | Distinct eligible traces per ingestion job, distribution                                              |
| `sampling_rate`                                                 | Configured admission fraction on producers handling eligible jobs, gauge                              |
| `sampling_decisions`                                            | Distinct trace decisions per ingestion job, counter tagged `decision:selected` or `decision:excluded` |
| `tracked_traces`, `tracking_errors`                             | Successful state updates and failed tracking calls, counters                                          |
| `pending_traces`, `ready_traces`                                | Global due-set depth and currently due subset, gauges                                                 |
| `oldest_due_age_ms`, `due_lag_ms`                               | Oldest backlog age gauge and per-dispatch trace lag distribution                                      |
| `reactivated_traces`                                            | Acknowledgements that preserved changed revisions, counter                                            |
| `observation_count`, `found_trace_count`, `missing_trace_count` | Per-consumer-attempt read coverage distributions                                                      |
| `io_metadata_bytes`                                             | Logical UTF-8 payload bytes read per attempt, excluding transport, compression and tool fields        |

Backlog gauges are emitted by the active dispatcher; use a **max**, not a sum,
across hosts for one Redis deployment. They stop updating when dispatch is off.
Due-lag samples use the snapshot time, before that chunk's batches are enqueued.
The existing `langfuse.queue.trace_batch` metrics cover queue waiting/processing
time, depth and failures; periodic-runner metrics cover dispatch failures.
ClickHouse query tags identify `worker: langfuse.queue.trace_batch` so compare
query CPU, bytes read and latency with actual traces processed.

For observed sampling, divide the `sampling_decisions{decision:selected}` count
by the count across both decisions over the same environment and time window.
Repeated trace IDs in different ingestion jobs count again; this is not a
globally unique trace percentage. Compare min/max `sampling_rate` across active
producer hosts to spot mixed rollout settings.

Measure the natural project batch distribution with a fixed dispatch interval
and consumer fleet size. Compare the distribution and singleton trace percentage with
CPU/bytes per found trace, queue delay, missing rows and ingestion latency. If
singletons dominate, try a longer dispatch interval. Additional batch splitting
and cross-project batching are separate experiments.

## Semantics and limits

- Tracking errors do not fail ingestion; monitor tracking errors and latency.
  Tracking awaits shared Redis, so a connection outage can delay ingestion
  while that client's retry policy waits for recovery.
  Writer acceptance precedes asynchronous ClickHouse flush, so inactivity is
  not a guarantee that every write is visible.
- State is deleted after successful scheduling. A trace reactivated afterward
  starts new bounds; earlier historical observations can fall outside them.
  These reads measure the active window and do not guarantee complete historical
  transcripts. The events table may also return pre-merge duplicate versions.
- Enqueue and acknowledgement are not one transaction. Stable job IDs and
  bounded completed-job retention reduce duplicates, but regrouping/retries can
  repeat reads. Metrics describe dispatches/read attempts, not exactly-once
  unique trace processing. A crash can also lose metric samples.
- Pending state has no whole-key TTL: expiring either global key could lose
  unrelated traces. The dispatcher removes acknowledged entries. Keeping intake
  on while dispatch is off grows the active-state backlog.
- No query cache, materialized view, SQL transcript generation, or LLM calls
  are involved in this experiment.

## Local checks

With the standard local Redis and ClickHouse services and shared package built:

```sh
pnpm --filter worker run test traceBatching.test.ts traceBatchQueue.test.ts
pnpm --filter web run test event-repository.servertest.ts -t 'streams complete trace batches'
```

The Redis tests cover bounds/readiness, per-project grouping and metrics,
producer-off draining, enqueue failure, concurrent updates including state
recreation, exclusive dispatch, and shutdown. The ClickHouse test reads more
than 20,000 rows and checks full payloads, tenant isolation, exact trace IDs,
and per-trace time bounds.
The connected integration test uses actual ingestion and batch BullMQ workers,
Redis, OTLP conversion and ClickHouse. It checks fixed 10% sampling identities,
delay reset, persistence of excluded observations, and draining after sampling
is set to zero. A fixed 1,000-trace cohort also covers 0/10/50/100% admission,
reordered replay, nested samples and per-ingestion-job decision counts.
