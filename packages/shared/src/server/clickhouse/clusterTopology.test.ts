import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLICKHOUSE_SHARDED_TABLES } from "./shardingContract";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  nodeQuery: vi.fn(),
  env: {
    CLICKHOUSE_CLUSTER_NAME: "default",
    CLICKHOUSE_DB: "default",
    CLICKHOUSE_LOCAL_HOST_FIELD: "host_address" as const,
    CLICKHOUSE_LOCAL_HTTP_PORT: 8123,
    CLICKHOUSE_LOCAL_HTTP_PROTOCOL: "http" as const,
    CLICKHOUSE_LOCAL_TOPOLOGY_TTL_MS: 60_000,
  },
}));

vi.mock("../../env", () => ({ env: mocks.env }));
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("./client", () => ({
  clickhouseClient: vi.fn(() => ({ query: mocks.query })),
  clickhouseClientForUrl: vi.fn(() => ({ query: mocks.nodeQuery })),
}));

import {
  __resetClusterTopologyCacheForTests,
  __setClusterTopologyForTests,
  getCachedClusterTopology,
  getClusterTopologyContractState,
  getClusterNodeUrl,
  getClusterTopology,
  hasValidLocalWriteTableContract,
  hasUnsafeInternalReplication,
  parseClusterTopologyRows,
  type SystemClustersRow,
  type SystemTablesRow,
} from "./clusterTopology";

const row = (
  shardNum: number,
  replicaNum: number,
  overrides: Partial<SystemClustersRow> = {},
): SystemClustersRow => ({
  shard_num: shardNum,
  replica_num: replicaNum,
  host_name: `shard-${shardNum}-replica-${replicaNum}`,
  host_address: `10.0.${shardNum}.${replicaNum}`,
  shard_weight: 1,
  internal_replication: 1,
  ...overrides,
});

const tableRows = (): SystemTablesRow[] =>
  Object.entries(CLICKHOUSE_SHARDED_TABLES).flatMap(([table, contract]) => [
    {
      name: table,
      engine: "Distributed",
      engine_full: `Distributed('default', 'default', '${table}_local', ${contract.shardingExpression})`,
      comment: "langfuse_sharding_schema=1,langfuse_routing=1",
    },
    {
      name: `${table}_local`,
      engine: contract.localEngine,
      engine_full: `${contract.localEngine}('/clickhouse/tables/{shard}/${table}', '{replica}', event_ts)`,
      comment: "langfuse_sharding_schema=1,langfuse_routing=1",
    },
  ]);

describe("parseClusterTopologyRows", () => {
  beforeEach(() => {
    __resetClusterTopologyCacheForTests();
    mocks.query.mockReset();
    mocks.nodeQuery.mockReset();
  });

  it("parses complete weighted shard and replica metadata", () => {
    const topology = parseClusterTopologyRows([
      row(1, 1, { shard_weight: 3 }),
      row(1, 2, { shard_weight: 3 }),
      row(2, 1),
    ]);

    expect(topology?.shards).toMatchObject([
      { shardNum: 1, weight: 3, replicas: [{}, {}] },
      { shardNum: 2, weight: 1, replicas: [{}] },
    ]);
    expect(topology?.fingerprint).toBeTruthy();
  });

  it.each([
    ["empty host", [row(1, 1, { host_address: "" })]],
    ["missing shard", [row(1, 1), row(3, 1)]],
    ["missing replica", [row(1, 1), row(1, 3)]],
    ["duplicate replica", [row(1, 1), row(1, 1)]],
    ["invalid weight", [row(1, 1, { shard_weight: 0 })]],
    ["conflicting weight", [row(1, 1), row(1, 2, { shard_weight: 2 })]],
    [
      "conflicting replication",
      [row(1, 1), row(1, 2, { internal_replication: 0 })],
    ],
  ])("fails closed for %s", (_name, rows) => {
    expect(parseClusterTopologyRows(rows as SystemClustersRow[])).toBeNull();
  });

  it("marks every replicated shard without internal replication as unsafe", () => {
    const topology = parseClusterTopologyRows([
      row(1, 1, { internal_replication: 0 }),
    ]);

    expect(topology).not.toBeNull();
    expect(hasUnsafeInternalReplication(topology!)).toBe(true);
  });

  it("formats IPv6 node URLs", () => {
    expect(
      getClusterNodeUrl({ host: "2001:db8::1", port: 8443, protocol: "https" }),
    ).toBe("https://[2001:db8::1]:8443");
  });

  it("validates the Distributed and local table contract", () => {
    expect(hasValidLocalWriteTableContract(tableRows())).toBe(true);
    expect(
      hasValidLocalWriteTableContract(
        tableRows().map((table) =>
          table.name === "traces"
            ? {
                ...table,
                engine_full:
                  "Distributed('default', 'default', 'traces_local', rand())",
              }
            : table,
        ),
      ),
    ).toBe(false);
    expect(
      hasValidLocalWriteTableContract(
        tableRows().map((table) =>
          table.name === "traces"
            ? {
                ...table,
                engine_full:
                  "Distributed('default', 'default', 'traces_local', cityHash64(project_id, id) + 1)",
              }
            : table,
        ),
      ),
    ).toBe(false);
  });

  it("requires replicated local tables", () => {
    expect(
      hasValidLocalWriteTableContract(
        tableRows().map((table) =>
          table.name.endsWith("_local")
            ? { ...table, engine: "ReplacingMergeTree" }
            : table,
        ),
      ),
    ).toBe(false);
    expect(hasValidLocalWriteTableContract(tableRows())).toBe(true);
  });

  it("requires shard-isolated Keeper paths", () => {
    expect(
      hasValidLocalWriteTableContract(
        tableRows().map((table) =>
          table.name === "traces_local"
            ? {
                ...table,
                engine_full:
                  "ReplicatedReplacingMergeTree('/clickhouse/tables/traces', '{replica}', event_ts)",
              }
            : table,
        ),
      ),
    ).toBe(false);
  });

  it("requires matching schema and routing versions", () => {
    expect(
      hasValidLocalWriteTableContract(
        tableRows().map((table) =>
          table.name === "events_full"
            ? { ...table, comment: "langfuse_sharding_schema=2" }
            : table,
        ),
      ),
    ).toBe(false);
  });

  it("shares concurrent topology discovery", async () => {
    mocks.query.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue([row(1, 1)]),
    });
    mocks.nodeQuery.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue(tableRows()),
    });

    const [first, second] = await Promise.all([
      getClusterTopology(),
      getClusterTopology(),
    ]);

    expect(first).toEqual(second);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.nodeQuery).toHaveBeenCalledTimes(1);
  });

  it("clears a cached snapshot when a refresh is invalid", async () => {
    const cached = parseClusterTopologyRows([row(1, 1)])!;
    __setClusterTopologyForTests(cached);
    mocks.query.mockResolvedValue({
      json: vi.fn().mockResolvedValue([row(1, 1, { host_address: "" })]),
    });

    expect(await getClusterTopology({ forceRefresh: true })).toBeNull();
    expect(getCachedClusterTopology()).toBeNull();
  });

  it("fails closed when any replica has a mismatched table contract", async () => {
    mocks.query.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue([row(1, 1), row(2, 1)]),
    });
    mocks.nodeQuery
      .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue(tableRows()) })
      .mockResolvedValueOnce({
        json: vi
          .fn()
          .mockResolvedValue(
            tableRows().filter((table) => table.name !== "scores_local"),
          ),
      });

    expect(await getClusterTopology()).toBeNull();
    expect(mocks.nodeQuery).toHaveBeenCalledTimes(2);
    expect(getClusterTopologyContractState()).toMatchObject({
      status: "invalid",
    });
  });

  it("fails closed when a validated topology fingerprint changes", async () => {
    mocks.query
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue([row(1, 1), row(2, 1)]),
      })
      .mockResolvedValueOnce({
        json: vi
          .fn()
          .mockResolvedValue([row(1, 1, { shard_weight: 2 }), row(2, 1)]),
      });
    mocks.nodeQuery.mockResolvedValue({
      json: vi.fn().mockResolvedValue(tableRows()),
    });

    expect(await getClusterTopology()).not.toBeNull();
    expect(await getClusterTopology({ forceRefresh: true })).toBeNull();
    expect(getCachedClusterTopology()).toBeNull();
    expect(getClusterTopologyContractState()).toMatchObject({
      status: "topology_changed",
    });
  });
});
