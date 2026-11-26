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
    const fromDate = new Date(2026, 0, 1);
    const toDate = new Date(2026, 0, 5);
    const interval = { count: 2, unit: "day" as const };
    const data = [
      { timestamp: fromDate, count: 40 },
      { timestamp: new Date(2026, 0, 3), count: 100 },
      { timestamp: toDate, count: 200 },
    ];

    const result = fillTimeSeriesGaps(data, fromDate, toDate, interval);

    expect(result).toEqual([
      { timestamp: new Date(2026, 0, 3), count: 40 },
      { timestamp: toDate, count: 150 },
    ]);
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
  it("keeps the first partial unit when its timestamp precedes the bucket", () => {
    const fromDate = new Date(2026, 0, 1, 0, 10);
    const toDate = new Date(2026, 0, 5, 0, 5);
    const data = [
      { timestamp: new Date(2026, 0, 1), category: "ok", count: 10 },
      { timestamp: new Date(2026, 0, 5), category: "ok", count: 20 },
    ];

    expect(
      fillCategoricalTimeSeriesGaps(data, fromDate, toDate, {
        count: 2,
        unit: "day",
      }),
    ).toEqual([
      { timestamp: new Date(2026, 0, 3, 0, 5), category: "ok", count: 10 },
      { timestamp: toDate, category: "ok", count: 20 },
    ]);
  });

  it("retains UTC bucket timestamps in a local date range", () => {
    const fromDate = new Date("2026-01-01T05:10:00Z");
    const toDate = new Date("2026-01-05T05:05:00Z");
    const data = [
      {
        timestamp: new Date("2026-01-01T00:00:00Z"),
        category: "ok",
        count: 10,
      },
      {
        timestamp: new Date("2026-01-04T00:00:00Z"),
        category: "ok",
        count: 20,
      },
    ];

    expect(
      fillCategoricalTimeSeriesGaps(data, fromDate, toDate, {
        count: 2,
        unit: "day",
      }),
    ).toEqual([
      {
        timestamp: new Date("2026-01-03T05:05:00Z"),
        category: "ok",
        count: 10,
      },
      { timestamp: toDate, category: "ok", count: 20 },
    ]);
  });

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
