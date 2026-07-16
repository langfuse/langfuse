import { describe, expect, it } from "vitest";

import { timeSeriesToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";

describe("timeSeriesToDataPoints", () => {
  it("passes real values through", () => {
    const ts = Date.UTC(2026, 6, 1);
    expect(
      timeSeriesToDataPoints([{ ts, values: [{ label: "Traces", value: 5 }] }]),
    ).toEqual([
      {
        time_dimension: new Date(ts).toISOString(),
        dimension: "Traces",
        metric: 5,
      },
    ]);
  });

  it("keeps a value-less entry as null instead of inventing a 0", () => {
    // A latency percentile with no data in the bucket has no honest value;
    // fabricating 0 draws a fake drop to zero. (LFE-10694)
    const ts = Date.UTC(2026, 6, 2);
    expect(
      timeSeriesToDataPoints([{ ts, values: [{ label: "gpt-4" }] }]),
    ).toEqual([
      {
        time_dimension: new Date(ts).toISOString(),
        dimension: "gpt-4",
        metric: null,
      },
    ]);
  });

  it("emits a dimension-less bucket marker for an empty bucket so the axis keeps it", () => {
    const ts = Date.UTC(2026, 6, 3);
    expect(timeSeriesToDataPoints([{ ts, values: [] }])).toEqual([
      {
        time_dimension: new Date(ts).toISOString(),
        dimension: undefined,
        metric: null,
      },
    ]);
  });
});
