import { describe, expect, it, vi } from "vitest";

import type { QueryType } from "../types";
import { QueryBuilder } from "./queryBuilder";

// QueryBuilder.build checks the OTEL FINAL optimization before compiling SQL.
// Mock it so these stay unit-level and do not need ClickHouse.
vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

const usageByTypeTimeseries = {
  view: "observations",
  dimensions: [{ field: "usageType" }],
  metrics: [{ measure: "usageByType", aggregation: "sum" }],
  filters: [],
  timeDimension: { granularity: "day" },
  fromTimestamp: "2025-01-01T00:00:00.000Z",
  toTimestamp: "2025-01-08T00:00:00.000Z",
  orderBy: null,
} as QueryType;

const costByTypeQuery = {
  view: "observations",
  dimensions: [{ field: "costType" }],
  metrics: [{ measure: "costByType", aggregation: "sum" }],
  filters: [],
  timeDimension: null,
  fromTimestamp: "2025-01-01T00:00:00.000Z",
  toTimestamp: "2025-01-08T00:00:00.000Z",
  orderBy: null,
} as QueryType;

const inputTokensByCacheStatusTimeseries = {
  view: "observations",
  dimensions: [{ field: "inputCacheStatus" }],
  metrics: [{ measure: "inputTokensByCacheStatus", aggregation: "sum" }],
  filters: [],
  timeDimension: { granularity: "day" },
  fromTimestamp: "2025-01-01T00:00:00.000Z",
  toTimestamp: "2025-01-08T00:00:00.000Z",
  orderBy: null,
} as QueryType;

const inputCostWithoutCacheReadsByUseCase = {
  view: "observations",
  dimensions: [{ field: "name" }],
  metrics: [{ measure: "inputCost", aggregation: "sum" }],
  filters: [
    {
      column: "cachedInputTokens",
      operator: "<=",
      value: 0,
      type: "number",
    },
  ],
  timeDimension: null,
  fromTimestamp: "2025-01-01T00:00:00.000Z",
  toTimestamp: "2025-01-08T00:00:00.000Z",
  orderBy: null,
} as QueryType;

describe("queryBuilder pairExpand ARRAY JOIN aliases", () => {
  it("does not re-alias usageType in a single-level usageByType timeseries", async () => {
    // Dashboard ModelUsageChart (v2) compiles this shape. ClickHouse rejects
    // `usageType AS usageType` in the same SELECT as `ARRAY JOIN … AS usageType`.
    const { query } = await new QueryBuilder(undefined, "v2").build(
      usageByTypeTimeseries,
      "test-project",
      true,
    );

    expect(query).toContain("ARRAY JOIN");
    expect(query).toMatch(/mapKeys\([^)]*usage_details\) AS usageType/);
    expect(query).not.toMatch(/usageType\s+as\s+usageType/i);
    expect(query).toMatch(/sum\(usage_value\)\s+as\s+sum_usageByType/i);
  });

  it("does not re-alias costType in the two-level inner SELECT", async () => {
    const { query } = await new QueryBuilder(undefined, "v2").build(
      costByTypeQuery,
      "test-project",
      false,
    );

    expect(query).toContain("ARRAY JOIN");
    expect(query).toMatch(/mapKeys\([^)]*cost_details\) AS costType/);
    expect(query).not.toMatch(/costType\s+as\s+costType/i);
  });

  it("expands cached, other, and unreported input token buckets", async () => {
    const { query } = await new QueryBuilder(undefined, "v2").build(
      inputTokensByCacheStatusTimeseries,
      "test-project",
      true,
    );

    expect(query).toContain("ARRAY JOIN");
    expect(query).toContain(
      "['Cached input', 'Other input', 'Cache reporting unavailable'] AS inputCacheStatus",
    );
    expect(query).toMatch(
      /sum\(input_tokens_by_cache_status_value\)\s+as\s+sum_inputTokensByCacheStatus/i,
    );
    expect(query).toContain("positionCaseInsensitive");
  });

  it("sums input cost only for observations reporting no cache reads", async () => {
    const { query } = await new QueryBuilder(undefined, "v2").build(
      inputCostWithoutCacheReadsByUseCase,
      "test-project",
      true,
    );

    expect(query).toMatch(/sum\(.+cost_details.+\)\s+as\s+sum_inputCost/is);
    expect(query).toMatch(
      /positionCaseInsensitive.+<= \{[^}]+: Decimal64\(12\)\}/s,
    );
    expect(query).toContain("positionCaseInsensitive");
  });
});
