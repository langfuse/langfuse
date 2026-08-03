import { describe, expect, it } from "vitest";

import {
  buildClickhouseDeleteTarget,
  buildClickhouseMutationTable,
} from "./mutationRouting";

describe("ClickHouse sharded mutation routing", () => {
  it("keeps single-shard deletes on the logical table", () => {
    expect(
      buildClickhouseDeleteTarget("traces", {
        shardingEnabled: false,
        clusterName: "default",
      }),
    ).toBe("traces");
  });

  it("fans sharded deletes out to every local table", () => {
    expect(
      buildClickhouseDeleteTarget("traces", {
        shardingEnabled: true,
        clusterName: "prod-cluster",
      }),
    ).toBe("traces_local ON CLUSTER `prod-cluster`");
  });

  it("maps sharded ALTER mutations to the local table", () => {
    expect(buildClickhouseMutationTable("events_full", true)).toBe(
      "events_full_local",
    );
  });

  it("rejects unsafe cluster identifiers", () => {
    expect(() =>
      buildClickhouseDeleteTarget("scores", {
        shardingEnabled: true,
        clusterName: "default` ON CLUSTER injected",
      }),
    ).toThrow("Invalid ClickHouse cluster name");
  });
});
