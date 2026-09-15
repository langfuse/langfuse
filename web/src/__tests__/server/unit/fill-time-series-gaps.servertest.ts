/**
 * @fileoverview Regression tests for fill-time-series-gaps multi-unit bucket aggregation.
 *
 * Covers the bug in `aggregateIntoMultiUnitBuckets` and the mirrored
 * `aggregateCategoricalIntoMultiUnitBuckets` where the bucket-start loop went
 * back `count - 1` units while the next bucket's end stepped back `count`
 * units, leaving a one-unit gap between consecutive buckets and silently
 * dropping any single-unit points that fell into a gap.
 *
 * Reference: langfuse/langfuse#17157.
 */

import {
  fillTimeSeriesGaps,
  fillCategoricalTimeSeriesGaps,
} from "@/src/utils/fill-time-series-gaps";

// Build dates from UTC components to keep tests timezone-independent:
// `toStartOfSingleUnit` uses local time (date-fns startOfDay etc.), so a
// `new Date("2026-01-01T00:00:00Z")` literal would shift under non-UTC
// locales and the test would assert against the wrong day.
const utc = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, mi, s));

describe("fill-time-series-gaps multi-unit buckets", () => {
  describe("aggregateIntoMultiUnitBuckets (numeric)", () => {
    it("includes every point in range across contiguous 2-day buckets (issue #17157)", () => {
      // 5 daily points; range Jan 1 00:00 to Jan 5 14:30; interval { count: 2, unit: "day" }.
      // Before the fix the output counts were [10, 30, 50] (Jan 2 and Jan 4 dropped).
      // After the fix the buckets tile contiguously back from toDate and every
      // point lands in exactly one bucket, giving averages [10, 25, 45].
      const data = [
        { timestamp: utc(2026, 1, 1, 0, 0, 0), value: 10 },
        { timestamp: utc(2026, 1, 2, 0, 0, 0), value: 20 },
        { timestamp: utc(2026, 1, 3, 0, 0, 0), value: 30 },
        { timestamp: utc(2026, 1, 4, 0, 0, 0), value: 40 },
        { timestamp: utc(2026, 1, 5, 0, 0, 0), value: 50 },
      ];
      const fromDate = utc(2026, 1, 1, 0, 0, 0);
      const toDate = utc(2026, 1, 5, 14, 30, 0);

      const result = fillTimeSeriesGaps(data, fromDate, toDate, {
        count: 2,
        unit: "day",
      });

      expect(result.map((d) => d.value)).toEqual([10, 25, 45]);
      // The rightmost bucket's timestamp should be toDate, not startOfUnit(toDate).
      expect(result[result.length - 1]!.timestamp.toISOString()).toBe(
        toDate.toISOString(),
      );
    });

    it("assigns a point on a shared boundary to the later (newer) bucket", () => {
      // When toDate is itself start-of-unit, bucket boundaries land on the
      // same time-of-day as the single-unit points, so a point can sit on
      // both a previous bucket's end and the next bucket's start. The newer
      // bucket wins so the rightmost bucket stays anchored at toDate.
      const data = [
        { timestamp: utc(2026, 1, 1, 0, 0, 0), value: 10 },
        { timestamp: utc(2026, 1, 2, 0, 0, 0), value: 20 },
        { timestamp: utc(2026, 1, 3, 0, 0, 0), value: 30 },
        { timestamp: utc(2026, 1, 4, 0, 0, 0), value: 40 },
        { timestamp: utc(2026, 1, 5, 0, 0, 0), value: 50 },
      ];
      const fromDate = utc(2026, 1, 1, 0, 0, 0);
      const toDate = utc(2026, 1, 5, 0, 0, 0);

      const result = fillTimeSeriesGaps(data, fromDate, toDate, {
        count: 2,
        unit: "day",
      });

      // Three contiguous 2-day buckets tile back from toDate:
      //   [Dec 30 00:00, Jan 1 00:00] -> empty
      //   [Jan  1 00:00, Jan 3 00:00] -> Jan 1, Jan 2 -> avg 15
      //   [Jan  3 00:00, Jan 5 00:00] -> Jan 3, Jan 4, Jan 5 -> avg 40
      // The boundary point (Jan 3 00:00) is assigned to the newer bucket
      // (bucket 2), not the older one (bucket 1) - an oldest-first
      // assignment would have produced [10, 25, 45] instead.
      expect(result.map((d) => d.value)).toEqual([null, 15, 40]);
      expect(result[result.length - 1]!.timestamp.toISOString()).toBe(
        toDate.toISOString(),
      );
    });

    it("keeps count=1 single-unit behavior unchanged", () => {
      // The multi-unit path is the only one touched by the fix; this guards
      // against an accidental change in the fillGapsInSingleUnitData path.
      const data = [
        { timestamp: utc(2026, 1, 1, 0, 0, 0), value: 10 },
        { timestamp: utc(2026, 1, 3, 0, 0, 0), value: 30 },
        { timestamp: utc(2026, 1, 5, 0, 0, 0), value: 50 },
      ];
      const fromDate = utc(2026, 1, 1, 0, 0, 0);
      const toDate = utc(2026, 1, 5, 0, 0, 0);

      const result = fillTimeSeriesGaps(data, fromDate, toDate, {
        count: 1,
        unit: "day",
      });

      expect(result.map((d) => d.value)).toEqual([10, null, 30, null, 50]);
    });
  });

  describe("aggregateCategoricalIntoMultiUnitBuckets", () => {
    it("sums per-category counts into contiguous 2-day buckets", () => {
      // Same shape as the numeric reproducer, with two categories per day.
      // The categorical path uses SUM (not average) per category per bucket,
      // and emits one row per (bucket, category).
      type Row = { timestamp: Date; category: string; count: number };
      const data: Row[] = [
        { timestamp: utc(2026, 1, 1, 0, 0, 0), category: "A", count: 10 },
        { timestamp: utc(2026, 1, 1, 0, 0, 0), category: "B", count: 100 },
        { timestamp: utc(2026, 1, 2, 0, 0, 0), category: "A", count: 20 },
        { timestamp: utc(2026, 1, 2, 0, 0, 0), category: "B", count: 200 },
        { timestamp: utc(2026, 1, 3, 0, 0, 0), category: "A", count: 30 },
        { timestamp: utc(2026, 1, 3, 0, 0, 0), category: "B", count: 300 },
        { timestamp: utc(2026, 1, 4, 0, 0, 0), category: "A", count: 40 },
        { timestamp: utc(2026, 1, 4, 0, 0, 0), category: "B", count: 400 },
        { timestamp: utc(2026, 1, 5, 0, 0, 0), category: "A", count: 50 },
        { timestamp: utc(2026, 1, 5, 0, 0, 0), category: "B", count: 500 },
      ];
      const fromDate = utc(2026, 1, 1, 0, 0, 0);
      const toDate = utc(2026, 1, 5, 14, 30, 0);

      const result = fillCategoricalTimeSeriesGaps(data, fromDate, toDate, {
        count: 2,
        unit: "day",
      });

      // Three contiguous 2-day buckets, oldest first, A then B per bucket:
      //   [Nov 30 14:30, Jan 1 14:30] -> A: 10,  B: 100
      //   [Jan  1 14:30, Jan 3 14:30] -> A: 50,  B: 500
      //   [Jan  3 14:30, Jan 5 14:30] -> A: 90,  B: 900
      expect(result.map((d) => d.count)).toEqual([10, 100, 50, 500, 90, 900]);
      expect(result[result.length - 1]!.timestamp.toISOString()).toBe(
        toDate.toISOString(),
      );
    });
  });
});
