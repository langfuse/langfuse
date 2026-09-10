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
timeout. Batches encountered while that connection is starting or reconnecting
are skipped. Errors stop the remaining updates for that batch without failing
ingestion. Consequently, this is an approximate activity map, not a completeness
guarantee. Disabling the flag stops updates; existing keys expire naturally.

Metrics use the `langfuse.ingestion.otel.activity_map` prefix:
`trace_updates`, `skipped_batches`, `errors`, and `duration_ms`. Counts cover
OTel only; updates are deduplicated within a batch but count again on retries.
There is no automatic storage scan in the ingestion path. For a regional
storage experiment, sample matching keys with incremental `SCAN` and
`MEMORY USAGE`, and compare Redis memory, CPU, eviction counts, and ingestion
latency before/after enablement. On a cluster, sample each primary. Include
key/index overhead, replication, and allocator overhead when estimating total
capacity; `MEMORY USAGE` samples alone are not total Redis memory.
