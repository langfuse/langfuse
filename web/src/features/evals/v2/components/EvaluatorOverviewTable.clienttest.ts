import { decodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { getEvaluatorScoresHref } from "./EvaluatorOverviewTable";

describe("getEvaluatorScoresHref", () => {
  it("links to the scores table filtered to evaluator scores with this name", () => {
    const href = getEvaluatorScoresHref({
      projectId: "project-1",
      scoreName: "Quality",
    });

    expect(href.pathname).toBe("/project/project-1/scores");
    expect(decodeFiltersGeneric(href.query.filter)).toEqual([
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["Quality"],
      },
      {
        column: "source",
        type: "stringOptions",
        operator: "any of",
        value: ["EVAL"],
      },
    ]);
  });
});
