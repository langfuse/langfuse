import { getEvaluationRuleMappingReviewHref } from "./evaluationRuleMappingReviewHref";

describe("getEvaluationRuleMappingReviewHref", () => {
  it("opens the rule peek focused on the problematic evaluator mapping", () => {
    expect(
      getEvaluationRuleMappingReviewHref({
        projectId: "project/1",
        ruleId: "rule/1",
        evaluatorId: "evaluator/1",
      }),
    ).toBe(
      "/project/project%2F1/evals/v2/rules?peek=rule%2F1&mappingEvaluatorId=evaluator%2F1",
    );
  });
});
