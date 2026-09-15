# OTel trace activity map

Write-only, best-effort experiment in the OTel batch worker. Enable per region:

```env
LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_ENABLED=true
LANGFUSE_OTEL_TRACE_ACTIVITY_MAP_SAMPLE_PERCENT=10
```

The feature defaults to disabled; sampling defaults to **10%**. Percentages
from 0 to 100 (including fractions) are supported; zero skips all map work.
Restart/redeploy workers with consistent regional settings to change sampling.

Sampling hashes the project/trace pair, so selection is stable across batches
and retries. Increasing to 50% retains the original sample. Newly selected
traces start on their next update; deselected traces expire naturally.
Sampling controls expected trace volume, not exact traffic or a hard memory cap.

## Stored state

Each trace uses a hash at
`<REDIS_KEY_PREFIX>langfuse:otel:activity:{<project_id>}:<trace_id>`:

- `first_seen`: Redis arrival time in Unix milliseconds when the key is created.
- `last_seen`: Redis arrival time of the latest update, never decreasing.
- TTL: two hours, refreshed on every update; no explicit drainage.

Lua atomically initializes the first timestamp, updates the last, and refreshes
expiry. Scripts contain at most 100 keys with the same project hash tag for
Redis Cluster. A project's keys concentrate on one shard.

Expiry/eviction resets the window. These are worker-arrival timestamps, not
observation timestamps or ClickHouse visibility guarantees. **Do not use
`first_seen` as a lower bound for loading complete traces.**

## Ingestion safety and rollout

The helper has a fixed 100ms budget covering sampling and Redis waits, using a
dedicated connection. Startup/reconnect batches are skipped immediately.
Errors or deadline expiry stop further chunks without failing ingestion.
An already-sent script may still apply after the deadline; timing out does not
cancel Redis work. JavaScript event-loop delays can delay timeout handling.

There are no custom experiment metrics or ingestion-path storage scans.
Use existing Redis and queue monitoring: compare per-shard memory, CPU,
evictions, and ingestion/queue latency against a baseline. Begin at 10% in one
region; observe at least two hours and representative peak traffic before
considering 50%. Disable if operator-agreed headroom is exceeded.

Budget/connection skips make actual coverage lower than the selected sample.
Infrastructure metrics do not measure that coverage, so do not blindly scale
observed storage by 10 to predict a complete map. This experiment does not
estimate the cost of a future index, scheduler, or drainage mechanism.
