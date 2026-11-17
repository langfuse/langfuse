import { describe, expect, it, vi } from "vitest";
import { QueryBuilder } from "./queryBuilder";
import type { QueryType } from "../types";

vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
  shouldSkipScoresDedup: vi.fn().mockReturnValue(false),
}));

describe("parameterized dashboard aggregations", () => {
  it("compiles the requested percentile and exact non-overlapping bands through both engines", async () => {
    for (const version of ["v1", "v2"] as const) {
      const query = {
        view: "observations",
        dimensions: [],
        metrics: [{ measure: "latency", aggregation: "p50", percentile: 10 }],
        filters: [],
        timeDimension: null,
        fromTimestamp: "2026-01-01T00:00:00Z",
        toTimestamp: "2026-01-02T00:00:00Z",
        orderBy: null,
      } as QueryType;
      const percentile = await new QueryBuilder(undefined, version).build(
        query,
        "test-project",
        true,
      );
      expect(percentile.query).toMatch(/quantile\(0\.1\)/i);
      const bands = await new QueryBuilder(
        { histogramEdges: [0, 100, 1000] },
        version,
      ).build(
        {
          ...query,
          metrics: [{ measure: "latency", aggregation: "histogram" }],
        },
        "test-project",
        true,
      );
      expect(bands.query).toMatch(/countIf\(/i);
      expect(bands.query).toMatch(/isNull\(/i);
      expect(bands.query).not.toMatch(/histogram\(/i);
    }
  });
});
