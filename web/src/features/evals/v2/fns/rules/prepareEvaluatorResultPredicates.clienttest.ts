import { EvalTemplateTypeEnum } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { prepareEvaluatorResultPredicates } from "@/src/features/evals/v2/fns/rules/prepareEvaluatorResultPredicates";

describe("prepareEvaluatorResultPredicates", () => {
  it("initializes code evaluators with one editable predicate", () => {
    const result = prepareEvaluatorResultPredicates({
      name: "Custom code",
      type: EvalTemplateTypeEnum.CODE,
    });

    expect(result).toEqual({
      scoreDefinitions: { mode: "freeform", scores: [] },
      predicates: [
        {
          scoreName: "",
          dataType: "BOOLEAN",
          operator: "=",
          value: false,
        },
      ],
    });
  });

  it("limits generated predicates to the rule schema maximum", () => {
    const result = prepareEvaluatorResultPredicates({
      name: "Decision model",
      type: EvalTemplateTypeEnum.DECISION_MODEL,
      questions: Array.from({ length: 21 }, (_, index) => ({
        id: `question-${index}`,
        scoreName: `score-${index}`,
        type: "noul",
        instructions: `Question ${index}`,
      })),
    });

    expect(result.predicates).toHaveLength(20);
    expect(result.scoreDefinitions).toMatchObject({
      mode: "known",
      scores: expect.arrayContaining([
        expect.objectContaining({ name: "score-20" }),
      ]),
    });
  });
});
