# OTel trace activity map

Set `LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_ENABLED=true` on the region's OTel
workers to enable this experiment. It defaults to false. It does not run for
legacy JSON ingestion or schedule evaluations.

Use `LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT=10` to start with an
approximately 10% trace sample, then raise it to `50` or `100`. This setting
accepts numbers from 0 to 100 (including fractional percentages), defaulting to 100. Zero performs no map writes. Apply env changes by restarting/redeploying
the region's workers, using the same value across them for consistent coverage.

Sampling hashes the `(project_id, trace_id)` pair, so a trace is consistently
included or excluded across batches and retries. Increasing the percentage
keeps the existing sample and adds traces; newly included traces start their
activity window on their next processed batch. Decreasing it stops refreshing
excluded keys, which expire according to their existing TTL. Selection happens
before Redis connection creation or commands. This controls expected trace
volume, not an exact count, traffic percentage, or hard memory limit.

Each distinct trace in a converted OTel batch updates a Redis hash:

`<REDIS_KEY_PREFIX>langfuse:otel:activity:{<project_id>}:<trace_id>`

- `first_seen`: Redis server time in Unix milliseconds when the key was created.
- `last_seen`: Redis server time of the latest update, never decreasing.
- TTL: two hours, refreshed on every update. No explicit drainage.

A Lua script performs initialization, update, and expiry without another
worker interleaving. Calls contain at most 100 trace keys, sharing a project
hash tag for Redis Cluster. This places a project's activity keys on one shard.
The script is atomic with respect to concurrent commands, not a durable queue
or a rollback transaction.

After expiration or eviction, another observation creates a fresh window.
These timestamps measure worker processing activity, including retries, not
event time or ClickHouse visibility. **Do not use `first_seen` as a lower bound
for loading the complete trace from ClickHouse.**

Writes are best-effort on a separate connection with a one-second command
timeout. Concurrent first batches share a startup wait of at most one second,
so a healthy new connection can write its first batch. If startup times out or
the connection is reconnecting, batches are skipped. Startup waiting and a
subsequent command timeout are separate budgets, not a one-second whole-batch
deadline. Errors stop the remaining updates for that batch without failing
ingestion. Consequently, this is an approximate activity map, not a completeness
guarantee. Disabling the flag stops updates; existing keys expire naturally.

## Experiment measurements

Metrics use the `langfuse.ingestion.otel.activity_map` prefix, without
project/trace ID tags. Group by the deployment's region/service tags when
comparing rollout stages. Metrics are emitted only when enabled with a nonzero
sampling percentage and a nonempty input batch.

| Suffix                   | Type         | Meaning                                                                                                        |
| ------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `eligible_trace_updates` | Counter      | Distinct traces per input batch, before sampling.                                                              |
| `sampled_trace_updates`  | Counter      | Selected trace updates, before connecting or writing.                                                          |
| `trace_updates`          | Counter      | Updates in scripts acknowledged as successful.                                                                 |
| `trace_creations`        | Counter      | Hash initializations reported by successful scripts; obtained atomically with `HSETNX`, without an extra read. |
| `skipped_batches`        | Counter      | Batches with selected traces skipped entirely or partly because the connection is unavailable.                 |
| `errors`                 | Counter      | Failed map calls; may follow successful chunks in the same batch.                                              |
| `duration_ms`            | Distribution | Map-call duration including sampling, startup waiting, and writes.                                             |

Counts cover OTel only. Updates are deduplicated within a batch but count again
on retries. Creations include recreation after expiry/eviction, so their sum is
neither the current map size nor a globally unique trace count. A timeout can
occur after Redis applied a script: success/creation counters reflect confirmed
responses, not a complete ledger of writes.

For each stable sampling stage, compare:

- `sampled_trace_updates / eligible_trace_updates`: observed selection fraction
  of trace updates (not necessarily the configured percentage of unique traces,
  because traces have different batch frequencies).
- `trace_updates / sampled_trace_updates`, plus skips/errors: confirmed write
  coverage. The difference includes unconfirmed writes, not just lost updates.
- Rates of `trace_creations` and `trace_updates`: new-entry churn vs write load.
- p50/p95/p99 of `duration_ms`: added worker latency, including startup.

There is no automatic storage scan in the ingestion path. For a regional
storage experiment, sample matching keys with incremental `SCAN` and
`MEMORY USAGE`, and compare Redis memory, CPU, eviction counts, and ingestion
latency before/after enablement. On a cluster, sample each primary. Include
key/index overhead, replication, and allocator overhead when estimating total
capacity; `MEMORY USAGE` samples alone are not total Redis memory.

The application counters do **not** automatically publish map bytes, active-key
count, Redis CPU, evictions, or BullMQ latency. Use a separately scoped key-count
and memory sample plus the existing infrastructure/queue telemetry for those.
Redis metrics must be checked per shard, since the current project hash tag can
concentrate writes. Whole-cluster averages can hide that pressure.

Capture a baseline, enable 10% in one region, and observe at least the two-hour
retention window and representative peak traffic. Record the actual sampling
configuration and time of each rollout. Increase to 50% only within operator-
agreed memory/CPU and ingestion/queue latency limits; disable on breaches.
Do not extrapolate write-only measurements as the cost of a future sorted-set
index or readiness scheduler: those are separate experiments.
