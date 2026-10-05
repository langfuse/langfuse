import { describe, expect, it } from "vitest";
import { experimentChartDateRange } from "./experimentChartDateRange";

describe("experiment chart date range", () => {
  it("uses the actual fallback query window when displaying older experiments", () => {
    const selected = {
      from: new Date("2026-10-01"),
      to: new Date("2026-10-02"),
    };
    const fallback = {
      from: new Date("2025-10-02"),
      to: new Date("2026-10-02"),
    };
    expect(experimentChartDateRange(selected, fallback)).toEqual(fallback);
    expect(experimentChartDateRange(selected, undefined)).toEqual(selected);
  });
});
