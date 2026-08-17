import {
  canApplyScoreOutlierStripFilters,
  shouldQueryStringScores,
} from "@/src/features/scores-chart-view/fns/outlierStripFilters";

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

describe("shouldQueryStringScores", () => {
  it("skips the string-score aggregate when the data type filter only allows numeric and Boolean scores", () => {
    expect(
      shouldQueryStringScores([
        {
          column: "dataType",
          type: "stringOptions",
          operator: "any of",
          value: ["NUMERIC", "BOOLEAN"],
        },
      ]),
    ).toBe(false);
  });

  it("keeps the string-score aggregate when categorical scores can match", () => {
    expect(
      shouldQueryStringScores([
        {
          column: "dataType",
          type: "string",
          operator: "=",
          value: "CATEGORICAL",
        },
      ]),
    ).toBe(true);
  });
});
