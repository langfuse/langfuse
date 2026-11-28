// @vitest-environment node

import { describe, expect, it } from "vitest";
import { fillTimeSeriesGaps } from "./fill-time-series-gaps";

describe("fillTimeSeriesGaps", () => {
  it("keeps a score that is absent from the first row of a multi-unit bucket", () => {
    const result = fillTimeSeriesGaps(
      [
        {
          timestamp: new Date("2026-01-01T10:00:00.000Z"),
          avg1: null as number | null,
          avg2: 0.2 as number | null,
          count: 1,
        },
        {
          timestamp: new Date("2026-01-01T11:00:00.000Z"),
          avg1: 0.8 as number | null,
          avg2: null as number | null,
          count: 1,
        },
      ],
      new Date("2026-01-01T09:00:00.000Z"),
      new Date("2026-01-01T11:00:00.000Z"),
      { count: 3, unit: "hour" },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ avg1: 0.8, avg2: 0.2 });
  });
});
