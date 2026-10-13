import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    CLICKHOUSE_CLUSTER_ENABLED: "true",
    CLICKHOUSE_CLUSTER_NAME: "default",
  },
}));

vi.mock("../../env", () => ({ env: mocks.env }));
vi.mock("../repositories", () => ({ queryClickhouse: vi.fn() }));

import { systemTableRef } from "./queryTracking";

describe("systemTableRef", () => {
  beforeEach(() => {
    mocks.env.CLICKHOUSE_CLUSTER_ENABLED = "true";
    mocks.env.CLICKHOUSE_CLUSTER_NAME = "default";
  });

  it("queries all query log tables on every replica in clustered mode", () => {
    expect(systemTableRef("system.query_log")).toBe(
      "clusterAllReplicas('default', merge(system, '^query_log*'))",
    );
  });

  it("escapes custom cluster names before interpolating them into SQL", () => {
    mocks.env.CLICKHOUSE_CLUSTER_NAME = "eu-west'\\blue\n";

    expect(systemTableRef("system.processes")).toBe(
      "clusterAllReplicas('eu-west\\'\\\\blue\\n', 'system.processes')",
    );
  });

  it("rejects cluster names containing NUL bytes", () => {
    mocks.env.CLICKHOUSE_CLUSTER_NAME = "invalid\0cluster";

    expect(() => systemTableRef("system.processes")).toThrow(
      "Invalid ClickHouse string",
    );
  });
});
