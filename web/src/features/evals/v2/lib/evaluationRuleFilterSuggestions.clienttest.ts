import { describe, expect, it } from "vitest";

import { buildEvaluationRuleFilterSuggestionSection } from "@/src/features/evals/v2/lib/evaluationRuleFilterSuggestions";

describe("buildEvaluationRuleFilterSuggestionSection", () => {
  it("suggests attached rules first and labels their relationship", () => {
    expect(
      buildEvaluationRuleFilterSuggestionSection({
        rules: [
          {
            id: "existing-rule",
            name: "Existing rule",
            evaluators: [{ scoreName: "Quality" }],
            evaluatorCount: 1,
          },
          {
            id: "attached-rule",
            name: "Attached rule",
            evaluators: [{ scoreName: "Current evaluator" }],
            evaluatorCount: 1,
          },
        ],
        attachedRuleIds: ["attached-rule"],
      }),
    ).toEqual({
      title: "Reuse existing evaluation rule",
      items: [
        {
          id: "attached-rule",
          label: "Attached rule",
          detail: "Attached to this evaluator",
        },
        {
          id: "existing-rule",
          label: "Existing rule",
          detail: "Quality",
        },
      ],
    });
  });

  it("omits the section when there are no compatible rules", () => {
    expect(
      buildEvaluationRuleFilterSuggestionSection({
        rules: [],
        attachedRuleIds: [],
      }),
    ).toBeUndefined();
  });
});
