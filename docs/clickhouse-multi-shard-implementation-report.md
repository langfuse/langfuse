# ClickHouse multi-shard implementation report

## Supported boundary

This implementation supports fixed-topology, fresh self-hosted ClickHouse
deployments through the `sharded_distributed` mode. Existing data conversion,
online resharding, and topology changes remain unsupported. Direct-local is an
explicit, default-off experimental optimization for traces, observations, and
scores; the Distributed facade remains the correctness and rollback path.

Schema and routing contract version: `1` / `1`.

## Implemented paths

- Configuration and startup: shared/worker env schemas, web and worker startup
  contract validation, fail-closed topology fingerprinting, engine/sharding
  expression/comment checks, and foreground Distributed inserts.
- Schema: independent `clickhouse/migrations/sharded` lineage with replicated
  local tables, Distributed facades, `{shard}` Keeper paths, `{replica}` names,
  `internal_replication=true`, and local-source/local-target materialized views.
- Writes: every ordinary writer and direct background insert continues to use
  a logical table. Direct-local is restricted to the three contract tables and
  binds queued records to routing version, topology fingerprint, shard, replica
  order, row/byte/interval limits, global queue limits, and connection limits.
- Reads: stable logical table names fan out through Distributed. Application
  clients force `skip_unavailable_shards=0`; full-shard loss is an error.
- Events/background work: trace-family tables share the same routing key,
  events MVs execute at the local layer, distributed subqueries use explicit
  GLOBAL semantics, and physical partition discovery reads one replica per
  shard.
- Deletion/maintenance: repository, project-cleaner, retention-cleaner, and
  deleted-mask mutations target replicated local tables with `ON CLUSTER` in
  sharded mode. Candidate and mutation discovery are cluster-aware.
- CI/operations: a pinned ClickHouse 25.12 2-shard × 2-replica fixture runs the
  formal golang-migrate path and cleans up all containers, volumes, and network.

## Acceptance checklist

| Acceptance item | Result | Evidence |
| --- | --- | --- |
| Fresh 2×2 initialization through formal migrations | Complete | `1/u sharded_baseline`; CI fixture asserts 2 shards and 4 replicas. |
| Reject non-empty/conflicting schema before mutation | Complete | Fixture reapplies the baseline directly and requires the preflight guard to fail. |
| Trace/observation/trace-score co-location | Complete | Fixture inserts a shared `(project_id, trace_id)` and asserts one `_shard_num`. |
| Events/staging/dataset-run-item co-location | Complete | Same fixture assertion covers all three logical facades. |
| Different shard data and equal same-shard replicas | Complete | Data lands on both shards; direct per-node counts match each replica pair. |
| Single-replica failure and recovery | Complete | Insert/read succeeds with one replica stopped, then `SYSTEM SYNC REPLICA` restores equality. |
| Whole-shard failure is explicit | Complete | With both replicas stopped, a Distributed read must fail. Foreground inserts and `skip_unavailable_shards=0` are enforced by the client. |
| Direct-local disabled correctness baseline | Complete | All ordinary paths use logical facades; 2×2 routing, reads, MV, and deletion are exercised with direct-local off. |
| Legacy/dual/events-only write semantics | Complete by invariant | Mode selection is unchanged; each mode's selected writer targets the same logical tables and the sharded schema includes both legacy and v4 targets. |
| Incremental events MV local execution | Complete | `events_core_mv` is `events_full_local` → `events_core_local`; fixture observes exactly one derived row. |
| Project/trace/score/event/dataset/blob deletion | Complete | Central mutation routing and the fixture delete all corresponding local tables on the cluster, then assert zero facade rows. |
| Background migration shard/chunk ownership | Not applicable to historical conversion | Sharded schema is fresh-install only. Live partition discovery is cluster-aware; historical single-shard conversion is explicitly unsupported. |
| Runtime topology change refusal | Complete | Fingerprint lock includes ordered shards, replicas, weights, DB, cluster, schema, and routing versions; unit tests cover drift. |
| Mixed schema/routing version refusal | Complete | Every logical/local table comment is checked on every node during startup. |
| Direct-local ambiguous retry/failover safety | Complete for experimental path | Unit tests distinguish definite connection refusal from ambiguous reset, reuse the batch/replica order, and requeue on failure. |
| Rows/bytes/interval/memory/connection limits | Complete | Worker env limits and direct-local unit tests cover byte flush and global backpressure. |
| Direct-local A/B performance report | Not applicable to supported default | Direct-local remains experimental and off. The operations contract lists mandatory production metrics before promotion. |
| Existing single-shard behavior | Complete | Both new flags default false; mode and routing tests retain the old logical-table path. |
| Safe observability | Complete | Metrics use table/shard labels only; topology errors expose bounded reason tokens and never credentials/entity IDs. |
| Deployment/runbook documentation | Complete | `clickhouse-multi-shard-contract.md` documents macros, Keeper, modes, rollout, failure, rollback, and no online reshard. |

## Verification evidence

- `pnpm run db:generate`: `Tasks: 1 successful, 1 total`.
- `pnpm run lint`: `Tasks: 7 successful, 7 total`.
- `pnpm run typecheck`: `Tasks: 7 successful, 7 total`.
- Shared sharding/client tests: `Tests 40 passed (40)`.
- Worker routing/writer/background/deleted-mask tests:
  `Tests 81 passed | 1 skipped (82)`; the skipped case requires a locally
  enabled events table and its sharded behavior is covered by the 2×2 fixture.
- Web ClickHouse search regression: `Tests 11 passed | 9 skipped (20)`.
- 2×2 integration summary: `Multi-shard integration: schema guard, 2 shards,
  4 replicas, routing, local MV, deletion, replica failover, and shard
  fail-closed passed`.
- Shell syntax, Compose rendering, `git diff --check`, and migration semicolon
  safety scans completed without output.
