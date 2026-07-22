import { decodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { getEvaluationRuleTracesHref } from "./evaluationRuleTracesHref";

describe("getEvaluationRuleTracesHref", () => {
  it("can filter execution traces by evaluator without a rule", () => {
    const href = getEvaluationRuleTracesHref({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });

    expect(href.pathname).toBe("/project/project-1/traces");
    expect(decodeFiltersGeneric(href.query.filter)).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["langfuse-llm-as-a-judge", "langfuse-code-eval"],
      },
      {
        column: "metadata",
        type: "stringObject",
        key: "job_configuration_id",
        operator: "=",
        value: "evaluator-1",
      },
    ]);
  });
});
