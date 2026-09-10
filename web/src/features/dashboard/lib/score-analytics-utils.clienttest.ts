/**
 * @fileoverview Unit tests for the score-analytics utils used by the
 * dashboard numeric-score histogram.
 *
 * Focused on regressions captured by
 * https://github.com/langfuse/langfuse/issues/15208.
 */
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";
import { createHistogramData } from "@/src/features/dashboard/lib/score-analytics-utils";

const row = (value: number): DatabaseRow => ({ value });

describe("createHistogramData", () => {
  it("returns empty chart for empty data", () => {
    const { chartData } = createHistogramData([]);
    expect(chartData).toEqual([]);
  });

  // Regression test for langfuse/langfuse#15208 — Bug 1.
  //
  // The previous implementation rounded the value to 2dp *before* computing
  // the bin index while keeping the bin edges at the raw precision, so a
  // value like 0.857 (whose round-trip edge is 0.86) jumped to the wrong
  // bucket on integer-style floor/precision mismatches.
  //
  // To trigger the bug we need ``binSize`` small enough that ``round(v)``
  // and ``v`` land in *different* buckets. ``computeBinSize`` picks
  // ``bins = clamp(floor(sqrt(valueCount)), minBins, maxBins)``, so to get
  // ``bins >= 7`` we need ``valueCount >= 49``. With ``bins=7`` and
  // ``range=1``, ``binSize = 1/7 ≈ 0.1429``. For v=0.857:
  //   buggy:  round(0.857, 2) = 0.86, floor(0.86 / (1/7)) = floor(6.02) = 6
  //           → bucket 6 = [6/7, 1] = [0.857, 1]
  //   fixed:  floor(0.857 / (1/7)) = floor(5.999) = 5
  //           → bucket 5 = [5/7, 6/7] = [0.714, 0.857]
  //
  // We seed 49 evenly-spaced values and then *replace* one of them (which
  // originally landed in bucket 6) with the bug-trigger 0.857, which
  // belongs in bucket 5. With the fix, bucket 5 picks up the sentinel;
  // with the bug, the sentinel rounds to 0.86 and stays in bucket 6.
  it("bins raw values without rounding the value before floor()", () => {
    const data: DatabaseRow[] = [];
    // 50 evenly-spaced values in [0, 1]: floor(sqrt(50)) = 7, so
    // bins = 7 (clamped to [1, 10]). binSize = 1/7 ≈ 0.1429.
    for (let i = 0; i < 50; i++) {
      data.push(row(i / 49));
    }
    // ``data[43]`` originally held 43/49 ≈ 0.8776, which belongs in
    // bucket 6 ([0.857, 1]). Replace it with the bug-trigger 0.857,
    // which *correctly* belongs in bucket 5 ([0.714, 0.857)).
    data[43] = row(0.857);

    const { chartData } = createHistogramData(data, 1, 10);

    // Locate bucket 5 ([0.714, 0.857)) and bucket 6 ([0.857, 1]) by
    // their actual numeric edges — don't rely on label string matching
    // because labels are rounded to 3dp.
    const findBucket = (lo: number, hi: number) =>
      chartData.find((b) => {
        const m = b.binLabel.match(/\[([\d.]+),\s*([\d.]+)\]/);
        if (!m) return false;
        return (
          Math.abs(parseFloat(m[1]!) - lo) < 0.01 &&
          Math.abs(parseFloat(m[2]!) - hi) < 0.01
        );
      });

    const bucket5 = findBucket(5 / 7, 6 / 7);
    const bucket6 = findBucket(6 / 7, 7 / 7);
    expect(bucket5).toBeDefined();
    expect(bucket6).toBeDefined();

    // With 50 dense values and bins=7:
    //   - bucket 5 ([0.714, 0.857)) naturally contains 7 dense values
    //     (i=35..41 ⇒ 35/49..41/49, all < 6/7 ≈ 0.857).
    //   - bucket 6 ([0.857, 1]) naturally contains 8 dense values
    //     (i=42..49 ⇒ 42/49..49/49, all ≥ 6/7).
    //
    // We replaced data[43] (which was 43/49 ≈ 0.878, in bucket 6) with
    // 0.857 (which lives in bucket 5).
    //
    //   - FIXED: 0.857 → bucket 5 ⇒ bucket 5 = 7 + 1 = 8,
    //                            bucket 6 = 8 − 1 = 7.
    //   - BUGGY: round(0.857, 2) = 0.86 → bucket 6 ⇒ bucket 5 = 7,
    //                                       bucket 6 = 8 − 1 + 1 = 8.
    expect(bucket5!.count).toBe(8);
    expect(bucket6!.count).toBe(7);

    // Total count must equal the input length — nothing dropped.
    const total = chartData.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(data.length);
  });

  // Regression test for langfuse/langfuse#15208 — Bug 1, second symptom.
  //
  // For narrow ranges the previous implementation produced zero-width or
  // duplicated bin labels because the 2-decimal label rounding collapsed
  // adjacent edges. The fix rounds labels with enough precision to keep
  // distinct edges visually separate.
  it("produces distinct non-degenerate labels for a narrow range", () => {
    const data = [0.855, 0.857, 0.858, 0.861].map(row);

    const { chartData } = createHistogramData(data, 1, 5);

    const labels = chartData.map((b) => b.binLabel);
    // No label should appear twice in a row.
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i]).not.toBe(labels[i - 1]);
    }
    // Every label must contain a non-degenerate half-open range.
    for (const label of labels) {
      const match = label.match(/\[([-\d.]+),\s*([-\d.]+)\]/);
      expect(match).not.toBeNull();
      if (match) {
        expect(parseFloat(match[2]!)).toBeGreaterThan(parseFloat(match[1]!));
      }
    }
  });

  // Counts should still sum to the input length for any input — i.e., no
  // value is dropped during binning.
  it("preserves total count for a wide spread of values", () => {
    const data = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(
      row,
    );

    const { chartData } = createHistogramData(data, 1, 5);

    const total = chartData.reduce((sum, bin) => sum + bin.count, 0);
    expect(total).toBe(data.length);
  });
});
