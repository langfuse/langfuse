# ClickHouse fixed-topology sharding contract

This document freezes the first supported self-hosted multi-shard contract.
It applies only to fresh deployments. It does not convert, copy, or rebalance
data from an existing single-shard deployment.

## Deployment modes

`CLICKHOUSE_CLUSTER_ENABLED` continues to mean only that DDL uses `ON CLUSTER`.
It is not evidence that a deployment is sharded.

| `CLICKHOUSE_SHARDING_ENABLED` | `CLICKHOUSE_WRITE_LOCAL_ENABLED` | Mode | Behavior |
| --- | --- | --- | --- |
| `false` | `false` | `single_shard` | Existing logical table behavior; this remains the default. |
| `true` | `false` | `sharded_distributed` | Reads and writes use the stable logical `Distributed` tables. |
| `true` | `true` | `sharded_direct_local` | The validated trace/observation/score optimization may write local tables; all other paths use logical tables. |
| `false` | `true` | invalid | Startup fails because direct-local routing has no sharded schema contract. |

Both sharded modes require `CLICKHOUSE_CLUSTER_ENABLED=true`. A process must
fail closed when the configured cluster, database, table engines, sharding
expressions, Keeper macros, or topology fingerprint differ from the validated
contract. `skip_unavailable_shards` is not part of the application contract.

The contract versions are owned by
`packages/shared/src/server/clickhouse/shardingContract.ts`. Schema or routing
expression changes require a version bump and a separate data movement plan;
they must not silently change routing in place.

## Table classification

Every sharded logical table has a `<table>_local` physical table. The local
table uses a replicated MergeTree-family engine with a Keeper path containing
`{shard}` and a replica name containing `{replica}`. Its logical facade uses
`Distributed(<cluster>, <database>, <table>_local, <expression>)`.

| Logical table | Class | Sharding expression | Write owner |
| --- | --- | --- | --- |
| `traces` | trace-family sharded | `cityHash64(project_id, id)` | logical table; optional direct-local |
| `observations` | trace-family sharded | `cityHash64(project_id, trace_id)` | logical table; optional direct-local |
| `scores` | trace-family sharded | `cityHash64(project_id, ifNull(trace_id, id))` | logical table; optional direct-local |
| `observations_batch_staging` | trace-family sharded | `cityHash64(project_id, trace_id)` | logical table |
| `events_full` | trace-family sharded | `cityHash64(project_id, trace_id)` | logical table |
| `events_core` | trace-family derived | `cityHash64(project_id, trace_id)` | local `events_full` MV only |
| `dataset_run_items_rmt` | trace-family sharded | `cityHash64(project_id, trace_id)` | logical table |
| `blob_storage_file_log` | entity-family sharded | `cityHash64(project_id, entity_id)` | logical table |
| `ingestion_size_stats` | trace-family derived | `cityHash64(project_id, trace_id)` | local source MVs only |
| `project_environments` | project aggregate | `cityHash64(project_id)` | local source MVs only; global reads merge shard results |

All incremental materialized views use local source to local target. In
particular, `events_core_mv` listens to `events_full_local` and writes to
`events_core_local`. The ingestion-size and project-environment MVs follow the
same rule. Logical facades are for global reads and coordinated writes, not MV
triggers.

`dataset_run_items` and `event_log` are legacy migration sources. A fresh
sharded deployment keeps them as empty compatibility tables only while the
corresponding background migration code still requires their presence; new
application writes never target them. They are not routing contracts.

`traces_null`, `traces_all_amt`, `traces_7d_amt`, and `traces_30d_amt` were
retired by migration 0029. They must not be recreated in the sharded track.

## Routing and topology invariants

- Shards and replicas are numbered contiguously from one; weights are positive
  integers and are part of the topology fingerprint.
- Every shard backed by replicated local tables requires
  `internal_replication=true`, including a temporarily single-replica shard.
- Direct-local shard selection reproduces ClickHouse CityHash 1.0.2 and the
  weighted `Distributed` selection algorithm. `scores.trace_id` falls back to
  `id` only for null, never for an empty string.
- The fingerprint includes schema version, routing version, cluster name,
  database, ordered shards, weights, replication mode, and node URLs.
- Once validated by a process, a different fingerprint is fatal until restart.
  Queued local batches remain bound to the original fingerprint and routing
  version and are never recomputed against a new topology.
- A missing routing field may use the already validated logical Distributed
  path. An invalid schema or changed topology may not fall back.

## Compatibility and rollout

With both new flags unset, existing single-shard behavior is unchanged.
Direct-local remains disabled by default. Mixed worker versions may run
together only when they use the same schema and routing versions; the sharded
migration track will persist those versions as part of its schema contract.
Online shard-count, order, or weight changes are unsupported in this version.

## Fresh deployment procedure

The supported baseline is ClickHouse 25.12 or newer with one Keeper quorum and
fixed `default` cluster metadata. Every server needs stable macros and the same
`remote_servers` definition:

```xml
<remote_servers>
  <default>
    <shard>
      <internal_replication>true</internal_replication>
      <replica><host>ch-1a</host><port>9000</port></replica>
      <replica><host>ch-1b</host><port>9000</port></replica>
    </shard>
    <shard>
      <internal_replication>true</internal_replication>
      <replica><host>ch-2a</host><port>9000</port></replica>
      <replica><host>ch-2b</host><port>9000</port></replica>
    </shard>
  </default>
</remote_servers>
<macros>
  <shard>01</shard>
  <replica>ch-1a</replica>
</macros>
```

Set `CLICKHOUSE_CLUSTER_ENABLED=true`,
`CLICKHOUSE_SHARDING_ENABLED=true`, and keep
`CLICKHOUSE_WRITE_LOCAL_ENABLED=false`. Run `pnpm --filter @langfuse/shared
run ch:up` against an empty database. The runner selects only
`clickhouse/migrations/sharded`; it never mixes clustered or unclustered
history with the sharded lineage. The first migration rejects any conflicting
Langfuse table before creating the baseline.

After migration, check all of the following before starting web or worker:

- `system.clusters` reports the intended shard/replica count and
  `internal_replication=1` everywhere.
- `clusterAllReplicas(default, system.tables)` reports every logical table as
  `Distributed`, every local table as `Replicated*MergeTree`, and the comment
  `langfuse_sharding_schema=1,langfuse_routing=1` on both.
- `clusterAllReplicas(default, system.replicas)` shows Keeper paths beginning
  `/clickhouse/tables/<shard>/` and distinct replica names.
- Replication queues are empty before enabling traffic.

The executable reference is
`packages/shared/clickhouse/tests/multishard/run.sh`. CI runs it against a real
2-shard, 2-replica topology and verifies the formal migration runner, schema
guard, data distribution, replication, local materialized view, deletion,
single-replica failover, and whole-shard fail-closed behavior.

## Deletes and background work

Reads and inserts use logical tables. ClickHouse does not support lightweight
`DELETE` against a `Distributed` engine, so sharded deletion and retention
paths target `<table>_local ON CLUSTER default`; a partial DDL response is an
error and must be retried. Deleted-mask discovery reads one replica per shard,
then applies the local-table mutation on the cluster. Physical partition
discovery similarly uses one replica per shard rather than treating replica
copies as independent work.

Fresh sharded deployments start directly on the v4 events schema. Historical
single-shard data conversion and online resharding remain unsupported; move
such data with a separately reviewed offline migration.

## Direct-local experimental gate

Direct-local covers only traces, observations, and scores. It is not a
supported default and must remain off until a deployment-specific A/B test
shows a material benefit. Local batches are bounded by rows, bytes, interval,
global queued rows, global queued bytes, and per-node connection count via:

- `LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE`
- `LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS`
- `CLICKHOUSE_LOCAL_BATCH_MAX_BYTES`
- `CLICKHOUSE_LOCAL_QUEUE_MAX_ROWS`
- `CLICKHOUSE_LOCAL_QUEUE_MAX_BYTES`
- `CLICKHOUSE_LOCAL_MAX_OPEN_CONNECTIONS`

The benchmark report must compare Distributed and direct-local on identical
traffic and include throughput, p95/p99 latency, CPU, network, active parts,
Keeper/replication pressure, queue depth, and error rate. Node addresses come
from administrator-controlled `system.clusters`; use private DNS/IP space,
TLS (`CLICKHOUSE_LOCAL_HTTP_PROTOCOL=https`), a least-privilege ClickHouse
user, and network policy that prevents access to any host outside that
cluster. Never enable the optimization for an untrusted cluster definition.

## Failure and rollback runbook

- One replica unavailable: the Distributed path uses another replica and the
  recovered node must drain its replication queue before it is considered
  healthy.
- Every replica of a shard unavailable: reads and foreground inserts fail.
  `skip_unavailable_shards` is forced off so partial results cannot look
  successful.
- Schema/routing comment or topology fingerprint mismatch: sharded processes
  stop accepting writes. Restore the expected immutable topology; do not
  silently change shard count, order, or weight.
- Direct-local incident: stop ingestion, drain or explicitly fail the batches
  bound to the old fingerprint, set `CLICKHOUSE_WRITE_LOCAL_ENABLED=false`,
  restart workers, and verify writes through Distributed tables.
- Schema incident before traffic: run the sharded down migration or discard
  the fresh database and recreate it. Once traffic exists, do not use down or
  drop as rollback; restore service through the validated Distributed facade
  and use an explicit forward repair.

Safe diagnostics may include table name, shard number, replica count, schema
version, routing version, contract state, replication queue size, and a
fingerprint. Do not log credentials, project IDs, trace IDs, or node URLs that
contain user information.
