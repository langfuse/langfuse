// @vitest-environment node

import { canApplyScoreOutlierStripFilters } from "@/src/features/scores-chart-view/fns/outlierStripFilters";

describe("canApplyScoreOutlierStripFilters", () => {
  it("allows an empty filter state", () => {
    expect(canApplyScoreOutlierStripFilters([])).toBe(true);
  });

  it("allows filters on scores-numeric dimensions", () => {
    expect(
      canApplyScoreOutlierStripFilters([
        { column: "name", type: "string", operator: "=", value: "accuracy" },
        { column: "source", type: "string", operator: "=", value: "API" },
      ]),
    ).toBe(true);
  });

  it("disallows a presence (null) filter", () => {
    expect(
      canApplyScoreOutlierStripFilters([
        { column: "comment", type: "null", operator: "is null", value: "" },
      ]),
    ).toBe(false);
  });

  it("disallows a filter with no scores-numeric dimension", () => {
    expect(
      canApplyScoreOutlierStripFilters([
        {
          column: "stringValue",
          type: "string",
          operator: "=",
          value: "x",
        },
      ]),
    ).toBe(false);
  });
});
