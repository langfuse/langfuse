// @vitest-environment node

import { fillTimeSeriesGaps, fillCategoricalTimeSeriesGaps } from "./fill-time-series-gaps";

describe("fillTimeSeriesGaps - multi-unit buckets", () => {
  it("assigns every single-unit point to a bucket (no gaps between buckets)", () => {
    // 5 days of daily points, range ending mid-day on day 5, aggregated into
    // 2-day buckets. Buckets must tile contiguously back from toDate:
    // [Jan 3 14:30, Jan 5 14:30] -> (40+50)/2, [Jan 1 14:30, Jan 3 14:30] ->
    // (20+30)/2, [Dec 30 14:30, Jan 1 14:30] -> 10.
    const counts = [10, 20, 30, 40, 50];
    const data = counts.map((c, i) => ({
      timestamp: new Date(2026, 0, i + 1, 0, 0, 0),
      count: c,
    }));

    const result = fillTimeSeriesGaps(
      data,
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 0, 5, 14, 30, 0),
      { count: 2, unit: "day" },
    );

    expect(result.map((p) => p.count)).toEqual([10, 25, 45]);
  });

  it("puts a point exactly on a bucket boundary into the earlier bucket", () => {
    // Buckets are (start, end]: a point on a shared boundary belongs to the
    // earlier bucket, and the rightmost bucket never holds more than `count`
    // unit-points even when toDate is aligned and the query's inclusive
    // `timestamp <= toTimestamp` delivers a point exactly at toDate.
    const data = [
      { timestamp: new Date(2026, 0, 3, 0, 0, 0), count: 1 },
      { timestamp: new Date(2026, 0, 5, 0, 0, 0), count: 2 },
    ];

    const result = fillTimeSeriesGaps(
      data,
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 0, 5, 0, 0, 0),
      { count: 2, unit: "day" },
    );

    // (Jan 1, Jan 3] gets count 1, (Jan 3, Jan 5] gets count 2
    expect(result.map((p) => p.count)).toEqual([null, 1, 2]);
  });

  it("keeps count points per bucket when toDate is aligned to the unit", () => {
    const counts = [10, 20, 30, 40, 50];
    const data = counts.map((c, i) => ({
      timestamp: new Date(2026, 0, i + 1, 0, 0, 0),
      count: c,
    }));

    const result = fillTimeSeriesGaps(
      data,
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 0, 5, 0, 0, 0),
      { count: 2, unit: "day" },
    );

    // (Dec 31, Jan 1] -> 10, (Jan 1, Jan 3] -> (20+30)/2, (Jan 3, Jan 5] ->
    // (40+50)/2 - no bucket may absorb three daily points.
    expect(result.map((p) => p.count)).toEqual([10, 25, 45]);
  });
});

describe("fillCategoricalTimeSeriesGaps - multi-unit buckets", () => {
  it("sums every single-unit point into a bucket (no gaps between buckets)", () => {
    // 4 days, one category: counts 1, 2, 3, 4 with toDate mid-day on day 4.
    // Contiguous 2-day buckets: [Jan 2 14:30, Jan 4 14:30] -> 3+4,
    // [Dec 31 14:30, Jan 2 14:30] -> 1+2.
    const data = [1, 2, 3, 4].map((c, i) => ({
      timestamp: new Date(2026, 0, i + 1, 0, 0, 0),
      category: "good",
      count: c,
    }));

    const result = fillCategoricalTimeSeriesGaps(
      data,
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 0, 4, 14, 30, 0),
      { count: 2, unit: "day" },
      ["good"],
    );

    expect(result.map((p) => p.count)).toEqual([3, 7]);
  });
});
