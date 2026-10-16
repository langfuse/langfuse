import { describe, expect, it } from "vitest";
import { ScoreDataTypeEnum } from "../../domain/scores";
import { isScoreResultTriggerCompatibleWithEvaluator } from "./isScoreResultTriggerCompatibleWithEvaluator";
import { EvalTemplateTypeEnum } from "./types";

describe("isScoreResultTriggerCompatibleWithEvaluator", () => {
  it("rejects stale predicates for evaluators with known score definitions", () => {
    const definition = {
      name: "quality",
      type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
      outputDefinition: {
        dataType: ScoreDataTypeEnum.CATEGORICAL,
        reasoning: { description: "" },
        score: {
          description: "",
          categories: ["good", "bad"],
          shouldAllowMultipleMatches: false,
        },
      },
    };

    expect(
      isScoreResultTriggerCompatibleWithEvaluator(
        {
          evaluatorId: "evaluator",
          predicates: [
            {
              scoreName: "quality",
              dataType: ScoreDataTypeEnum.CATEGORICAL,
              operator: "=",
              value: "good",
            },
          ],
        },
        definition,
      ),
    ).toBe(true);
    expect(
      isScoreResultTriggerCompatibleWithEvaluator(
        {
          evaluatorId: "evaluator",
          predicates: [
            {
              scoreName: "quality",
              dataType: ScoreDataTypeEnum.CATEGORICAL,
              operator: "=",
              value: "removed",
            },
          ],
        },
        definition,
      ),
    ).toBe(false);
  });

  it("accepts freeform code evaluator predicates", () => {
    expect(
      isScoreResultTriggerCompatibleWithEvaluator(
        {
          evaluatorId: "evaluator",
          predicates: [
            {
              scoreName: "custom",
              dataType: ScoreDataTypeEnum.TEXT,
              operator: "=",
              value: "accepted",
            },
          ],
        },
        {
          name: "code",
          type: EvalTemplateTypeEnum.CODE,
        },
      ),
    ).toBe(true);
  });
});
