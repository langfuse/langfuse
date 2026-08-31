import { describe, expect, it } from "vitest";
import { isChartDataEmpty } from "@/src/features/widgets/chart-library/isChartDataEmpty";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

const point = (metric: DataPoint["metric"], dimension?: string): DataPoint => ({
  time_dimension: "2026-01-01T00:00:00Z",
  dimension,
  metric,
});

describe("isChartDataEmpty", () => {
  it("treats an empty array as empty", () => {
    expect(isChartDataEmpty([])).toBe(true);
  });

  it("treats all-null metrics as empty (no honest value measured)", () => {
    const data = [point(null), point(null, "series-a")];
    expect(isChartDataEmpty(data)).toBe(true);
  });

  // A real 0 is a deliberate, honest value here (never coerced from a gap —
  // manifesto V2 / DataPoint.metric's doc), so it must never be treated as
  // "no data": additive count/sum series fill an empty bucket with a real 0
  // (getWidgetMissingBucketValue), a genuine zero-average score chart still
  // has something true to show (NumericScoreTimeSeriesChart's
  // isNullValueAllowed:true opt-out of the legacy detector), and a monitor
  // alert-preview whose measure is 0 across the window still needs its
  // threshold bands drawn.
  it("is NOT empty when every point is a real 0", () => {
    const data = [point(0), point(0, "series-a"), point(0, "series-b")];
    expect(isChartDataEmpty(data)).toBe(false);
  });

  it("is NOT empty for a single real-0 point", () => {
    expect(isChartDataEmpty([point(0)])).toBe(false);
  });

  it("is NOT empty for a mix of null and real-0 points (0 is real data)", () => {
    const data = [point(null), point(0, "series-a"), point(null, "series-b")];
    expect(isChartDataEmpty(data)).toBe(false);
  });

  it("is not empty when at least one point carries a real, non-zero value", () => {
    const data = [point(null), point(5, "series-a"), point(null, "series-b")];
    expect(isChartDataEmpty(data)).toBe(false);
  });

  it("is not empty when a real negative value is present", () => {
    const data = [point(-3, "series-a")];
    expect(isChartDataEmpty(data)).toBe(false);
  });

  it("treats an empty histogram (no bins) as empty", () => {
    const data = [point([])];
    expect(isChartDataEmpty(data)).toBe(true);
  });

  it("treats a histogram of only empty bin arrays as empty", () => {
    const data = [point([[], []])];
    expect(isChartDataEmpty(data)).toBe(true);
  });

  it("is not empty when a histogram has a populated bin", () => {
    const data = [point([[0, 5, 10]])];
    expect(isChartDataEmpty(data)).toBe(false);
  });
});
