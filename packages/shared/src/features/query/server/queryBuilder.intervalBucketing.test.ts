/** queryBuilder.intervalBucketing.test.ts verifies the 10 Monitor window
 * tokens compile to toStartOfInterval bucketing and matching WITH FILL steps. */
import { describe, it, expect, vi } from "vitest";

import { type QueryType } from "../types";
import { QueryBuilder } from "./queryBuilder";

vi.mock("../../../server/queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
  shouldSkipScoresDedup: vi.fn().mockReturnValue(false),
}));

/** windowBucketCases maps each window token to its expected ClickHouse interval. */
const windowBucketCases = [
  ["5m", "INTERVAL 5 MINUTE"],
  ["10m", "INTERVAL 10 MINUTE"],
  ["15m", "INTERVAL 15 MINUTE"],
  ["30m", "INTERVAL 30 MINUTE"],
  ["1h", "INTERVAL 1 HOUR"],
  ["2h", "INTERVAL 2 HOUR"],
  ["4h", "INTERVAL 4 HOUR"],
  ["1d", "INTERVAL 1 DAY"],
  ["2d", "INTERVAL 2 DAY"],
  ["1w", "INTERVAL 7 DAY"],
] as const;

/** buildWindowQuery compiles a minimal traces query bucketed by the given window granularity. */
const buildWindowQuery = async (
  granularity: string,
  fromTimestamp = "2025-01-01T00:00:00.000Z",
  toTimestamp = "2025-01-02T00:00:00.000Z",
) => {
  const query = {
    view: "traces",
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: [],
    timeDimension: { granularity },
    fromTimestamp,
    toTimestamp,
    orderBy: null,
  } as unknown as QueryType;
  return new QueryBuilder().build(query, "test-project");
};

describe("queryBuilder interval bucketing", () => {
  it.each(windowBucketCases)(
    "%s window buckets via toStartOfInterval and fills with the matching STEP",
    async (granularity, interval) => {
      const { query } = await buildWindowQuery(granularity);
      expect(query).toContain("toStartOfInterval");
      expect(query).toContain(interval);
      expect(query).toContain(`STEP ${interval}`);
    },
  );

  // Fill bounds are bucketed to 32-bit DateTime, which overflows after 2106-02-07T06:28:15Z.
  it.each([
    ["month", "2025-01-01T00:00:00.000Z", "2106-01-01T00:00:00.000Z", true],
    ["month", "2025-01-01T00:00:00.000Z", "2106-01-01T00:00:00.001Z", false],
    ["day", "1969-12-31T23:59:59.999Z", "1970-02-01T00:00:00.000Z", false],
    // 50,000 and 50,001 one-minute buckets.
    ["minute", "2025-01-01T00:00:00.000Z", "2025-02-04T17:20:00.000Z", true],
    ["minute", "2025-01-01T00:00:00.000Z", "2025-02-04T17:21:00.000Z", false],
  ] as const)(
    "%s from %s to %s applies WITH FILL: %s",
    async (granularity, fromTimestamp, toTimestamp, fills) => {
      const { query } = await buildWindowQuery(
        granularity,
        fromTimestamp,
        toTimestamp,
      );
      expect(query.includes("WITH FILL")).toBe(fills);
    },
  );
});
