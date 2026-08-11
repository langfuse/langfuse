/**
 * Application-side replica of ClickHouse's Distributed sharding decision.
 *
 * When CLICKHOUSE_WRITE_LOCAL_ENABLED is on we bypass the Distributed table and
 * insert directly into `<table>_local` on the correct shard. To keep the data
 * layout identical to what the Distributed engine would produce (critical for
 * ReplacingMergeTree dedup, which only works within a single shard), we must
 * reproduce both:
 *   1. the per-table sharding key expression, and
 *   2. the shard selection: `key % totalWeight` mapped by cumulative shard
 *      weights (weights come from system.clusters.shard_weight).
 *
 * Sharding key expressions must mirror the deployment's Distributed tables:
 *   traces        -> cityHash64(project_id, id)
 *   observations  -> cityHash64(project_id, trace_id)
 *   scores        -> cityHash64(project_id, ifNull(trace_id, id))
 */

import { cityHash64OfStrings } from "./cityHash64";
import { CLICKHOUSE_DIRECT_LOCAL_TABLES } from "./shardingContract";

/** Logical tables that have a `<table>_local` shard and are locally routable. */
export const LOCAL_ROUTABLE_TABLES = CLICKHOUSE_DIRECT_LOCAL_TABLES;

export type LocalRoutableTable = (typeof LOCAL_ROUTABLE_TABLES)[number];

export const isLocalRoutableTable = (
  table: string,
): table is LocalRoutableTable =>
  (LOCAL_ROUTABLE_TABLES as readonly string[]).includes(table);

export interface ShardInfo {
  /** 1-based shard number as reported by system.clusters. */
  shardNum: number;
  /** shard_weight from system.clusters (defaults to 1 when absent). */
  weight: number;
}

/**
 * Compute the ClickHouse sharding key value for a record of the given table.
 * Returns a UInt64 as bigint, or null if the record is missing the fields
 * required to route it (caller should fall back to the distributed path).
 */
export const computeShardingKey = (
  table: LocalRoutableTable,
  record: Record<string, unknown>,
): bigint | null => {
  const projectId = record.project_id;
  if (typeof projectId !== "string") return null;

  switch (table) {
    case "traces": {
      const id = record.id;
      if (typeof id !== "string") return null;
      return cityHash64OfStrings(projectId, id);
    }
    case "observations": {
      const traceId = record.trace_id;
      if (typeof traceId !== "string") return null;
      return cityHash64OfStrings(projectId, traceId);
    }
    case "scores": {
      // Mirror ClickHouse `ifNull(trace_id, id)` exactly: fall back to `id`
      // ONLY when trace_id is NULL/undefined. A non-null empty string ("")
      // must be hashed as-is, otherwise our shard choice diverges from the
      // Distributed engine and the row could dedup on a different shard.
      const traceId = record.trace_id;
      if (
        traceId !== null &&
        traceId !== undefined &&
        typeof traceId !== "string"
      ) {
        return null;
      }
      const key = traceId ?? record.id;
      if (typeof key !== "string") return null;
      return cityHash64OfStrings(projectId, key);
    }
  }
};

/**
 * Select the target shard for a sharding key, matching ClickHouse Distributed:
 * `slot = key % totalWeight`, then pick the shard whose cumulative weight range
 * `[prefix, prefix + weight)` contains `slot`.
 *
 * Shards are considered in ascending shardNum order. Equal weights degenerate
 * to `key % shardCount`.
 *
 * Returns the selected shardNum, or null when the topology is empty.
 */
export const selectShardNum = (
  shardingKey: bigint,
  shards: ShardInfo[],
): number | null => {
  if (shards.length === 0) return null;

  const ordered = [...shards].sort((a, b) => a.shardNum - b.shardNum);
  if (
    ordered.some(
      (shard) =>
        !Number.isInteger(shard.shardNum) ||
        shard.shardNum <= 0 ||
        !Number.isInteger(shard.weight) ||
        shard.weight <= 0,
    )
  ) {
    return null;
  }
  const totalWeight = ordered.reduce((acc, s) => acc + s.weight, 0);
  if (totalWeight <= 0) return null;

  const slot = Number(shardingKey % BigInt(totalWeight));

  let prefix = 0;
  for (const shard of ordered) {
    const weight = shard.weight;
    if (slot < prefix + weight) return shard.shardNum;
    prefix += weight;
  }
  // Should be unreachable given slot < totalWeight, but be defensive.
  return ordered[ordered.length - 1].shardNum;
};
