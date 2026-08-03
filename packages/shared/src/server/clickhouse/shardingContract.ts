export const CLICKHOUSE_SHARDING_SCHEMA_VERSION = 1 as const;
export const CLICKHOUSE_ROUTING_VERSION = 1 as const;
export const CLICKHOUSE_SHARDING_CONTRACT_COMMENT =
  `langfuse_sharding_schema=${CLICKHOUSE_SHARDING_SCHEMA_VERSION},` +
  `langfuse_routing=${CLICKHOUSE_ROUTING_VERSION}`;

type ShardedTableContract = {
  shardingExpression: string;
  routingFields: readonly string[];
  colocationGroup: "trace" | "entity";
  writeTarget: "logical" | "materialized_view_target";
  localEngine:
    | "ReplicatedReplacingMergeTree"
    | "ReplicatedMergeTree"
    | "ReplicatedAggregatingMergeTree";
  directLocal: boolean;
};

/**
 * Versioned source of truth shared by migrations, topology validation, and
 * application-side routing. Changing an expression requires bumping both the
 * schema and routing versions; an in-place change is not safe because old and
 * new versions of the same entity could land on different shards.
 */
export const CLICKHOUSE_SHARDED_TABLES = {
  traces: {
    shardingExpression: "cityHash64(project_id, id)",
    routingFields: ["project_id", "id"],
    colocationGroup: "trace",
    writeTarget: "logical",
    localEngine: "ReplicatedReplacingMergeTree",
    directLocal: true,
  },
  observations: {
    shardingExpression: "cityHash64(project_id, trace_id)",
    routingFields: ["project_id", "trace_id"],
    colocationGroup: "trace",
    writeTarget: "logical",
    localEngine: "ReplicatedReplacingMergeTree",
    directLocal: true,
  },
  scores: {
    shardingExpression: "cityHash64(project_id, ifNull(trace_id, id))",
    routingFields: ["project_id", "trace_id", "id"],
    colocationGroup: "trace",
    writeTarget: "logical",
    localEngine: "ReplicatedReplacingMergeTree",
    directLocal: true,
  },
  observations_batch_staging: {
    shardingExpression: "cityHash64(project_id, trace_id)",
    routingFields: ["project_id", "trace_id"],
    colocationGroup: "trace",
    writeTarget: "logical",
    localEngine: "ReplicatedReplacingMergeTree",
    directLocal: false,
  },
  events_full: {
    shardingExpression: "cityHash64(project_id, trace_id)",
    routingFields: ["project_id", "trace_id"],
    colocationGroup: "trace",
    writeTarget: "logical",
    localEngine: "ReplicatedReplacingMergeTree",
    directLocal: false,
  },
  events_core: {
    shardingExpression: "cityHash64(project_id, trace_id)",
    routingFields: ["project_id", "trace_id"],
    colocationGroup: "trace",
    writeTarget: "materialized_view_target",
    localEngine: "ReplicatedReplacingMergeTree",
    directLocal: false,
  },
  dataset_run_items_rmt: {
    shardingExpression: "cityHash64(project_id, trace_id)",
    routingFields: ["project_id", "trace_id"],
    colocationGroup: "trace",
    writeTarget: "logical",
    localEngine: "ReplicatedReplacingMergeTree",
    directLocal: false,
  },
  blob_storage_file_log: {
    shardingExpression: "cityHash64(project_id, entity_id)",
    routingFields: ["project_id", "entity_id"],
    colocationGroup: "entity",
    writeTarget: "logical",
    localEngine: "ReplicatedReplacingMergeTree",
    directLocal: false,
  },
  ingestion_size_stats: {
    shardingExpression: "cityHash64(project_id, trace_id)",
    routingFields: ["project_id", "trace_id"],
    colocationGroup: "trace",
    writeTarget: "materialized_view_target",
    localEngine: "ReplicatedMergeTree",
    directLocal: false,
  },
  project_environments: {
    shardingExpression: "cityHash64(project_id)",
    routingFields: ["project_id"],
    colocationGroup: "entity",
    writeTarget: "materialized_view_target",
    localEngine: "ReplicatedAggregatingMergeTree",
    directLocal: false,
  },
} as const satisfies Record<string, ShardedTableContract>;

export type ClickhouseShardedTable = keyof typeof CLICKHOUSE_SHARDED_TABLES;

export const CLICKHOUSE_DIRECT_LOCAL_TABLES = [
  "traces",
  "observations",
  "scores",
] as const satisfies readonly ClickhouseShardedTable[];

/** Removed by migration 0029; retained here to prevent accidental revival. */
export const CLICKHOUSE_RETIRED_TABLES = ["traces_null"] as const;

export type ClickhouseDeploymentMode =
  | "single_shard"
  | "sharded_distributed"
  | "sharded_direct_local";

export type ClickhouseDeploymentModeResult =
  | { ok: true; mode: ClickhouseDeploymentMode }
  | { ok: false; error: string };

export const resolveClickhouseDeploymentMode = ({
  shardingEnabled,
  localWriteEnabled,
  clusterEnabled,
}: {
  shardingEnabled: boolean;
  localWriteEnabled: boolean;
  clusterEnabled: boolean;
}): ClickhouseDeploymentModeResult => {
  if (localWriteEnabled && !shardingEnabled) {
    return {
      ok: false,
      error:
        "ClickHouse direct-local writes require sharding to be explicitly enabled",
    };
  }
  if (shardingEnabled && !clusterEnabled) {
    return {
      ok: false,
      error: "ClickHouse sharding requires cluster DDL to be enabled",
    };
  }
  if (!shardingEnabled) return { ok: true, mode: "single_shard" };
  return {
    ok: true,
    mode: localWriteEnabled ? "sharded_direct_local" : "sharded_distributed",
  };
};
