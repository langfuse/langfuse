import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    CLICKHOUSE_CLUSTER_ENABLED: "true",
    CLICKHOUSE_CLUSTER_NAME: "default",
  },
}));

vi.mock("../../env", () => ({ env: mocks.env }));
vi.mock("../repositories", () => ({ queryClickhouse: vi.fn() }));

import {
  getQueryError,
  pollQueryStatus,
  systemTableRef,
} from "./queryTracking";
import { queryClickhouse } from "../repositories";

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

describe("query log tracking", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    mocks.env.CLICKHOUSE_CLUSTER_ENABLED = "true";
    mocks.env.CLICKHOUSE_CLUSTER_NAME = "default";
  });

  afterEach(() => vi.useRealTimers());

  it("bounds archived terminal lookups from the original submission across UTC midnight", async () => {
    vi.mocked(queryClickhouse)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { type: "ExceptionWhileProcessing", exception_code: "241" },
      ])
      .mockResolvedValueOnce([{ exception_message: "Memory limit exceeded" }]);
    const startedAt = "2026-01-01T00:01:00.000Z";

    expect(await pollQueryStatus("archived-query", startedAt)).toBe("failed");
    expect(await getQueryError("archived-query", startedAt)).toBe(
      "Memory limit exceeded",
    );

    const requests = vi
      .mocked(queryClickhouse)
      .mock.calls.map(([request]) => request);
    expect(requests[0].params).toEqual({ queryId: "archived-query" });
    for (const request of requests.slice(1)) {
      expect(request.query).toContain(
        "clusterAllReplicas('default', merge(system, '^query_log*'))",
      );
      expect(request.query).toContain(
        "event_date >= {queryLogSinceDate: Date}",
      );
      expect(request.query).toContain(
        "event_time >= {queryLogSince: DateTime64(3, 'UTC')}",
      );
      expect(request.params).toEqual({
        queryId: "archived-query",
        queryLogSince: "2025-12-31 23:56:00.000",
        queryLogSinceDate: "2025-12-30",
      });
      expect(request.query).not.toMatch(/event_(time|date)\s*<=|now\(|today\(/);
    }
  });

  it.each([
    undefined,
    "invalid' OR 1=1",
    new Date(NaN),
    "2026-01-01T00:00:00",
    "9999-01-01T00:00:00Z",
  ])(
    "keeps unbounded coverage for missing or invalid submission time %s",
    async (startedAt) => {
      vi.mocked(queryClickhouse)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ type: "QueryFinish", exception_code: "0" }])
        .mockResolvedValueOnce([]);
      expect(await pollQueryStatus("legacy-query", startedAt)).toBe(
        "completed",
      );
      expect(await getQueryError("legacy-query", startedAt)).toBeUndefined();
      for (const [request] of vi.mocked(queryClickhouse).mock.calls.slice(1)) {
        expect(request.params).toEqual({ queryId: "legacy-query" });
        expect(request.query).not.toContain("event_date >=");
        expect(request.query).not.toContain("event_time >=");
      }
    },
  );

  it("checks running queries without a time bound or a log scan", async () => {
    vi.mocked(queryClickhouse).mockResolvedValueOnce([
      { query_id: "long-running" },
    ]);
    expect(
      await pollQueryStatus("long-running", new Date("2026-01-01T00:00:00Z")),
    ).toBe("running");
    expect(queryClickhouse).toHaveBeenCalledTimes(1);
    expect(vi.mocked(queryClickhouse).mock.calls[0][0].query).toContain(
      "clusterAllReplicas('default', 'system.processes')",
    );
  });

  it("normalizes offset timestamps to UTC and preserves single-node lookup behavior", async () => {
    mocks.env.CLICKHOUSE_CLUSTER_ENABLED = "false";
    vi.mocked(queryClickhouse).mockResolvedValue([]);

    expect(
      await pollQueryStatus("missing", "2026-01-01T02:01:00.123+02:00"),
    ).toBe("not_found");

    const request = vi.mocked(queryClickhouse).mock.calls[1][0];
    expect(request.query).toContain("FROM system.query_log");
    expect(request.params).toMatchObject({
      queryLogSince: "2025-12-31 23:56:00.000",
      queryLogSinceDate: "2025-12-30",
    });
  });
});
