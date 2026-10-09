import { EvalTemplateTypeEnum } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { prepareEvaluatorResultPredicates } from "@/src/features/evals/v2/fns/rules/prepareEvaluatorResultPredicates";

describe("prepareEvaluatorResultPredicates", () => {
  it("initializes every score from a saved evaluator definition", () => {
    const result = prepareEvaluatorResultPredicates({
      name: "Safety checks",
      type: EvalTemplateTypeEnum.DECISION_MODEL,
      questions: [
        {
          id: "toxicity",
          scoreName: "toxicity",
          type: "choice",
          instructions: "Check toxicity",
          options: [{ value: "safe" }, { value: "unsafe" }],
        },
        {
          id: "pii",
          scoreName: "pii_leak",
          type: "noul",
          instructions: "Check for PII",
        },
      ],
    });

    expect(result.predicates).toEqual([
      {
        scoreName: "toxicity",
        dataType: "CATEGORICAL",
        operator: "=",
        value: "safe",
      },
      {
        scoreName: "pii_leak",
        dataType: "NUMERIC",
        operator: "=",
        value: 0,
      },
    ]);
  });

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
});
