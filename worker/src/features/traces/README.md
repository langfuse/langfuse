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

One lease-owning dispatcher fixes a cutoff using Redis server time and removes
expired entries in atomic chunks of at most 1,000. A single Redis range read
collects the complete nonexpired due ID list. Only the IDs are retained in worker
memory; no temporary database, files or additional Redis index are needed.
A stable binary project-ID sort preserves Redis readiness order within each project.

The dispatcher fetches state in chunks of at most 1,000, atomically checking
that each trace is still due by the fixed cutoff and has not expired. Deleted,
reactivated or missing-state entries are excluded. State contains the current
bounds and revision; observations becoming ready after the cutoff wait for another run.
`LANGFUSE_TRACE_BATCH_STRATEGY=project` keeps the rollback behavior: sort the
complete ID cohort by project, preserve readiness order within a project, and
pack consecutive traces up to `LANGFUSE_TRACE_BATCH_MAX_SIZE` (default 60).
For A:70 and B:70, jobs contain A:60, A:10+B:50, then B:20. Its tail spans
hydration chunks.

The optional `locality` strategy leaves IDs in Redis readiness order and selects
independently inside each hydrated window. It sorts by the `events_full`
physical locality hierarchy: project ID, minimum observed start-time minute,
maximum observed start-time minute, then `xxHash32(trace_id)`. The maximum
minute keeps traces with similar complete observed ranges adjacent; the other
keys align with the table's primary key. Consecutive entries are cut into
batches at `LANGFUSE_TRACE_BATCH_MAX_SIZE`.

This hierarchy makes crossing a project boundary the last fallback when filling
a batch, followed by crossing an observed time range. Within one project and
time range, each batch covers a contiguous trace-hash range. It does not impose
fixed trace-width or overlap assumptions.

Selection is deterministic and worst-case O(n log n) time/O(n) memory, with `n`
hard-bounded to the existing 1,000-entry hydration window. Locality tails flush
inside that window; no candidate state survives a dispatch run. Project mode
may carry at most `max batch size - 1` entries into the next hydration window.
Neither mode adds a second full-cohort state copy.

After enqueue succeeds, acknowledgement atomically removes state and due membership
only when the revision still matches. Arrivals during enqueue remain scheduled.
The full run is not one Redis transaction: ID enumeration happens once, and current
state is revalidated before delivery. Failures or process death leave unscheduled
entries in Redis for retry.

There is no 10-second/10,000-trace run cutoff. The 60-second lease is renewed as
collection and delivery progress. Only one run is active. The next delay subtracts
runtime from the configured interval, so a 5-second run on a 30-second interval
waits 25 seconds. An overrun schedules the next attempt immediately after completion,
without overlapping runs. Shutdown preserves unscheduled entries.
Collecting/sorting the entire cohort delays the first enqueue. Worker memory and
the Redis response size grow with the due backlog; a large range read can delay
other Redis clients. Monitor runtime, cohort size, backlog age and worker memory.

The consumer makes one streamed query per batch with exact project/trace
pair filters, explicit trace-hash pruning, and one shared min/max start-time
window plus a two-minute buffer. No observation-count cap silently truncates a trace. Queries
use at most two execution threads and a 30-second execution limit; failures
throw and follow the queue's three-attempt retry policy. Only counts and logical
I/O/metadata bytes are retained in job results.

## Controls and rollout

All enablement flags default to `false`. Sampling defaults to `1` (100%), so
enabled intake tracks every eligible trace unless a lower rate is configured.

| Setting                                       | Default   | Purpose                                                     |
| --------------------------------------------- | --------- | ----------------------------------------------------------- |
| `LANGFUSE_TRACE_BATCH_INGESTION_ENABLED`      | `false`   | Track accepted direct-v4 event writes in Redis              |
| `LANGFUSE_TRACE_BATCH_SAMPLING_RATE`          | `1`       | Stable trace admission fraction, 0–1 (`0.1` = 10%)          |
| `LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED`     | `false`   | Turn ready state into queue jobs                            |
| `QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED` | `false`   | Consume existing `trace-batch` jobs                         |
| `LANGFUSE_TRACE_BATCH_CONCURRENCY`            | `2`       | Concurrent reads **per enabled worker process**             |
| `LANGFUSE_TRACE_BATCH_MAX_SIZE`               | `60`      | Cross-project trace cap per job (1–1,000)                   |
| `LANGFUSE_TRACE_BATCH_STRATEGY`               | `project` | Rollback baseline (`project`) or experimental `locality`    |
| `LANGFUSE_TRACE_BATCH_IDLE_MS`                | `600000`  | Inactivity before a trace becomes due                       |
| `LANGFUSE_TRACE_BATCH_PENDING_TTL_MS`         | `7200000` | Retention after readiness, pruned during ingestion/dispatch |
| `LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS`   | `30000`   | Target start interval; catches up after overruns            |

Deploy with flags off. Start consumers on a small, known number of worker
processes, enable the dispatcher, then enable intake on direct-v4 ingestion
workers. Multiple dispatcher processes may be enabled; only the lease owner
dispatches. Consumer concurrency multiplies across the fleet; this is not a
global ClickHouse concurrency limit. Trace-count caps do not cap payload bytes.
Changing the strategy requires only a dispatcher rollout; queued payloads and
consumer behavior are unchanged. Set it back to `project` for immediate
algorithm rollback. Do not enable `locality` in production without a controlled
comparison showing lower total ClickHouse work at equivalent required coverage.

When upgrading from single-project jobs, disable the dispatcher before the
deployment and upgrade **every enabled consumer** before resuming dispatch.
Consumers accept persisted single-project jobs and normalize their project ID
onto each trace. Older consumers cannot read cross-project jobs. Before rolling
back consumers, stop cross-project dispatch and drain waiting/active jobs;
handle retained failed cross-project jobs with the newer consumer as well.
The Redis readiness layout, intake flag and sampling cohort are unchanged.

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
distribution: a nonempty batch still issues one query.

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

- `project_count`: distribution of distinct projects per dispatched batch.
  Enable percentile aggregations to distinguish mixed-project jobs from jobs
  filled by one hot project. Query-log attribution is `MULTI_PROJECT` when a
  read spans projects; row coverage counts exact project/trace pairs.
- `found_project_count`: distribution of distinct project IDs in rows actually
  returned by ClickHouse, once per successful consumer attempt. Multiple traces
  and observations from one project count once; requested projects with no rows
  do not count. Empty reads emit zero. Retries contribute another sample.
  Job results expose the same value as `projectCount`. No project IDs are tags.
  Enable percentile aggregations for this metric in Metrics Summary; then use
  `p95:langfuse.trace_batch.found_project_count{env:prod-jp}` (or `prod-eu`),
  replacing `p95` with `avg`, `p50`, `p75`, `p90` or `p99` as needed.

| Metric                                                          | Meaning                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ingestion_trace_count`                                         | Distinct eligible traces per ingestion job, distribution                                               |
| `sampling_rate`                                                 | Configured admission fraction on producers handling eligible jobs, gauge                               |
| `sampling_decisions`                                            | Distinct trace decisions per ingestion job, counter tagged `decision:selected` or `decision:excluded`  |
| `tracked_traces`, `tracking_errors`                             | Successful state updates and failed tracking calls, counters                                           |
| `pending_traces`, `ready_traces`                                | Global due-set depth and eligible subset at the run cutoff, gauges                                     |
| `snapshot_size`                                                 | Complete collected due-ID cohort size, distribution                                                    |
| `candidate_buffer_size`, `selector_duration_ms`                 | Bounded selector input and scoring time, distributions tagged only by strategy                         |
| `event_time_envelope_ms`, `observed_start_span_ms`              | Buffered batch query envelope and per-trace observed start span, distributions tagged only by strategy |
| `dispatched_batches`                                            | Counter tagged by strategy and `fill:singleton/partial/full`                                           |
| `skipped_traces`                                                | Collected entries excluded by pre-delivery validation, counter                                         |
| `expired_traces`                                                | Pending trace entries discarded after retention, counter                                               |
| `oldest_due_age_ms`, `due_lag_ms`                               | Oldest backlog age gauge and per-dispatch trace lag distribution                                       |
| `reactivated_traces`                                            | Acknowledgements that preserved changed revisions, counter                                             |
| `observation_count`, `found_trace_count`, `missing_trace_count` | Per-consumer-attempt read coverage distributions                                                       |
| `io_metadata_bytes`                                             | Logical UTF-8 payload bytes read per attempt, excluding transport, compression and tool fields         |

Backlog gauges are emitted by the active dispatcher; use a **max**, not a sum,
across hosts for one Redis deployment. They stop updating when dispatch is off.
Due-lag samples are recorded after each successful enqueue using worker time.
Snapshot gauges describe collection; the next run refreshes them after delivery.
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
singletons dominate even across projects, try a longer dispatch interval.
Start with a cap of 60 and compare 60/80 using equal admitted trace cohorts;
the cap is an experiment setting, not an established production optimum.

## Semantics and limits

- Tracking errors do not fail ingestion; monitor tracking errors and latency.
  Tracking awaits shared Redis, so a connection outage can delay ingestion
  while that client's retry policy waits for recovery.
  Writer acceptance precedes asynchronous ClickHouse flush, so inactivity is
  not a guarantee that every write is visible.
- State is deleted after successful scheduling. A trace reactivated afterward
  starts new bounds; earlier historical observations can fall outside them.
  Required coverage for this experiment is each selected trace's recorded
  min/max observation-start interval plus the existing two-minute buffer, under
  the same database visibility and merge-state assumptions. A wider companion
  trace can incidentally admit more rows for a selected trace, so changing batch
  membership can change those extra rows. These reads do not guarantee complete
  lifetime history after state is acknowledged and later recreated. The events
  table may also return pre-merge duplicate versions.
- Enqueue and acknowledgement are not one transaction. Stable job IDs and
  bounded completed-job retention reduce duplicates, but regrouping/retries can
  repeat reads. Metrics describe dispatches/read attempts, not exactly-once
  unique trace processing. A crash can also lose metric samples.
- Pending entries are retained for `LANGFUSE_TRACE_BATCH_PENDING_TTL_MS` after
  their due timestamp (two hours by default, or 2h10m after last activity with
  the default idle delay). Each admitted ingestion chunk and dispatcher snapshot
  atomically prunes at most 1,000 expired members from both due/state. An arrival
  moves readiness forward before ingestion cleanup, preserving active traces.
  Existing pending entries use the same cutoff; no migration or third index is
  needed. Expired entries are discarded without enqueueing and counted in
  `langfuse.trace_batch.expired_traces`. Already queued jobs are unaffected.
  Expiry cleanup remains bounded per Lua call and continues across pages.
- This is opportunistic retention, not native Redis TTL or a hard memory cap.
  Ingestion cleanup runs even with the dispatcher disabled, but with both paths
  stopped no entries are removed until activity resumes. Cleanup can lag behind
  a large backlog; continuously active traces keep extending readiness. No
  whole-key expiry is used because shared keys may still contain fresh traces.
  Keep retention consistent across workers; a lower setting can discard existing
  pending work. Monitor expiry counts alongside pending depth and oldest due age.
- No query cache, materialized view, SQL transcript generation, or LLM calls
  are involved in this experiment.

## Local checks

### Query shape and production comparison

The repository uses the same `EventsQueryBuilder`, full-I/O selection and
streaming client as the event blob-export reader. The batch-I/O API also reads
`events_full` by project, trace IDs and time bounds. The experiment adds an
explicit trace-hash filter and uses one shared time window across projects.
These are comparable existing code paths, not a production capacity guarantee.

The emitted query has this shape (the builder also selects span identity,
timestamps, type, name and tool fields):

```sql
SELECT input, output,
       mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values)) AS metadata
FROM events_full AS e
WHERE e.project_id IN ({projectIds: Array(String)})
  AND e.trace_id IN ({traceIds: Array(String)})
  AND (e.project_id, e.trace_id) IN {tracePairs: Array(Tuple(String, String))}
  AND xxHash32(e.trace_id) IN (
    SELECT arrayJoin(arrayMap(id -> xxHash32(id), {traceIds: Array(String)}))
  )
  AND e.start_time >= fromUnixTimestamp64Milli({batchMinStart: Int64})
  AND e.start_time <= fromUnixTimestamp64Milli({batchMaxStart: Int64})
SETTINGS max_threads = 2, max_execution_time = 30, timeout_overflow_mode = 'throw'
```

There are five parameters, independent of batch size. The ID arrays grow
with the batch, but the request does not add a parameter or SQL branch per trace.
The exact tuple filter prevents independent project/trace lists from matching
unrequested crossed pairs. The reader also returns `project_id`, so identical
trace IDs in different projects remain distinct when counting coverage.
The hash subquery reads only
the supplied array, not another table, and is compatible with ClickHouse 25.12.
Global bounds retain primary-key pruning and include a two-minute buffer at
each end. A selected trace can return observations outside its own tracked
bounds when another trace widens the batch window. Per-trace predicates can
narrow this coverage if needed; the shared window is not a complete-history
guarantee. No `FINAL`, aggregation or sorting is added.

Inspect `system.query_log` using the consumer's query ID to see the executed
SQL, `read_rows`, `read_bytes`, `result_rows`, `memory_usage`, duration and CPU
profile events. For planned pruning, use `EXPLAIN indexes = 1` with
`use_query_condition_cache = 0, use_skip_indexes_on_data_read = 0`; measure real
execution separately with the normal service settings. Verify PREWHERE filters
before wide payload reads. See the [ClickHouse EXPLAIN documentation](https://clickhouse.com/docs/sql-reference/statements/explain).

Local and preview checks establish correctness, compatibility and query shape.
Production capacity still depends on payload sizes, part/granule density,
time-window spread, cache/storage behavior and the concurrent consumer fleet.
Compare equal trace cohorts across batch sizes and measure bytes/CPU per trace,
not just query latency or query count.

### Locality benchmark recipe

Performance is currently unproven. Compare equivalent eligible cohorts in this
order, draining between arms while holding sampling, consumer concurrency,
project/trace-size distribution and foreground load fixed:

1. `LANGFUSE_TRACE_BATCH_STRATEGY=project`, max size 60.
2. `LANGFUSE_TRACE_BATCH_STRATEGY=locality`, max size 60.
3. The lower-work strategy at max size 120.
4. Max size 240 only if the preceding arm reduces total work without material
   latency, memory, fairness or backlog regressions.

Repeat or interleave arms to reduce cache and time-of-day bias. Do not run
duplicate full reads simultaneously in production. For each arm, capture
dispatcher/queue metrics and query-log rows, including failed attempts:

```sql
SELECT
  query_id,
  type,
  query_duration_ms,
  read_rows,
  read_bytes,
  result_rows,
  memory_usage,
  (
    ProfileEvents['UserTimeMicroseconds']
    + ProfileEvents['SystemTimeMicroseconds']
  ) / 1e6 AS cpu_seconds
FROM system.query_log
WHERE event_time >= {arm_start:DateTime}
  AND event_time < {arm_end:DateTime}
  AND JSONExtractString(log_comment, 'surface') = 'worker'
  AND JSONExtractString(log_comment, 'route') = 'langfuse.queue.trace_batch'
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
ORDER BY event_time, query_id;
```

Report CPU seconds and read bytes per selected trace, and normalize both by
returned observations/logical payload bytes. Also report p95 query latency,
peak memory, fill, query rate, dispatcher duration, queue wait, oldest due age,
errors/retries and foreground-query latency. Fewer queries alone is not a win;
retain `project` if representative runs do not repeatably reduce total work.

### Integration tests

With the standard local Redis and ClickHouse services and shared package built:

```sh
pnpm --filter worker run test traceBatching.test.ts traceBatchQueue.test.ts
pnpm --filter web run test event-repository.servertest.ts -t 'streams complete trace batches'
```

The Redis tests cover bounds/readiness, bounded cross-project packing and metrics,
project/time/trace-hash locality ordering, deterministic/lossless bounded
selection, producer-off draining, enqueue failure, concurrent updates including
state recreation, exclusive dispatch, and shutdown. The ClickHouse test reads
more than 20,000 rows and checks full payloads, exact project/trace pairs
(including forbidden crossed pairs and the same trace ID requested in two
projects), and shared batch time bounds. It contrasts an incidental row admitted
by a wider companion trace with the same trace read alone, while retaining its
own buffered interval.
The connected integration test uses actual ingestion and batch BullMQ workers,
Redis, OTLP conversion and ClickHouse. It checks fixed 10% sampling identities,
delay reset, persistence of excluded observations, and draining after sampling
is set to zero. A fixed 1,000-trace cohort also covers 0/10/50/100% admission,
reordered replay, nested samples and per-ingestion-job decision counts.

The project-ordering regressions cover a 10,061-trace cohort spanning hydration
chunks and the former run limit, equal due scores, deleted/missing state,
reactivation after the ID read, and exclusion of arrivals after the cutoff.
The cadence regression checks remaining delay and immediate catch-up after an overrun.
