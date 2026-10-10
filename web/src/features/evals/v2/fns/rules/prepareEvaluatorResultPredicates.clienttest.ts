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
});
