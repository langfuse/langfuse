import { describe, expect, it } from "vitest";

import { sumRowsSharingLabel } from "@/src/features/widgets/chart-library/sumRowsSharingLabel";

describe("sumRowsSharingLabel", () => {
  it("adds up rows with one label and re-ranks a breakdown", () => {
    expect(
      sumRowsSharingLabel(
        [
          { time_dimension: undefined, dimension: "service", metric: 5 },
          { time_dimension: undefined, dimension: "Alice", metric: 3 },
          { time_dimension: undefined, dimension: "Alice", metric: 4 },
        ],
        { isTimeSeries: false },
      ),
    ).toEqual([
      { time_dimension: undefined, dimension: "Alice", metric: 7 },
      { time_dimension: undefined, dimension: "service", metric: 5 },
    ]);
  });

  it("merges per bucket and keeps time series order and bucket markers", () => {
    expect(
      sumRowsSharingLabel(
        [
          { time_dimension: "t1", dimension: undefined, metric: null },
          { time_dimension: "t2", dimension: "Alice", metric: 1 },
          { time_dimension: "t3", dimension: "Alice", metric: 2 },
          { time_dimension: "t2", dimension: "Alice", metric: 3 },
        ],
        { isTimeSeries: true },
      ),
    ).toEqual([
      { time_dimension: "t1", dimension: undefined, metric: null },
      { time_dimension: "t2", dimension: "Alice", metric: 4 },
      { time_dimension: "t3", dimension: "Alice", metric: 2 },
    ]);
  });
});
