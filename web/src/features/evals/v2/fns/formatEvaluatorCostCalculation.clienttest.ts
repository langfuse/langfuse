import { describe, expect, it } from "vitest";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { formatEvaluatorCostCalculation } from "./formatEvaluatorCostCalculation";

describe("formatEvaluatorCostCalculation", () => {
  it("shows the individual inputs and weekly result", () => {
    expect(
      formatEvaluatorCostCalculation({
        matchingObservations: 1_840,
        sampling: 0.4,
        testRunCostUsd: 0.001,
        estimatedCostUsd: 0.736,
        evaluatorType: EvalTemplateTypeEnum.LLM_AS_JUDGE,
      }),
    ).toBe(
      "1,840 matching observations × 40% sampling × $0.001 per evaluation = ≈ $0.74 / week. Estimated model-provider / LLM cost only.",
    );
  });

  it("explains when neither a recent trace nor fallback test provides a cost", () => {
    expect(
      formatEvaluatorCostCalculation({
        matchingObservations: 318,
        sampling: 0.25,
        testRunCostUsd: null,
        estimatedCostUsd: null,
        evaluatorType: EvalTemplateTypeEnum.LLM_AS_JUDGE,
      }),
    ).toBe(
      "No cost-bearing evaluator trace was available from the last 7 days, and the fallback test call did not return a usable model cost. Estimated model-provider / LLM cost only.",
    );
  });

  it("shows zero cost when no observations match", () => {
    expect(
      formatEvaluatorCostCalculation({
        matchingObservations: 0,
        sampling: 1,
        testRunCostUsd: null,
        estimatedCostUsd: 0,
        evaluatorType: EvalTemplateTypeEnum.LLM_AS_JUDGE,
      }),
    ).toBe(
      "0 matching observations × 100% sampling = ≈ $0.00 / week. Estimated model-provider / LLM cost only.",
    );
  });

  it("explains why code evaluators have no model-provider cost", () => {
    expect(
      formatEvaluatorCostCalculation({
        matchingObservations: 318,
        sampling: 0.25,
        testRunCostUsd: 0,
        estimatedCostUsd: 0,
        evaluatorType: EvalTemplateTypeEnum.CODE,
      }),
    ).toBe(
      "Code evaluators do not call an LLM, so they do not incur model-provider / LLM costs.",
    );
  });
});
