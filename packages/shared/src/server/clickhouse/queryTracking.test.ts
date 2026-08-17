import { describe, expect, it, vi } from "vitest";

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
  it("queries all query log tables on every replica in clustered mode", () => {
    expect(systemTableRef("system.query_log")).toBe(
      "clusterAllReplicas('default', merge(system, '^query_log*'))",
    );
  });
});
