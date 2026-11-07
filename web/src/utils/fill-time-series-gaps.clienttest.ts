// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  fillCategoricalTimeSeriesGaps,
  fillTimeSeriesGaps,
} from "@/src/utils/fill-time-series-gaps";

describe("fillTimeSeriesGaps", () => {
  it("does not drop data points for multi-unit intervals (Issue #17157 regression)", () => {
    // 5 daily midnight-aligned points with counts 10, 20, 30, 40, 50
    const data = [
      { timestamp: new Date(2026, 0, 1), count: 10 },
      { timestamp: new Date(2026, 0, 2), count: 20 },
      { timestamp: new Date(2026, 0, 3), count: 30 },
      { timestamp: new Date(2026, 0, 4), count: 40 },
      { timestamp: new Date(2026, 0, 5), count: 50 },
    ];

    const fromDate = new Date(2026, 0, 1);
    const toDate = new Date(2026, 0, 5, 14, 30);
    const interval = { count: 2, unit: "day" as const };

    const result = fillTimeSeriesGaps(data, fromDate, toDate, interval);

    // Buckets tiling back from Jan 5 14:30:
    // Bucket 0: Dec 30 14:30 - Jan 1 14:30 -> contains Jan 1 (10) -> avg 10
    // Bucket 1: Jan 1 14:30 - Jan 3 14:30 -> contains Jan 2 (20), Jan 3 (30) -> avg 25
    // Bucket 2: Jan 3 14:30 - Jan 5 14:30 -> contains Jan 4 (40), Jan 5 (50) -> avg 45
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.count)).toEqual([10, 25, 45]);
  });

  it("assigns boundary points to the later bucket and includes toDate", () => {
    // Points exactly at boundary timestamps
    const fromDate = new Date(2026, 0, 1);
    const toDate = new Date(2026, 0, 5);
    const interval = { count: 2, unit: "day" as const };

    // With toDate = Jan 05 00:00:
    // Bucket 2: [Jan 03 00:00, Jan 05 00:00]
    // Bucket 1: [Jan 01 00:00, Jan 03 00:00]
    // Bucket 0: [Dec 30 00:00, Jan 01 00:00]
    const data = [
      { timestamp: new Date(2026, 0, 3), count: 100 },
      { timestamp: new Date(2026, 0, 5), count: 200 },
    ];

    const result = fillTimeSeriesGaps(data, fromDate, toDate, interval);

    // Jan 03 00:00 is on the boundary between Bucket 1 ([Jan 1, Jan 3]) and Bucket 2 ([Jan 3, Jan 5]).
    // Checked newest-first: Bucket 2 receives Jan 03 00:00.
    // Bucket 2 also receives Jan 05 00:00 (toDate).
    // So Bucket 2 has both points: avg = (100 + 200) / 2 = 150.
    // Bucket 1 has no points -> placeholder null count.
    expect(result.length).toBeGreaterThanOrEqual(2);
    const lastBucket = result[result.length - 1];
    expect(lastBucket?.count).toBe(150);
  });

  it("handles single-unit intervals correctly without alteration", () => {
    const data = [
      { timestamp: new Date(2026, 0, 1), count: 10 },
      { timestamp: new Date(2026, 0, 3), count: 30 },
    ];
    const fromDate = new Date(2026, 0, 1);
    const toDate = new Date(2026, 0, 3);
    const interval = { count: 1, unit: "day" as const };

    const result = fillTimeSeriesGaps(data, fromDate, toDate, interval);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.count)).toEqual([10, null, 30]);
  });
});

describe("fillCategoricalTimeSeriesGaps", () => {
  it("does not drop categorical data points for multi-unit intervals (Issue #17157 regression)", () => {
    const data = [
      {
        timestamp: new Date(2026, 0, 1),
        category: "ok",
        count: 10,
      },
      {
        timestamp: new Date(2026, 0, 2),
        category: "ok",
        count: 20,
      },
      {
        timestamp: new Date(2026, 0, 3),
        category: "ok",
        count: 30,
      },
      {
        timestamp: new Date(2026, 0, 4),
        category: "ok",
        count: 40,
      },
      {
        timestamp: new Date(2026, 0, 5),
        category: "ok",
        count: 50,
      },
    ];

    const fromDate = new Date(2026, 0, 1);
    const toDate = new Date(2026, 0, 5, 14, 30);
    const interval = { count: 2, unit: "day" as const };

    const result = fillCategoricalTimeSeriesGaps(
      data,
      fromDate,
      toDate,
      interval,
    );

    // Categorical sums points in each bucket:
    // Bucket 0: contains Jan 1 -> sum = 10
    // Bucket 1: contains Jan 2, Jan 3 -> sum = 20 + 30 = 50
    // Bucket 2: contains Jan 4, Jan 5 -> sum = 40 + 50 = 90
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.count)).toEqual([10, 50, 90]);
  });
});
