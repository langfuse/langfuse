import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_RENDERED_SERIES,
  prepareVisibleSeries,
} from "@/src/features/widgets/chart-library/prepareVisibleSeries";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

/** Builds one bucket per value for a dimension, so its summary == sum(values). */
const series = (dimension: string, values: number[]): DataPoint[] =>
  values.map((metric, i) => ({
    time_dimension: `2026-01-0${i + 1}T00:00:00Z`,
    dimension,
    metric,
  }));

describe("prepareVisibleSeries", () => {
  it("returns every series untouched (and in original order) below the cap", () => {
    const dimensions = ["b", "a", "c"];
    const data = [
      ...series("b", [1]),
      ...series("a", [100]),
      ...series("c", [10]),
    ];
    const result = prepareVisibleSeries(data, dimensions, 25);
    expect(result).toEqual({ visible: ["b", "a", "c"], total: 3, hidden: 0 });
  });

  it("keeps the highest-magnitude series and reports the dropped count", () => {
    const dimensions = ["small", "big", "medium"];
    const data = [
      ...series("small", [1, 1]),
      ...series("big", [50, 50]),
      ...series("medium", [10, 10]),
    ];
    const result = prepareVisibleSeries(data, dimensions, 2);
    expect(result.visible).toEqual(["big", "medium"]);
    expect(result.total).toBe(3);
    expect(result.hidden).toBe(1);
  });

  it("breaks ties by name for a deterministic selection", () => {
    const dimensions = ["delta", "alpha", "charlie", "bravo"];
    const data = [
      ...series("delta", [5]),
      ...series("alpha", [5]),
      ...series("charlie", [5]),
      ...series("bravo", [5]),
    ];
    const result = prepareVisibleSeries(data, dimensions, 2);
    // All equal magnitude -> alphabetical.
    expect(result.visible).toEqual(["alpha", "bravo"]);
  });

  it("ranks series with no finite data last", () => {
    const dimensions = ["empty", "tiny", "huge"];
    const data = [
      // 'empty' has only non-finite metrics -> null summary -> ranked last.
      {
        time_dimension: "2026-01-01T00:00:00Z",
        dimension: "empty",
        metric: NaN,
      },
      ...series("tiny", [1]),
      ...series("huge", [999]),
    ];
    const result = prepareVisibleSeries(data, dimensions, 2);
    expect(result.visible).toEqual(["huge", "tiny"]);
    expect(result.hidden).toBe(1);
  });

  it("treats a real 0-sum series as data (kept over a no-data series)", () => {
    const dimensions = ["zero", "nodata"];
    const data = [
      ...series("zero", [0, 0]),
      {
        time_dimension: "2026-01-01T00:00:00Z",
        dimension: "nodata",
        metric: NaN,
      },
    ];
    const result = prepareVisibleSeries(data, dimensions, 1);
    expect(result.visible).toEqual(["zero"]);
  });

  it("defaults to the shared render cap", () => {
    const dimensions = Array.from(
      { length: DEFAULT_MAX_RENDERED_SERIES + 30 },
      (_, i) => `series-${i}`,
    );
    const data = dimensions.flatMap((d, i) => series(d, [i]));
    const result = prepareVisibleSeries(data, dimensions);
    expect(result.visible).toHaveLength(DEFAULT_MAX_RENDERED_SERIES);
    expect(result.hidden).toBe(30);
    expect(result.total).toBe(DEFAULT_MAX_RENDERED_SERIES + 30);
  });
});
