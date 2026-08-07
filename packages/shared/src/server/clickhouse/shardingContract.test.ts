import { describe, expect, it } from "vitest";

import {
  CLICKHOUSE_ROUTING_VERSION,
  CLICKHOUSE_SHARDED_TABLES,
  CLICKHOUSE_SHARDING_SCHEMA_VERSION,
  CLICKHOUSE_SHARDING_CONTRACT_COMMENT,
  resolveClickhouseDeploymentMode,
} from "./shardingContract";

describe("ClickHouse sharding contract", () => {
  it("pins schema and routing versions", () => {
    expect(CLICKHOUSE_SHARDING_SCHEMA_VERSION).toBe(1);
    expect(CLICKHOUSE_ROUTING_VERSION).toBe(1);
    expect(CLICKHOUSE_SHARDING_CONTRACT_COMMENT).toBe(
      "langfuse_sharding_schema=1,langfuse_routing=1",
    );
  });

  it("keeps the trace data family colocated", () => {
    expect(CLICKHOUSE_SHARDED_TABLES.traces.shardingExpression).toBe(
      "cityHash64(project_id, id)",
    );
    for (const table of [
      "observations",
      "observations_batch_staging",
      "events_full",
      "events_core",
      "dataset_run_items_rmt",
    ] as const) {
      expect(CLICKHOUSE_SHARDED_TABLES[table].shardingExpression).toBe(
        "cityHash64(project_id, trace_id)",
      );
    }
    expect(CLICKHOUSE_SHARDED_TABLES.scores.shardingExpression).toBe(
      "cityHash64(project_id, ifNull(trace_id, id))",
    );
  });

  it("pins replicated local engines for every sharded table", () => {
    for (const contract of Object.values(CLICKHOUSE_SHARDED_TABLES)) {
      expect(contract.localEngine).toMatch(/^Replicated.*MergeTree$/);
    }
    expect(CLICKHOUSE_SHARDED_TABLES.ingestion_size_stats.localEngine).toBe(
      "ReplicatedMergeTree",
    );
    expect(CLICKHOUSE_SHARDED_TABLES.project_environments.localEngine).toBe(
      "ReplicatedAggregatingMergeTree",
    );
  });

  it.each([
    [false, false, true, "single_shard"],
    [true, false, true, "sharded_distributed"],
    [true, true, true, "sharded_direct_local"],
  ] as const)(
    "resolves sharding=%s local=%s cluster=%s as %s",
    (shardingEnabled, localWriteEnabled, clusterEnabled, expected) => {
      expect(
        resolveClickhouseDeploymentMode({
          shardingEnabled,
          localWriteEnabled,
          clusterEnabled,
        }),
      ).toEqual({ ok: true, mode: expected });
    },
  );

  it.each([
    [false, true, true, "direct-local writes require sharding"],
    [true, false, false, "sharding requires cluster DDL"],
    [true, true, false, "sharding requires cluster DDL"],
  ] as const)(
    "rejects sharding=%s local=%s cluster=%s",
    (shardingEnabled, localWriteEnabled, clusterEnabled, expectedError) => {
      const result = resolveClickhouseDeploymentMode({
        shardingEnabled,
        localWriteEnabled,
        clusterEnabled,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(expectedError);
    },
  );
});
