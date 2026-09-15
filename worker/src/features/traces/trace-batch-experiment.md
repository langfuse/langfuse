# Topics trace-batch operator runbook

Compare query block size on one deployed reader revision before changing
threads, batching or concurrency. These are operator-run experiments; adding
the controls does not deploy code or change production configuration. This
runbook does not require the assistant to execute any ClickHouse query.

The reader streams full event payloads, counts them, and discards them. It does
not construct transcripts or run LLMs. Keep query projection, exact
project/trace/time membership, transport, compression and the existing
30-second throwing timeout fixed throughout these comparisons.

## Controls and ownership

All values are read from worker process environment at startup. Change the
deployment configuration and roll the affected worker processes; these are
not live runtime settings. Web processes do not consume these controls.

| Variable                                      | Code default / accepted values                                           | Consuming worker role                                       |
| --------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `LANGFUSE_TRACE_BATCH_MAX_THREADS`            | `1`; positive integer                                                    | Batch consumer; ClickHouse query threads                    |
| `LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE`         | Unset; optional positive integer                                         | Batch consumer; query block-size override                   |
| `LANGFUSE_TRACE_BATCH_EXPERIMENT_ID`          | Unset; 1–64 characters, matching `^[A-Za-z0-9][A-Za-z0-9._-]*$` when set | Batch consumer; structured logs and query attribution       |
| `LANGFUSE_TRACE_BATCH_MAX_SIZE`               | `60`; integer 1–10,000                                                   | Dispatcher; maximum traces per job                          |
| `LANGFUSE_TRACE_BATCH_CONCURRENCY`            | `2`; positive integer                                                    | Batch consumer registration; simultaneous jobs per process  |
| `LANGFUSE_TRACE_BATCH_STRATEGY`               | `project`; `project` or `locality`                                       | Dispatcher; batch selection                                 |
| `LANGFUSE_TRACE_BATCH_SAMPLING_RATE`          | `1`; number from 0 to 1                                                  | Direct-v4 ingestion; stable trace admission                 |
| `LANGFUSE_TRACE_BATCH_IDLE_MS`                | `600000`; positive integer                                               | Direct-v4 ingestion; delay from activity to readiness       |
| `LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS`   | `30000`; positive integer                                                | Dispatcher; target interval between starts                  |
| `LANGFUSE_TRACE_BATCH_PENDING_TTL_MS`         | `7200000`; positive integer                                              | Ingestion and dispatcher; pending retention after readiness |
| `LANGFUSE_TRACE_BATCH_INGESTION_ENABLED`      | `false`; `true` or `false`                                               | Direct-v4 ingestion; admit/update Redis state               |
| `LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED`     | `false`; `true` or `false`                                               | Dispatcher; enqueue ready traces                            |
| `QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED` | `false`; `true` or `false`                                               | Batch consumer registration; pick up queued jobs            |
| `LANGFUSE_TRACE_BATCH_READ_ENABLED`           | `false`; `true` or `false`                                               | Consumer; query when true, discard/remove jobs when false   |

Defaults are source defaults, not evidence of running configuration. An absent
block setting is omitted from the query, preserving the ClickHouse profile's
behavior; an empty block-size environment value also means omitted. The block
size is independent of traces per batch, result-row limits and byte/memory
budgets. Values 256, 512 and 1024 are supported. An unset thread setting
preserves the inherited one-thread behavior.

Fleet reader concurrency is the sum of configured concurrency across enabled
consumer processes. Record process count and autoscaling changes as well as
the per-process value; this is not a global concurrency limit. Other workloads
share the same resources. Environment values provide deployment defaults and
resource controls; they are not a future store for customer project settings.

## Establish the experiment

Before upgrading existing intake writers to native expiry, stop intake and
drain pending state, upgrade **all** writers, then resume. The command
`PEXPIRETIME` requires Redis 7+. Old writers preserve TTL set by a new writer
but do not extend it, so mixed-version intake can expire a late arrival too
early. Use the same stop/drain sequence before rolling back writer code.
This is separate from later consumer-only query-setting rollouts.

For existing enabled consumers, install `LANGFUSE_TRACE_BATCH_READ_ENABLED=true`
before or alongside the new image, or disable consumers until image and env
are both installed. Old code ignores the flag; new code with the flag absent
discards queued work. Do not introduce an unintended discard window during rollout.

1. Record the actual deployed commit SHA, image/build ID, region, consumer
   process count, other enabled experimental readers, and every control above.
   Map `BUILD_ID` to the deployed SHA explicitly; a build ID is not necessarily
   a commit. Keep the same code/image for every arm.
2. Fix a representative cohort containing both ordinary and large-payload
   traces, sampling, cap, strategy, idle delay, dispatch cadence and retention.
   The trace sampling setting is not a project-cohort selector. Record any
   existing routing/cohort definition separately and do not add production
   traffic for this experiment.
3. Use existing ingestion/freshness SLOs and established resource headroom to
   agree stop criteria before starting. Record their dashboard/alert references
   and baseline values in the experiment record. No new numeric production
   thresholds are implied here.
4. Deploy with enable flags off if introducing the experiment to a deployment.
   Upgrade every enabled consumer before dispatching the inherited cross-project
   payloads; old single-project consumers cannot process those jobs. Start a
   known consumer fleet with `LANGFUSE_TRACE_BATCH_READ_ENABLED=true`, then
   dispatcher, then eligible direct-v4 intake. A registered consumer without
   that explicit read flag discards jobs; set it on every intended reader.
   Multiple dispatchers may be enabled, but only the Redis lease owner runs.
5. Establish arm A separately if the previous deployment used one thread or
   different query code. That transition is not evidence for the block-size
   treatment. Wait for rollout completion and queue/cache transients to settle
   before opening a measurement window.

### Exact A/B query configuration

Apply these values to **every batch consumer**, retaining the same existing
values for all other controls. For split-role deployments leave intake and
dispatcher flags on their existing roles. These shell snippets describe the
desired environment; apply it through the normal deployment mechanism.

**A — two threads, profile block size:**

```sh
export LANGFUSE_TRACE_BATCH_MAX_THREADS=2
unset LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE
export LANGFUSE_TRACE_BATCH_EXPERIMENT_ID=topics-block-a-01
```

Remove `LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE` from the actual deployment env,
including inherited overrides; shell `unset` alone does not alter a running
container. Do not replace omission with an assumed numeric profile default.

**B — two threads, block size 512:**

```sh
export LANGFUSE_TRACE_BATCH_MAX_THREADS=2
export LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE=512
export LANGFUSE_TRACE_BATCH_EXPERIMENT_ID=topics-block-b-01
```

Use repeated A/B/B/A windows with distinct labels such as
`topics-block-b-02` and `topics-block-a-02`, after rollout and backlog/cache
transients settle each time. Keep duration and load periods comparable; record
UTC start/end and exclude mixed-configuration rollout intervals. Live traffic
does not produce identical replay cohorts: compare actual project/payload
mix and completed throughput, and repeat across representative load periods.
Do not compare regions as interchangeable controls.

## Later comparisons: change one factor

Keep the established fixed settings and consumer fleet unchanged unless that
row names them as the factor. Give each window a distinct experiment ID and
roll its consuming processes before measuring.

| Comparison            | Exact differing settings                                                                       | Keep fixed                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| C: query threads      | `LANGFUSE_TRACE_BATCH_MAX_THREADS=1` versus `2`                                                | `LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE=512`                     |
| D: block size         | Unset `LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE`, then set `256`, `512`, `1024` in separate windows | `LANGFUSE_TRACE_BATCH_MAX_THREADS=2`                          |
| E: trace cap          | `LANGFUSE_TRACE_BATCH_MAX_SIZE=60` versus `80` on dispatchers                                  | Threads `2`, block `512`, all other controls and fleet        |
| E: reader concurrency | `LANGFUSE_TRACE_BATCH_CONCURRENCY=1` versus `2` on consumers                                   | Threads `2`, block `512`, same consumer process count and cap |
| E: selection          | `LANGFUSE_TRACE_BATCH_STRATEGY=project` versus `locality` on dispatchers                       | Threads `2`, block `512`, same cap and fleet                  |

The cap values above define a later comparison, not a recommended production
cap. Establish the first arm separately if the deployed cap differs. Keep
sampling, idle and dispatch cadence fixed for these runs. Any later tuning of
those controls needs its own comparison because it changes admission, readiness
or batch fill. Do not combine retention changes with performance tuning.

For dispatcher comparisons, stop intake and drain old pending/queued work
before changing the arm, then resume with unchanged cohort settings. Queued
jobs already contain their batch membership. Query thread/block settings and
experiment attribution come from the consumer that executes an attempt,
including a retry, not from the dispatcher that created the job.

## Attribution and measurements

When an experiment ID is configured, the consumer emits a batch-start log with
the experiment ID, `BUILD_ID`, query overrides, configured batch controls and
requested trace count. The query carries the ID in structured `log_comment`
attribution alongside the existing surface, route and project context. Keep
the filter `surface=worker`, `route=langfuse.queue.trace_batch`; multi-project
jobs use the existing project attribution. No experiment, project, trace or
job ID is added as a new metric tag.

A logged absent block override means the profile value is **unknown to the
worker**, not zero. Confirm actual server-applied query settings using existing
operator-accessible query telemetry where available. Log fields describing
dispatcher/intake controls are local consumer environment values: on split-role
fleets they do not prove the producing processes used those values. Record
the configuration of each role independently. Use `BUILD_ID`/OpenTelemetry
`service.version` and deployment metadata to identify revision; do not assume
every Datadog metric has a usable version tag.

For each UTC window collect:

| Source                                                                  | Measurements and interpretation                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing ClickHouse query telemetry, inspected manually by the operator | Query settings, duration, CPU profile events, per-query peak memory, rows/bytes read, result rows, and failed attempts. Query-log availability, settings capture and retention depend on server configuration. Include failures before and during execution where available. |
| `langfuse.queue.trace_batch`                                            | Request/completion/failure rates, processing and queue-wait distributions, queue depth. Inspect waiting, active, delayed retry and failed work; consumer processing time includes streaming/parsing but does not isolate those costs.                                        |
| `langfuse.trace_batch`                                                  | Actual `size` and `project_count`, dispatched traces/batches, found/missing traces and returned observations, logical `io_metadata_bytes`, pending/ready depth, oldest due age, due lag, expiry and tracking errors.                                                         |
| `langfuse.periodic_runner` with `runner:trace_batch_dispatcher`         | Run outcomes, duration and health; a failed or stale dispatcher can hide behind declining reader throughput.                                                                                                                                                                 |
| Existing worker/container/runtime dashboards                            | CPU, RSS/heap, event-loop/GC signals where exported, consumer count, restarts and OOMs; Datadog runtime metrics are enabled in worker instrumentation, but confirm actual series availability.                                                                               |
| Existing foreground and ingestion dashboards                            | Service RAM and CPU, ingestion latency, freshness SLOs, foreground query latency and shared-resource headroom.                                                                                                                                                               |

Use percentile distributions for query/worker latency, per-query memory and
actual batch size. Enable Datadog percentile aggregation where required. For
one Redis deployment take the **maximum**, not the sum, of dispatcher backlog
gauges across hosts; gauges stop refreshing when dispatch is disabled.

Compare total CPU (including failed/retried attempts) and read bytes per
successful returned observation and per GiB of logical payload, alongside
completed traces/observations/bytes per second. Show denominators and coverage
explicitly. Current metrics count attempts, not deduplicated useful work; if
successful retries repeat already-read data, report this limitation instead
of claiming unique-observation cost. Lower query count alone is not a win.

Important gaps:

- Logical payload bytes omit tool fields, transport/compression and worker
  allocation. Streaming avoids retaining all rows, but client buffers and an
  oversized row can still consume substantial memory. No separate transfer,
  parse or transcript-cost measurement is provided.
- Per-query peaks cannot be summed into concurrent service RAM. Read bytes
  are not physical storage I/O. Compare actual service memory as well.
- Existing metrics have no experiment-arm tag. Separate windows by region,
  host/deployment scope and UTC time; use labeled logs/query attribution for
  attempts. Do not claim aggregate metrics separate mixed-arm consumers.
- Trace sampling decisions repeat across ingestion jobs; they do not measure
  globally unique admitted traces. Returned rows may include pre-merge versions,
  and reads cover tracked buffered intervals, not complete lifetime histories.
- Start logs prove an attempt began, not that it completed. Include failures,
  missing data, retries and post-window completions when reconciling throughput.

Maintain one record per window: arm/label, UTC boundaries, SHA/image/build
mapping, actual per-role configuration, cohort definition, consumer count,
server-applied block setting if known, settling/exclusion periods, resource/SLO
criteria, throughput/cost results and gaps. Prior sampled memory reductions
and CPU tradeoffs motivate the comparison; they are not fleet-wide guarantees.

## Rollback and stopping

- **Block rollback:** remove `LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE`, set a new
  rollback experiment label, and roll consumers. Keep threads at `2` to isolate
  this reversal. Removing the thread setting too returns to the code default
  `1` and constitutes another change. Already active attempts finish with their
  original query settings.
- **Strategy rollback:** set dispatcher `LANGFUSE_TRACE_BATCH_STRATEGY=project`
  and roll dispatchers. This changes future selection only; queued jobs retain
  their membership, and it does not reverse inherited query code.
- **Normal stop:** disable intake first; keep dispatcher, consumers and reads enabled
  until pending/ready and waiting/active/delayed retry work drain. Inspect failed
  jobs separately. Then disable dispatchers and consumers. Intake off or sample
  rate `0` does not cancel/resample pending or queued work.
- **Stop further reads:** disable consumers and roll them, then disable intake
  and dispatchers to prevent backlog growth. Graceful shutdown drains active
  reads; this is not instantaneous query cancellation. Queued and retained failed
  jobs remain subject to queue retention/retry policy and can resume with the
  configuration of the next consumer. Keep compatible reader code deployed.

For a fast stop that **discards** queued experiment work instead of retaining
it, roll consumers with:

```sh
LANGFUSE_TRACE_BATCH_INGESTION_ENABLED=false
LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED=false
QUEUE_CONSUMER_TRACE_BATCH_QUEUE_IS_ENABLED=true
LANGFUSE_TRACE_BATCH_READ_ENABLED=false
```

The running consumer completes and immediately removes picked-up jobs without
querying. Leave the dispatcher on if pending traces should also be enqueued and
discarded as they become ready; otherwise the pending map expires natively.
Resume a paused queue to drain it. Delayed retries wait until eligible. Existing
failed/completed history is not purged by this mode; BullMQ retention remains
lazy. There is no separate housekeeping runner. No worker running means no
queue cleanup. Active reads finish during graceful rollout.

With reads enabled, jobs at least two hours old (from their payload timestamp)
are also discarded/removed before querying, including retries. The fixed job-age
policy prevents stale replay after a long stop but is not autonomous queue TTL.
`langfuse.trace_batch.discarded_jobs{reason:reads_disabled|expired}` counts these
discards; they are excluded from read-success distributions.

Stop/revert on the pre-agreed resource/SLO criteria, persistent backlog growth,
or rising failures; investigate before resuming. Do not invent thresholds from
the two sampled benchmark cases.

Pending TTL is retention after the due timestamp. Admitted ingestion chunks
and dispatcher activity prune individual expired entries from the shared
due/state keys. Each admitted chunk also sets the same native expiry on both
whole keys: current Redis time plus retention, preserving any later existing
expiry. Thus the default backstop is two hours without admitted intake, without
adding the idle delay. Abandoned state expires without another writer or
dispatcher run. Per-trace pruning is still needed during continuous intake;
whole-key expiry is not a per-trace memory bound. Native expirations do not
increment `expired_traces`, and backlog gauges may stay stale while dispatch
is disabled. Sampling `0` produces no admitted chunks or TTL refresh.
Lower retention can discard existing pending traces without enqueueing them.
Already queued jobs are unaffected. See [the implementation README](README.md)
for readiness, retention, retry and legacy-job compatibility details.
